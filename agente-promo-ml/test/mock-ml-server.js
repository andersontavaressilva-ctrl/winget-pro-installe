// Servidor falso da API do Mercado Livre para testar o agente de ponta a ponta.
import http from 'node:http';

const item = (id, price, original, extra = {}) => ({
  id, title: `Produto ${id}`, price, original_price: original, condition: 'new',
  permalink: `https://produto.mercadolivre.com.br/${id}`, thumbnail: `http://img/${id}-I.jpg`,
  shipping: { free_shipping: true }, ...extra,
});

export function startMock({ searchStatus = 403 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url);
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/oauth/token') return send(200, { access_token: 'tok', expires_in: 21600, refresh_token: 'TG-new' });
    if (req.headers.authorization !== 'Bearer tok') return send(401, { error: 'unauthorized' });
    if (u.pathname.startsWith('/sites/MLB/search')) {
      return searchStatus === 200 ? send(200, { results: [item('MLB900', 50, 100)] }) : send(403, { message: 'forbidden' });
    }
    if (u.pathname === '/highlights/MLB/category/MLB1051') {
      return send(200, { content: [
        { id: 'MLB111', position: 1, type: 'ITEM' },
        { id: 'MLB222', position: 2, type: 'ITEM' },
        { id: 'MLBP333', position: 3, type: 'PRODUCT' },
      ] });
    }
    if (u.pathname === '/items') {
      return send(200, u.searchParams.get('ids').split(',').map((id) => ({
        code: 200,
        body: id === 'MLB111' ? item(id, 89.9, 179.9, { official_store_id: 1 }) : item(id, 300, null),
      })));
    }
    if (u.pathname === '/items/MLB222/prices') {
      return send(200, { prices: [{ type: 'promotion', amount: 199, regular_amount: 300 }] });
    }
    if (u.pathname.match(/^\/items\/.+\/prices$/)) return send(200, { prices: [] });
    if (u.pathname === '/products/MLBP333') return send(200, { name: 'Smartwatch Top', pictures: [{ url: 'https://img/p.jpg' }], permalink: 'https://www.mercadolivre.com.br/p/MLBP333' });
    if (u.pathname === '/products/MLBP333/items') {
      return send(200, { results: [{ item_id: 'MLB444', price: 120, original_price: 240, condition: 'new', shipping: { free_shipping: true, logistic_type: 'fulfillment' } }] });
    }
    send(404, { error: 'not_found', path: u.pathname });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}
