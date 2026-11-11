import http from 'node:http';
import os from 'node:os';
import { bookmarkletHref } from './botao-favorito.js';

// Servidor pequeno, só para a rede de casa, que recebe as ofertas mandadas pelo
// botão de favorito do Chrome (de qualquer computador da casa).
//   /         página para arrastar o botão para a barra de favoritos
//   /receber  janelinha que o botão abre para entregar as ofertas
//   /fila     (POST) grava as ofertas na lista do robô

const ML = 'https://www.mercadolivre.com.br';
const LINK_OK = /^https:\/\/(meli\.la|mercadolivre\.com|www\.mercadolivre\.com\.br)\//;

const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#222}
.botao{display:inline-block;background:#3483fa;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600}
.ok{color:#00a650;font-weight:600}.erro{color:#d9363e;font-weight:600}li{margin:6px 0}</style></head><body>${body}</body></html>`;

// Só guarda os campos esperados e com formato conhecido.
function limpar(i) {
  if (!i || !/^MLB\d+$/.test(i.id) || !LINK_OK.test(i.link || '') || !(i.price > 0)) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const inst = i.installments && n(i.installments.quantity) ? {
    quantity: n(i.installments.quantity), amount: n(i.installments.amount), rate: i.installments.rate === 0 ? 0 : 1,
  } : null;
  return {
    id: i.id,
    link: i.link,
    title: String(i.title || '').slice(0, 200),
    permalink: /^https:\/\/[a-z.]*mercadolivre\.com\.br\//.test(i.permalink || '') ? i.permalink : null,
    thumbnail: /^https:\/\/http2\.mlstatic\.com\//.test(i.thumbnail || '') ? i.thumbnail : null,
    price: n(i.price),
    originalPrice: n(i.originalPrice),
    discount: n(i.discount) || 0,
    pix: Boolean(i.pix),
    otherMethodsPrice: n(i.otherMethodsPrice),
    installments: inst,
    rating: n(i.rating),
    soldQuantity: n(i.soldQuantity),
    condition: 'new',
  };
}

// Endereços da rede de casa (e o próprio computador). Quem vem de fora é recusado.
const REDE_DE_CASA = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/;

// Endereço deste computador na rede, para mostrar no registro.
function enderecoNaRede() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const a of lista || []) if (a.family === 'IPv4' && !a.internal && /^(10|192\.168|172)\./.test(a.address)) return a.address;
  }
  return '127.0.0.1';
}

export function startServer({ port, host = '0.0.0.0', filters, queue, onReceive = () => {}, log = console.log }) {
  const server = http.createServer((req, res) => {
    if (!REDE_DE_CASA.test(req.socket.remoteAddress || '')) {
      res.writeHead(403);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === 'GET' && url.pathname === '/') {
      // O botão aponta para o mesmo endereço por onde esta página foi aberta
      // (127.0.0.1 neste computador, o IP dele nos outros computadores da casa).
      const robo = /^[\w.\-]+:\d+$/.test(req.headers.host || '') ? `http://${req.headers.host}` : `http://127.0.0.1:${port}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Robô de ofertas', `<h2>🤖 Robô de ofertas</h2>
<p>Ofertas esperando para postar: <b>${queue.size()}</b></p>
<p><b>Instalar o botão (uma vez só):</b> arraste o botão azul abaixo para a <b>barra de favoritos</b> do Chrome
(se ela não aparece, aperte <b>Ctrl+Shift+B</b>).</p>
<p><a class="botao" href="${bookmarkletHref(robo, filters)}">📦 Mandar ofertas pro robô</a></p>
<p><b>Uso (1 vez por dia):</b></p><ol>
<li>Abra o <a href="${ML}/afiliados/hub" target="_blank">painel de afiliados</a> e ligue o filtro <b>Mais vendidos</b>.</li>
<li>Clique no favorito <b>📦 Mandar ofertas pro robô</b> e espere uns 2 minutos (ele desce a página sozinho para carregar mais produtos).</li>
<li>Uma janelinha confirma quantas ofertas o robô recebeu.</li></ol>`));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/receber') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Recebendo ofertas', `<h3>🤖 Robô de ofertas</h3><p id="s">Gerando os links no painel... aguarde.</p>
<script>
let feito = false;
window.addEventListener('message', async (e) => {
  if (e.origin !== '${ML}' || !e.data || e.data.tipo !== 'ofertas' || feito) return;
  feito = true;
  e.source.postMessage({ tipo: 'recebido' }, '${ML}');
  const s = document.getElementById('s');
  try {
    const r = await fetch('/fila', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: e.data.itens }) });
    const j = await r.json();
    const pulados = Number(e.data.pulados) ? '<br>Puladas na página por pouco desconto ou preço fora da faixa: ' + Number(e.data.pulados) : '';
    s.innerHTML = '<span class="ok">✅ Pronto! O robô recebeu ' + j.validos + ' ofertas (' + j.novos + ' novas).</span>' + pulados + '<br>Em instantes chega no seu WhatsApp a lista das que podem ser postadas.<br><br>Pode fechar esta janela.';
  } catch (err) {
    s.innerHTML = '<span class="erro">❌ Não consegui entregar para o robô: ' + err.message + '</span>';
  }
});
</script>`));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/fila') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
      req.on('end', () => {
        try {
          const itens = (JSON.parse(body).itens || []).map(limpar).filter(Boolean);
          const novos = queue.add(itens);
          log(`Botão do Chrome: recebi ${itens.length} ofertas (${novos} novas). Na fila: ${queue.size()}.`);
          onReceive(itens);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ validos: itens.length, novos, naFila: queue.size() }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ erro: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  // Escuta a rede de casa; o filtro lá em cima recusa quem vem da internet.
  server.listen(port, host, () => log(`Botão do Chrome: abra http://${host === '127.0.0.1' ? host : enderecoNaRede()}:${port} para instalar.`));
  return server;
}
