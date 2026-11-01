// Descrição dos grupos de ofertas (aprovada pelo Anderson em 31/10/2026).
export function groupDescription(invite) {
  return [
    '🔥 *SHOW DE OFERTAS ML* 🔥',
    'As melhores promoções do Mercado Livre, escolhidas a dedo todos os dias! 🛒',
    '',
    '✅ Só produtos *MAIS VENDIDOS* e bem avaliados',
    '💸 Descontos de verdade: preço de antes e preço de agora',
    '🎟️ Cupons quando tiver',
    '⏰ Ofertas o dia todo, das 8h às 22h',
    '',
    '⚠️ Preço e estoque mudam rápido: viu, gostou, garante!',
    ...(invite ? [`📲 Chame a família e os amigos: ${invite}`] : []),
    '🔕 Grupo só de ofertas: só os administradores postam.',
    '',
    'ℹ️ Os links são de afiliado: você paga o mesmo preço e ajuda o grupo a continuar.',
  ].join('\n');
}
