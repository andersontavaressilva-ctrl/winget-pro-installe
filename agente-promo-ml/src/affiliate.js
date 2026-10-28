import fs from 'node:fs';

// Gera o link de afiliado do produto.
// 1) Se houver um link curto cadastrado manualmente (painel de afiliados) para o ID, usa ele.
// 2) Senão aplica o modelo AFFILIATE_LINK_TEMPLATE.
export function createAffiliateLinker({ template, linksFile }) {
  let manual = {};
  try {
    if (linksFile && fs.existsSync(linksFile)) manual = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
  } catch (err) {
    console.error(`[Afiliado] Não foi possível ler ${linksFile}: ${err.message}`);
  }

  return (item) => {
    if (manual[item.id]) return manual[item.id];
    const cleanUrl = item.permalink.split('#')[0].split('?')[0];
    return template
      .replaceAll('{url_encoded}', encodeURIComponent(cleanUrl))
      .replaceAll('{url}', cleanUrl)
      .replaceAll('{id}', item.id);
  };
}
