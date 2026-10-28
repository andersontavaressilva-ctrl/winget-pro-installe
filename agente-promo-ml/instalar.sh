#!/usr/bin/env bash
# Instalador do Agente de Promoções (Ubuntu 22.04 / VPS).
# Uso: curl -fsSL https://raw.githubusercontent.com/andersontavaressilva-ctrl/winget-pro-installe/claude/mercado-livre-promo-agent-d2nz05/agente-promo-ml/instalar.sh | bash
set -euo pipefail

REPO=https://github.com/andersontavaressilva-ctrl/winget-pro-installe.git
BRANCH=claude/mercado-livre-promo-agent-d2nz05
DIR="$HOME/winget-pro-installe"
APP="$DIR/agente-promo-ml"

etapa() { echo -e "\n\033[1;32m==> $*\033[0m"; }

etapa "1/6 Memória extra (swap de 2 GB)"
if ! swapon --show 2>/dev/null | grep -q /swapfile; then
  if sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile; then
    grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  else
    echo "Aviso: não foi possível criar o swap (seguindo mesmo assim)."
  fi
fi

etapa "2/6 Node.js 20 e git"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
fi
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs git >/dev/null

etapa "3/6 Baixando o agente"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" pull -q origin "$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$APP"

etapa "4/6 Instalando dependências e o Chrome (pode levar alguns minutos)"
npm install --no-audit --no-fund --loglevel=error
sudo npx --yes puppeteer browsers install-deps chrome >/dev/null 2>&1 \
  || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
       libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
       libcairo2 libnss3 >/dev/null

etapa "5/6 Gerenciador pm2 (mantém o agente rodando 24h)"
command -v pm2 >/dev/null || sudo npm install -g pm2 --loglevel=error

etapa "6/6 Configuração"
[ -f .env ] || cp .env.example .env

# Pergunta um valor e grava no .env (Enter mantém o valor atual)
perguntar() {
  local chave="$1" texto="$2" atual="" valor=""
  atual="$(grep -E "^$chave=" .env | cut -d= -f2- || true)"
  read -r -p "$texto [${atual:-vazio}]: " valor < /dev/tty || true
  if [ -n "$valor" ]; then
    valor="${valor//\\/\\\\}"; valor="${valor//&/\\&}"; valor="${valor//|/\\|}"
    sed -i "s|^$chave=.*|$chave=$valor|" .env
  fi
}

echo "Responda abaixo (aperte Enter para pular e preencher depois com: nano $APP/.env)"
perguntar WHATSAPP_PHONE_NUMBER "Seu número do WhatsApp com 55 e DDD (ex.: 5511999998888)"
perguntar WHATSAPP_GROUP_NAME   "Nome exato do grupo do WhatsApp"
perguntar ML_CLIENT_ID          "Mercado Livre - Client ID"
perguntar ML_CLIENT_SECRET      "Mercado Livre - Client Secret"
perguntar AFFILIATE_LINK_TEMPLATE "Modelo do link de afiliado"
perguntar SEARCH_TERMS          "Termos de busca separados por ;"

cat <<FIM

*** Instalação concluída! ***

Próximos passos:
  cd $APP
  npm run ml-login        # autoriza o agente na sua conta do Mercado Livre
  npm run list-groups     # mostra o CÓDIGO DE PAREAMENTO -> digite no WhatsApp
                          # (Aparelhos conectados > Conectar aparelho > Conectar com número de telefone)
  npm run dry-run         # testa a busca de promoções sem postar
  pm2 start src/index.js --name promo && pm2 save   # liga o agente 24h
  pm2 logs promo          # acompanha o que ele está fazendo
FIM
