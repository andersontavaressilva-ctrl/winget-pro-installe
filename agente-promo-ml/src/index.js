import { config } from './config.js';
import { fetchDeals } from './mercadolivre.js';
import { rankDeals } from './scorer.js';
import { createAffiliateLinker } from './affiliate.js';
import { buildMessage } from './message.js';
import { createStore } from './store.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ONCE = args.has('--once');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toLocaleString('pt-BR')}]`, ...a);

function insidePostingHours() {
  const h = new Date().getHours();
  return h >= config.schedule.startHour && h < config.schedule.endHour;
}

async function runCycle({ chat, store, toLink }) {
  if (!DRY_RUN && !insidePostingHours()) {
    log('Fora do horário de postagem, pulando ciclo.');
    return;
  }

  log('Buscando promoções no Mercado Livre...');
  const items = await fetchDeals(config.ml);
  const ranked = rankDeals(items, config.filters)
    .filter((i) => !store.wasPostedRecently(i.id, config.schedule.repostAfterDays));
  log(`${items.length} produtos encontrados, ${ranked.length} aprovados nos filtros.`);

  const selected = ranked.slice(0, config.schedule.postsPerCycle);
  for (const [idx, item] of selected.entries()) {
    const text = buildMessage(item, toLink(item));

    if (DRY_RUN) {
      console.log(`\n----- [nota ${item.score}] ${item.id} -----\n${text}\n`);
    } else {
      await postDeal(chat, text, item.thumbnail);
      store.markPosted(item.id);
      log(`Postado: ${item.title} (nota ${item.score})`);
      if (idx < selected.length - 1) await sleep(config.schedule.delayBetweenPostsSec * 1000);
    }
  }
}

// Importação tardia para que o --dry-run funcione sem abrir o navegador do WhatsApp.
let postDeal;

async function main() {
  const store = createStore();
  const toLink = createAffiliateLinker(config.affiliate);
  let chat = null;

  if (!DRY_RUN) {
    const wa = await import('./whatsapp.js');
    postDeal = wa.postDeal;
    const client = await wa.connectWhatsApp();

    if (args.has('--list-groups')) {
      console.table(await wa.listGroups(client));
      await client.destroy();
      return;
    }
    chat = await wa.findGroup(client, config.whatsapp);
    log(`Postando no grupo: ${chat.name}`);
  }

  const cycle = () => runCycle({ chat, store, toLink }).catch((e) => log('Erro no ciclo:', e.message));
  await cycle();
  if (ONCE || DRY_RUN) {
    if (!DRY_RUN) await sleep(5000); // deixa a última mensagem terminar de enviar
    process.exit(0);
  }
  setInterval(cycle, config.schedule.intervalMinutes * 60_000);
  log(`Agente rodando. Próxima busca em ${config.schedule.intervalMinutes} min.`);
}

main().catch((e) => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
