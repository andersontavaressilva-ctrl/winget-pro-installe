# Plano de configuração (para executar quando o Anderson estiver no computador)

Roteiro para o Claude seguir no navegador do Anderson (Claude in Chrome / controle do computador).
**Regras:** o Anderson digita as senhas e códigos de login. Confirmar com ele antes de aceitar termos,
mexer em faturamento ou enviar mensagens no WhatsApp. Nunca colar o Client Secret no chat.

## Status
| # | Etapa | Status |
|---|---|---|
| 1 | Código do agente no GitHub | ✅ pronto |
| 2 | VM e2-micro no Google Cloud | ✅ criada pelo Anderson |
| 3 | Alerta de orçamento R$ 5 no Google Cloud | ⏳ |
| 4 | Instalar agente na VM (`instalar.sh`) | ⏳ |
| 5 | App no Mercado Livre (Client ID / Secret) | ⏳ |
| 6 | Autorizar agente no ML (`npm run ml-login`) | ⏳ |
| 7 | Parâmetros de afiliado (`AFFILIATE_LINK_TEMPLATE`) | ⏳ |
| 8 | Conectar WhatsApp (código de pareamento) e escolher grupo | ⏳ |
| 9 | Teste `npm run dry-run` com dados reais | ⏳ |
| 10 | 1 post de teste no grupo (`npm run once`) e conferir clique no painel de afiliados | ⏳ |
| 11 | Ligar 24h com pm2 | ⏳ |

## 3. Alerta de orçamento (console.cloud.google.com)
Faturamento → Orçamentos e alertas → Criar orçamento → nome `limite-agente`, todos os projetos/serviços →
valor especificado **R$ 5** → alertas 50/90/100% → e-mail para administradores → Concluir.
Obs.: orçamento **só avisa**, não bloqueia gastos.
Conferir também na VM: tipo **e2-micro**, região **us-central1/us-east1/us-west1**, disco **padrão ≤ 30 GB**.

## 4. Instalar na VM (Compute Engine → Instâncias de VM → SSH)
```bash
curl -fsSL https://raw.githubusercontent.com/andersontavaressilva-ctrl/winget-pro-installe/claude/mercado-livre-promo-agent-d2nz05/agente-promo-ml/instalar.sh | bash
```
Deve terminar com "Chrome OK" e "Instalação concluída". (Testado em Ubuntu 22.04 limpo.)

## 5. App no Mercado Livre (developers.mercadolivre.com.br/devcenter)
Criar aplicação: nome `Agente Promo`, redirect `https://www.google.com/`, escopos leitura + offline_access.
Copiar **ID do aplicativo** → `ML_CLIENT_ID` e **Chave secreta** → `ML_CLIENT_SECRET` (`nano .env` na VM).

## 6. Autorizar
`npm run ml-login` → abrir link → Permitir → colar a URL `https://www.google.com/?code=TG-...` no terminal.

## 7. Link de afiliado (mercadolivre.com.br/afiliados)
Gerar link de qualquer produto no Gerador de links → abrir em aba anônima → ver parâmetros na URL final
(`matt_tool`, `matt_word` ou `tracking_id`) → montar `AFFILIATE_LINK_TEMPLATE={url}?...` no `.env`.
Se o link final não trouxer parâmetros reutilizáveis, usar `data/links-afiliado.json` com links gerados no painel.

## 8. WhatsApp
`.env`: `WHATSAPP_PHONE_NUMBER=55DDDNUMERO`. Rodar `npm run list-groups` → código de 8 caracteres →
celular: Aparelhos conectados → Conectar aparelho → Conectar com número de telefone. Copiar nome do grupo
para `WHATSAPP_GROUP_NAME`.

## 9–11. Testar e ligar
```bash
npm run dry-run        # ver as ofertas e notas; ajustar filtros no .env se vier pouca coisa
npm run once           # posta 1 ciclo no grupo (confirmar com o Anderson antes)
pm2 start src/index.js --name promo && pm2 save && pm2 startup   # rodar o comando que o pm2 mostrar
```

## Riscos conhecidos
- **Busca por termos da API do ML** responde 403 para muitos apps desde 2025. O agente detecta e usa os
  **mais vendidos por categoria** (`/highlights`). Se `/highlights` também der 403, abrir chamado no
  DevCenter do ML pedindo acesso, ou avaliar buscar ofertas pelo painel de afiliados.
- Os nomes dos campos de preço da API do ML foram testados com um servidor simulado, não com a API real:
  validar no passo 9.
- WhatsApp via `whatsapp-web.js` não é oficial: risco de bloqueio do número se postar demais.
