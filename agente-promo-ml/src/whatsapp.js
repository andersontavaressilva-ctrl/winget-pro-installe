import fs from 'node:fs';
import * as B from '@whiskeysockets/baileys';
import pino from 'pino';
import { groupDescription } from './descricao.js';

// Baileys fala direto com o WhatsApp, sem abrir um navegador: bem mais leve
// que o whatsapp-web.js e cabe numa VM pequena.
const lib = { ...B, ...(B.default && typeof B.default === 'object' ? B.default : {}) };
const makeWASocket = typeof lib.default === 'function' ? lib.default : lib.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, jidNormalizedUser } = lib;

const AUTH_DIR = './.baileys_auth';
const CONTACTS_FILE = './data/contatos.json';
let stopping = false;

// Contatos salvos no celular: são eles que veem o status. O WhatsApp manda a
// lista aos poucos (eventos de contatos); guardamos em data/contatos.json.
let contacts = new Set();
try { contacts = new Set(JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'))); } catch { /* primeiro uso */ }
function addContacts(list = []) {
  const before = contacts.size;
  for (const c of list) {
    // Contatos novos podem vir com "id" no formato @lid; o número de verdade fica em "jid".
    const id = [c.jid, c.id].find((j) => j && j.endsWith('@s.whatsapp.net'));
    if (id) contacts.add(jidNormalizedUser(id));
  }
  if (contacts.size !== before) {
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify([...contacts]));
  }
}

// Últimas mensagens enviadas, para reenviar quando um aparelho pede de novo.
const sent = new Map();
function remember(msg) {
  if (!msg?.key?.id || !msg.message) return msg;
  sent.set(msg.key.id, msg.message);
  if (sent.size > 300) sent.delete(sent.keys().next().value);
  return msg;
}

// Conecta no WhatsApp. Na primeira vez mostra um código de pareamento para
// digitar no celular (WHATSAPP_PHONE_NUMBER no .env). A sessão fica salva.
export async function connectWhatsApp() {
  const phoneNumber = (process.env.WHATSAPP_PHONE_NUMBER || '').replace(/\D/g, '');
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

  return new Promise((resolve, reject) => {
    let askedCode = false;
    let current = null;
    let resolved = false;
    // Quando a conexão cai, o robô reconecta com um socket novo. O "handle"
    // sempre aponta para o socket atual, assim quem guardou ele não fica com um morto.
    const handle = new Proxy({}, {
      get: (_, prop) => {
        const value = current[prop];
        return typeof value === 'function' ? value.bind(current) : value;
      },
    });

    const start = () => {
      const sock = makeWASocket({
        auth: state,
        version,
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // Quando o celular não consegue abrir uma mensagem ("Aguardando mensagem"),
        // ele pede de novo; aqui o robô devolve a mensagem guardada.
        getMessage: async (key) => sent.get(key.id),
      });
      current = sock;
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('messages.upsert', ({ messages }) => {
        for (const m of messages) if (m.key.fromMe && m.message) remember(m);
      });
      sock.ev.on('contacts.upsert', addContacts);
      sock.ev.on('contacts.update', addContacts);
      sock.ev.on('messaging-history.set', ({ contacts: list }) => addContacts(list));

      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && !sock.authState.creds.registered && !askedCode) {
          askedCode = true;
          if (!phoneNumber) return reject(new Error('Preencha WHATSAPP_PHONE_NUMBER no .env para receber o código de pareamento.'));
          const code = await sock.requestPairingCode(phoneNumber);
          console.log(`\nCódigo de pareamento: ${code}`);
          console.log('No celular: WhatsApp > Aparelhos conectados > Conectar aparelho > Conectar com número de telefone\n');
        }
        if (connection === 'open') {
          console.log('[WhatsApp] Conectado!');
          // Pede de novo a lista de contatos se ainda não temos (ela vem só no pareamento).
          // Os contatos ficam na coleção "critical_unblock_low"; apagando a versão
          // guardada dela, o WhatsApp manda a lista inteira de novo.
          if (contacts.size < 5 && sock.resyncAppState) {
            fs.rmSync(`${AUTH_DIR}/app-state-sync-version-critical_unblock_low.json`, { force: true });
            sock.resyncAppState(['critical_unblock_low'], false)
              .then(() => console.log(`[WhatsApp] Contatos conhecidos para o status: ${contacts.size}`))
              .catch((e) => console.error(`[WhatsApp] Não consegui buscar os contatos: ${e.message}`));
          }
          if (!resolved) { resolved = true; resolve(handle); }
        }
        if (connection === 'close') {
          if (stopping) return;
          const status = lastDisconnect?.error?.output?.statusCode;
          if (status === DisconnectReason.loggedOut) {
            console.error('[WhatsApp] Desconectado pelo celular. Apague a pasta .baileys_auth e conecte de novo.');
            return reject(new Error('WhatsApp desconectado'));
          }
          // Depois do pareamento o WhatsApp pede para reconectar; quedas de rede também caem aqui.
          setTimeout(start, 3000);
        }
      });
    };
    start();
  });
}

export async function listGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({ name: g.subject, id: g.id, participantes: g.participants.length }));
}

// "chat" aqui é só { sock, id, name }: o suficiente para postar e para os logs.
export async function getGroup(sock, id) {
  const meta = await sock.groupMetadata(id);
  return { sock, id, name: meta.subject, size: meta.participants.length };
}

export async function findGroup(sock, { groupId }) {
  return getGroup(sock, groupId);
}

export async function createGroup(sock, name, members) {
  const meta = await sock.groupCreate(name, members.map((n) => `${n}@s.whatsapp.net`));
  // Só administradores (você) podem mandar mensagem no grupo.
  await sock.groupSettingUpdate(meta.id, 'announcement');
  const invite = `https://chat.whatsapp.com/${await sock.groupInviteCode(meta.id)}`;
  await sock.groupUpdateDescription(meta.id, groupDescription(invite))
    .catch((e) => console.error(`[WhatsApp] Não consegui pôr a descrição: ${e.message}`));
  return { chat: { sock, id: meta.id, name: meta.subject, size: meta.participants.length }, invite };
}

// A chave de segredo entre o robô e o celular do Anderson às vezes se embaralha
// e as mensagens para ele ficam "Aguardando mensagem" (o grupo não é afetado).
// Antes de cada mensagem para ele, o robô joga fora essa chave: o WhatsApp
// então entrega uma nova, que o celular sempre consegue abrir.
async function freshKeyWithPhone(sock) {
  const users = [sock.user.id, sock.user.lid].filter(Boolean).map((j) => j.split(/[:@]/)[0]);
  const myDevice = sock.user.id.split('@')[0].split(':')[1];
  const ids = fs.readdirSync(AUTH_DIR)
    .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
    .map((f) => f.slice('session-'.length, -'.json'.length))
    .filter((id) => {
      const [user, device] = id.split('.');
      return users.includes(user.split('_')[0]) && device !== myDevice;
    });
  if (ids.length) await sock.authState.keys.set({ session: Object.fromEntries(ids.map((id) => [id, null])) });
}

export async function sendToSelf(sock, text) {
  await freshKeyWithPhone(sock).catch((e) => console.error(`[WhatsApp] Não consegui renovar a chave: ${e.message}`));
  return remember(await sock.sendMessage(jidNormalizedUser(sock.user.id), { text }));
}

// image: arte pronta (Buffer) ou link da foto do produto.
export async function postDeal(chat, text, image) {
  if (image) {
    try {
      return remember(await chat.sock.sendMessage(chat.id, { image: Buffer.isBuffer(image) ? image : { url: image }, caption: text }));
    } catch (err) {
      console.error(`[WhatsApp] Imagem falhou (${err.message}), enviando só texto.`);
    }
  }
  return remember(await chat.sock.sendMessage(chat.id, { text }));
}

// Manda uma imagem com legenda para o próprio WhatsApp do Anderson (conversa "você").
export async function sendImageToSelf(sock, text, image) {
  const me = jidNormalizedUser(sock.user.id);
  await freshKeyWithPhone(sock).catch((e) => console.error(`[WhatsApp] Não consegui renovar a chave: ${e.message}`));
  if (!image) return remember(await sock.sendMessage(me, { text }));
  return remember(await sock.sendMessage(me, { image: Buffer.isBuffer(image) ? image : { url: image }, caption: text }));
}

export function contactCount() {
  return contacts.size;
}

// Posta no status do WhatsApp. Só quem está na lista de contatos recebe.
export async function postStatus(sock, text, image) {
  const audience = [...contacts, jidNormalizedUser(sock.user.id)];
  if (audience.length < 2) throw new Error('ainda não recebi a lista de contatos do celular');
  const content = image
    ? { image: Buffer.isBuffer(image) ? image : { url: image }, caption: text }
    : { text, backgroundColor: '#0b5cff', font: 1 };
  return sock.sendMessage('status@broadcast', content, { statusJidList: audience, broadcast: true });
}

export async function disconnect(sock) {
  stopping = true;
  sock.end(undefined);
}
