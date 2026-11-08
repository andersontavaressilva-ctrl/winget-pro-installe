/* CineFlow — app de filmes, séries e TV ao vivo.
 * Funciona no navegador (PWA), no Android / Android TV (Capacitor) e no computador (Electron ou PWA).
 * Sem etapa de build: HTML + CSS + JS puro.
 */
(() => {
  'use strict';

  // ---------- Armazenamento seguro ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('cf:' + key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('cf:' + key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    view: 'home',
    query: '',
    catalog: { movies: [], series: [], channels: [] },
    favorites: new Set(store.get('favorites', [])),
    progress: store.get('progress', {}),          // { chave: { t, d, ts, itemId, epId } }
    sources: store.get('sources', { catalogs: [], playlists: [] }),
  };

  // ---------- Detecção de TV ----------
  const ua = navigator.userAgent;
  const isTV = /Android TV|AFT|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|GoogleTV|CrKey/i.test(ua)
    || new URLSearchParams(location.search).has('tv');
  if (isTV) document.body.classList.add('tv');

  // ---------- Carregamento de conteúdo ----------
  function normalize(raw, origin) {
    const out = { movies: [], series: [], channels: [] };
    for (const m of raw.movies || []) out.movies.push({ ...m, type: 'movie', id: `${origin}:${m.id || m.title}` });
    for (const s of raw.series || []) out.series.push({ ...s, type: 'series', id: `${origin}:${s.id || s.title}` });
    for (const c of raw.channels || []) out.channels.push({ ...c, type: 'channel', id: `${origin}:${c.id || c.title}` });
    return out;
  }

  // Parser de listas M3U / M3U8 (formato IPTV com #EXTINF)
  function parseM3U(text, origin) {
    const lines = text.split(/\r?\n/);
    const channels = [];
    let pending = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        const attr = (name) => (line.match(new RegExp(name + '="([^"]*)"', 'i')) || [])[1] || '';
        const comma = line.lastIndexOf(',');
        pending = {
          title: (comma >= 0 ? line.slice(comma + 1) : '').trim() || attr('tvg-name') || 'Canal',
          logo: attr('tvg-logo'),
          group: attr('group-title') || 'Canais',
        };
      } else if (!line.startsWith('#')) {
        const ch = pending || { title: line.split('/').pop(), group: 'Canais', logo: '' };
        channels.push({ ...ch, type: 'channel', src: line, id: `${origin}:${channels.length}:${ch.title}` });
        pending = null;
      }
    }
    return { movies: [], series: [], channels };
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function loadAll() {
    const jobs = [
      fetchText('catalog.json').then((t) => normalize(JSON.parse(t), 'local')),
      ...state.sources.catalogs.map((u) => fetchText(u).then((t) => normalize(JSON.parse(t), u))),
      ...state.sources.playlists.map((u) => fetchText(u).then((t) => parseM3U(t, u))),
    ];
    const results = await Promise.allSettled(jobs);
    const merged = { movies: [], series: [], channels: [] };
    let failed = 0;
    for (const r of results) {
      if (r.status !== 'fulfilled') { failed++; console.warn(r.reason); continue; }
      merged.movies.push(...r.value.movies);
      merged.series.push(...r.value.series);
      merged.channels.push(...r.value.channels);
    }
    state.catalog = merged;
    if (failed) toast(`${failed} fonte(s) não puderam ser carregadas`);
  }

  const allItems = () => [...state.catalog.movies, ...state.catalog.series, ...state.catalog.channels];
  const findItem = (id) => allItems().find((i) => i.id === id);

  // ---------- Pôsteres ----------
  function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

  function posterHTML(item, { wide = false, progress = 0 } = {}) {
    const img = wide ? (item.backdrop || item.poster || item.logo) : (item.poster || item.logo);
    const h = hue(item.title);
    const bg = `background:linear-gradient(160deg,hsl(${h} 60% 35%),hsl(${(h + 50) % 360} 55% 15%))`;
    return `<div class="poster ${!item.poster && item.logo ? 'logo' : ''}" style="${bg}">
      <div class="fallback">${esc(item.title)}</div>
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      ${item.type === 'channel' ? '<span class="badge">AO VIVO</span>' : ''}
      ${progress > 0 ? `<div class="progress" style="width:${Math.round(progress * 100)}%"></div>` : ''}
    </div>`;
  }

  function cardHTML(item, opts = {}) {
    const sub = item.type === 'channel' ? item.group : [item.year, (item.genres || [])[0]].filter(Boolean).join(' · ');
    return `<button class="card focusable ${opts.wide ? 'wide' : ''}" data-id="${esc(item.id)}"${opts.epId ? ` data-ep="${esc(opts.epId)}"` : ''}>
      ${posterHTML(item, opts)}
      <div class="card-title">${esc(opts.label || item.title)}</div>
      <div class="card-sub">${esc(opts.sub || sub || '')}</div>
    </button>`;
  }

  const rowHTML = (title, items, opts) => items.length
    ? `<h2 class="section-title">${esc(title)}</h2><div class="row">${items.map((i) => cardHTML(i, opts)).join('')}</div>` : '';
  const gridHTML = (items) => items.length
    ? `<div class="grid">${items.map((i) => cardHTML(i)).join('')}</div>`
    : '<p class="empty">Nada por aqui ainda.</p>';

  // ---------- Progresso / continuar assistindo ----------
  const progressKey = (itemId, epId) => epId ? `${itemId}#${epId}` : itemId;
  const ratio = (p) => (p && p.d ? p.t / p.d : 0);

  function continueWatching() {
    const seen = new Set();
    return Object.values(state.progress)
      .filter((p) => ratio(p) > 0.02 && ratio(p) < 0.95)
      .sort((a, b) => b.ts - a.ts)
      .map((p) => ({ p, item: findItem(p.itemId) }))
      .filter(({ item }) => item && !seen.has(item.id) && seen.add(item.id));
  }

  function findEpisode(series, epId) {
    for (const s of series.seasons || []) for (const e of s.episodes || []) if (e.id === epId) return { season: s, ep: e };
    return null;
  }

  // ---------- Telas ----------
  const main = $('#main');

  function render() {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view && !state.query));
    const { movies, series, channels } = state.catalog;

    if (state.query) {
      const q = state.query.toLowerCase();
      const hits = allItems().filter((i) => [i.title, i.description, i.group, ...(i.genres || [])].join(' ').toLowerCase().includes(q));
      main.innerHTML = `<h2 class="section-title">Resultados para “${esc(state.query)}”</h2>${gridHTML(hits)}`;
      return;
    }

    switch (state.view) {
      case 'home': {
        const featured = [...movies, ...series].filter((i) => i.featured);
        if (!state.heroId || !findItem(state.heroId)) {
          const pick = featured[Math.floor(Math.random() * featured.length)] || movies[0] || series[0];
          state.heroId = pick && pick.id;
        }
        const hero = state.heroId && findItem(state.heroId);
        const cw = continueWatching();
        const genres = [...new Set([...movies, ...series].flatMap((i) => i.genres || []))];
        main.innerHTML = (hero ? heroHTML(hero) : '')
          + (cw.length ? `<h2 class="section-title">Continuar assistindo</h2><div class="row">${cw.map(({ p, item }) => {
            const ep = p.epId && findEpisode(item, p.epId);
            return cardHTML(item, { wide: true, progress: ratio(p), epId: p.epId, sub: ep ? `T${ep.season.number} · ${ep.ep.title}` : '' });
          }).join('')}</div>` : '')
          + rowHTML('Filmes', movies)
          + rowHTML('Séries', series)
          + rowHTML('TV ao vivo', channels.slice(0, 30), { wide: true })
          + genres.map((g) => rowHTML(g, [...movies, ...series].filter((i) => (i.genres || []).includes(g)))).join('');
        if (!movies.length && !series.length && !channels.length) main.innerHTML = '<p class="empty">Nenhum conteúdo. Adicione fontes em Ajustes.</p>';
        break;
      }
      case 'movies': main.innerHTML = '<h2 class="section-title">Filmes</h2>' + gridHTML(movies); break;
      case 'series': main.innerHTML = '<h2 class="section-title">Séries</h2>' + gridHTML(series); break;
      case 'live': {
        const groups = [...new Set(channels.map((c) => c.group || 'Canais'))];
        main.innerHTML = groups.length
          ? groups.map((g) => rowHTML(g, channels.filter((c) => (c.group || 'Canais') === g), { wide: true })).join('')
          : '<p class="empty">Nenhum canal. Adicione uma lista M3U em Ajustes.</p>';
        break;
      }
      case 'favorites':
        main.innerHTML = '<h2 class="section-title">Minha lista</h2>' + gridHTML(allItems().filter((i) => state.favorites.has(i.id)));
        break;
      case 'settings': main.innerHTML = settingsHTML(); break;
    }
  }

  function heroHTML(item) {
    return `<section class="hero" style="background-image:url('${esc(item.backdrop || item.poster || '')}')">
      <div class="hero-content">
        <h1>${esc(item.title)}</h1>
        <div class="meta">${[item.year, item.duration, item.rating, (item.genres || []).join(', ')].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</div>
        <p>${esc(item.description || '')}</p>
        <button class="btn primary focusable" data-play="${esc(item.id)}">▶ Assistir</button>
        <button class="btn focusable" data-id="${esc(item.id)}">ⓘ Mais informações</button>
      </div>
    </section>`;
  }

  function settingsHTML() {
    const list = (kind) => state.sources[kind].map((u, i) =>
      `<li><span>${esc(u)}</span><button class="btn focusable" data-remove="${kind}:${i}">Remover</button></li>`).join('');
    return `<div class="settings">
      <h2 class="section-title" style="margin-left:0">Ajustes</h2>
      <div class="notice">Use apenas conteúdo que você tem direito de transmitir: suas próprias mídias, obras em domínio público
        ou licença aberta, ou listas fornecidas por um serviço que você assina legalmente.</div>

      <label for="pl-url">Listas de TV ao vivo (M3U / M3U8)</label>
      <p class="hint">Endereço de uma lista IPTV no formato #EXTINF. Os canais aparecem em “TV ao vivo”, agrupados por group-title.</p>
      <div class="field-row"><input id="pl-url" class="focusable" type="url" placeholder="https://exemplo.com/lista.m3u">
        <button class="btn primary focusable" data-add="playlists">Adicionar</button></div>
      <ul class="source-list">${list('playlists')}</ul>

      <label for="cat-url">Catálogos de filmes e séries (JSON)</label>
      <p class="hint">Arquivo JSON no mesmo formato de <code>catalog.json</code> (movies, series, channels).</p>
      <div class="field-row"><input id="cat-url" class="focusable" type="url" placeholder="https://exemplo.com/catalogo.json">
        <button class="btn primary focusable" data-add="catalogs">Adicionar</button></div>
      <ul class="source-list">${list('catalogs')}</ul>

      <label>Dados</label>
      <button class="btn focusable" data-action="clear-progress">Limpar histórico de reprodução</button>
      <button class="btn focusable" data-action="reload">Recarregar conteúdo</button>
    </div>`;
  }

  // ---------- Detalhes ----------
  const details = $('#details');
  let detailsReturnFocus = null;

  function openDetails(item, seasonNumber) {
    if (item.type === 'channel') return play(item);
    detailsReturnFocus = document.activeElement;
    const fav = state.favorites.has(item.id);
    const p = state.progress[item.id];
    let body = '';
    let resume = '';

    if (item.type === 'series') {
      const seasons = item.seasons || [];
      const last = Object.values(state.progress).filter((x) => x.itemId === item.id).sort((a, b) => b.ts - a.ts)[0];
      const lastEp = last && findEpisode(item, last.epId);
      const current = seasons.find((s) => s.number === seasonNumber) || (lastEp && lastEp.season) || seasons[0];
      if (lastEp) resume = `<button class="btn primary focusable" data-play="${esc(item.id)}" data-ep="${esc(lastEp.ep.id)}">▶ Continuar T${lastEp.season.number}: ${esc(lastEp.ep.title)}</button>`;
      else if (current && current.episodes[0]) resume = `<button class="btn primary focusable" data-play="${esc(item.id)}" data-ep="${esc(current.episodes[0].id)}">▶ Assistir T${current.number} E1</button>`;
      body = `<div class="seasons">${seasons.map((s) => `<button class="season-btn focusable ${s === current ? 'active' : ''}" data-season="${s.number}" data-id="${esc(item.id)}">Temporada ${s.number}</button>`).join('')}</div>
        <div class="episodes">${(current ? current.episodes : []).map((e, i) => {
          const r = ratio(state.progress[progressKey(item.id, e.id)]);
          return `<button class="episode focusable" data-play="${esc(item.id)}" data-ep="${esc(e.id)}">
            <span class="num">${i + 1}</span>
            <span style="flex:1"><div class="ep-title">${esc(e.title)}</div><div class="card-sub">${esc(e.duration || '')} ${esc(e.description || '')}</div>
            ${r > 0 ? `<div class="ep-progress" style="width:${Math.round(r * 100)}%"></div>` : ''}</span>
          </button>`;
        }).join('')}</div>`;
    } else {
      const r = ratio(p);
      resume = `<button class="btn primary focusable" data-play="${esc(item.id)}">▶ ${r > 0.02 && r < 0.95 ? 'Continuar' : 'Assistir'}</button>`
        + (r > 0.02 && r < 0.95 ? `<button class="btn focusable" data-play="${esc(item.id)}" data-restart="1">↺ Do início</button>` : '');
    }

    details.innerHTML = `<div class="sheet">
      <div class="sheet-hero" style="background-image:url('${esc(item.backdrop || item.poster || '')}')"></div>
      <div class="sheet-body">
        <h2>${esc(item.title)}</h2>
        <div class="meta">${[item.year, item.duration, item.rating, (item.genres || []).join(', ')].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</div>
        <p>${esc(item.description || '')}</p>
        ${resume}
        <button class="btn focusable" data-fav="${esc(item.id)}">${fav ? '✓ Na minha lista' : '+ Minha lista'}</button>
        <button class="btn focusable" data-action="close-details">Fechar</button>
        ${body}
      </div>
    </div>`;
    details.hidden = false;
    focusFirst(details, seasonNumber ? `.season-btn[data-season="${seasonNumber}"]` : '.btn.primary');
  }

  function closeDetails() {
    details.hidden = true;
    details.innerHTML = '';
    if (detailsReturnFocus && document.contains(detailsReturnFocus)) detailsReturnFocus.focus();
  }

  // ---------- Player ----------
  const player = $('#player');
  const video = $('#video');
  let hls = null;
  let current = null;       // { item, ep, key }
  let saveTimer = null;
  let idleTimer = null;
  let playerReturnFocus = null;

  function nextEpisode(series, epId) {
    const flat = (series.seasons || []).flatMap((s) => s.episodes || []);
    const i = flat.findIndex((e) => e.id === epId);
    return i >= 0 ? flat[i + 1] : null;
  }

  function play(item, epId, { restart = false } = {}) {
    let src = item.src;
    let title = item.title;
    let ep = null;
    if (item.type === 'series') {
      const found = findEpisode(item, epId) || { season: item.seasons[0], ep: item.seasons[0].episodes[0] };
      ep = found.ep;
      src = ep.src;
      title = `${item.title} — T${found.season.number}: ${ep.title}`;
    }
    if (!src) return toast('Este item não tem fonte de vídeo');

    if (!player.hidden) stopPlayback();
    else playerReturnFocus = document.activeElement;

    details.hidden = true;
    current = { item, ep, key: progressKey(item.id, ep && ep.id) };
    $('#player-title').textContent = title;
    const next = item.type === 'series' && nextEpisode(item, ep.id);
    $('#player-next').hidden = !next;
    player.hidden = false;
    showMsg('Carregando…');

    const isHls = /\.m3u8(\?|$)/i.test(src) || item.type === 'channel' && !/\.(mp4|webm|mkv)(\?|$)/i.test(src);
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ enableWorker: true, lowLatencyMode: item.type === 'channel' });
      hls.on(window.Hls.Events.ERROR, (_, data) => { if (data.fatal) showMsg('Não foi possível reproduzir este conteúdo.'); });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    const saved = state.progress[current.key];
    if (item.type !== 'channel' && saved && !restart && ratio(saved) < 0.95) {
      video.addEventListener('loadedmetadata', () => { video.currentTime = saved.t; }, { once: true });
    }
    video.play().catch(() => showMsg('Toque ▶ para iniciar'));
    saveTimer = setInterval(saveProgress, 5000);
    poke();
    $('#player-close').focus({ preventScroll: true });
  }

  function saveProgress() {
    if (!current || current.item.type === 'channel' || !isFinite(video.duration) || !video.duration) return;
    state.progress[current.key] = { t: video.currentTime, d: video.duration, ts: Date.now(), itemId: current.item.id, epId: current.ep && current.ep.id };
    store.set('progress', state.progress);
  }

  function stopPlayback() {
    saveProgress();
    clearInterval(saveTimer);
    if (hls) { hls.destroy(); hls = null; }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function closePlayer() {
    stopPlayback();
    player.hidden = true;
    current = null;
    hideMsg();
    render();
    const back = playerReturnFocus && playerReturnFocus.dataset && playerReturnFocus.dataset.id
      && main.querySelector(`[data-id="${CSS.escape(playerReturnFocus.dataset.id)}"]`);
    (back || main.querySelector('.focusable') || document.querySelector('.nav-btn.active'))?.focus();
  }

  function showMsg(text) { const m = $('#player-msg'); m.textContent = text; m.hidden = false; }
  function hideMsg() { $('#player-msg').hidden = true; }

  function poke() {
    player.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused) player.classList.add('idle'); }, 3500);
  }

  video.addEventListener('playing', hideMsg);
  video.addEventListener('waiting', () => showMsg('Carregando…'));
  video.addEventListener('error', () => showMsg('Não foi possível reproduzir este conteúdo.'));
  video.addEventListener('ended', () => {
    saveProgress();
    if (current && current.item.type === 'series') {
      const next = nextEpisode(current.item, current.ep.id);
      if (next) return play(current.item, next.id);
    }
    closePlayer();
  });
  player.addEventListener('mousemove', poke);
  player.addEventListener('touchstart', poke, { passive: true });
  $('#player-close').addEventListener('click', closePlayer);
  $('#player-next').addEventListener('click', () => {
    const next = current && nextEpisode(current.item, current.ep.id);
    if (next) play(current.item, next.id, { restart: true });
  });

  // ---------- Navegação espacial (controle remoto / setas) ----------
  function visibleFocusables() {
    const root = !player.hidden ? player : !details.hidden ? details : document;
    return [...root.querySelectorAll('.focusable, video')].filter((el) => {
      if (el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function moveFocus(dir) {
    const cur = document.activeElement;
    const items = visibleFocusables();
    if (!items.includes(cur)) { items[0]?.focus(); return; }
    const a = cur.getBoundingClientRect();
    const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      const dx = bc.x - ac.x;
      const dy = bc.y - ac.y;
      let primary, secondary;
      if (dir === 'left') { if (b.right > a.left + 1) continue; primary = -dx; secondary = Math.abs(dy); }
      if (dir === 'right') { if (b.left < a.right - 1) continue; primary = dx; secondary = Math.abs(dy); }
      if (dir === 'up') { if (b.bottom > a.top + 1) continue; primary = -dy; secondary = Math.abs(dx); }
      if (dir === 'down') { if (b.top < a.bottom - 1) continue; primary = dy; secondary = Math.abs(dx); }
      const score = primary + secondary * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) {
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      if (dir === 'up' && !best.closest('.modal, .player') && best.getBoundingClientRect().top < 120) {
        // Mantém a linha focada visível abaixo do cabeçalho fixo.
        window.scrollBy({ top: best.getBoundingClientRect().top - 140, behavior: 'smooth' });
      }
    }
  }

  function goBack() {
    if (!player.hidden) return closePlayer(), true;
    if (!details.hidden) return closeDetails(), true;
    if (state.query) { state.query = ''; $('#search').value = ''; render(); return true; }
    if (state.view !== 'home') { setView('home'); return true; }
    return false;
  }

  const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Back']);
  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, textarea');
    const isBack = BACK_KEYS.has(e.key) || e.keyCode === 10009 || e.keyCode === 461 || (e.key === 'Backspace' && !typing);

    if (isBack) { if (goBack()) e.preventDefault(); return; }

    // Atalhos do player
    if (!player.hidden) {
      poke();
      const onVideo = document.activeElement === video || document.activeElement === document.body;
      if (e.key === 'MediaPlayPause' || (e.key === ' ' && !typing) || (e.key === 'Enter' && onVideo)) {
        e.preventDefault(); video.paused ? video.play() : video.pause(); return;
      }
      if (onVideo && current && current.item.type !== 'channel') {
        if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') { e.preventDefault(); video.currentTime += 10; return; }
        if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') { e.preventDefault(); video.currentTime -= 10; return; }
      }
      if (onVideo && e.key === 'ArrowUp') { e.preventDefault(); $('#player-close').focus(); return; }
      if (e.key === 'ArrowDown' && !onVideo) { e.preventDefault(); video.focus(); return; }
    }

    const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[e.key]) {
      if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      moveFocus(dirs[e.key]);
    }
  });

  // Botão "voltar" físico no Android (Capacitor)
  const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (capApp) capApp.addListener('backButton', () => { if (!goBack()) capApp.exitApp(); });

  function focusFirst(root, preferred) {
    const el = (preferred && root.querySelector(preferred)) || root.querySelector('.focusable');
    if (el) el.focus({ preventScroll: true });
  }

  // ---------- Cliques (delegação) ----------
  function setView(view) {
    state.view = view;
    state.query = '';
    $('#search').value = '';
    render();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view],[data-play],[data-id],[data-fav],[data-add],[data-remove],[data-action]');
    if (!t) { if (e.target === details) closeDetails(); return; }
    const d = t.dataset;

    if (d.view) {
      setView(d.view);
      t.focus();
    } else if (d.play) {
      const item = findItem(d.play);
      if (item) play(item, d.ep, { restart: !!d.restart });
    } else if (d.season) {
      const item = findItem(d.id);
      if (item) openDetails(item, Number(d.season));
    } else if (d.id) {
      const item = findItem(d.id);
      if (!item) return;
      if (d.ep) play(item, d.ep); else openDetails(item);
    } else if (d.fav) {
      state.favorites.has(d.fav) ? state.favorites.delete(d.fav) : state.favorites.add(d.fav);
      store.set('favorites', [...state.favorites]);
      t.textContent = state.favorites.has(d.fav) ? '✓ Na minha lista' : '+ Minha lista';
      if (state.view === 'favorites') render();
    } else if (d.add) {
      const input = $(d.add === 'playlists' ? '#pl-url' : '#cat-url');
      const url = input.value.trim();
      if (!/^https?:\/\//i.test(url)) return toast('Informe um endereço http(s) válido');
      if (!state.sources[d.add].includes(url)) state.sources[d.add].push(url);
      store.set('sources', state.sources);
      toast('Fonte adicionada. Carregando…');
      reload();
    } else if (d.remove) {
      const [kind, i] = d.remove.split(':');
      state.sources[kind].splice(Number(i), 1);
      store.set('sources', state.sources);
      reload();
    } else if (d.action === 'clear-progress') {
      state.progress = {};
      store.set('progress', {});
      toast('Histórico apagado');
    } else if (d.action === 'reload') {
      reload();
    } else if (d.action === 'close-details') {
      closeDetails();
    }
  });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value.trim(); render(); }, 200);
  });

  // ---------- Utilidades ----------
  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  async function reload() {
    await loadAll();
    render();
  }

  // ---------- Início ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  reload().then(() => {
    const first = main.querySelector('.btn.primary') || main.querySelector('.focusable');
    if (isTV && first) first.focus({ preventScroll: true });
  });
})();
