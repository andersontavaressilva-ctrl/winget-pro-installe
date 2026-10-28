import fs from 'node:fs';
import path from 'node:path';

// Guarda quais produtos já foram postados para não repetir.
export function createStore(file = './data/postados.json') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primeiro uso */ }

  return {
    wasPostedRecently(id, days) {
      const t = data[id];
      return Boolean(t) && Date.now() - t < days * 86_400_000;
    },
    markPosted(id) {
      data[id] = Date.now();
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    },
  };
}
