// Botão de favorito do Chrome: "Mandar ofertas pro robô".
// O Anderson clica nele com o painel de afiliados aberto (filtro "Mais vendidos").
// Ele lê os produtos da tela, abre o "Compartilhar" de cada um (que gera o link
// meli.la da conta dele) e manda tudo para o robô neste computador.
//
// A função abaixo roda DENTRO da página do Mercado Livre, não no Node.

/* eslint-disable no-undef */
async function mandarOfertas(ROBO, MAX) {
  if (!/mercadolivre\.com\.br\/afiliados\/hub/.test(location.href)) {
    alert('Abra o painel de afiliados do Mercado Livre (filtro "Mais vendidos") e clique de novo.');
    return;
  }
  const janela = window.open(ROBO + '/receber', 'robo-ofertas', 'width=480,height=340');
  if (!janela) {
    alert('O Chrome bloqueou a janelinha do robô. Permita pop-ups neste site e clique de novo.');
    return;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const links = {};
  const guarda = (txt) => {
    try {
      const j = JSON.parse(txt);
      for (const u of j.urls || []) {
        const m = /MLB-?(\d+)/i.exec(u.origin_url || '');
        if (m && u.short_url) links['MLB' + m[1]] = u.short_url;
      }
    } catch (e) { /* resposta que não é de link */ }
  };
  // Escuta a resposta do "Compartilhar" para pegar o link meli.la.
  const f0 = window.fetch;
  window.fetch = async function (i) {
    const r = await f0.apply(this, arguments);
    try { if (String(typeof i === 'string' ? i : i.url).includes('createLink')) guarda(await r.clone().text()); } catch (e) { /* ignora */ }
    return r;
  };
  const op = XMLHttpRequest.prototype.open;
  const se = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return op.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (String(this.__u).includes('createLink')) this.addEventListener('load', () => guarda(this.responseText));
    return se.apply(this, arguments);
  };
  const fechar = () => {
    const b = document.querySelector('.andes-modal__close-button, [aria-label="Fechar"]');
    if (b) b.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  };
  const reais = (label) => {
    const m = /([\d.]+)\s*reais?(?:\s*com\s*(\d+)\s*centavos?)?/i.exec(label || '');
    return m ? Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2]) / 100 : 0) : null;
  };
  const brl = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
  const vendidos = (t) => {
    const m = /\+?\s*([\d.,]+)\s*(mil)?\s*vendidos/i.exec(t || '');
    return m ? Math.round(brl(m[1]) * (m[2] ? 1000 : 1)) : null;
  };

  const itens = [];
  for (const c of [...document.querySelectorAll('li.poly-card')].slice(0, MAX)) {
    const a = c.querySelector('a.poly-component__title');
    const m = /MLB-?(\d+)/i.exec(a ? a.href : '');
    if (!m) continue;
    const id = 'MLB' + m[1];
    const btn = [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Compartilhar');
    if (btn && !links[id]) {
      c.scrollIntoView({ block: 'center' });
      await sleep(500 + Math.random() * 500);
      btn.click();
      for (let t = 0; t < 30 && !links[id]; t++) await sleep(200);
      await sleep(300);
      fechar();
      await sleep(400 + Math.random() * 400);
    }
    if (!links[id]) continue;

    const img = c.querySelector('img.poly-component__picture');
    const src = (img && (img.getAttribute('data-src') || img.src)) || '';
    const texto = c.innerText;
    const labels = [...c.querySelectorAll('.poly-component__review-compacted .polylabel-label')].map((e) => e.textContent.trim());
    const disc = (c.querySelector('.poly-price__disc-label') || {}).textContent || '';
    const parc = /(\d+)x\s*R\$\s*([\d.]+(?:,\d+)?)\s*(sem juros)?/i.exec(texto);
    const outros = /ou\s*R\$\s*([\d.]+(?:,\d+)?)\s*em outros meios/i.exec(texto);
    const price = reais((c.querySelector('.poly-price__current .andes-money-amount') || { getAttribute: () => '' }).getAttribute('aria-label'));
    const originalPrice = reais((c.querySelector('.andes-money-amount--previous') || { getAttribute: () => '' }).getAttribute('aria-label'));
    itens.push({
      id,
      link: links[id],
      title: a.textContent.trim(),
      permalink: a.href.split('?')[0].split('#')[0],
      thumbnail: src.startsWith('http') ? src.replace(/\.webp$/, '.jpg') : null,
      price,
      originalPrice,
      discount: Number((/(\d+)%/.exec(disc) || [])[1] || (originalPrice && price ? Math.round((1 - price / originalPrice) * 100) : 0)),
      pix: /pix/i.test(disc),
      otherMethodsPrice: outros ? brl(outros[1]) : null,
      installments: parc ? { quantity: Number(parc[1]), amount: brl(parc[2]), rate: parc[3] ? 0 : 1 } : null,
      rating: labels[0] ? Number(labels[0].replace(',', '.')) : null,
      soldQuantity: vendidos(labels[1]),
    });
  }
  window.fetch = f0;
  XMLHttpRequest.prototype.open = op;
  XMLHttpRequest.prototype.send = se;

  // Entrega para a janelinha do robô e espera a confirmação.
  let ok = false;
  window.addEventListener('message', (e) => { if (e.origin === ROBO && e.data && e.data.tipo === 'recebido') ok = true; });
  for (let t = 0; t < 40 && !ok; t++) {
    janela.postMessage({ tipo: 'ofertas', itens }, ROBO);
    await sleep(500);
  }
  if (!ok) alert('Não consegui entregar as ofertas para o robô. Ele está ligado neste computador?');
}
/* eslint-enable no-undef */

export function bookmarkletHref(port, max = 20) {
  const code = `(${mandarOfertas.toString()})('http://127.0.0.1:${port}', ${max})`;
  return 'javascript:' + encodeURIComponent(code);
}
