import fs from 'node:fs';
import path from 'node:path';

// Lista de ofertas esperando para serem postadas. Ela é enchida pelo botão
// "Mandar ofertas pro robô" (clicado no painel de afiliados) e esvaziada aos
// poucos pelo robô, um post por vez.
export function createQueue(file = './data/fila.json', maxAgeHours = 36) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let items = [];
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primeiro uso */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(items, null, 2));
  // Preço muda rápido: oferta velha sai da lista sem ser postada.
  const fresh = () => {
    const limit = Date.now() - maxAgeHours * 3_600_000;
    const before = items.length;
    items = items.filter((i) => i.receivedAt >= limit);
    if (items.length !== before) save();
  };

  return {
    // Junta ofertas novas; se o produto já está na lista, atualiza preço e link.
    add(novos) {
      const now = Date.now();
      let added = 0;
      for (const n of novos) {
        const idx = items.findIndex((i) => i.id === n.id);
        if (idx >= 0) items[idx] = { ...items[idx], ...n, receivedAt: now };
        else { items.push({ ...n, receivedAt: now }); added++; }
      }
      save();
      return added;
    },
    all() { fresh(); return [...items]; },
    remove(id) { items = items.filter((i) => i.id !== id); save(); },
    size() { fresh(); return items.length; },
  };
}
