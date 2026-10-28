// Autoriza o agente na sua conta do Mercado Livre e salva o ML_REFRESH_TOKEN no .env.
// Uso: npm run ml-login
import readline from 'node:readline/promises';
import { config } from './config.js';
import { setEnvValue } from './envfile.js';

const { clientId, clientSecret, redirectUri } = config.ml;
if (!clientId || !clientSecret) {
  console.error('Preencha ML_CLIENT_ID e ML_CLIENT_SECRET no .env antes (nano .env).');
  process.exit(1);
}

const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}`
  + `&redirect_uri=${encodeURIComponent(redirectUri)}`;
console.log('\n1) Abra este link no navegador, entre na sua conta e toque em "Permitir":\n');
console.log(authUrl);
console.log(`\n2) Você será levado para ${redirectUri} com "?code=TG-..." no endereço.`);
console.log('   Copie o endereço inteiro da barra do navegador e cole aqui.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('Endereço (ou só o código TG-...): ')).trim();
rl.close();
const code = answer.match(/TG-[\w-]+/)?.[0] || answer;

const res = await fetch('https://api.mercadolibre.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }),
});
const data = await res.json();
if (!res.ok || !data.refresh_token) {
  console.error('\nFalhou:', JSON.stringify(data));
  console.error('Confira se o Redirect URI do app é exatamente', redirectUri, 'e se o escopo offline_access está marcado.');
  process.exit(1);
}
setEnvValue('ML_REFRESH_TOKEN', data.refresh_token);
console.log('\n✅ Pronto! Token salvo no .env. Agora rode: npm run dry-run');
