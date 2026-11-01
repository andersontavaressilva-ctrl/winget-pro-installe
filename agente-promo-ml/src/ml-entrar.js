import fs from 'node:fs';
import { abrirNavegador, estaLogado, salvarSessao } from './navegador.js';

// Abre o navegador do robô na tela para o Anderson entrar na conta do Mercado Livre.
// Ele mesmo digita e-mail, senha e códigos. A entrada fica salva em ./data/sessao-ml.json.
// Uso: npm run ml-entrar

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync('./data', { recursive: true });
const context = await abrirNavegador({ visivel: true });
const page = context.pages()[0] || await context.newPage();
await page.bringToFront();
await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'domcontentloaded' });
console.log('Navegador aberto. Entre na sua conta do Mercado Livre nele (até 15 minutos).');

const limite = Date.now() + 15 * 60_000;
let entrou = false;
while (Date.now() < limite) {
  await sleep(3000);
  if (page.isClosed()) break;
  const fora = /\/login|\/lgz/.test(page.url());
  if (!fora && await estaLogado(context).catch(() => false)) {
    // Espera a página terminar de carregar antes de guardar a entrada.
    await sleep(5000);
    await salvarSessao(context);
    entrou = true;
    break;
  }
}

console.log(entrou ? 'PRONTO: conta conectada no navegador do robô.' : 'NAO_ENTROU: tempo esgotado ou janela fechada.');
if (entrou) {
  await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(4000);
}
await context.close().catch(() => {});
process.exit(entrou ? 0 : 1);
