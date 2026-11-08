# CineFlow — filmes, séries e TV ao vivo

Um único código (HTML + CSS + JavaScript, sem etapa de build) que roda em:

| Plataforma | Como |
|---|---|
| **Navegador / PWA** (celular e computador) | Hospede a pasta `www/` (ex.: GitHub Pages) e use "Instalar app" no navegador |
| **Android (celular) e Android TV** | Empacotado com [Capacitor](https://capacitorjs.com) — um único APK para os dois |
| **Computador (Windows, macOS, Linux)** | Empacotado com [Electron](https://www.electronjs.org) |

## Funcionalidades

- Tela inicial com destaque, "Continuar assistindo", filmes, séries, TV ao vivo e linhas por gênero
- Séries com temporadas e episódios, avanço automático para o próximo episódio
- TV ao vivo a partir de listas **M3U/M3U8** (IPTV), agrupadas por `group-title`, com logos `tvg-logo`
- Player com MP4 e HLS (`.m3u8`, via hls.js), retomada de onde parou
- Busca, "Minha lista" (favoritos), histórico salvo no aparelho
- **Navegação por controle remoto** (setas, OK, Voltar) para Android TV; no player: ←/→ voltam/avançam 10 s, OK pausa
- Layout responsivo: celular, computador e TV (modo TV detectado automaticamente, ou force com `?tv` na URL)

## Conteúdo

O app **não traz conteúdo próprio**: ele reproduz as fontes que você configurar em **Ajustes**.
O `www/catalog.json` de exemplo usa curtas de licença aberta (Blender Foundation, CC-BY) e streams de teste.

Use somente conteúdo que você tem direito de distribuir/assistir: mídias próprias, domínio público,
licenças abertas, ou listas de um provedor que você assina legalmente. Publicar um app com links para
filmes/canais pirateados viola direitos autorais e faz o app ser removido da Play Store.

### Formato do catálogo (JSON)

```json
{
  "movies":   [{ "id": "x", "title": "…", "year": 2024, "genres": ["Drama"], "description": "…",
                 "poster": "https://…jpg", "backdrop": "https://…jpg", "src": "https://…mp4|m3u8", "featured": true }],
  "series":   [{ "id": "y", "title": "…", "poster": "…", "seasons": [
                 { "number": 1, "episodes": [{ "id": "s1e1", "title": "…", "src": "https://…" }] }] }],
  "channels": [{ "id": "z", "title": "…", "group": "Notícias", "logo": "https://…png", "src": "https://…m3u8" }]
}
```

Adicione o endereço do seu JSON (ou da sua lista M3U) em **Ajustes**. O servidor precisa permitir CORS
quando o app roda no navegador.

## Rodar no navegador

```bash
npm start            # abre http://localhost:8080
```

## Android e Android TV

Requer Node 18+, Android Studio e JDK 17.

```bash
npm install
npm run android:init   # cria a pasta android/ e aplica os ajustes de Android TV
npm run android:open   # abre no Android Studio -> Build > Build APK(s)
```

Depois de alterar arquivos em `www/`, rode `npm run android:sync`.

`scripts/patch-android-tv.js` adiciona ao `AndroidManifest.xml`: a categoria `LEANBACK_LAUNCHER`
(ícone na tela inicial da TV), touchscreen/leanback como opcionais (mesmo APK em celular e TV),
o banner da TV e permissão para streams `http`. Para publicar na Play Store para TV, troque o banner
por uma imagem 320×180 em `android/app/src/main/res/drawable/banner.png` e aponte `android:banner` para ela.

## Computador

```bash
npm install
npm run desktop        # abre o app
npm run desktop:build  # gera instalador em dist/ (.exe no Windows, .dmg no macOS, AppImage no Linux)
```
