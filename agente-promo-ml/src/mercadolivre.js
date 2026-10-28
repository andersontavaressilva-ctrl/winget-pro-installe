// Cliente da API oficial do Mercado Livre (https://developers.mercadolivre.com.br)
const API = 'https://api.mercadolibre.com';

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
  // O ML devolve um novo refresh token a cada renovação; o antigo deixa de valer.
  if (data.refresh_token) ml.refreshToken = data.refresh_token;
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

// Executa todas as buscas configuradas e remove duplicados.
export async function fetchDeals(ml) {
  const queries = [
    ...ml.searchTerms.map((q) => ({ q })),
    ...ml.categories.map((category) => ({ category })),
  ];
  if (!queries.length) throw new Error('Configure SEARCH_TERMS ou SEARCH_CATEGORIES no .env');
  await getToken(ml); // falha logo se as credenciais estiverem erradas

  const byId = new Map();
  for (const query of queries) {
    try {
      for (const item of await search(ml, query)) byId.set(item.id, item);
    } catch (err) {
      console.error(`[ML] Erro na busca ${JSON.stringify(query)}: ${err.message}`);
    }
  }
  return [...byId.values()];
}
