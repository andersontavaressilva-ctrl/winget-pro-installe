import 'dotenv/config';

const list = (v) => (v || '').split(';').map((s) => s.trim()).filter(Boolean);
const num = (v, def) => (v === undefined || v === '' ? def : Number(v));
const bool = (v, def = false) => (v === undefined || v === '' ? def : /^(1|true|sim|yes)$/i.test(v));

export const config = {
  ml: {
    clientId: process.env.ML_CLIENT_ID || '',
    clientSecret: process.env.ML_CLIENT_SECRET || '',
    refreshToken: process.env.ML_REFRESH_TOKEN || '',
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
  affiliate: {
    template: process.env.AFFILIATE_LINK_TEMPLATE || '{url}',
    linksFile: process.env.AFFILIATE_LINKS_FILE || './data/links-afiliado.json',
  },
  whatsapp: {
    groupName: process.env.WHATSAPP_GROUP_NAME || '',
    groupId: process.env.WHATSAPP_GROUP_ID || '',
  },
  schedule: {
    intervalMinutes: num(process.env.INTERVAL_MINUTES, 60),
    postsPerCycle: num(process.env.POSTS_PER_CYCLE, 3),
    delayBetweenPostsSec: num(process.env.DELAY_BETWEEN_POSTS_SECONDS, 90),
    startHour: num(process.env.POST_START_HOUR, 8),
    endHour: num(process.env.POST_END_HOUR, 22),
    repostAfterDays: num(process.env.REPOST_AFTER_DAYS, 7),
  },
};
