// Tira do nome do produto os pontos fortes que fazem a pessoa querer comprar
// (ex.: "850w" -> "⚡ Potência de 850W"), mais a prova social (vendas e nota).
// Usado na arte da oferta no lugar do preço.

const MARCAS = ['Makita', 'Lupo', 'Kappa', 'Puma', 'Bracol', 'Marluvas', 'Tork', 'Brastemp', 'Consul', 'Samsung', 'Apple',
  'Xiaomi', 'Motorola', 'LG', 'Philips', 'Mondial', 'Electrolux', 'Nike', 'Adidas', 'Olympikus', 'Mizuno', 'Fila', 'Bosch',
  'Tramontina', 'JBL', 'Multilaser', 'Positivo', 'Lenovo', 'Dell', 'Asus', 'Acer', 'Havaianas', 'Hering', 'Wap', 'Arno',
  'Britânia', 'Oster', 'Cadence', 'Dewalt', 'Vonder', 'Stanley', 'Intelbras', 'Lacoste', 'Oakley', 'Colgate', 'Nivea', 'Natura'];

const num = (s) => s.replace('.', ',');

// [regra, emoji, texto] — o texto pode usar o que o regex pegou.
const REGRAS = [
  [/\bkit\s*(?:com\s*)?(\d+)/i, '📦', (m, t) => `Kit com ${m[1]} ${/pares/i.test(t) ? 'pares' : 'unidades'}`],
  [/^(?!.*\bkit\b).*?\b(\d+)\s*pares\b/i, '📦', (m) => `Vem ${m[1]} pares`],
  [/\b(\d+(?:[.,]\d+)?)\s*w\b/i, '⚡', (m) => `Potência de ${num(m[1])}W`],
  [/\b(\d+(?:[.,]\d+)?)\s*(?:l|litros)\b/i, '🧊', (m) => `${num(m[1])} litros de capacidade`],
  [/\b(\d+)\s*mah\b/i, '🔋', (m) => `Bateria de ${m[1]}mAh`],
  [/\b(\d+)\s*(gb|tb)\b/i, '💾', (m) => `${m[1]}${m[2].toUpperCase()} de memória`],
  [/\b(\d+(?:[.,]\d+)?)\s*(?:polegadas|pol|")/i, '📺', (m) => `Tela de ${num(m[1])} polegadas`],
  [/\b(\d+(?:[.,]\d+)?)\s*mm\b/i, '📏', (m) => `Medida de ${num(m[1])}mm`],
  [/\b(\d+(?:[.,]\d+)?)\s*kg\b/i, '⚖️', (m) => `${num(m[1])} kg`],
  [/frost\s*free/i, '❄️', () => 'Frost free: não forma gelo'],
  [/inteligente|\bsmart\b/i, '🤖', () => 'Inteligente'],
  [/bluetooth/i, '🎧', () => 'Bluetooth, sem fio'],
  [/sem\s*fio|wireless/i, '📡', () => 'Sem fio'],
  [/sem\s*costura/i, '✨', () => 'Sem costura: não marca'],
  [/algod[aã]o/i, '🌿', () => 'Algodão macio'],
  [/microfibra/i, '🌬️', () => 'Microfibra leve'],
  [/dry\s*-?fit/i, '💨', () => 'Dry fit: seca rápido'],
  [/imperme[aá]vel|prova\s*d.?[aá]gua/i, '💧', () => 'Impermeável'],
  [/prova\s*(?:de\s*)?vento/i, '🌬️', () => 'Resiste ao vento'],
  [/\buv\b/i, '☀️', () => 'Proteção UV'],
  [/autom[aá]tic/i, '⚙️', () => 'Abre e fecha automático'],
  [/port[aá]til/i, '🎒', () => 'Portátil: leva para todo lado'],
  [/inox/i, '✨', () => 'Aço inox'],
  [/seguran[cç]a|\bepi\b|\bca\b/i, '🦺', () => 'Com CA: segurança no trabalho'],
  [/academia|treino|corrida|caminhada/i, '🏃', () => 'Ideal para treino e caminhada'],
  [/confort/i, '☁️', () => 'Super confortável'],
  [/cintura\s*alta/i, '👖', () => 'Cintura alta'],
  [/wide\s*leg/i, '👖', () => 'Modelagem wide leg'],
  [/antiescara/i, '🛏️', () => 'Ajuda a prevenir escaras'],
  [/\bled\b/i, '💡', () => 'Iluminação LED'],
  [/impressora\s*3d|\b3d\b/i, '🖨️', () => 'Para impressora 3D'],
  [/unissex/i, '👫', () => 'Unissex'],
  [/original/i, '✅', () => '100% original'],
];

export function sellingPoints(item, max = 4) {
  const title = item.title || '';
  const pontos = [];
  const add = (emoji, text) => {
    if (pontos.length < max && !pontos.some((p) => p.text === text)) pontos.push({ emoji, text });
  };

  // Até 2 pontos do próprio produto primeiro, depois marca e prova social.
  for (const [re, emoji, fn] of REGRAS) {
    if (pontos.length >= 2) break;
    const m = re.exec(title);
    if (m) add(emoji, fn(m, title));
  }
  const marca = MARCAS.find((b) => new RegExp(`\\b${b}\\b`, 'i').test(title));
  if (marca) add('🏷️', `Marca ${marca}`);
  if (item.soldQuantity >= 1000) add('🏆', `+${Math.floor(item.soldQuantity / 1000).toLocaleString('pt-BR')} mil vendidos`);
  else if (item.soldQuantity >= 100) add('🏆', `+${item.soldQuantity} vendidos`);
  if (item.rating >= 4.5) add('⭐', `Nota ${item.rating.toFixed(1).replace('.', ',')} de 5`);
  if (item.freeShipping) add('🚚', 'Frete grátis');

  // Se ainda sobrar espaço, usa mais características do nome.
  for (const [re, emoji, fn] of REGRAS) {
    const m = re.exec(title);
    if (m) add(emoji, fn(m, title));
  }
  return pontos;
}
