const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const HOOKS = ['🔥 OFERTA RELÂMPAGO', '💥 PREÇO DESPENCOU', '🚨 ACHADO DO DIA', '⚡ CORRE QUE ACABA', '🤑 PROMOÇÃO IMPERDÍVEL'];

export function buildMessage(item, link) {
  const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
  const lines = [`*${hook}*`, '', `📦 *${item.title}*`, ''];

  if (item.originalPrice && item.originalPrice > item.price) {
    lines.push(`~De ${brl(item.originalPrice)}~`);
  }
  lines.push(`✅ *Por ${brl(item.price)}*  (${item.discount}% OFF)`);

  if (item.installments && item.installments.quantity > 1) {
    const juros = item.installments.rate === 0 ? ' sem juros' : '';
    lines.push(`💳 ${item.installments.quantity}x de ${brl(item.installments.amount)}${juros}`);
  }

  const extras = [];
  if (item.freeShipping) extras.push('🚚 Frete grátis');
  if (item.full) extras.push('⚡ Envio Full');
  if (item.officialStore) extras.push('🏬 Loja oficial');
  if (item.soldQuantity >= 100) extras.push(`🛒 +${item.soldQuantity} vendidos`);
  if (item.rating) extras.push(`⭐ ${item.rating.toFixed(1)}`);
  if (extras.length) lines.push('', extras.join('  |  '));

  lines.push('', `👉 *Compre aqui:* ${link}`, '', '_Preço e estoque podem mudar a qualquer momento._');
  return lines.join('\n');
}
