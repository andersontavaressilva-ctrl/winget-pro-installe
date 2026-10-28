import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from '../src/mercadolivre.js';
import { rankDeals, scoreItem } from '../src/scorer.js';
import { createAffiliateLinker } from '../src/affiliate.js';
import { buildMessage } from '../src/message.js';

const raw = {
  id: 'MLB123',
  title: 'Fone Bluetooth XYZ',
  price: 79.9,
  original_price: 159.9,
  permalink: 'https://produto.mercadolivre.com.br/MLB-123-fone-bluetooth-_JM#position=1',
  thumbnail: 'http://http2.mlstatic.com/D_123-I.jpg',
  shipping: { free_shipping: true, logistic_type: 'fulfillment' },
  official_store_id: 10,
  sold_quantity: 1200,
  condition: 'new',
  installments: { quantity: 6, amount: 13.32, rate: 0 },
};

const filters = { minDiscount: 20, minPrice: 20, maxPrice: 1500, requireFreeShipping: false, minScore: 55 };

test('normaliza item e calcula desconto', () => {
  const item = normalizeItem(raw);
  assert.equal(item.discount, 50);
  assert.equal(item.thumbnail, 'https://http2.mlstatic.com/D_123-O.jpg');
  assert.equal(item.full, true);
});

test('produto bom passa, produto ruim é descartado', () => {
  const good = normalizeItem(raw);
  const bad = normalizeItem({ ...raw, id: 'MLB2', original_price: 85, official_store_id: null, shipping: {} });
  const ranked = rankDeals([bad, good], filters);
  assert.deepEqual(ranked.map((i) => i.id), ['MLB123']);
  assert.ok(scoreItem(good).score >= 70);
});

test('link de afiliado usa modelo e remove rastreio da URL', () => {
  const link = createAffiliateLinker({ template: '{url}?matt_tool=111&matt_word=abc', linksFile: '' })(normalizeItem(raw));
  assert.equal(link, 'https://produto.mercadolivre.com.br/MLB-123-fone-bluetooth-_JM?matt_tool=111&matt_word=abc');
});

test('mensagem contém preço e link', () => {
  const msg = buildMessage(normalizeItem(raw), 'https://link');
  assert.match(msg, /R\$\s?79,90/);
  assert.match(msg, /https:\/\/link/);
  assert.match(msg, /6x de/);
});
