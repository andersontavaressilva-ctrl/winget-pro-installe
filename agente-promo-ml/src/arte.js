import { chromium } from 'playwright-core';
import { sellingPoints } from './caracteristicas.js';

// Monta uma arte quadrada e chamativa para a oferta (foto + desconto + pontos
// fortes do produto) desenhando um HTML no Chrome e tirando uma "foto" dele.
// O preço fica no texto do post. Não abre o Mercado Livre: só carrega a foto
// do produto do servidor de imagens.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function html(item, marca) {
  const off = item.discount ? `<div class="selo"><b>-${item.discount}%</b><span>OFF</span></div>` : '';
  const pontos = sellingPoints(item)
    .map((p) => `<div class="ponto"><span class="em">${p.emoji}</span><span class="tx">${esc(p.text)}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1080px;font-family:"Segoe UI",Arial,sans-serif;
 background:radial-gradient(circle at 20% 10%,#2bb6ff 0,#0b5cff 45%,#001a6e 100%);color:#fff;overflow:hidden;position:relative}
.raios{position:absolute;inset:-300px;background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,255,255,.07) 0 8deg,transparent 8deg 16deg)}
.topo{position:absolute;top:30px;left:0;right:0;text-align:center;font-size:58px;font-weight:900;letter-spacing:2px;
 text-shadow:0 5px 0 rgba(0,0,0,.25)}
.foto{position:absolute;top:122px;left:150px;width:780px;height:470px;background:#fff;border-radius:40px;
 box-shadow:0 22px 50px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:26px}
.foto img{max-width:100%;max-height:100%;object-fit:contain}
.selo{position:absolute;top:92px;right:62px;width:210px;height:210px;border-radius:50%;background:#ffe600;color:#0b3a9e;
 display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(12deg);
 box-shadow:0 12px 30px rgba(0,0,0,.35);border:8px solid #fff}
.selo b{font-size:74px;line-height:1;font-weight:900}.selo span{font-size:38px;font-weight:900}
.titulo{position:absolute;left:60px;right:60px;top:612px;text-align:center;font-size:40px;font-weight:800;line-height:1.15;
 max-height:94px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-shadow:0 2px 4px rgba(0,0,0,.3)}
.pontos{position:absolute;left:50px;right:50px;top:730px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.ponto{background:#fff;color:#0b3a9e;border-radius:24px;padding:16px 20px;display:flex;align-items:center;gap:14px;
 box-shadow:0 8px 20px rgba(0,0,0,.28);min-width:0}
.em{font-size:42px;line-height:1}.tx{font-size:33px;font-weight:800;line-height:1.1;overflow:hidden;
 display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.rodape{position:absolute;bottom:0;left:0;right:0;height:74px;background:rgba(0,0,0,.35);display:flex;align-items:center;
 justify-content:space-between;padding:0 50px;font-size:31px;font-weight:700}
</style></head><body><div class="raios"></div>
<div class="topo">🔥 OFERTA IMPERDÍVEL 🔥</div>
<div class="foto"><img src="${esc(item.thumbnail)}"></div>${off}
<div class="titulo">${esc(item.title)}</div>
<div class="pontos">${pontos}</div>
<div class="rodape"><span>${esc(marca)}</span><span>⏰ Corre que acaba!</span></div>
</body></html>`;
}

// Devolve a arte em JPG (Buffer) ou null se der algum problema (aí o post vai com a foto simples).
export async function criarArte(item, { marca = 'Show de Ofertas ML' } = {}) {
  if (!item.thumbnail) return null;
  // Foto do painel vem pequena (D_Q_); a versão D_NQ_ tem mais qualidade.
  item = { ...item, thumbnail: item.thumbnail.replace('/D_Q_NP_2X_', '/D_NQ_NP_2X_') };
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.setContent(html(item, marca), { waitUntil: 'networkidle', timeout: 30_000 });
    const carregou = await page.$eval('.foto img', (img) => img.complete && img.naturalWidth > 0);
    if (!carregou) return null;
    return await page.screenshot({ type: 'jpeg', quality: 88 });
  } catch (e) {
    console.error(`[Arte] Não consegui montar a arte: ${e.message}`);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
