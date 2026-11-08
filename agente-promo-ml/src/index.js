import fs from 'node:fs';
import { config } from './config.js';
import { rankDeals, passesFilters } from './scorer.js';
import { buildMessage } from './message.js';
import { createStore } from './store.js';
import { createQueue } from './fila.js';
import { startServer } from './servidor.js';
import { criarArte } from './arte.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ONCE = args.has('--once');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toLocaleString('pt-BR')}]`, ...a);

function insidePostingHours() {
  const h = new Date().getHours();
  return h >= config.schedule.startHour && h < config.schedule.endHour;
}

// Próximas ofertas da fila: melhor nota primeiro, sem repetir produto já postado.
function nextDeals(queue, store, n) {
  const pending = queue.all().filter((i) => {
    if (!store.wasPostedRecently(i, config.schedule.repostAfterDays)) return true;
    queue.remove(i.id);
    return false;
  });
  return rankDeals(pending, config.filters).slice(0, n);
}

// Quantas ofertas da lista ainda podem ser postadas (passam nos filtros e não repetem).
function pendingCount(queue, store) {
  const fresh = queue.all().filter((i) => !store.wasPostedRecently(i, config.schedule.repostAfterDays));
  return rankDeals(fresh, config.filters).length;
}

// Por que uma oferta da lista não pode ser postada.
function motivoFora(item, store) {
  const f = config.filters;
  if (store.wasPostedRecently(item, config.schedule.repostAfterDays)) return 'já postadas há pouco tempo';
  if (item.discount < f.minDiscount) return `com menos de ${f.minDiscount}% de desconto`;
  if (!passesFilters(item, f)) return 'fora das regras de preço e desconto';
  return 'com nota baixa';
}

// Resumo para o Anderson: todas as ofertas que podem ser postadas e quantas ficaram de fora.
function resumoDaLista(queue, store) {
  const todas = queue.all();
  const prontas = rankDeals(todas.filter((i) => !store.wasPostedRecently(i, config.schedule.repostAfterDays)), config.filters);
  const ids = new Set(prontas.map((i) => i.id));
  const motivos = {};
  for (const i of todas) {
    if (ids.has(i.id)) continue;
    const m = motivoFora(i, store);
    motivos[m] = (motivos[m] || 0) + 1;
  }
  const preco = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const linhas = [`📋 *Ofertas conferidas*\n\n✅ *Podem ser postadas: ${prontas.length}*`];
  prontas.forEach((i, n) => linhas.push(`${n + 1}. ${i.title.slice(0, 45)} - ${preco(i.price)} (${i.discount}% OFF)`));
  const fora = todas.length - prontas.length;
  if (fora) {
    linhas.push(`\n🚫 *Ficaram de fora: ${fora}*`);
    for (const [m, q] of Object.entries(motivos)) linhas.push(`• ${q} ${m}`);
  }
  return linhas.join('\n');
}

// Minutos entre um post e outro para a lista durar até o fim do horário.
// Fica entre o mínimo e o máximo do .env; 0 = lista vazia.
function postingGapMinutes(queue, store, now = new Date()) {
  const n = pendingCount(queue, store);
  if (!n) return 0;
  const end = new Date(now);
  end.setHours(config.schedule.endHour, 0, 0, 0);
  const minutesLeft = Math.max(0, (end - now) / 60_000);
  const gap = Math.round(minutesLeft / n);
  return Math.min(config.schedule.maxIntervalMinutes, Math.max(config.schedule.minIntervalMinutes, gap));
}

// Abre a página pública de cada produto para ver cupom, frete e uma foto maior.
// Se não der (ex.: o Mercado Livre pedir verificação), posta com o que já tem.
async function enrich(items) {
  const nav = await import('./navegador.js');
  let context;
  try {
    context = await nav.abrirNavegador({ headless: config.browser.headless });
  } catch (e) {
    log('Não consegui abrir o navegador para ver cupom:', e.message);
    return items;
  }
  const out = [];
  let skip = false;
  try {
    for (const item of items) {
      if (skip || !item.permalink) { out.push(item); continue; }
      try {
        out.push(await nav.detalharProduto(context, item));
      } catch (e) {
        log(`Sem detalhes de "${item.title}": ${e.message}`);
        if (e.motivo) skip = true; // verificação: não insiste
        out.push(item);
      }
    }
  } finally {
    await context.close().catch(() => {});
  }
  return out;
}

let lastReminderDay = '';

async function remindEmptyQueue(notify) {
  const today = new Date().toDateString();
  if (!notify || lastReminderDay === today || new Date().getHours() < 9) return;
  lastReminderDay = today;
  await notify('📦 A lista de ofertas do robô acabou.\nAbra o painel de afiliados (filtro "Mais vendidos") e clique no favorito *📦 Mandar ofertas pro robô*.');
}

let postsSinceStatus = Infinity;

// Repete a oferta no status do WhatsApp, com o convite do grupo no final.
async function postToStatus(status, text, image) {
  if (++postsSinceStatus < config.whatsapp.statusEvery) return;
  postsSinceStatus = 0;
  try {
    const invite = await status.invite();
    const convite = invite ? `\n\n📲 *Entre no grupo de ofertas e receba todas:*\n${invite}` : '';
    await status.post(text + convite, image);
    log(config.whatsapp.statusMode === 'manual' ? 'Arte do status enviada para o seu WhatsApp.' : 'Postado também no status.');
  } catch (e) {
    log('Não consegui postar no status:', e.message);
  }
}

async function runCycle({ getChat, store, queue, notify, status }) {
  if (!DRY_RUN && !insidePostingHours()) {
    log('Fora do horário de postagem, pulando ciclo.');
    return;
  }

  const chosen = nextDeals(queue, store, config.schedule.postsPerCycle);
  if (!chosen.length) {
    log(`Nenhuma oferta boa na fila (${queue.size()} esperando). Falta clicar no botão do Chrome.`);
    if (!DRY_RUN) await remindEmptyQueue(notify);
    return;
  }

  // Desligado por padrão: o Mercado Livre pediu verificação quando o robô abriu as páginas dos produtos.
  const selected = config.browser.checkProductPage ? await enrich(chosen) : chosen;
  const posting = !DRY_RUN && config.schedule.postingEnabled;
  // Confere no começo de cada ciclo se o grupo atual encheu.
  const chat = posting ? await getChat() : null;
  if (chat) log(`Postando no grupo: ${chat.name}`);
  for (const [idx, item] of selected.entries()) {
    const text = buildMessage(item, item.link);

    if (!posting) {
      console.log(`\n----- [nota ${item.score}] ${item.id} (NÃO postado: modo teste) -----\n${text}\nFoto: ${item.thumbnail}\n`);
      continue;
    }
    const arte = await criarArte(item);
    await postDeal(chat, text, arte || item.thumbnail);
    store.markPosted(item);
    queue.remove(item.id);
    log(`Postado: ${item.title} (nota ${item.score})`);
    if (status) await postToStatus(status, text, arte || item.thumbnail);
    if (idx < selected.length - 1) await sleep(config.schedule.delayBetweenPostsSec * 1000);
  }
}

// Importação tardia para que o --dry-run funcione sem conectar o WhatsApp.
let postDeal;

async function main() {
  const store = createStore();
  const queue = createQueue();
  let getChat = null;
  let notify = null;
  let status = null;

  if (!DRY_RUN) {
    const wa = await import('./whatsapp.js');
    postDeal = wa.postDeal;
    const client = await wa.connectWhatsApp();
    notify = (text) => wa.sendToSelf(client, text);
    let invite = async () => null;
    if (config.whatsapp.statusEnabled && config.whatsapp.statusMode === 'manual') {
      // Modo manual: o robô manda a arte pronta no WhatsApp do Anderson e ele
      // mesmo encaminha para o status (assim ele vê e controla o que sai).
      let lastTipDay = '';
      status = {
        post: async (text, image) => {
          const today = new Date().toDateString();
          if (lastTipDay !== today) {
            lastTipDay = today;
            await notify('📲 *Ofertas prontas para o seu status*\nQuando quiser, toque e segure a imagem que chegar aqui, toque em *Encaminhar* e escolha *Meu status*.');
          }
          await wa.sendImageToSelf(client, text, image);
        },
        invite: () => invite(),
      };
    } else if (config.whatsapp.statusEnabled) {
      status = { post: (text, image) => wa.postStatus(client, text, image), invite: () => invite() };
    }

    if (args.has('--list-groups')) {
      console.table(await wa.listGroups(client));
      await wa.disconnect(client);
      return;
    }

    if (config.whatsapp.groupId) {
      // Grupo fixo escolhido no .env.
      const fixed = await wa.findGroup(client, config.whatsapp);
      getChat = async () => fixed;
      invite = async () => `https://chat.whatsapp.com/${await client.groupInviteCode(fixed.id)}`;
    } else {
      const { createGroupManager } = await import('./groups.js');
      const groups = createGroupManager(client, config.whatsapp, log);
      getChat = () => groups.current();
      // Convite do grupo atual (o último criado).
      invite = async () => groups.list().at(-1)?.invite || null;

      if (args.has('--setup-group')) {
        const chat = await getChat();
        log(`Grupo pronto: ${chat.name}`);
        console.table(groups.list().map(({ name, invite }) => ({ name, invite })));
        await sleep(5000); // deixa a mensagem do convite terminar de enviar
        await wa.disconnect(client);
        return;
      }
    }
  }

  const cycle = () => runCycle({ getChat, store, queue, notify, status }).catch((e) => log('Erro no ciclo:', e.message));
  if (ONCE) {
    await cycle();
    if (!DRY_RUN) await sleep(5000); // deixa a última mensagem terminar de enviar
    process.exit(0);
  }

  // Espera um pouco depois de cada clique no favorito: se o Anderson clicar em
  // várias páginas seguidas, chega um resumo só.
  let resumoTimer;
  const agendarResumo = () => {
    if (!notify) return;
    clearTimeout(resumoTimer);
    resumoTimer = setTimeout(() => {
      notify(resumoDaLista(queue, store))
        .then(() => log('Resumo das ofertas enviado.'))
        .catch((e) => log('Não consegui mandar o resumo:', e.message));
    }, 90_000);
  };
  startServer({ port: config.server.port, host: config.server.host, queue, onReceive: agendarResumo, log });
  if (!config.schedule.postingEnabled) log('MODO TESTE: os posts aparecem só aqui no registro, nada vai para o grupo.');
  // Confere a cada minuto. O espaço entre posts é o tempo que falta até o fim
  // do horário dividido pelas ofertas que ainda tem na lista, assim elas se
  // espalham pelo dia todo. O primeiro do dia sai logo na abertura (8h).
  // Conta a partir do último post de verdade: religar o robô não gera posts colados.
  let lastCycle = store.lastPostedAt();
  let lastLoggedCount = null;
  // Avisa uma vez quando a lista está acabando; volta a valer quando a lista enche de novo.
  // Fica num arquivo, para religar o robô não repetir o aviso.
  const avisoFile = './data/aviso-lista.json';
  let avisado = false;
  try { avisado = JSON.parse(fs.readFileSync(avisoFile, 'utf8')).avisado; } catch { /* nunca avisou */ }
  const marcarAviso = (v) => { avisado = v; fs.writeFileSync(avisoFile, JSON.stringify({ avisado: v })); };
  setInterval(() => {
    const now = new Date();
    if (!insidePostingHours()) return;
    const opening = new Date(now);
    opening.setHours(config.schedule.startHour, 0, 0, 0);
    const firstOfDay = lastCycle < opening.getTime();
    const gap = postingGapMinutes(queue, store, now);
    const count = pendingCount(queue, store);
    if (count !== lastLoggedCount) {
      lastLoggedCount = count;
      log(gap ? `Ritmo: 1 post a cada ${gap} min (${count} ofertas na lista).` : 'Lista de ofertas vazia.');
    }
    if (count > config.schedule.lowQueueWarning) {
      if (avisado) marcarAviso(false);
    } else if (count > 0 && !avisado && notify) {
      marcarAviso(true);
      notify(`⚠️ *As ofertas estão acabando!*\nSó ${count === 1 ? 'falta 1' : `faltam ${count}`} para postar.\n\nAbra o painel de afiliados e clique no favorito *📦 Mandar ofertas pro robô*.`)
        .then(() => log(`Aviso enviado: faltam ${count} ofertas.`))
        .catch((e) => log('Não consegui mandar o aviso:', e.message));
    }
    if (!gap) {
      remindEmptyQueue(notify).catch(() => {});
      return;
    }
    if (!firstOfDay && now - lastCycle < gap * 60_000) return;
    lastCycle = now.getTime();
    cycle();
  }, 60_000);

  // Lembrete de bom dia para o Anderson puxar as ofertas no painel.
  // O dia do último lembrete fica num arquivo, para religar o robô não repetir o lembrete.
  const reminderFile = './data/lembrete.json';
  let lastMorningDay = '';
  try { lastMorningDay = JSON.parse(fs.readFileSync(reminderFile, 'utf8')).dia; } catch { /* nunca lembrou */ }
  setInterval(() => {
    const now = new Date();
    if (!notify || now.getHours() < config.schedule.reminderHour || now.getHours() >= config.schedule.endHour
        || lastMorningDay === now.toDateString()) return;
    lastMorningDay = now.toDateString();
    fs.writeFileSync(reminderFile, JSON.stringify({ dia: lastMorningDay }));
    notify(`☀️ *Bom dia! Hora de puxar as ofertas de hoje.*\n\n1️⃣ Abra o painel de afiliados: https://www.mercadolivre.com.br/afiliados/hub\n2️⃣ Ligue o filtro *Mais vendidos*\n3️⃣ Clique no favorito *📦 Mandar ofertas pro robô*\n\nOfertas prontas para postar agora: ${pendingCount(queue, store)}`)
      .then(() => log('Lembrete de bom dia enviado.'))
      .catch((e) => log('Não consegui mandar o lembrete:', e.message));
  }, 60_000);
  log(`Agente rodando. Próximo post em ${config.schedule.intervalMinutes} min.`);
}

main().catch((e) => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
