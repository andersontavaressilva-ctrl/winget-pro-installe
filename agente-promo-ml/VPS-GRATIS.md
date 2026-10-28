# Rodar o agente 24h numa VPS gratuita (Oracle Cloud), só pelo celular

## 1. Criar a conta
1. No navegador do celular, acesse <https://www.oracle.com/br/cloud/free/> → **Comece gratuitamente**.
2. Preencha os dados. **Região inicial: Brazil East (São Paulo)** — não dá para trocar depois.
3. Vai pedir cartão de crédito só para verificar (pode aparecer uma cobrança temporária de ~US$ 1 que é estornada).
   Recursos "Always Free" não são cobrados.

## 2. Criar o servidor
1. Menu ☰ → **Compute → Instances → Create instance**.
2. **Image:** *Change image* → **Canonical Ubuntu 22.04**.
3. **Shape:** *Change shape* → **AMD → VM.Standard.E2.1.Micro** (selo "Always Free eligible").
4. **Add SSH keys:** escolha **Generate a key pair for me** e toque em **Save private key** (guarde o arquivo `.key`).
5. **Create**. Quando ficar verde (*Running*), anote o **Public IP address**.

## 3. Acessar pelo celular
1. Instale o **Termius** (Play Store).
2. *Keychain* → **+ → Import key** → escolha o arquivo `.key` baixado.
3. *Hosts* → **+**: Address = IP público, Username = `ubuntu`, Key = a chave importada. Conecte.

## 4. Instalar o agente (copie e cole no Termius)
```bash
# memória extra (o servidor grátis tem só 1 GB)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Node.js 20 + bibliotecas que o Chrome precisa
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libnss3

# baixar o agente
git clone -b claude/mercado-livre-promo-agent-d2nz05 https://github.com/andersontavaressilva-ctrl/winget-pro-installe.git
cd winget-pro-installe/agente-promo-ml
npm install
cp .env.example .env
```
> Se o repositório for privado, o `git clone` vai pedir usuário e senha: use seu usuário do GitHub e um
> *token* (GitHub → Settings → Developer settings → Personal access tokens) no lugar da senha.

## 5. Configurar
```bash
nano .env
```
Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `AFFILIATE_LINK_TEMPLATE`, `WHATSAPP_GROUP_NAME` e
**`WHATSAPP_PHONE_NUMBER`** (ex.: `5511999998888`). Salvar: `Ctrl+O`, `Enter`, sair: `Ctrl+X`
(no Termius o Ctrl fica na barra acima do teclado).

## 6. Testar e conectar o WhatsApp
```bash
npm run dry-run       # mostra as promoções sem postar
npm run list-groups   # conecta no WhatsApp e lista os grupos
```
Vai aparecer um **código de pareamento** de 8 caracteres. No WhatsApp:
**⋮ → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone** e digite o código.

## 7. Deixar rodando 24h
```bash
sudo npm install -g pm2
pm2 start src/index.js --name promo
pm2 save && pm2 startup    # rode o comando que ele mostrar, para iniciar sozinho após reiniciar
```
Comandos úteis: `pm2 logs promo` (ver o que está fazendo), `pm2 restart promo`, `pm2 stop promo`.

## Atualizar o agente depois
```bash
cd ~/winget-pro-installe && git pull && cd agente-promo-ml && npm install && pm2 restart promo
```
