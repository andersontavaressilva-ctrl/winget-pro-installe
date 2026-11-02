import fs from 'node:fs';
import path from 'node:path';

// Guarda quais produtos já foram postados (quando e por quanto) para não repetir.
export function createStore(file = './data/postados.json') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primeiro uso */ }
  // Registros antigos guardavam só a hora do post, sem o preço.
  const get = (id) => (typeof data[id] === 'number' ? { at: data[id] } : data[id]);

  return {
    // Produto repetido só volta depois de "days" dias, ou antes disso se o preço baixou.
    wasPostedRecently(item, days) {
      const rec = get(item.id);
      if (!rec || Date.now() - rec.at >= days * 86_400_000) return false;
      return !(rec.price && item.price < rec.price);
    },
    lastPostedAt() {
      return Math.max(0, ...Object.keys(data).map((id) => get(id).at));
    },
    markPosted(item) {
      data[item.id] = { at: Date.now(), price: item.price };
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    },
  };
}
