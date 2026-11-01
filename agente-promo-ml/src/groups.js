import fs from 'node:fs';
import path from 'node:path';
import { createGroup, getGroup, sendToSelf } from './whatsapp.js';

// Cuida dos grupos de ofertas: cria o primeiro, e quando o atual chega no
// limite de participantes cria o próximo ("Nome 1", "Nome 2", ...).
// Os grupos criados ficam salvos em data/grupos.json.
export function createGroupManager(sock, { groupPrefix, maxMembers, notifyInvite, members }, log = console.log, file = './data/grupos.json') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = { groups: [] };
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primeiro uso */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));

  async function create(number) {
    const name = `${groupPrefix} ${number}`;
    // O WhatsApp não deixa criar grupo vazio: entra pelo menos uma pessoa de
    // WHATSAPP_GROUP_MEMBERS junto com você.
    const { chat, invite } = await createGroup(sock, name, members);

    data.groups.push({ id: chat.id, name, number, invite, createdAt: new Date().toISOString() });
    save();
    log(`Grupo criado: ${name} - convite: ${invite}`);

    if (notifyInvite) {
      await sendToSelf(sock, `Grupo novo criado pelo robô: *${name}*\nLink de convite para divulgar:\n${invite}`);
    }
    return chat;
  }

  return {
    // Devolve o grupo onde postar agora, criando um novo se o atual encheu.
    async current() {
      const last = data.groups.at(-1);
      if (!last) return create(1);

      const chat = await getGroup(sock, last.id);
      if (chat.size >= maxMembers) {
        log(`${last.name} tem ${chat.size} participantes (limite ${maxMembers}), abrindo o próximo grupo.`);
        return create(last.number + 1);
      }
      return chat;
    },
    list: () => data.groups,
  };
}
