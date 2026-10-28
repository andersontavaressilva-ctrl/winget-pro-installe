import wweb from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth, MessageMedia } = wweb;

// Conecta no WhatsApp Web (escaneie o QR Code na primeira vez; a sessão fica salva).
export async function connectWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    },
  });

  client.on('qr', (qr) => {
    console.log('\nEscaneie o QR Code abaixo no WhatsApp (Aparelhos conectados > Conectar aparelho):\n');
    qrcode.generate(qr, { small: true });
  });
  client.on('auth_failure', (m) => console.error('[WhatsApp] Falha na autenticação:', m));
  client.on('disconnected', (r) => console.error('[WhatsApp] Desconectado:', r));

  const ready = new Promise((resolve) => client.once('ready', resolve));
  await client.initialize();
  await ready;
  console.log('[WhatsApp] Conectado!');
  return client;
}

export async function listGroups(client) {
  const chats = await client.getChats();
  return chats.filter((c) => c.isGroup).map((c) => ({ name: c.name, id: c.id._serialized }));
}

export async function findGroup(client, { groupId, groupName }) {
  if (groupId) return client.getChatById(groupId);
  const groups = (await client.getChats()).filter((c) => c.isGroup);
  const group = groups.find((c) => c.name.trim().toLowerCase() === groupName.trim().toLowerCase());
  if (!group) {
    throw new Error(`Grupo "${groupName}" não encontrado. Rode "npm run list-groups" para ver os nomes.`);
  }
  return group;
}

export async function postDeal(chat, text, imageUrl) {
  if (imageUrl) {
    try {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      return await chat.sendMessage(media, { caption: text });
    } catch (err) {
      console.error(`[WhatsApp] Imagem falhou (${err.message}), enviando só texto.`);
    }
  }
  return chat.sendMessage(text);
}
