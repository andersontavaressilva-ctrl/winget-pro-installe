// Dá uma nota de 0 a 100 para a chance de venda de um produto em promoção.
// A ideia: desconto real + prova social (vendas/avaliações) + confiança no
// vendedor + facilidade de compra (frete grátis, Full, preço de impulso).
export function scoreItem(item) {
  let score = 0;
  const reasons = [];

  // Desconto (até 35 pts)
  score += Math.min(item.discount, 70) / 2;
  if (item.discount >= 40) reasons.push(`${item.discount}% OFF`);

  // Prova social: ranking de mais vendidos ou quantidade vendida (até 20 pts)
  if (item.bestSellerPosition) {
    const p = item.bestSellerPosition;
    score += p <= 5 ? 20 : p <= 10 ? 16 : 12;
    reasons.push(`top ${p} mais vendidos`);
  } else if (item.soldQuantity != null) {
    const s = item.soldQuantity;
    score += s >= 5000 ? 20 : s >= 1000 ? 16 : s >= 500 ? 12 : s >= 100 ? 8 : s >= 25 ? 4 : 0;
    if (s >= 500) reasons.push(`+${s} vendidos`);
  } else {
    score += 6; // a API nem sempre informa; nota neutra
  }

  // Avaliações (até 10 pts)
  if (item.rating != null) {
    if (item.rating >= 4.5) score += 10;
    else if (item.rating >= 4) score += 6;
    else if (item.rating < 3.5) score -= 10;
  } else {
    score += 4;
  }

  // Vendedor (até 15 pts)
  if (item.officialStore) { score += 8; reasons.push('loja oficial'); }
  if (item.powerSeller === 'platinum') score += 7;
  else if (item.powerSeller === 'gold') score += 5;
  else if (item.powerSeller === 'silver') score += 3;
  if (item.sellerLevel && /^[12]_/.test(item.sellerLevel)) score -= 10; // reputação vermelha/laranja

  // Facilidade de compra (até 15 pts)
  if (item.freeShipping) { score += 7; reasons.push('frete grátis'); }
  if (item.full) score += 4;
  if (item.installments && item.installments.rate === 0 && item.installments.quantity > 1) score += 4;

  // Preço de impulso: produtos baratos vendem mais por impulso no grupo (até 5 pts)
  if (item.price <= 100) score += 5;
  else if (item.price <= 300) score += 3;

  if (item.condition && item.condition !== 'new') score -= 15;

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function passesFilters(item, f) {
  if (item.discount < f.minDiscount) return false;
  if (item.price < f.minPrice || item.price > f.maxPrice) return false;
  if (f.requireFreeShipping && !item.freeShipping) return false;
  // Desconto absurdo costuma ser preço "inflado" antes da promoção
  if (item.discount > 85) return false;
  return true;
}

export function rankDeals(items, filters) {
  return items
    .filter((i) => passesFilters(i, filters))
    .map((i) => ({ ...i, ...scoreItem(i) }))
    .filter((i) => i.score >= filters.minScore)
    .sort((a, b) => b.score - a.score);
}
