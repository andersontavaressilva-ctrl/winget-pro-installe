import fs from 'node:fs';
import { chromium } from 'playwright-core';

// Coleta ofertas pelo painel de afiliados do Mercado Livre usando um navegador
// de verdade (Chrome) com perfil salvo, onde o Anderson entrou na conta uma vez.
// Regra: se o Mercado Livre pedir verificação ou login, o robô PARA e avisa.
// Nunca tenta passar sozinho.

const HUB = 'https://www.mercadolivre.com.br/afiliados/hub';
const PROFILE_DIR = './perfil-navegador';
const SESSION_FILE = './data/sessao-ml.json';

export class PrecisaDeAjuda extends Error {
  constructor(motivo, message) { super(message); this.motivo = motivo; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pausa com variação, para o ritmo parecer de uma pessoa.
const pausa = (min, max) => sleep(min + Math.random() * (max - min));

export async function abrirNavegador({ headless = false, visivel = false } = {}) {
  // Fora do modo "visível" a janela abre fora da tela, para não atrapalhar quem usa o computador.
  const args = visivel ? ['--start-maximized'] : ['--window-position=-2400,0'];
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless,
    args,
    viewport: visivel ? null : { width: 1366, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  // O Mercado Livre guarda a entrada em cookies "de sessão", que o Chrome apaga
  // ao fechar. Por isso a entrada também fica salva em SESSION_FILE.
  try {
    const { cookies } = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    await context.addCookies(cookies);
  } catch { /* ainda não entrou na conta */ }
  return context;
}

export async function salvarSessao(context) {
  await context.storageState({ path: SESSION_FILE });
}

export async function estaLogado(context) {
  const cookies = await context.cookies('https://www.mercadolivre.com.br');
  return cookies.some((c) => c.name === 'ssid');
}

// Confere se a página atual é tela de login ou de verificação.
async function conferirBloqueio(page) {
  const url = page.url();
  if (/\/(lgz|login|jms\/mlb\/lgz)/i.test(url)) {
    throw new PrecisaDeAjuda('login', 'O Mercado Livre pediu para entrar na conta de novo.');
  }
  const texto = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/account-verification|captcha|challenge/i.test(url) ||
      /n[aã]o (sou|é) (um )?rob[oô]|verifi(que|car|ca[cç][aã]o) (a |sua )?(conta|identidade)|confirme que (voc[eê] )?[eé] voc[eê]/i.test(texto)) {
    throw new PrecisaDeAjuda('verificacao', 'O Mercado Livre pediu uma verificação de segurança.');
  }
}

const centavos = (label) => {
  // "Agora: 126 reais com 02 centavos" -> 126.02
  const m = /([\d.]+)\s*reais?(?:\s*com\s*(\d+)\s*centavos?)?/i.exec(label || '');
  return m ? Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2]) / 100 : 0) : null;
};

const vendidos = (t) => {
  // "+10mil vendidos" -> 10000 ; "+1000 vendidos" -> 1000
  const m = /\+?\s*([\d.,]+)\s*(mil)?\s*vendidos/i.exec(t || '');
  if (!m) return null;
  return Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * (m[2] ? 1000 : 1));
};

// Abre o painel de afiliados com o filtro "Mais vendidos" e lê os produtos.
export async function buscarMaisVendidos(context, { rolagens = 4 } = {}) {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(HUB, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await pausa(2500, 4500);
  await conferirBloqueio(page);

  const filtro = page.locator('button.andes-tag', { hasText: 'Mais vendidos' }).first();
  await filtro.waitFor({ timeout: 30_000 });
  if ((await filtro.getAttribute('aria-pressed')) !== 'true') {
    await filtro.click();
    await pausa(2500, 4000);
  }
  await page.locator('li.poly-card').first().waitFor({ timeout: 30_000 });

  for (let i = 0; i < rolagens; i++) {
    await page.mouse.wheel(0, 900 + Math.random() * 600);
    await pausa(1500, 3000);
  }
  await conferirBloqueio(page);

  const brutos = await page.$$eval('li.poly-card', (cards) => cards.map((c) => {
    const a = c.querySelector('a.poly-component__title');
    const img = c.querySelector('img.poly-component__picture');
    const labels = [...c.querySelectorAll('.poly-component__review-compacted .polylabel-label')].map((e) => e.textContent.trim());
    return {
      href: a?.href || '',
      title: a?.textContent.trim() || '',
      image: img?.getAttribute('data-src') || img?.src || '',
      prev: c.querySelector('.andes-money-amount--previous')?.getAttribute('aria-label') || '',
      cur: c.querySelector('.poly-price__current .andes-money-amount')?.getAttribute('aria-label') || '',
      disc: c.querySelector('.poly-price__disc-label')?.textContent.trim() || '',
      ganhos: c.querySelector('.poly-component__chip')?.textContent.trim() || '',
      rating: labels[0] || '',
      sold: labels[1] || '',
      text: c.innerText,
    };
  }));

  return brutos.map((b) => {
    const idMatch = /MLB-?(\d+)/i.exec(b.href);
    const parcelas = /(\d+)x\s*R\$\s*([\d.]+(?:,\d+)?)\s*(sem juros)?/i.exec(b.text);
    const outros = /ou\s*R\$\s*([\d.]+(?:,\d+)?)\s*em outros meios/i.exec(b.text);
    const price = centavos(b.cur);
    const originalPrice = centavos(b.prev);
    const discount = Number((/(\d+)%/.exec(b.disc) || [])[1] || (originalPrice && price ? Math.round((1 - price / originalPrice) * 100) : 0));
    const brl = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
    return {
      id: idMatch ? `MLB${idMatch[1]}` : b.href,
      title: b.title,
      permalink: b.href.split('?')[0].split('#')[0],
      thumbnail: b.image.startsWith('http') ? b.image : null,
      price,
      originalPrice,
      discount,
      pix: /pix/i.test(b.disc),
      otherMethodsPrice: outros ? brl(outros[1]) : null,
      installments: parcelas ? { quantity: Number(parcelas[1]), amount: brl(parcelas[2]), rate: parcelas[3] ? 0 : 1 } : null,
      rating: b.rating ? Number(b.rating.replace(',', '.')) : null,
      soldQuantity: vendidos(b.sold),
      commission: b.ganhos,
      condition: 'new',
    };
  }).filter((i) => i.title && i.price && i.id.startsWith('MLB'));
}

// Abre a página do produto para ver cupom, frete grátis e Full. Volta para o painel depois.
export async function detalharProduto(context, item) {
  const page = await context.newPage();
  try {
    await page.goto(item.permalink, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await pausa(3000, 6000);
    // Com o título do produto na tela a página abriu normal; o texto dela pode
    // falar em "verificar" (ex.: compra garantida) sem ser bloqueio.
    if (!(await page.locator('h1.ui-pdp-title').count())) await conferirBloqueio(page);
    const texto = await page.locator('body').innerText();
    // Código de cupom (ex.: "cupom ELETRO300") ou texto do cupom (ex.: "Cupom R$ 20 OFF").
    const codigo = /cupom:?\s+([A-Z0-9]{4,20})\b/.exec(texto);
    const cupom = /(cupom[^\n]{0,60}?(?:R\$\s*[\d.,]+|\d+%)\s*(?:OFF)?)/i.exec(texto)
      || /((?:R\$\s*[\d.,]+|\d+%)\s*OFF\s*(?:com|no|usando o)?\s*cupom[^\n]{0,30})/i.exec(texto);
    const foto = await page.locator('meta[property="og:image"]').first().getAttribute('content', { timeout: 3000 }).catch(() => null);
    return {
      ...item,
      // O WhatsApp mostra melhor JPG; o servidor de fotos do ML entrega JPG trocando a extensão.
      thumbnail: foto && /^https:\/\//.test(foto) ? foto.replace(/\.webp$/, '.jpg') : item.thumbnail,
      coupon: codigo && /[A-Z]/.test(codigo[1]) && /\d/.test(codigo[1]) ? codigo[1]
        : cupom ? cupom[1].replace(/\s+/g, ' ').trim() : null,
      freeShipping: /frete gr[aá]tis|chegar[aá] gr[aá]tis|envio gr[aá]tis/i.test(texto),
      full: /\bFULL\b/.test(texto),
      officialStore: /loja oficial/i.test(texto),
    };
  } finally {
    await page.close();
    await pausa(1500, 3000);
  }
}

// Gera o link de afiliado pelo botão "Compartilhar" do painel (o mesmo que o
// Gerador de links usa). Devolve o link curto meli.la.
export async function gerarLink(context, item) {
  const page = context.pages()[0];
  await conferirBloqueio(page);
  const card = page.locator('li.poly-card').filter({ has: page.locator(`a.poly-component__title[href*="${item.id.replace('MLB', '')}"]`) }).first();
  await card.scrollIntoViewIfNeeded();
  await pausa(800, 1600);
  const resposta = page.waitForResponse((r) => r.url().includes('/affiliates/createLink') && r.request().method() === 'POST', { timeout: 30_000 });
  await card.getByRole('button', { name: 'Compartilhar' }).click();
  const json = await (await resposta).json();
  await pausa(1200, 2500);
  await page.keyboard.press('Escape');
  await pausa(800, 1500);
  const link = json?.urls?.[0]?.short_url;
  if (!link) throw new Error(`O painel não devolveu link para ${item.title}`);
  return link;
}
