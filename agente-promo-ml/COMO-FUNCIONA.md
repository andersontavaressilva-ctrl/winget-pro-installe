# Robô de ofertas: como funciona hoje

Resumo para quem for mexer neste robô depois (pessoa ou Claude).
**Fale sempre em português simples com o Anderson, sem palavras em inglês nem termos técnicos.**
Ele digita senhas e códigos; confirme com ele antes de postar no grupo ou mexer em faturamento.

## Onde roda
Num computador Windows da casa do Anderson, na pasta `C:\robo-ofertas`
(a máquina do Google Cloud foi abandonada). Precisa de Node.js 24, Git e Google Chrome.
- Tarefa agendada **"Robo de ofertas"**: liga `node src/index.js` quando o Windows entra no usuário
  e reinicia sozinha se cair. Registro em `robo.log`.
- O computador entra sozinho no usuário (sem senha) e não pode entrar em suspensão.

## Como as ofertas chegam (sem login automático)
O Mercado Livre bloqueia: API de busca (403), login em navegador controlado por robô
("não confiável") e visitas do robô às páginas de produto (pede verificação). **Não contornar.**
Por isso as ofertas vêm de um clique do Anderson no navegador dele:
1. O robô sobe uma página em `http://127.0.0.1:3999` com o favorito **"📦 Mandar ofertas pro robô"**
   (`src/botao-favorito.js`, `src/servidor.js`).
2. Uma vez por dia (lembrete às 8h no WhatsApp dele), o Anderson abre o painel de afiliados,
   liga o filtro **Mais vendidos** e clica no favorito.
3. O favorito clica em "Compartilhar" de cada produto, pega o link curto **meli.la** da conta dele,
   lê preço, desconto, parcelas, nota e vendas, e manda tudo para `data/fila.json` (`src/fila.js`).

## Como posta
- `src/index.js` confere a cada minuto. Das 8h às 22h, divide o tempo que falta pelas ofertas da lista
  (entre 20 e 120 min por post). O primeiro do dia sai às 8h. Religar não gera posts colados.
- Escolhe a melhor oferta pela nota (`src/scorer.js`, `MIN_SCORE`), sem repetir produto (`data/postados.json`).
- Texto no modelo que o Anderson mandou (`src/message.js`).
- Arte 1080x1080 azul, com pontos fortes tirados do nome do produto no lugar do preço
  (`src/arte.js`, `src/caracteristicas.js`). É desenhada no Chrome sem abrir o Mercado Livre.
- WhatsApp pela biblioteca Baileys (`src/whatsapp.js`, sessão em `.baileys_auth/`).
- Grupos "Show de Ofertas ML N": o robô cria o próximo quando o atual chega a 1000 pessoas,
  com a descrição de `src/descricao.js` (`src/groups.js`, `data/grupos.json`).
- Status: a cada 3 ofertas, a arte com o convite do grupo vai para o WhatsApp do próprio Anderson
  e ele encaminha para o status pelo celular (assim aparece para ele e repassa para Facebook/Instagram).

## Instalar do zero
1. `git clone -b claude/mercado-livre-promo-agent-d2nz05 https://github.com/andersontavaressilva-ctrl/winget-pro-installe.git`
2. `cd winget-pro-installe/agente-promo-ml`, `npm install`, copiar `.env.example` para `.env`.
3. Pedir ao Anderson o número dele e o da pessoa de confiança para o `.env` (não ficam aqui de propósito).
4. `npm run list-groups` mostra o código de pareamento do WhatsApp.
5. Se o grupo já existe, criar `data/grupos.json` com o id e o convite dele (senão o robô cria um novo).
6. Deixar `POSTING_ENABLED=false`, testar, e só ligar com o ok do Anderson.

Arquivos antigos que ficaram sem uso: `src/mercadolivre.js`, `src/affiliate.js`, `src/ml-login.js`
(caminho da API, bloqueado), `src/ml-entrar.js` e parte de `src/navegador.js` (login automático, bloqueado).
