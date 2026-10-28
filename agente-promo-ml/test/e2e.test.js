import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { startMock } from './mock-ml-server.js';

test('busca bloqueada (403) cai para os mais vendidos e calcula descontos', async () => {
  const mock = await startMock();
  process.env.ML_API_BASE = mock.url;
  const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agente-')), '.env');
  process.env.ENV_FILE = envFile;
  const { fetchDeals } = await import(`../src/mercadolivre.js?t=${Date.now()}`);
  const { rankDeals } = await import('../src/scorer.js');
  const ml = { clientId: 'a', clientSecret: 'b', refreshToken: '', site: 'MLB', searchTerms: ['fone', 'tv'], categories: ['MLB1051'], resultsPerSearch: 50 };

  const items = await fetchDeals(ml);
  mock.server.close();
  // refresh token novo devolvido pelo ML é salvo no .env
  assert.match(fs.readFileSync(envFile, 'utf8'), /ML_REFRESH_TOKEN=TG-new/);

  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.MLB111.discount, 50);
  assert.equal(byId.MLB111.bestSellerPosition, 1);
  assert.equal(byId.MLB222.discount, 34);           // veio de /items/{id}/prices
  assert.equal(byId.MLB444.title, 'Smartwatch Top'); // produto de catálogo
  assert.equal(byId.MLB444.full, true);
  // só uma tentativa de busca por termo depois do 403
  assert.equal(mock.calls.filter((c) => c.startsWith('/sites/')).length, 1);

  const ranked = rankDeals(items, { minDiscount: 20, minPrice: 20, maxPrice: 1500, requireFreeShipping: false, minScore: 55 });
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].id, 'MLB111');
});
