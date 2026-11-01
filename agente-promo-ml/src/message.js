const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Frases de chamada no estilo dos grupos de ofertas (modelo enviado pelo Anderson).
const HOOKS = [
  'GENTEEEE OLHA ESSE PREÇO 😱😱',
  'CORREEEE QUE TÁ BARATO DEMAIS 🏃‍♂️💨',
  'ACHADINHO DO DIA 🔎✨',
  'O PREÇO DESPENCOU 📉😱',
  'QUEM PEDIU DESCONTO?? 🙋🔥',
  'OFERTA BOA DEMAIS PRA DEIXAR PASSAR 🤑',
];

// Código de cupom de verdade (ex.: ELETRO300); textos como "R$ 20 OFF" não são código.
const couponCode = (c) => (/^[A-Z0-9]{4,20}$/.test(c || '') && /[A-Z]/.test(c) ? c : null);

export function buildMessage(item, link) {
  const hook = item.discount >= 40
    ? `${item.discount}% OFF 😱 TÁ QUASE DE GRAÇA`
    : HOOKS[Math.floor(Math.random() * HOOKS.length)];
  const lines = [`*${hook}*`, '', `> 🛍️ ${item.title}`, ''];

  if (item.originalPrice && item.originalPrice > item.price) {
    lines.push(`~de ${brl(item.originalPrice)}~`);
  }
  const off = item.discount ? ` (${item.discount}% OFF)` : '';
  lines.push(`💸 *por ${brl(item.price)}*${item.pix ? ' no Pix' : ''} 🔥${off}`);
  if (item.otherMethodsPrice) lines.push(`ou ${brl(item.otherMethodsPrice)} em outros meios`);

  if (item.installments && item.installments.quantity > 1) {
    const juros = item.installments.rate === 0 ? ' sem juros' : '';
    lines.push(`💳 ou ${item.installments.quantity}x de ${brl(item.installments.amount)}${juros}`);
  }

  const code = couponCode(item.coupon);
  if (code) lines.push('', `🎟️ Use o cupom: \`${code}\``);
  else if (item.coupon) lines.push('', `🎟️ ${item.coupon} (ative na página do produto)`);

  const extras = [];
  if (item.freeShipping) extras.push('🚚 Frete grátis');
  if (item.full) extras.push('⚡ Full');
  if (item.rating) extras.push(`⭐ ${item.rating.toFixed(1)}`);
  if (item.soldQuantity >= 100) extras.push(`🛒 +${item.soldQuantity.toLocaleString('pt-BR')} vendidos`);
  if (extras.length) lines.push('', extras.join('  |  '));

  lines.push('', '🛒 *COMPRE AGORA NO LINK AQUI* 👇👇👇', link, '', '_Preço e estoque podem mudar a qualquer momento._');
  return lines.join('\n');
}
