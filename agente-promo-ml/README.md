# 🤖 Agente de Promoções Mercado Livre → WhatsApp

Busca produtos em promoção no Mercado Livre, dá uma **nota de chance de venda** para cada um
e posta os melhores em um **grupo do WhatsApp** com o **seu link de afiliado**.

```
Mercado Livre (API oficial) → filtros + nota → link de afiliado → mensagem com foto → grupo do WhatsApp
```

## Como o agente escolhe os produtos

Cada produto recebe uma nota de 0 a 100 (`src/scorer.js`):

| Critério | Peso |
|---|---|
| % de desconto | até 35 pts |
| Quantidade vendida (prova social) | até 20 pts |
| Avaliação dos compradores | até 10 pts |
| Loja oficial / MercadoLíder | até 15 pts |
| Frete grátis, Full, parcelamento sem juros | até 15 pts |
| Preço de impulso (até R$ 100 / R$ 300) | até 5 pts |

Também descarta: usados, vendedores com reputação ruim, desconto acima de 85% (geralmente preço
inflado) e produtos já postados nos últimos dias.

## Passo a passo

### 1. Instalar
Precisa do [Node.js 18+](https://nodejs.org) e do Google Chrome.
```bash
cd agente-promo-ml
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

### 2. Credenciais do Mercado Livre
A busca da API do Mercado Livre exige autenticação.
1. Acesse <https://developers.mercadolivre.com.br/devcenter> e crie um aplicativo.
2. Copie o **Client ID** e o **Client Secret** para `ML_CLIENT_ID` e `ML_CLIENT_SECRET` no `.env`.
3. (Recomendado) Gere um *refresh token* pelo fluxo OAuth do app e coloque em `ML_REFRESH_TOKEN`.

### 3. Seu link de afiliado
Entre no programa de afiliados (<https://www.mercadolivre.com.br/afiliados>), gere um link de
qualquer produto e abra no navegador. Na URL final aparecem seus parâmetros de afiliado
(ex.: `matt_tool=...&matt_word=...`). Coloque-os no modelo:
```
AFFILIATE_LINK_TEMPLATE={url}?matt_tool=SEU_MATT_TOOL&matt_word=SEU_MATT_WORD
```
> ⚠️ **Confira** clicando em um link gerado pelo agente e verificando no painel de afiliados se o
> clique foi contabilizado antes de divulgar em massa.

Se preferir usar os links curtos (`mercadolivre.com/sec/...`) gerados no painel, cadastre-os em
`data/links-afiliado.json` — eles têm prioridade sobre o modelo:
```json
{ "MLB1234567890": "https://mercadolivre.com/sec/abc123" }
```

### 4. Escolher o que buscar
No `.env`: `SEARCH_TERMS` (termos separados por `;`), `SEARCH_CATEGORIES`, `MIN_DISCOUNT_PERCENT`,
`MIN_PRICE`, `MAX_PRICE`, `MIN_SCORE` etc.

### 5. Testar sem postar
```bash
npm run dry-run
```
Mostra no terminal as mensagens que seriam enviadas, com a nota de cada produto.

### 6. Conectar o WhatsApp e achar o grupo
```bash
npm run list-groups
```
Só tem o celular? Preencha `WHATSAPP_PHONE_NUMBER` no `.env` e, em vez do QR Code, aparece um
**código de pareamento**: WhatsApp → *Aparelhos conectados* → *Conectar aparelho* →
*Conectar com número de telefone*. Para rodar 24h numa VPS gratuita pelo celular, veja
[`VPS-GRATIS.md`](VPS-GRATIS.md).

Senão, na primeira vez aparece um **QR Code**: no celular, abra WhatsApp → *Aparelhos conectados* →
*Conectar um aparelho*. A sessão fica salva em `.wwebjs_auth/`. Copie o nome (ou ID) do grupo para
`WHATSAPP_GROUP_NAME` (ou `WHATSAPP_GROUP_ID`).

### 7. Rodar
```bash
npm run once   # um ciclo só
npm start      # fica rodando, buscando a cada INTERVAL_MINUTES
```
Para deixar 24h no ar, rode em um PC sempre ligado ou numa VPS (ex.: `npx pm2 start src/index.js --name promo`).

## Exemplo de mensagem
```
*🔥 OFERTA RELÂMPAGO*

📦 *Fone de Ouvido Bluetooth XYZ*

~De R$ 159,90~
✅ *Por R$ 79,90*  (50% OFF)
💳 6x de R$ 13,32 sem juros

🚚 Frete grátis  |  ⚡ Envio Full  |  🏬 Loja oficial  |  🛒 +1200 vendidos

👉 *Compre aqui:* https://...

_Preço e estoque podem mudar a qualquer momento._
```

## ⚠️ Avisos importantes
- **WhatsApp:** o agente usa o WhatsApp Web (biblioteca `whatsapp-web.js`), que **não é oficial**.
  Envio automático em excesso pode causar **bloqueio do número**. Use um número dedicado às
  promoções, mantenha poucos posts por ciclo e intervalos longos (padrão: 3 posts/hora, 90 s entre eles).
- Siga as regras do programa de afiliados do Mercado Livre (sem spam, sem promessas falsas).
- Preços mudam rápido; a mensagem já avisa isso ao comprador.

## Estrutura
```
src/config.js       configurações do .env
src/mercadolivre.js busca na API do Mercado Livre
src/scorer.js       filtros e nota de chance de venda
src/affiliate.js    gera o link de afiliado
src/message.js      monta o texto da mensagem
src/whatsapp.js     conexão e envio no WhatsApp
src/store.js        evita repetir produtos
src/index.js        orquestra tudo e agenda os ciclos
```
