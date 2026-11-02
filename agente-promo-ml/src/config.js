import 'dotenv/config';

const list = (v) => (v || '').split(';').map((s) => s.trim()).filter(Boolean);
const num = (v, def) => (v === undefined || v === '' ? def : Number(v));
const bool = (v, def = false) => (v === undefined || v === '' ? def : /^(1|true|sim|yes)$/i.test(v));

export const config = {
  ml: {
    clientId: process.env.ML_CLIENT_ID || '',
    clientSecret: process.env.ML_CLIENT_SECRET || '',
    refreshToken: process.env.ML_REFRESH_TOKEN || '',
    redirectUri: process.env.ML_REDIRECT_URI || 'https://www.google.com/',
    site: process.env.ML_SITE || 'MLB',
    searchTerms: list(process.env.SEARCH_TERMS),
    categories: list(process.env.SEARCH_CATEGORIES),
    resultsPerSearch: Math.min(num(process.env.RESULTS_PER_SEARCH, 50), 50),
  },
  filters: {
    minDiscount: num(process.env.MIN_DISCOUNT_PERCENT, 20),
    minPrice: num(process.env.MIN_PRICE, 20),
    maxPrice: num(process.env.MAX_PRICE, 1500),
    requireFreeShipping: bool(process.env.REQUIRE_FREE_SHIPPING),
    minScore: num(process.env.MIN_SCORE, 55),
  },
  browser: {
    // "true" esconde o navegador de vez; o padrão abre a janela fora da tela.
    headless: bool(process.env.BROWSER_HEADLESS),
    // Abrir a página de cada produto para ver cupom e frete (o ML pode pedir verificação).
    checkProductPage: bool(process.env.CHECK_PRODUCT_PAGE),
  },
  affiliate: {
    template: process.env.AFFILIATE_LINK_TEMPLATE || '{url}',
    linksFile: process.env.AFFILIATE_LINKS_FILE || './data/links-afiliado.json',
  },
  whatsapp: {
    groupName: process.env.WHATSAPP_GROUP_NAME || '',
    groupId: process.env.WHATSAPP_GROUP_ID || '',
    groupPrefix: process.env.WHATSAPP_GROUP_PREFIX || 'Show de Ofertas ML',
    maxMembers: num(process.env.WHATSAPP_GROUP_MAX_MEMBERS, 1000),
    notifyInvite: bool(process.env.WHATSAPP_NOTIFY_INVITE, true),
    members: list(process.env.WHATSAPP_GROUP_MEMBERS).map((n) => n.replace(/\D/g, '')),
    // Repetir as ofertas no status, com o convite do grupo. STATUS_EVERY=3 posta 1 a cada 3 ofertas.
    statusEnabled: bool(process.env.STATUS_ENABLED, true),
    statusEvery: Math.max(1, num(process.env.STATUS_EVERY, 1)),
    // "manual": manda a arte para o seu WhatsApp e você encaminha para o status.
    // "auto": o robô posta direto no status (no seu celular ele pode não aparecer).
    statusMode: (process.env.STATUS_MODE || 'manual').toLowerCase(),
  },
  schedule: {
    intervalMinutes: num(process.env.INTERVAL_MINUTES, 60),
    // O espaço entre posts se ajusta à lista, mas nunca fica fora destes limites.
    minIntervalMinutes: num(process.env.MIN_INTERVAL_MINUTES, 20),
    maxIntervalMinutes: num(process.env.MAX_INTERVAL_MINUTES, 120),
    postsPerCycle: num(process.env.POSTS_PER_CYCLE, 3),
    delayBetweenPostsSec: num(process.env.DELAY_BETWEEN_POSTS_SECONDS, 90),
    startHour: num(process.env.POST_START_HOUR, 8),
    endHour: num(process.env.POST_END_HOUR, 22),
    // Produto repetido volta depois desses dias (ou antes, se o preço baixar).
    repostAfterDays: num(process.env.REPOST_AFTER_DAYS, 2),
    // Hora do lembrete de bom dia para puxar as ofertas (24h).
    reminderHour: num(process.env.REMINDER_HOUR, 8),
    // Enquanto for "false", o robô só mostra os posts no registro (modo teste).
    postingEnabled: bool(process.env.POSTING_ENABLED),
  },
  server: {
    // Porta do receptor do botão de favorito (só neste computador).
    port: num(process.env.SERVER_PORT, 3999),
  },
};
