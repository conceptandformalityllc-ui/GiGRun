'use strict';
/* Customer review: selfie, stars, short review, song pick, animated presentation, shareable image. */

let rv = null;
let audio = null;
let searchTimer = null;

function stopAudio() { if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } audio = null; } }
function stopStream() {
  if (rv && rv.stream) { rv.stream.getTracks().forEach(t => t.stop()); rv.stream = null; }
}
function loadImg(src, cors) {
  return new Promise(res => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), 5000);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = src;
  });
}
function squareFrom(source, sw, sh) {
  const s = Math.min(sw, sh), cv = document.createElement('canvas');
  cv.width = cv.height = 720;
  cv.getContext('2d').drawImage(source, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, 720, 720);
  return cv.toDataURL('image/jpeg', 0.82);
}

/* ---------- flow ---------- */
function openReviewFlow(jobId) {
  const j = byId(jobId); if (!j) return;
  rv = { jobId, stars: 0, text: '', selfie: null, song: null, stream: null, video: null, results: [], tab: 'apple', playing: null };
  const first = (j.contact.name || 'there').split(' ')[0];
  const body = `
    <p class="sub" style="margin:0 2px 12px">Hand the phone to ${esc(first)}. Three quick things and it is done.</p>
    ${S.profile.name ? '' : `<label class="field"><span>Your name (printed on the review)</span><input id="rv-worker" class="in" autocomplete="name" placeholder="First and last name"></label>`}
    <div class="step"><h3><i id="rv-n1">1</i>Selfie</h3>
      <div class="cam" id="rv-cam"><div><p style="margin-bottom:12px">Smile. This goes on the review next to the finished job.</p>
        <button class="btn go" type="button" data-act="rv-cam">${icon('camera')}Open camera</button></div></div>
      <div class="wrap" style="margin-top:10px"><label class="btn sm" style="cursor:pointer">${icon('plus', 'sm')}Choose a photo instead<input id="rv-file" type="file" accept="image/*" hidden></label></div></div>
    <div class="step"><h3><i id="rv-n2">2</i>Your review</h3>
      <div class="stars big" id="rv-stars" style="margin-bottom:8px">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-act="rv-star" data-n="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${icon('star', 'fill')}</button>`).join('')}</div>
      <label class="field" style="margin:0"><span>A few words about the job <span id="rv-count" style="float:right">0 / 160</span></span><textarea id="rv-text" class="in" maxlength="160" placeholder="Showed up on time and the yard has never looked better."></textarea></label></div>
    <div class="step"><h3><i id="rv-n3">3</i>Pick a song</h3>
      <div class="seg"><button type="button" class="on" data-act="rv-tab" data-v="apple">Apple Music</button><button type="button" data-act="rv-tab" data-v="spotify">Spotify</button></div>
      <div id="rv-apple"><div class="grid2" style="grid-template-columns:1fr auto"><input id="rv-q" class="in" placeholder="Song or artist" autocomplete="off" aria-label="Search songs"><button class="btn" type="button" data-act="rv-search">Search</button></div>
        <p class="hint" style="margin-top:8px">Tap play to hear a 30-second preview, then tap Use.</p><div id="rv-results"></div></div>
      <div id="rv-spotify" hidden><p class="hint" style="margin-top:0">Spotify does not let apps search without a developer key. Find the song in Spotify, tap Share, then Copy link, and paste it here.</p>
        <div class="wrap" style="margin-bottom:10px"><button class="btn sm" type="button" data-act="rv-open-spotify">Open Spotify</button></div>
        <input id="rv-link" class="in" placeholder="Paste a Spotify or Apple Music link"><button class="btn block" type="button" data-act="rv-use-link" style="margin-top:8px">Use this link</button></div>
      <div id="rv-chosen"></div></div>`;
  openSheet('Leave a review', body, `<p class="hint" id="rv-hint" style="margin:0 0 8px;text-align:center">Add a photo, stars and a few words to continue.</p><button class="btn go block" type="button" id="rv-go" data-act="rv-go" disabled>Preview the review</button>`,
    { full: true, kind: 'review', onClose() { stopStream(); stopAudio(); } });
}
function rvUpdate() {
  const ok = !!(rv.selfie && rv.stars && rv.text.trim().length >= 3);
  $('#rv-go').disabled = !ok;
  $('#rv-hint').textContent = ok ? (rv.song ? 'Ready. Tap preview to see the review.' : 'Ready. A song is optional but it makes the review pop.') : 'Add a photo, stars and a few words to continue.';
  $('#rv-n1').classList.toggle('ok', !!rv.selfie); $('#rv-n2').classList.toggle('ok', !!(rv.stars && rv.text.trim().length >= 3)); $('#rv-n3').classList.toggle('ok', !!rv.song);
}
function rvShowPhoto() {
  $('#rv-cam').innerHTML = `<img src="${rv.selfie}" alt="Selfie"><button class="btn sm" type="button" data-act="rv-cam" style="position:absolute;bottom:10px;right:10px">Retake</button>`;
  rvUpdate();
}
async function rvCamStart() {
  const cam = $('#rv-cam');
  try {
    stopStream();
    rv.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } }, audio: false });
    const v = document.createElement('video');
    v.className = 'mirror'; v.autoplay = true; v.playsInline = true; v.muted = true; v.srcObject = rv.stream;
    cam.innerHTML = ''; cam.appendChild(v);
    cam.insertAdjacentHTML('beforeend', '<button class="shutter" type="button" data-act="rv-snap" aria-label="Take photo"></button>');
    rv.video = v;
    await v.play().catch(() => {});
  } catch (e) {
    cam.innerHTML = '<div><p>The camera is not available. Allow camera access for GigRun, or choose a photo below.</p></div>';
  }
}
function rvSnap() {
  const v = rv.video; if (!v || !v.videoWidth) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 720;
  const x = cv.getContext('2d'), s = Math.min(v.videoWidth, v.videoHeight);
  x.translate(720, 0); x.scale(-1, 1);
  x.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 720, 720);
  rv.selfie = cv.toDataURL('image/jpeg', 0.82);
  stopStream(); rvShowPhoto();
}
async function rvFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const im = await loadImg(url, false);
  URL.revokeObjectURL(url);
  if (!im) return toast('Could not read that photo.');
  stopStream();
  rv.selfie = squareFrom(im, im.naturalWidth, im.naturalHeight);
  rvShowPhoto();
}

/* ---------- songs ---------- */
/* iTunes search works with CORS in most WebViews; if a browser blocks it, fall back to JSONP. */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'gr_cb_' + Math.random().toString(36).slice(2), el = document.createElement('script');
    const done = () => { delete window[cb]; el.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, 8000);
    window[cb] = d => { done(); resolve(d); };
    el.onerror = () => { done(); reject(new Error('script')); };
    el.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(el);
  });
}
async function itunes(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error('bad'); return await r.json(); }
  catch (e) { return jsonp(url); }
}
function mapApple(x) {
  return { source: 'apple', id: String(x.trackId), title: x.trackName, artist: x.artistName,
    art: (x.artworkUrl100 || '').replace('100x100', '300x300'), preview: x.previewUrl || '', url: x.trackViewUrl || '' };
}
async function rvSearch() {
  const q = val('rv-q').trim(), box = $('#rv-results');
  if (q.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="hint">Searching…</p>';
  try {
    const j = await itunes('https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' + encodeURIComponent(q));
    rv.results = (j.results || []).filter(x => x.trackName).map(mapApple);
    rvRenderSongs();
  } catch (e) { box.innerHTML = '<p class="hint">Cannot reach the music search. Check your connection, or paste a link on the Spotify tab.</p>'; }
}
function songRow(s, i) {
  const playing = rv.playing === s.id;
  return `<div class="song"><div class="art" style="${s.art ? `background-image:url('${esc(s.art)}')` : ''}">${s.art ? '' : icon('music')}</div>
    <div><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></div>
    ${s.preview ? `<button type="button" class="rnd ${playing ? 'on' : ''}" data-act="rv-play" data-i="${i}" aria-label="${playing ? 'Pause' : 'Play'} preview of ${esc(s.title)}">${icon(playing ? 'pause' : 'play', 'fill')}</button>` : '<span></span>'}
    <button type="button" class="btn sm dark" data-act="rv-pick" data-i="${i}">Use</button></div>`;
}
function rvRenderSongs() {
  const box = $('#rv-results');
  box.innerHTML = rv.results.length ? rv.results.map(songRow).join('') : '<p class="hint">No songs found. Try the artist name.</p>';
}
function rvRenderChosen() {
  const s = rv.song, box = $('#rv-chosen');
  if (!s) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="chosen"><div class="art" style="${s.art ? `background-image:url('${esc(s.art)}')` : ''}">${s.art ? '' : icon('music')}</div><div><b>${esc(s.title)}</b><br><small class="sub">${esc(s.artist || (s.source === 'spotify' ? 'Spotify' : ''))}</small></div><button type="button" class="btn sm" data-act="rv-unpick">Change</button></div>`;
}
function parseLink(u) {
  const sp = u.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/) || u.match(/spotify:track:([A-Za-z0-9]+)/);
  if (sp) return { kind: 'spotify', id: sp[1] };
  const ap = u.match(/music\.apple\.com\/[^\s]*[?&]i=(\d+)/) || u.match(/music\.apple\.com\/[^\s]*\/(\d{6,})(?:\?|$)/);
  if (ap) return { kind: 'apple', id: ap[1] };
  return null;
}
async function rvUseLink() {
  const u = val('rv-link').trim(), p = parseLink(u);
  if (!p) return toast('That is not a Spotify or Apple Music song link.');
  try {
    if (p.kind === 'apple') {
      const r = await itunes('https://itunes.apple.com/lookup?id=' + p.id);
      if (!r.results || !r.results[0]) throw new Error('none');
      rv.song = mapApple(r.results[0]);
    } else {
      let title = 'Spotify song', art = '';
      try {
        const o = await (await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + p.id))).json();
        title = o.title || title; art = o.thumbnail_url || '';
      } catch (e) { /* keep defaults */ }
      rv.song = { source: 'spotify', id: p.id, title, artist: '', art, preview: '', url: 'https://open.spotify.com/track/' + p.id };
    }
    rvRenderChosen(); rvUpdate(); toast('Song added.');
  } catch (e) { toast('Could not look that song up. Check your connection.'); }
}
function playPreview(url, onEnd) {
  stopAudio();
  audio = new Audio(url); audio.loop = !onEnd;
  if (onEnd) audio.onended = onEnd;
  return audio.play();
}

/* ---------- present ---------- */
function presentReview(id) {
  const r = S.reviews.find(x => x.id === id); if (!r) return;
  const j = byId(r.jobId) || { cat: 'other', title: 'Job' }, cat = CATS[j.cat] || CATS.other, s = r.song;
  const el = document.createElement('div');
  el.className = 'present';
  let songHtml = '';
  if (s) {
    const art = s.art ? `style="background-image:url('${esc(s.art)}')"` : '';
    if (s.source === 'spotify') {
      songHtml = `<iframe class="p-embed" title="Spotify player" src="https://open.spotify.com/embed/track/${esc(s.id)}?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media" loading="lazy"></iframe>`;
    } else {
      songHtml = `<div class="p-song" ${s.preview ? 'data-act="p-toggle" role="button" tabindex="0"' : ''}><div class="art" ${art}>${s.art ? '' : icon('music')}</div><div><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></div>` +
        (s.preview ? `<div class="eq" id="p-eq"><i></i><i></i><i></i><i></i></div>` : `<button class="btn sm" type="button" data-act="p-open" data-url="${esc(s.url)}">Open</button>`) + `</div>`;
    }
  }
  el.innerHTML = `<div class="bg" style="background-image:url('${r.selfie}')"></div>
    <button class="x" type="button" data-act="sheet-close" aria-label="Close review">${icon('close')}</button>
    <div class="inner"><div class="p-photo"><img src="${r.selfie}" alt="Customer selfie"></div>
      <div class="p-stars" aria-label="${r.stars} out of 5 stars">${[1, 2, 3, 4, 5].map(i => `<span style="${i <= r.stars ? '' : 'opacity:.25'}">${icon('star', 'fill')}</span>`).join('')}</div>
      <p class="p-quote">&ldquo;${esc(r.text)}&rdquo;</p>
      <div class="p-by"><b>Done by ${esc(r.worker || 'your pro')}</b><span>${esc(cat.label)} &middot; ${esc(j.title)} &middot; ${dayLabel(r.created)}</span></div>
      ${songHtml}</div>
    <div class="p-actions"><button class="btn" type="button" data-act="p-save" data-id="${r.id}">Save image</button><button class="btn go" type="button" data-act="p-share" data-id="${r.id}">${icon('share')}Share</button></div>`;
  pushOverlay(el, stopAudio);
  if (s && s.preview) {
    playPreview(s.preview).catch(() => { const eq = $('#p-eq'); if (eq) eq.classList.add('paused'); });
  }
}

/* ---------- shareable image ---------- */
function wrapLines(x, text, maxW) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  return lines;
}
function roundRect(x, px, py, w, h, r) {
  x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
}
function starPath(x, cx, cy, R) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad2 = i % 2 ? R * 0.45 : R;
    x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad2, cy + Math.sin(a) * rad2);
  }
  x.closePath();
}
async function buildCard(r) {
  const j = byId(r.jobId) || { cat: 'other', title: 'Job' }, cat = CATS[j.cat] || CATS.other;
  const W = 1080, H = 1920, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), F = 'Barlow Condensed, Roboto Condensed, sans-serif-condensed, Arial Narrow, sans-serif';
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1F2D3A'); g.addColorStop(1, '#0A1016');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FF6A13'; x.fillRect(0, 0, W, 18);
  x.textAlign = 'center';
  x.fillStyle = '#FFFFFF'; x.font = `800 46px ${F}`; x.fillText('VERIFIED BY THE CUSTOMER', W / 2, 96);
  const im = await loadImg(r.selfie, false), S0 = 780, sx = (W - S0) / 2, sy = 150;
  x.save(); roundRect(x, sx, sy, S0, S0, 52); x.clip();
  if (im) x.drawImage(im, sx, sy, S0, S0); else { x.fillStyle = '#2A3947'; x.fillRect(sx, sy, S0, S0); }
  x.restore();
  x.lineWidth = 12; x.strokeStyle = '#FF6A13'; roundRect(x, sx, sy, S0, S0, 52); x.stroke();
  for (let i = 0; i < 5; i++) { starPath(x, W / 2 + (i - 2) * 112, sy + S0 + 110, 46); x.fillStyle = i < r.stars ? '#F2A900' : 'rgba(255,255,255,.2)'; x.fill(); }
  x.fillStyle = '#FFFFFF'; x.font = `700 70px ${F}`;
  const lines = wrapLines(x, '“' + r.text + '”', 880).slice(0, 5);
  lines.forEach((l, i) => x.fillText(l, W / 2, sy + S0 + 250 + i * 80));
  const by = sy + S0 + 250 + lines.length * 80 + 50;
  x.fillStyle = '#FF6A13'; x.font = `800 58px ${F}`; x.fillText(('Done by ' + (r.worker || 'your pro')).toUpperCase(), W / 2, by);
  x.fillStyle = '#C8D2DB'; x.font = `500 40px ${F}`;
  wrapLines(x, `${cat.label} · ${j.title}`, 900).slice(0, 2).forEach((l, i) => x.fillText(l, W / 2, by + 56 + i * 48));
  if (r.song) {
    const y = 1650;
    x.fillStyle = 'rgba(255,255,255,.1)'; roundRect(x, 90, y, 900, 150, 28); x.fill();
    const art = r.song.art ? await loadImg(r.song.art, true) : null;
    if (art) { x.save(); roundRect(x, 110, y + 15, 120, 120, 18); x.clip(); x.drawImage(art, 110, y + 15, 120, 120); x.restore(); }
    else { x.fillStyle = '#2A3947'; roundRect(x, 110, y + 15, 120, 120, 18); x.fill(); x.fillStyle = '#FF6A13'; x.font = `800 72px ${F}`; x.fillText('♪', 170, y + 95); }
    x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = `700 44px ${F}`;
    x.fillText((r.song.title || '').slice(0, 30), 260, y + 70);
    x.fillStyle = '#B8C4CF'; x.font = `500 36px ${F}`; x.fillText((r.song.artist || (r.song.source === 'spotify' ? 'On Spotify' : '')).slice(0, 34), 260, y + 118);
    x.textAlign = 'center';
  }
  x.fillStyle = '#7F8C99'; x.font = `800 36px ${F}`; x.fillText('GIGRUN', W / 2, 1870);
  return cv;
}
async function shareCard(id, mode) {
  const r = S.reviews.find(x => x.id === id); if (!r) return;
  try {
    const cv = await buildCard(r), url = cv.toDataURL('image/png');
    const name = 'gigrun-review-' + slug(r.worker || 'pro') + '-' + r.created + '.png';
    const caption = `${r.stars} stars: "${r.text}" Done by ${r.worker}.`;
    if (native && native.shareImage) {
      const b64 = url.split(',')[1];
      if (mode === 'save') { native.saveImage(b64, name); toast('Saved to your Pictures folder.'); }
      else native.shareImage(b64, name, caption);
    } else {
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      toast('Image saved.');
    }
  } catch (e) { toast('Could not make the image. Try again.'); }
}

Object.assign(ACT, {
  review(d) { const top = sheetStack[sheetStack.length - 1]; if (top && top.kind === 'info') closeSheet(); openReviewFlow(d.id); },
  'review-view'(d) { const rv0 = S.reviews.find(r => r.jobId === d.id); if (rv0) { const top = sheetStack[sheetStack.length - 1]; if (top && top.kind === 'info') closeSheet(); presentReview(rv0.id); } },
  'rv-cam'() { rvCamStart(); },
  'rv-snap'() { rvSnap(); },
  'rv-star'(d) { rv.stars = +d.n; $$('#rv-stars button').forEach((b, i) => b.classList.toggle('on', i < rv.stars)); rvUpdate(); },
  'rv-tab'(d, el) {
    rv.tab = d.v;
    $$('.seg button', el.parentNode).forEach(b => b.classList.toggle('on', b === el));
    $('#rv-apple').hidden = d.v !== 'apple'; $('#rv-spotify').hidden = d.v !== 'spotify';
  },
  'rv-search'() { rvSearch(); },
  'rv-play'(d) {
    const s = rv.results[+d.i]; if (!s) return;
    if (rv.playing === s.id) { stopAudio(); rv.playing = null; }
    else { rv.playing = s.id; playPreview(s.preview, () => { rv.playing = null; rvRenderSongs(); }).catch(() => { rv.playing = null; rvRenderSongs(); }); }
    rvRenderSongs();
  },
  'rv-pick'(d) { rv.song = rv.results[+d.i]; stopAudio(); rv.playing = null; rvRenderSongs(); rvRenderChosen(); rvUpdate(); },
  'rv-unpick'() { rv.song = null; rvRenderChosen(); rvUpdate(); },
  'rv-open-spotify'() { openLink('https://open.spotify.com/search/' + encodeURIComponent(val('rv-q') || 'feel good')); },
  'rv-use-link'() { rvUseLink(); },
  'rv-go'() {
    const j = byId(rv.jobId); if (!j) return;
    const w = $('#rv-worker');
    if (w && w.value.trim()) { S.profile.name = w.value.trim(); }
    if (!S.profile.name) return toast('Add your name so it prints on the review.');
    const r = { id: uid('v'), jobId: j.id, custId: j.custId || null, stars: rv.stars, text: rv.text.trim(), selfie: rv.selfie, song: rv.song, worker: S.profile.name, created: Date.now() };
    S.reviews.push(r);
    if (!saveState()) { S.reviews.pop(); return toast('Phone storage is full. Remove old reviews or erase sample data.'); }
    closeSheet(); renderAll(); presentReview(r.id);
  },
  'p-toggle'() {
    const eq = $('#p-eq');
    if (!audio) return;
    if (audio.paused) { audio.play().catch(() => {}); if (eq) eq.classList.remove('paused'); } else { audio.pause(); if (eq) eq.classList.add('paused'); }
  },
  'p-open'(d) { if (d.url) openLink(d.url); },
  'p-save'(d) { shareCard(d.id, 'save'); },
  'p-share'(d) { shareCard(d.id, 'share'); }
});
