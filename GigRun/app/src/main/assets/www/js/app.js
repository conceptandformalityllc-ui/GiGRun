'use strict';
/* GigRun UI core: helpers, sheets, job cards, the five tabs, GPS. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const native = window.GigRunNative || null;
const icon = (n, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : d; };
const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const smsHref = p => 'sms:' + String(p || '').replace(/[^\d+]/g, '');

const ui = { tab: 'jobs', cat: 'all', sort: 'rate', seg: 'accepted', mapFilter: 'all', sel: null, route: false, fitted: false };
const ACT = {};
const DAY = 86400000;

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, undoLabel, undo) {
  const host = $('#toast');
  host.innerHTML = `<div class="t"><span>${esc(msg)}</span>${undo ? `<button type="button" id="toastUndo">${esc(undoLabel || 'Undo')}</button>` : ''}</div>`;
  if (undo) $('#toastUndo').onclick = () => { host.innerHTML = ''; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, undo ? 6000 : 3200);
}

/* ---------- sheets ---------- */
const sheetStack = [];
function openSheet(title, body, foot, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  wrap.innerHTML =
    `<div class="scrim" data-act="sheet-close"></div>` +
    `<div class="sheet ${opts.full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
    `<div class="sheet-h"><h2>${esc(title)}</h2><button class="x" type="button" data-act="sheet-close" aria-label="Close">${icon('close')}</button></div>` +
    `<div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}</div>`;
  $('#sheetHost').appendChild(wrap);
  const entry = { el: wrap, onClose: opts.onClose, render: opts.render, title, kind: opts.kind, id: opts.id };
  sheetStack.push(entry);
  return entry;
}
function setSheet(entry, body, foot) {
  const b = $('.sheet-b', entry.el), top = b.scrollTop;
  b.innerHTML = body;
  let f = $('.sheet-f', entry.el);
  if (foot) {
    if (!f) { f = document.createElement('div'); f.className = 'sheet-f'; $('.sheet', entry.el).appendChild(f); }
    f.innerHTML = foot;
  } else if (f) f.remove();
  b.scrollTop = top;
}
function closeSheet() {
  const s = sheetStack.pop();
  if (!s) return false;
  if (s.onClose) s.onClose();
  s.el.remove();
  return true;
}
function pushOverlay(el, onClose) {
  $('#sheetHost').appendChild(el);
  sheetStack.push({ el, onClose });
}
function refreshSheets() {
  sheetStack.forEach(s => {
    if (!s.render) return;
    const r = s.render();
    if (!r) { s.stale = true; return; }
    setSheet(s, r.body, r.foot);
  });
  for (let i = sheetStack.length - 1; i >= 0; i--) if (sheetStack[i].stale) { sheetStack[i].el.remove(); sheetStack.splice(i, 1); }
}

/* ---------- derived lists ---------- */
const byId = id => S.jobs.find(j => j.id === id);
const custById = id => S.customers.find(c => c.id === id);
const openJobs = () => S.jobs.filter(j => j.status === 'new');
function sortJobs(list, how) {
  const c = new Map(list.map(j => [j.id, calc(j)]));
  const key = {
    rate: j => -c.get(j.id).rate,
    near: j => c.get(j.id).miles,
    pay: j => -j.pay,
    new: j => -j.posted
  }[how];
  return [...list].sort((a, b) => key(a) - key(b));
}
function dueReminders() {
  const out = [], now = Date.now();
  S.customers.forEach(c => c.reminders.forEach(r => { if (!r.done && r.when <= now) out.push({ c, r }); }));
  return out.sort((a, b) => a.r.when - b.r.when);
}
function custRating(c) {
  const r = customerJobs(c.id).filter(j => j.rating).map(j => j.rating);
  return c.manualRating ? c.rating : (r.length ? r.reduce((a, b) => a + b, 0) / r.length : c.rating || 0);
}
const starsRow = (n, cls = '') =>
  `<span class="stars ${cls}" aria-label="${n ? n.toFixed(1).replace('.0', '') + ' stars' : 'Not rated'}">${[1, 2, 3, 4, 5].map(i =>
    `<span class="${i <= Math.round(n) ? 'on' : ''}">${icon('star', 'fill')}</span>`).join('')}</span>`;

/* ---------- job card ---------- */
function pips(n) { return `<span class="pips e${n}" title="Effort ${n} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; }

function jobCard(j, o = {}) {
  const c = calc(j), cat = CATS[j.cat] || CATS.other;
  const gearTxt = c.done ? '' : (c.gear > 0
    ? `<span class="fact">${icon('handy')}<b>${usd(c.gear)}</b> gear to rent</span>`
    : `<span class="fact">${icon('handy')}<b>Gear covered</b></span>`);
  let meta, facts, acts;
  if (j.status === 'done') {
    meta = `${dayLabel(j.doneAt)} · done`;
    facts = `<span class="fact">${icon('clock')}<b>${hrs(c.work)}</b> on site</span>${j.rating ? `<span class="fact">${starsRow(j.rating)}</span>` : ''}${j.contact.name ? `<span class="fact">${esc(j.contact.name)}</span>` : ''}`;
    const rv = S.reviews.find(r => r.jobId === j.id);
    acts = `<div class="acts two"><button class="btn" type="button" data-act="info" data-id="${j.id}">${icon('info')}Info</button>` +
      `<button class="btn ${rv ? '' : 'dark'}" type="button" data-act="${rv ? 'review-view' : 'review'}" data-id="${j.id}">${icon('camera')}${rv ? 'View review' : 'Ask for review'}</button></div>`;
  } else {
    meta = `${mi1(c.miles)} mi · ${ago(j.posted)}`;
    facts =
      `<span class="fact">${icon('clock')}<b>${hrs(c.total)}</b> <span>(${hrs(c.work)} work + ${mins(c.drive)} drive)</span></span>` +
      `<span class="fact">${pips(j.effort)}<b>${EFFORT[j.effort].name}</b></span>` + gearTxt;
    if (j.status === 'new') {
      acts = `<div class="acts"><button class="btn decline" type="button" data-act="decline" data-id="${j.id}">${icon('close')}Decline</button>` +
        `<button class="btn" type="button" data-act="info" data-id="${j.id}">${icon('info')}Info</button>` +
        `<button class="btn accept" type="button" data-act="accept" data-id="${j.id}">${icon('check')}Accept</button></div>`;
    } else if (j.status === 'accepted') {
      const canCall = !!j.contact.phone;
      acts = `<div class="acts go"><button class="btn go" type="button" data-act="go" data-id="${j.id}">${icon('nav')}GO · ${mi1(c.miles)} mi</button></div>` +
        `<div class="acts mini"><button class="btn sm" type="button" data-act="info" data-id="${j.id}">${icon('info', 'sm')}Info</button>` +
        `<a class="btn sm ${canCall ? '' : 'ghost'}" ${canCall ? `href="${telHref(j.contact.phone)}"` : 'aria-disabled="true"'}>${icon('phone', 'sm')}Call</a>` +
        `<a class="btn sm ${canCall ? '' : 'ghost'}" ${canCall ? `href="${smsHref(j.contact.phone)}"` : 'aria-disabled="true"'}>${icon('text', 'sm')}Text</a>` +
        `<button class="btn sm dark" type="button" data-act="done" data-id="${j.id}">${icon('check', 'sm')}Done</button></div>`;
    } else {
      acts = `<div class="acts two"><button class="btn" type="button" data-act="info" data-id="${j.id}">${icon('info')}Info</button>` +
        `<button class="btn dark" type="button" data-act="restore" data-id="${j.id}">Restore</button></div>`;
    }
  }
  const payNow = j.status === 'done' && j.result ? Math.round(j.result.pay) : j.pay;
  return `<article class="job ${o.top ? 'top' : ''}" data-v="${c.verdict}" data-id="${j.id}">
    ${o.top ? '<span class="top-flag">Top pick</span>' : ''}
    <div class="job-top"><span class="cat">${icon(cat.icon)}${esc(cat.label)}</span><span>${meta}</span>${j.sample ? '<span class="tag sample">Sample</span>' : ''}</div>
    <h3 class="job-title">${esc(j.title)}</h3>
    <div class="money">
      <div class="pay"><span class="cur">$</span>${payNow}</div>
      <div><b class="${c.verdict}">${usd(c.net)}</b><small>net after costs</small></div>
      <div style="text-align:right"><b>${usd(c.rate)}/hr</b><small><span class="pill ${c.verdict}" style="height:20px;font-size:10.5px;padding:0 7px">${VERDICT[c.verdict]}</span></small></div>
    </div>
    <div class="facts">${facts}</div>
    ${acts}
    ${o.extra || ''}
  </article>`;
}

/* ---------- tabs ---------- */
function dueBanner() {
  const d = dueReminders();
  if (!d.length) return '';
  const { c, r } = d[0];
  return `<div class="banner">${icon('bell')}<div class="t"><b>Follow up with ${esc(c.name)}</b>${esc(r.text)}${d.length > 1 ? ` · +${d.length - 1} more` : ''}</div><button class="btn sm" type="button" data-act="cust" data-id="${c.id}">Open</button></div>`;
}

function renderJobs() {
  const all = openJobs();
  const counts = {};
  all.forEach(j => { counts[j.cat] = (counts[j.cat] || 0) + 1; });
  let list = ui.cat === 'all' ? all : all.filter(j => j.cat === ui.cat);
  list = sortJobs(list, ui.sort);
  const good = all.filter(j => calc(j).verdict === 'good').length;
  const sorts = [['rate', 'Best $/hr'], ['near', 'Closest'], ['pay', 'Highest pay'], ['new', 'Newest']];
  let html = dueBanner();
  html += `<div class="h-row"><div><h1 class="h2">${all.length} open jobs</h1><span class="sub">${good} worth your time</span></div><button class="btn sm" type="button" data-act="add">${icon('plus', 'sm')}Add job</button></div>`;
  html += `<div class="chips" role="tablist" aria-label="Category">` +
    `<button class="chip ${ui.cat === 'all' ? 'on' : ''}" type="button" data-act="cat" data-v="all">All <span class="n">${all.length}</span></button>` +
    Object.keys(CATS).filter(k => counts[k] || ui.cat === k).map(k =>
      `<button class="chip ${ui.cat === k ? 'on' : ''}" type="button" data-act="cat" data-v="${k}">${icon(CATS[k].icon)}${esc(CATS[k].label)} <span class="n">${counts[k] || 0}</span></button>`).join('') + `</div>`;
  html += `<div class="chips" aria-label="Sort">` + sorts.map(s =>
    `<button class="chip sort ${ui.sort === s[0] ? 'on' : ''}" type="button" data-act="sort" data-v="${s[0]}">${s[1]}</button>`).join('') + `</div>`;
  if (!list.length) {
    html += `<div class="empty"><b>Nothing here yet</b>${all.length ? 'Try a different category.' : 'Add a job you found, or restore passed ones from My jobs.'}</div>`;
  } else {
    list.forEach((j, i) => { html += jobCard(j, { top: i === 0 && ui.sort === 'rate' && calc(j).verdict === 'good' }); });
  }
  $('#scr-jobs').innerHTML = html;
}

/* ----- map tab ----- */
let gmap = null;
function ensureMap() {
  if (gmap) return;
  const h = here();
  gmap = new GigMap($('#mapRoot'), { lat: h.lat, lng: h.lng, z: 13 });
  gmap.onPin = id => { ui.sel = id; ui.route = false; renderMap(); };
  gmap.onTap = () => { if (ui.sel) { ui.sel = null; renderMap(); } };
}
function mapJobs() {
  const f = ui.mapFilter;
  return S.jobs.filter(j => f === 'open' ? j.status === 'new' : f === 'mine' ? j.status === 'accepted' : (j.status === 'new' || j.status === 'accepted'));
}
function routePlan() {
  const left = S.jobs.filter(j => j.status === 'accepted');
  const stops = [];
  let cur = here();
  while (left.length) {
    left.sort((a, b) => haversine(cur, a) - haversine(cur, b));
    const n = left.shift();
    stops.push({ job: n, mi: roadMiles(cur, n), from: cur });
    cur = n;
  }
  const totalMi = stops.reduce((s, x) => s + x.mi, 0);
  const back = stops.length ? roadMiles(cur, here()) : 0;
  const miles = totalMi + back;
  const cost = miles * costPerMile();
  return { stops, miles, back, cost, drive: miles / S.profile.speed, pay: stops.reduce((s, x) => s + x.job.pay, 0), work: stops.reduce((s, x) => s + x.job.hours, 0) };
}
function renderMap() {
  ensureMap();
  const jobs = mapJobs();
  const me = here();
  gmap.setMe(RT.me || null);
  const pins = jobs.map(j => {
    const c = calc(j), cat = CATS[j.cat] || CATS.other;
    return { id: j.id, lat: j.lat, lng: j.lng, z: j.id === ui.sel ? 9 : 1,
      cls: (j.status === 'accepted' ? 'mine' : c.verdict) + (j.id === ui.sel ? ' sel' : ''),
      html: `<span class="dot">${icon(cat.icon)}</span><span class="tagp">$${j.pay}</span>`, label: `${j.title}, $${j.pay}` };
  });
  gmap.setPins(pins);

  const lines = [];
  const plan = routePlan();
  if (ui.route && plan.stops.length) {
    plan.stops.forEach(s => lines.push({ cls: 'leg-line', pts: [s.from, s.job], label: mi1(s.mi) + ' mi' }));
  } else if (ui.sel && byId(ui.sel)) {
    const s = byId(ui.sel);
    lines.push({ pts: [me, s], label: mi1(roadMiles(me, s)) + ' mi' });
    jobs.filter(j => j.id !== s.id).map(j => ({ j, mi: roadMiles(s, j) })).sort((a, b) => a.mi - b.mi).slice(0, 2)
      .forEach(x => lines.push({ pts: [s, x.j], label: mi1(x.mi) + ' mi' }));
  }
  gmap.setLines(lines);

  const f = ui.mapFilter;
  $('#mapTop').innerHTML = [['all', 'All jobs'], ['open', 'Open'], ['mine', 'Accepted']].map(x =>
    `<button class="chip ${f === x[0] ? 'on' : ''}" type="button" data-act="mapf" data-v="${x[0]}">${x[1]}</button>`).join('');
  $('#mapSide').innerHTML =
    `<button type="button" data-act="zin" aria-label="Zoom in">+</button><button type="button" data-act="zout" aria-label="Zoom out">&minus;</button>` +
    `<button type="button" data-act="mloc" aria-label="Center on me">${icon('locate')}</button>` +
    `<button type="button" data-act="mfit" aria-label="Show all jobs">${icon('fit')}</button>` +
    `<button type="button" class="${ui.route ? 'on' : ''}" data-act="mroute" aria-label="Route plan">${icon('route')}</button>`;

  let card = '';
  const sel = ui.sel && byId(ui.sel);
  if (sel) {
    const near = jobs.filter(j => j.id !== sel.id).map(j => ({ j, mi: roadMiles(sel, j) })).sort((a, b) => a.mi - b.mi)[0];
    card = jobCard(sel, { extra: near ? `<div class="rev-line"><span>Next closest job: ${esc(near.j.title.slice(0, 30))}${near.j.title.length > 30 ? '…' : ''}</span><b>${mi1(near.mi)} mi</b></div>` : '' });
  } else if (ui.route) {
    card = routeCardHtml(plan);
  }
  $('#mapCard').innerHTML = card;
  if (!ui.fitted && jobs.length) {
    ui.fitted = true;
    const near = [...jobs].sort((a, b) => haversine(me, a) - haversine(me, b)).slice(0, 8);
    gmap.fit([me, ...near], 50);
  }
}
function routeCardHtml(plan) {
  if (!plan.stops.length) {
    return `<div class="route-card"><h3>Route plan</h3><p class="sub">Accept two or more jobs and this shows the best order to drive them, the miles between each, and what the driving costs.</p></div>`;
  }
  return `<div class="route-card"><h3><span>Route plan</span><span class="sub" style="font:500 13px var(--body);text-transform:none">${plan.stops.length} stop${plan.stops.length > 1 ? 's' : ''}</span></h3>` +
    plan.stops.map((s, i) => `<div class="leg-row"><i>${i + 1}</i><div>${esc(s.job.title)}<small>${i === 0 ? 'From you' : 'From stop ' + i} · ${mi1(s.mi)} mi · ${mins(s.mi / S.profile.speed)} drive</small></div><b>$${s.job.pay}</b></div>`).join('') +
    `<div class="tbl" style="margin-top:6px"><div><span>Miles driven (round trip home)</span><span>${mi1(plan.miles)} mi</span></div>` +
    `<div><span>Fuel and wear</span><span class="neg">-${usd2(plan.cost)}</span></div>` +
    `<div><span>Total pay</span><span>${usd(plan.pay)}</span></div>` +
    `<div class="total"><span>Net per hour of the whole run</span><span>${usd((plan.pay - plan.cost) / (plan.work + plan.drive))}/hr</span></div></div>` +
    `<button class="btn go block" type="button" data-act="go" data-id="${plan.stops[0].job.id}" style="margin-top:6px">${icon('nav')}GO TO STOP 1</button></div>`;
}

/* ----- my jobs tab ----- */
function weekStats() {
  const since = Date.now() - 7 * DAY;
  const d = S.jobs.filter(j => j.status === 'done' && j.doneAt >= since && j.result);
  const net = d.reduce((s, j) => s + j.result.net, 0), h = d.reduce((s, j) => s + j.result.hours, 0);
  return { n: d.length, net, hours: h, rate: h ? net / h : 0, miles: d.reduce((s, j) => s + j.result.miles, 0) };
}
function renderMine() {
  const w = weekStats();
  const acc = S.jobs.filter(j => j.status === 'accepted').sort((a, b) => a.acceptedAt - b.acceptedAt);
  const done = S.jobs.filter(j => j.status === 'done').sort((a, b) => b.doneAt - a.doneAt);
  const dec = S.jobs.filter(j => j.status === 'declined');
  let html = `<div class="stats-h">Last 7 days · ${w.n} job${w.n === 1 ? '' : 's'} done</div>` +
    `<div class="stats"><div class="stat"><b class="hi">${usd(w.net)}</b><span>Net earned</span></div><div class="stat"><b>${w.hours.toFixed(1)}</b><span>Hours</span></div>` +
    `<div class="stat"><b>${usd(w.rate)}</b><span>Net per hr</span></div><div class="stat"><b>${Math.round(w.miles)}</b><span>Miles</span></div></div>`;
  html += `<div class="seg" role="tablist">` + [['accepted', 'Accepted', acc.length], ['done', 'Done', done.length], ['declined', 'Passed', dec.length]].map(x =>
    `<button type="button" class="${ui.seg === x[0] ? 'on' : ''}" data-act="seg" data-v="${x[0]}">${x[1]} (${x[2]})</button>`).join('') + `</div>`;
  const list = ui.seg === 'accepted' ? acc : ui.seg === 'done' ? done : dec;
  if (!list.length) {
    html += `<div class="empty"><b>${ui.seg === 'accepted' ? 'No accepted jobs' : ui.seg === 'done' ? 'Nothing finished yet' : 'Nothing passed'}</b>${ui.seg === 'accepted' ? 'Accept a job from the Jobs tab and it shows up here with a Go button.' : ''}</div>`;
  } else list.forEach(j => { html += jobCard(j); });
  $('#scr-mine').innerHTML = html;
}

/* ----- people tab ----- */
function renderPeople() {
  const list = [...S.customers].sort((a, b) => {
    const da = a.reminders.some(r => !r.done && r.when <= Date.now()) ? 0 : 1, db = b.reminders.some(r => !r.done && r.when <= Date.now()) ? 0 : 1;
    if (da !== db) return da - db;
    const la = Math.max(0, ...customerJobs(a.id).map(j => j.doneAt || j.acceptedAt || 0)), lb = Math.max(0, ...customerJobs(b.id).map(j => j.doneAt || j.acceptedAt || 0));
    return lb - la;
  });
  let html = dueBanner() + `<div class="h-row"><h1 class="h2">Customers</h1><span class="sub">${list.length} saved</span></div>`;
  if (!list.length) html += `<div class="empty"><b>No customers yet</b>When you accept a job, that customer lands here so you can rate them and set follow-up reminders.</div>`;
  list.forEach(c => {
    const jobs = customerJobs(c.id), r = custRating(c);
    const next = c.reminders.filter(x => !x.done).sort((a, b) => a.when - b.when)[0];
    const due = next && next.when <= Date.now();
    html += `<button class="person ${due ? 'due' : ''}" type="button" data-act="cust" data-id="${c.id}">
      <div class="nm"><span>${esc(c.name)} ${c.sample ? '<span class="tag sample">Sample</span>' : ''}</span>${r ? starsRow(r) : '<span class="sub">Not rated</span>'}</div>
      ${c.tags.length ? `<div class="tags">${c.tags.map(t => { const g = TAGS.find(x => x.id === t); return g ? `<span class="tag ${g.tone}">${esc(g.label)}</span>` : ''; }).join('')}</div>` : ''}
      <div class="ln">${jobs.length} job${jobs.length === 1 ? '' : 's'}${next ? ` · ${due ? 'Follow up now' : 'Follow up ' + dayLabel(next.when)}: ${esc(next.text)}` : ''}</div></button>`;
  });
  $('#scr-people').innerHTML = html;
}

/* ----- you tab ----- */
function renderYou() {
  const p = S.profile, h = RT.me;
  const gpsTxt = RT.gps === 'on' && h ? `GPS on · ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}${h.acc ? ' (within ' + Math.round(h.acc) + ' m)' : ''}`
    : RT.gps === 'off' ? 'GPS is off or blocked. Distances use your base below.' : 'Looking for GPS…';
  const toolRows = Object.keys(TOOLS).map(id => {
    const t = toolInfo(id), on = !!S.owned[id];
    return `<div class="toggle-row" style="flex-wrap:wrap"><div style="flex:1;min-width:150px"><b>${esc(t.name)}</b><div class="meta">${t.buy ? 'Buy ' + usd(t.buy) + ' · ' : ''}rent ${usd(t.rent)} per job</div></div>` +
      `<button type="button" class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="I own ${esc(t.name)}" data-act="own" data-t="${id}"></button>` +
      `<div class="grid2" style="width:100%;margin-top:6px"><label class="field" style="margin:0"><span>Rent per job ($)</span><input class="in" inputmode="decimal" data-bind="price.${id}.rent" value="${t.rent}"></label>` +
      `<label class="field" style="margin:0"><span>Buy price ($)</span><input class="in" inputmode="decimal" data-bind="price.${id}.buy" value="${t.buy}"></label></div></div>`;
  }).join('');
  $('#scr-you').innerHTML = `
    <div class="h-row"><h1 class="h2">You</h1></div>
    <div class="card"><h3>Your name</h3>
      <label class="field"><span>Shown on every customer review</span><input id="pf-name" class="in" data-bind="profile.name" value="${esc(p.name)}" placeholder="First and last name" autocomplete="name"></label></div>
    <div class="card"><h3>Your vehicle</h3>
      <div class="grid3"><label class="field"><span>Miles per gal</span><input class="in" inputmode="decimal" data-bind="profile.mpg" value="${p.mpg}"></label>
      <label class="field"><span>Gas $ / gal</span><input class="in" inputmode="decimal" data-bind="profile.gas" value="${p.gas}"></label>
      <label class="field"><span>Wear $ / mi</span><input class="in" inputmode="decimal" data-bind="profile.wear" value="${p.wear}"></label></div>
      <div class="grid2"><label class="field"><span>Avg speed (mph)</span><input class="in" inputmode="decimal" data-bind="profile.speed" value="${p.speed}"></label>
      <label class="field"><span>Goal: net $ per hour</span><input class="in" inputmode="decimal" data-bind="profile.target" value="${p.target}"></label></div>
      <p class="hint">Travel costs <b id="cpm">${usd2(costPerMile())}</b> per mile. A job is marked Worth it when it nets at least your goal per hour, counting drive time. Road miles are estimated as straight-line distance &times; ${ROAD_FACTOR}.</p></div>
    <div class="card"><h3>Where you are</h3>
      <p class="hint" style="margin-top:0">${esc(gpsTxt)}</p>
      <div class="wrap"><button class="btn sm" type="button" data-act="gps">${icon('locate', 'sm')}Update from GPS</button></div>
      <label class="field" style="margin-top:12px"><span>Or set a base address</span><input id="base-q" class="in" placeholder="Street, city" autocomplete="street-address"></label>
      <button class="btn sm block" type="button" data-act="base-search">Search address</button><div id="base-res"></div>
      ${S.anchor.label ? `<p class="hint" style="margin-top:8px">Base: ${esc(S.anchor.label)}</p>` : ''}</div>
    <div class="card"><h3>Your gear</h3><p class="hint" style="margin-top:0">Turn on what you own. Anything a job needs that you do not own is counted as a rental cost, so you can see if a job still pays.</p>${toolRows}</div>
    <div class="card"><h3>Your data</h3>
      <div class="wrap"><button class="btn sm" type="button" data-act="export">Copy backup</button><button class="btn sm" type="button" data-act="import-open">Restore backup</button>
      <button class="btn sm" type="button" data-act="clear-samples">Remove sample data</button><button class="btn sm decline" type="button" data-act="reset">Erase everything</button></div>
      <p class="hint" style="margin-top:10px">Everything is stored on this phone only.</p></div>`;
}
function updateCpm() { const el = $('#cpm'); if (el) el.textContent = usd2(costPerMile()); }

/* ---------- chrome + routing ---------- */
function renderChrome() {
  const open = openJobs().length, acc = S.jobs.filter(j => j.status === 'accepted').length, due = dueReminders().length;
  const set = (tab, n) => { const b = $(`#tabs [data-tab="${tab}"] .badge`); b.hidden = !n; b.textContent = n; };
  set('jobs', open); set('mine', acc); set('people', due);
  const chip = $('#locChip');
  chip.className = 'loc ' + (RT.gps === 'on' ? 'on' : RT.gps === 'off' ? 'off' : '');
  $('span', chip).textContent = RT.gps === 'on' ? 'GPS on' : RT.gps === 'off' ? 'No GPS · tap to retry' : 'Locating…';
}
const RENDERERS = { jobs: renderJobs, map: renderMap, mine: renderMine, people: renderPeople, you: renderYou };
function renderAll() {
  renderChrome();
  const keep = ui.tab === 'jobs' || ui.tab === 'mine' || ui.tab === 'people' ? $('#scr-' + ui.tab).scrollTop : 0;
  RENDERERS[ui.tab]();
  if (keep) $('#scr-' + ui.tab).scrollTop = keep;
  refreshSheets();
}
function setTab(t) {
  ui.tab = t;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + t));
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  renderAll();
  if (t === 'map') requestAnimationFrame(() => gmap && gmap.render());
}
window.__back = function () {
  if (sheetStack.length) { closeSheet(); return true; }
  if (ui.sel) { ui.sel = null; renderAll(); return true; }
  if (ui.tab !== 'jobs') { setTab('jobs'); return true; }
  return false;
};

/* ---------- GPS + geocoding ---------- */
let gpsWatch = null;
function startGPS() {
  if (!navigator.geolocation) { RT.gps = 'off'; renderChrome(); return; }
  if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
  RT.gps = RT.me ? 'on' : 'idle';
  renderChrome();
  gpsWatch = navigator.geolocation.watchPosition(pos => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
    const first = !RT.me, moved = RT.me ? haversine(RT.me, p) : 99;
    RT.me = p; RT.gps = 'on';
    if (!S.anchor.real) { S.anchor = { lat: p.lat, lng: p.lng, real: true }; recomputeSamples(); saveState(); ui.fitted = false; }
    if (first || moved > 0.05) { renderAll(); if (gmap) gmap.setMe(p); }
    renderChrome();
  }, () => { RT.gps = 'off'; renderChrome(); }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 25000 });
}
async function geocode(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('geocode ' + r.status);
  return (await r.json()).map(x => ({ name: x.display_name, lat: parseFloat(x.lat), lng: parseFloat(x.lon) }));
}

/* ---------- navigation + contact helpers ---------- */
function navigateTo(j) {
  if (native && native.navigate) native.navigate(j.lat, j.lng, j.title);
  else window.open(`https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}&travelmode=driving`, '_blank');
}
function openLink(url) {
  if (native && native.openUrl) native.openUrl(url);
  else window.open(url, '_blank');
}
function copyText(t) {
  if (native && native.shareText) { native.shareText(t); return Promise.resolve(); }
  return (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => {});
}
