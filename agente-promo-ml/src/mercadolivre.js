import { setEnvValue } from './envfile.js';

// Cliente da API oficial do Mercado Livre (https://developers.mercadolivre.com.br)
const API = process.env.ML_API_BASE || 'https://api.mercadolibre.com';

let token = null;
let tokenExpiresAt = 0;

async function getToken(ml) {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  if (!ml.clientId || !ml.clientSecret) {
    throw new Error('Configure ML_CLIENT_ID e ML_CLIENT_SECRET no arquivo .env');
  }

  const body = new URLSearchParams({ client_id: ml.clientId, client_secret: ml.clientSecret });
  if (ml.refreshToken) {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', ml.refreshToken);
  } else {
    body.set('grant_type', 'client_credentials');
  }

  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Falha ao obter token do Mercado Livre: ${JSON.stringify(data)}`);

  token = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 21600) * 1000;
  // O ML devolve um novo refresh token a cada renovação e o antigo deixa de
  // valer, então salvamos no .env para continuar funcionando após reiniciar.
  if (data.refresh_token && data.refresh_token !== ml.refreshToken) {
    ml.refreshToken = data.refresh_token;
    setEnvValue('ML_REFRESH_TOKEN', data.refresh_token);
  }
  return token;
}

async function apiGet(ml, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await getToken(ml)}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Normaliza um resultado da busca para o formato usado pelo agente.
export function normalizeItem(r) {
  const original = r.original_price || r.prices?.prices?.find((p) => p.regular_amount)?.regular_amount || null;
  const price = r.price;
  const discount = original && original > price ? Math.round((1 - price / original) * 100) : 0;
  return {
    id: r.id,
    title: r.title,
    price,
    originalPrice: original,
    discount,
    permalink: r.permalink,
    thumbnail: (r.thumbnail || '').replace(/^http:/, 'https:').replace(/-I\.(jpg|webp)$/, '-O.$1'),
    freeShipping: Boolean(r.shipping?.free_shipping),
    full: r.shipping?.logistic_type === 'fulfillment',
    officialStore: Boolean(r.official_store_id),
    soldQuantity: r.sold_quantity ?? null,
    sellerLevel: r.seller?.seller_reputation?.level_id || null,
    powerSeller: r.seller?.seller_reputation?.power_seller_status || null,
    rating: r.reviews?.rating_average ?? null,
    reviews: r.reviews?.total ?? null,
    installments: r.installments
      ? { quantity: r.installments.quantity, amount: r.installments.amount, rate: r.installments.rate }
      : null,
    condition: r.condition,
  };
}

export async function search(ml, { q, category }) {
  const params = new URLSearchParams({ limit: String(ml.resultsPerSearch), sort: 'relevance' });
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  // Filtro nativo de desconto do ML (só retorna itens com algum desconto)
  params.set('discount', '5-100');
  const data = await apiGet(ml, `/sites/${ml.site}/search?${params}`);
  return (data.results || []).map(normalizeItem);
}

// Executa tarefas assíncronas com no máximo `limit` ao mesmo tempo.
async function mapLimit(list, limit, fn) {
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const idx = i++;
      try { out[idx] = await fn(list[idx]); } catch (err) { out[idx] = null; console.error(`[ML] ${err.message}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out.filter(Boolean);
}

// Se o anúncio não informa o preço original, consulta os preços (promoção x preço normal).
async function fillOriginalPrice(ml, item) {
  if (item.originalPrice) return item;
  const data = await apiGet(ml, `/items/${item.id}/prices`).catch(() => null);
  const promo = data?.prices?.find((p) => p.type === 'promotion' && p.regular_amount);
  if (promo) {
    item.price = promo.amount;
    item.originalPrice = promo.regular_amount;
    item.discount = Math.round((1 - promo.amount / promo.regular_amount) * 100);
  }
  return item;
}

// Mais vendidos de uma categoria (top 20 do Mercado Livre), com preço do anúncio vencedor.
export async function bestSellers(ml, category) {
  const data = await apiGet(ml, `/highlights/${ml.site}/category/${category}`);
  const entries = data.content || [];

  const itemIds = entries.filter((e) => e.type === 'ITEM').map((e) => e.id);
  const products = entries.filter((e) => e.type === 'PRODUCT');
  const positionOf = new Map(entries.map((e) => [e.id, e.position]));
  const results = [];

  for (let k = 0; k < itemIds.length; k += 20) {
    const batch = await apiGet(ml, `/items?ids=${itemIds.slice(k, k + 20).join(',')}`);
    for (const r of batch) {
      if (r.code === 200 && r.body) results.push({ ...normalizeItem(r.body), bestSellerPosition: positionOf.get(r.body.id) });
    }
  }

  results.push(...await mapLimit(products, 5, async (p) => {
    const [product, offers] = await Promise.all([
      apiGet(ml, `/products/${p.id}`),
      apiGet(ml, `/products/${p.id}/items?limit=1`),
    ]);
    const offer = offers.results?.[0];
    if (!offer) return null;
    return {
      ...normalizeItem({
        ...offer,
        id: offer.item_id,
        title: product.name,
        permalink: product.permalink || `https://www.mercadolivre.com.br/p/${p.id}`,
        thumbnail: product.pictures?.[0]?.url,
      }),
      bestSellerPosition: p.position,
    };
  }));

  return mapLimit(results, 5, (item) => fillOriginalPrice(ml, item));
}

let searchBlocked = false;

// Executa todas as buscas configuradas e remove duplicados.
export async function fetchDeals(ml) {
  if (!ml.searchTerms.length && !ml.categories.length) {
    throw new Error('Configure SEARCH_TERMS ou SEARCH_CATEGORIES no .env');
  }
  await getToken(ml); // falha logo se as credenciais estiverem erradas

  const byId = new Map();
  const add = (items) => items.forEach((i) => byId.set(i.id, { ...byId.get(i.id), ...i }));

  // 1) Busca por termos. O ML bloqueou essa rota (403) para muitos apps;
  //    se acontecer, desligamos e seguimos só com os mais vendidos.
  for (const q of searchBlocked ? [] : ml.searchTerms) {
    try {
      add(await search(ml, { q }));
    } catch (err) {
      if (/-> 403/.test(err.message)) {
        searchBlocked = true;
        console.error('[ML] Busca por termos bloqueada pelo Mercado Livre (403). Usando só os mais vendidos por categoria.');
        break;
      }
      console.error(`[ML] Erro na busca "${q}": ${err.message}`);
    }
  }

  // 2) Mais vendidos por categoria
  for (const category of ml.categories) {
    try {
      add(await bestSellers(ml, category));
    } catch (err) {
      console.error(`[ML] Erro nos mais vendidos de ${category}: ${err.message}`);
    }
  }
  return [...byId.values()];
}
