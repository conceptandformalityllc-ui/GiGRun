'use strict';
/* GigRun sheets: job info, add job, finish job, customer, backup. Plus the click handlers (ACT). */

const atNine = ts => { const d = new Date(ts); d.setHours(9, 0, 0, 0); return d.getTime(); };
function nativeRemind(c, r, ask) {
  if (!native || !native.scheduleReminder) return;
  try { if (ask && native.ensureNotifications) native.ensureNotifications(); native.scheduleReminder(r.id, r.when, 'Follow up: ' + c.name, r.text); } catch (e) { /* ignore */ }
}
function nativeCancel(r) { try { if (native && native.cancelReminder) native.cancelReminder(r.id); } catch (e) { /* ignore */ } }
function rescheduleAll() {
  S.customers.forEach(c => c.reminders.forEach(r => { if (!r.done && r.when > Date.now()) nativeRemind(c, r, false); }));
}
function confirmSheet(title, text, okLabel, fn) {
  const e = openSheet(title, `<p style="margin:6px 2px 4px">${esc(text)}</p>`,
    `<div class="acts two"><button class="btn" type="button" data-act="sheet-close">Cancel</button><button class="btn decline" type="button" id="confirmOk">${esc(okLabel)}</button></div>`);
  $('#confirmOk', e.el).onclick = () => { closeSheet(); fn(); };
}

/* ---------- Info ---------- */
function infoRender(id) {
  return () => { const j = byId(id); return j ? { body: infoBody(j), foot: infoFoot(j) } : null; };
}
function openInfo(id) {
  const r = infoRender(id)();
  if (r) openSheet('Job details', r.body, r.foot, { render: infoRender(id), kind: 'info', id });
}
function infoBody(j) {
  const c = calc(j), cat = CATS[j.cat] || CATS.other;
  const nearList = S.jobs.filter(x => x.id !== j.id && (x.status === 'new' || x.status === 'accepted'))
    .map(x => ({ x, mi: roadMiles(j, x) })).sort((a, b) => a.mi - b.mi).slice(0, 3);
  const e = EFFORT[j.effort];
  const money = c.done
    ? `<div><span>You were paid${j.result.tip ? ' (incl. ' + usd(j.result.tip) + ' tip)' : ''}</span><span>${usd2(j.result.pay)}</span></div>`
    : `<div><span>Offer</span><span>${usd2(j.pay)}</span></div>`;
  const gearLines = c.gearList.filter(g => !g.owned && g.rent);
  const gearTbl = c.done ? '' : `<div><span>Gear you would rent${gearLines.length ? `<small>${esc(gearLines.map(g => g.name).join(', '))}</small>` : ''}</span><span class="${c.gear ? 'neg' : ''}">${c.gear ? '-' + usd2(c.gear) : '$0.00'}</span></div>`;
  const extras = (cat.extras || []).filter(id => !S.owned[id] && !jobTools(j).includes(id));
  const gearCard = c.done ? '' : `<div class="card"><h3>Gear for this job</h3>` +
    (c.gearList.length ? c.gearList.map(g => `<div class="gear-line"><div><b>${esc(g.name)}</b><div class="meta">${g.owned ? 'You own it: $0' : `Rent ${usd(g.rent)}${g.buy ? ` or buy ${usd(g.buy)} (pays off after about ${Math.ceil(g.buy / Math.max(1, g.rent))} jobs)` : ''}`}</div></div>` +
      `<button class="own ${g.owned ? 'on' : ''}" type="button" data-act="own" data-t="${g.id}">${g.owned ? 'I own it' : 'Mark owned'}</button></div>`).join('')
      : `<p class="sub">No special gear needed.</p>`) +
    (extras.length ? `<p class="hint" style="margin:10px 0 0">Nice to bring: ${esc(extras.map(id => TOOLS[id].name).join(', '))}.</p>` : '') + `</div>`;
  const contact = j.contact || {};
  const cBtns = (contact.phone || contact.email)
    ? `<div class="contact-btns">` +
      (contact.phone ? `<a class="btn" href="${telHref(contact.phone)}">${icon('phone')}Call</a><a class="btn" href="${smsHref(contact.phone)}">${icon('text')}Text</a>` : '<span></span><span></span>') +
      (contact.email ? `<a class="btn" href="mailto:${esc(contact.email)}?subject=${encodeURIComponent('About: ' + j.title)}">${icon('mail')}Email</a>` : '<span></span>') + `</div>` : '';
  return `
    <div class="big-pay"><div class="pay"><span class="cur">$</span>${c.done ? Math.round(j.result.pay) : j.pay}</div>
      <div style="text-align:right"><span class="pill ${c.verdict}">${VERDICT[c.verdict]}</span><div class="sub" style="margin-top:6px"><b>${usd(c.rate)}/hr</b> net</div></div></div>
    <h3 style="font-size:19px;line-height:1.25;margin-bottom:4px">${esc(j.title)}</h3>
    <p class="sub" style="margin-bottom:12px">${icon(cat.icon, 'sm')} ${esc(cat.label)}${j.when ? ' · ' + esc(j.when) : ''}${j.sample ? ' · Sample job' : ''}</p>
    <div class="card"><h3>Where the money goes</h3><div class="tbl">${money}
      <div><span>Travel<small>${c.done ? mi1(c.round) + ' mi round trip' : mi1(c.round) + ' mi round trip at ' + usd2(c.cpm) + '/mi'}</small></span><span class="neg">-${usd2(c.travel)}</span></div>
      ${gearTbl}
      <div><span>Supplies and fees</span><span class="${c.supplies ? 'neg' : ''}">${c.supplies ? '-' + usd2(c.supplies) : '$0.00'}</span></div>
      <div class="total"><span>You keep</span><span style="color:var(--${c.verdict === 'poor' ? 'bad' : c.verdict === 'ok' ? 'warn' : 'good'})">${usd2(c.net)}</span></div></div></div>
    <div class="card"><h3>Time and effort</h3><div class="tbl">
      <div><span>Work</span><span>${hrs(c.work)}</span></div>
      ${c.done ? '' : `<div><span>Driving (round trip)</span><span>${hrs(c.drive)}</span></div><div><span>Total from door to door</span><span><b>${hrs(c.total)}</b></span></div>`}</div>
      <div class="effort-bar" style="margin-top:10px">${pips(j.effort)}<b>${e.name}</b></div><p class="sub">${esc(e.tip)}</p></div>
    ${gearCard}
    <div class="card"><h3>Contact and place</h3>
      ${contact.name ? `<p style="font-weight:700;font-size:16px">${esc(contact.name)}</p>` : '<p class="sub">No contact saved for this job.</p>'}
      ${contact.phone ? `<p>${esc(contact.phone)}</p>` : ''}${contact.email ? `<p>${esc(contact.email)}</p>` : ''}
      <p class="sub" style="margin-top:6px">${icon('t-map', 'sm')} ${esc(j.addr || 'Pinned on the map')} · ${mi1(c.miles)} mi from you</p>
      ${cBtns}</div>
    ${nearList.length ? `<div class="card"><h3>Other jobs near this one</h3>${nearList.map(n => `<div class="near"><span>${esc(n.x.title)}<br><span class="sub">$${n.x.pay} · ${n.x.status === 'accepted' ? 'Accepted' : 'Open'}</span></span><b>${mi1(n.mi)} mi</b></div>`).join('')}</div>` : ''}
    ${j.desc ? `<div class="card"><h3>Details</h3><p style="white-space:pre-wrap">${esc(j.desc)}</p></div>` : ''}`;
}
function infoFoot(j) {
  if (j.status === 'new') return `<div class="acts two"><button class="btn decline" type="button" data-act="decline" data-id="${j.id}">${icon('close')}Decline</button><button class="btn accept" type="button" data-act="accept" data-id="${j.id}">${icon('check')}Accept</button></div>`;
  if (j.status === 'accepted') return `<div class="acts go"><button class="btn go" type="button" data-act="go" data-id="${j.id}">${icon('nav')}GO · ${mi1(calc(j).miles)} mi</button></div><div class="acts two" style="margin-top:8px"><button class="btn" type="button" data-act="sheet-close">Close</button><button class="btn dark" type="button" data-act="done" data-id="${j.id}">${icon('check')}Mark done</button></div>`;
  if (j.status === 'done') { const rv = S.reviews.find(r => r.jobId === j.id); return `<button class="btn dark block" type="button" data-act="${rv ? 'review-view' : 'review'}" data-id="${j.id}">${icon('camera')}${rv ? 'View review' : 'Ask for a review'}</button>`; }
  return `<button class="btn dark block" type="button" data-act="restore" data-id="${j.id}">Restore job</button>`;
}

/* ---------- Add job ---------- */
let aj = null;
function parseListing(text) {
  const t = text || '';
  const out = {};
  const pay = t.match(/\$\s?(\d[\d,]*(?:\.\d+)?)/);
  if (pay) out.pay = Math.round(parseFloat(pay[1].replace(/,/g, '')));
  const phone = t.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  if (phone) out.phone = phone[0].trim();
  const mail = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (mail) out.email = mail[0];
  const hr = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hr) out.hours = parseFloat(hr[1]);
  const lower = t.toLowerCase();
  const rules = [['wash', /pressure wash|power wash/], ['car', /car wash|detail|wash (my|the) (car|truck|suv)|vacuum (my|the) car/],
    ['lawn', /mow|lawn|yard|leaves|rake|hedge|weed|garden/], ['haul', /haul|junk|dump|trash removal|remove (an? |the )?(old|couch|mattress|appliance)/],
    ['clean', /clean|maid|janitor|sweep|mop|scrub/], ['move', /\bmov(e|ing)\b|load|unload|furniture|couch|boxes|u-?haul/],
    ['handy', /hang|install|fix|repair|patch|paint|assemble|handyman|shelf|shelves|lights/]];
  const hit = rules.find(r => r[1].test(lower));
  if (hit) out.cat = hit[0];
  const line = t.split('\n').map(s => s.trim()).filter(Boolean)[0];
  if (line) {
    let ttl = line.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
    if (ttl.length > 60) ttl = ttl.slice(0, 60).replace(/\s+\S*$/, '') + '\u2026';
    out.title = ttl;
  }
  return out;
}
function openAddJob() {
  aj = { size: 'M', lat: null, lng: null, label: '', touched: false, results: [] };
  const catOpts = Object.keys(CATS).map(k => `<option value="${k}">${esc(CATS[k].label)}</option>`).join('');
  const body = `
    <div class="card"><h3>Paste a listing</h3><p class="hint" style="margin-top:0">Copy an ad from Craigslist, Facebook or a text message and I will fill in what I can read: pay, phone, email, hours and category.</p>
      <textarea id="aj-paste" class="in" placeholder="Paste the post here"></textarea><button class="btn sm block" type="button" data-act="aj-parse" style="margin-top:8px">Fill in from text</button></div>
    <label class="field"><span>What is the job?</span><input id="aj-title" class="in" placeholder="Mow front lawn" maxlength="80"></label>
    <div class="grid2"><label class="field"><span>Category</span><select id="aj-cat" class="in">${catOpts}</select></label>
      <label class="field"><span>Pay offered ($)</span><input id="aj-pay" class="in" inputmode="decimal" placeholder="60"></label></div>
    <div class="field"><span>Size of the job</span><div class="wrap" id="aj-sizes">${Object.keys(SIZES).map(k => `<button type="button" class="chip ${k === 'M' ? 'on' : ''}" data-act="aj-size" data-v="${k}">${SIZES[k].label}</button>`).join('')}</div></div>
    <div class="grid3"><label class="field"><span>Hours</span><input id="aj-hours" class="in" inputmode="decimal" data-touch="1"></label>
      <label class="field"><span>Effort 1-5</span><input id="aj-effort" class="in" inputmode="numeric" data-touch="1"></label>
      <label class="field"><span>Supplies $</span><input id="aj-supplies" class="in" inputmode="decimal" placeholder="0"></label></div>
    <p class="hint">Hours and effort start as an estimate from the category and size. Change them if you know better.</p>
    <div class="card"><h3>Where is it?</h3>
      <label class="field"><span>Address</span><input id="aj-addr" class="in" placeholder="Street, city" autocomplete="street-address"></label>
      <div class="grid2"><button class="btn sm" type="button" data-act="aj-find">Find address</button><button class="btn sm" type="button" data-act="aj-here">${icon('locate', 'sm')}I am here</button></div>
      <div id="aj-results"></div><p id="aj-pinned" class="hint" style="margin:10px 0 0">Not placed yet.</p></div>
    <div class="card"><h3>Who to contact</h3>
      <label class="field"><span>Name</span><input id="aj-name" class="in" autocomplete="name"></label>
      <div class="grid2"><label class="field"><span>Phone</span><input id="aj-phone" class="in" inputmode="tel"></label><label class="field"><span>Email</span><input id="aj-email" class="in" inputmode="email"></label></div></div>
    <label class="field"><span>When does it need doing?</span><input id="aj-when" class="in" placeholder="Saturday morning"></label>
    <label class="field"><span>Notes</span><textarea id="aj-desc" class="in"></textarea></label>`;
  openSheet('Add a job', body, `<button class="btn go block" type="button" data-act="aj-save">Save job</button>`, { full: true, kind: 'addjob' });
  ajEstimate();
}
function ajEstimate() {
  if (!aj || aj.touched) return;
  const e = estimate(val('aj-cat') || 'lawn', aj.size);
  $('#aj-hours').value = e.hours; $('#aj-effort').value = e.effort;
}
function ajPlace(lat, lng, label) {
  aj.lat = lat; aj.lng = lng; aj.label = label;
  $('#aj-pinned').textContent = 'Placed: ' + label + ' · ' + mi1(roadMiles(here(), { lat, lng })) + ' mi from you';
  $('#aj-results').innerHTML = '';
}

/* ---------- Finish job ---------- */
let dn = null;
function openDone(id) {
  const j = byId(id), c = calc(j);
  dn = { id, stars: 0, tags: [], rem: null };
  const tagBtns = TAGS.map(t => `<button type="button" class="tag ${t.tone}" data-act="dn-tag" data-t="${t.id}">${esc(t.label)}</button>`).join('');
  const body = `
    <p class="sub" style="margin:0 2px 10px">${esc(j.title)}${j.contact.name ? ' · ' + esc(j.contact.name) : ''}</p>
    <div class="card"><h3>What happened</h3>
      <div class="grid3"><label class="field"><span>Paid ($)</span><input id="dn-pay" class="in" inputmode="decimal" value="${j.pay}"></label>
      <label class="field"><span>Tip ($)</span><input id="dn-tip" class="in" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Hours on site</span><input id="dn-hours" class="in" inputmode="decimal" value="${j.hours}"></label></div>
      <p class="hint" style="margin:0">Travel (${usd2(c.travel)}), gear and supplies come off automatically.</p></div>
    <div class="card"><h3>Rate this customer</h3>
      <div class="stars big" id="dn-stars">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-act="dn-star" data-n="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${icon('star', 'fill')}</button>`).join('')}</div>
      <p class="hint" style="margin:8px 0">Tag what they were like, so you remember next time.</p><div class="wrap" id="dn-tags">${tagBtns}</div>
      <label class="field" style="margin-top:12px"><span>Notes for later</span><textarea id="dn-notes" class="in" placeholder="Gate code, pets, what they want next time"></textarea></label></div>
    <div class="card"><h3>Follow-up reminder</h3>
      <div class="wrap" id="dn-rem">${[['none', 'None'], ['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months'], ['date', 'Pick a date']].map((x, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-act="dn-rem" data-d="${x[0]}">${x[1]}</button>`).join('')}</div>
      <div id="dn-remmore" style="margin-top:10px" hidden>
        <label class="field" id="dn-datewrap" hidden><span>Remind me on</span><input id="dn-date" type="date" class="in"></label>
        <label class="field" style="margin:0"><span>Reminder</span><input id="dn-remtext" class="in" value="Check in about more work"></label></div></div>`;
  openSheet('Finish job', body,
    `<div class="acts two"><button class="btn dark" type="button" data-act="dn-save">Save</button><button class="btn go" type="button" data-act="dn-save" data-review="1">${icon('camera')}Save + review</button></div>`,
    { full: true, kind: 'done' });
}
function dnSave(withReview) {
  const j = byId(dn.id); if (!j) return;
  const c = calc(j);
  const pay = num(val('dn-pay'), j.pay), tip = num(val('dn-tip')), hours = Math.max(0.1, num(val('dn-hours'), j.hours));
  const net = pay + tip - c.travel - c.gear - c.supplies;
  j.result = { pay: pay + tip, hours, miles: c.round, travel: c.travel, gear: c.gear, supplies: c.supplies, net, tip };
  j.status = 'done'; j.doneAt = Date.now(); j.rating = dn.stars || 0;
  const cu = custById(j.custId) || customerFor(j.contact);
  if (cu) {
    j.custId = cu.id;
    dn.tags.forEach(t => { if (!cu.tags.includes(t)) cu.tags.push(t); });
    const note = val('dn-notes').trim();
    if (note) cu.notes = (cu.notes ? cu.notes + '\n' : '') + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ': ' + note;
    if (!cu.manualRating) cu.rating = custRating(cu);
    if (dn.rem) {
      let when = null;
      if (dn.rem === 'date') { const d = val('dn-date'); if (d) when = new Date(d + 'T09:00:00').getTime(); }
      else when = atNine(Date.now() + parseInt(dn.rem, 10) * DAY);
      if (when) {
        const r = { id: uid('r'), when, text: val('dn-remtext').trim() || 'Check in about more work', done: false };
        cu.reminders.push(r); nativeRemind(cu, r, true);
      }
    }
  }
  saveState();
  closeSheet();
  renderAll();
  if (withReview) openReviewFlow(j.id);
  else toast(`Saved. You kept ${usd(net)} on that one.`);
}

/* ---------- Customer ---------- */
function custRender(id) { return () => { const c = custById(id); return c ? { body: custBody(c), foot: '' } : null; }; }
function openCustomer(id) {
  const r = custRender(id)();
  if (r) openSheet(custById(id).name, r.body, '', { render: custRender(id), kind: 'cust', id, full: true });
}
function custBody(c) {
  const jobs = customerJobs(c.id).sort((a, b) => (b.doneAt || b.acceptedAt || 0) - (a.doneAt || a.acceptedAt || 0));
  const revs = S.reviews.filter(r => r.custId === c.id);
  const rating = custRating(c);
  const rems = [...c.reminders].sort((a, b) => (a.done - b.done) || (a.when - b.when));
  return `
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:18px">${esc(c.name)}</b>${c.sample ? '<span class="tag sample">Sample</span>' : ''}</div>
      ${c.phone ? `<p>${esc(c.phone)}</p>` : ''}${c.email ? `<p>${esc(c.email)}</p>` : ''}
      ${(c.phone || c.email) ? `<div class="contact-btns">${c.phone ? `<a class="btn" href="${telHref(c.phone)}">${icon('phone')}Call</a><a class="btn" href="${smsHref(c.phone)}">${icon('text')}Text</a>` : '<span></span><span></span>'}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${icon('mail')}Email</a>` : '<span></span>'}</div>` : ''}</div>
    <div class="card"><h3>Your rating</h3><div class="stars big">${[1, 2, 3, 4, 5].map(i => `<button type="button" class="${i <= Math.round(rating) ? 'on' : ''}" data-act="c-star" data-id="${c.id}" data-n="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">${icon('star', 'fill')}</button>`).join('')}</div>
      <div class="wrap" style="margin-top:10px">${TAGS.map(t => `<button type="button" class="tag ${t.tone} ${c.tags.includes(t.id) ? 'on' : ''}" data-act="c-tag" data-id="${c.id}" data-t="${t.id}" aria-pressed="${c.tags.includes(t.id)}">${esc(t.label)}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span>Notes</span><textarea class="in" data-cnotes="${c.id}" placeholder="Gate code, pets, what they want next time">${esc(c.notes)}</textarea></label></div>
    <div class="card"><h3>Follow-up reminders</h3>
      ${rems.length ? rems.map(r => `<div class="gear-line"><div><b style="${r.done ? 'text-decoration:line-through;color:var(--mute)' : ''}">${esc(r.text)}</b><div class="meta">${r.done ? 'Done' : (r.when <= Date.now() ? 'Due now · ' : '') + dayLabel(r.when)}</div></div>` +
        `<div class="wrap" style="flex:none">${r.done ? '' : `<button class="own on" type="button" data-act="c-rem-done" data-id="${c.id}" data-r="${r.id}">Done</button>`}<button class="own" type="button" data-act="c-rem-del" data-id="${c.id}" data-r="${r.id}" aria-label="Delete reminder">${icon('close', 'sm')}</button></div></div>`).join('') : '<p class="sub">No reminders yet.</p>'}
      <label class="field" style="margin-top:12px"><span>New reminder</span><input id="cr-text" class="in" value="Check in about more work"></label>
      <div class="wrap">${[['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months']].map(x => `<button type="button" class="chip" data-act="c-rem" data-id="${c.id}" data-d="${x[0]}">${icon('bell')}${x[1]}</button>`).join('')}</div>
      <div class="grid2" style="margin-top:10px"><input id="cr-date" type="date" class="in" aria-label="Pick a date"><button class="btn" type="button" data-act="c-rem" data-id="${c.id}" data-d="date">Set on date</button></div></div>
    <div class="card"><h3>History</h3>${jobs.length ? jobs.map(j => `<div class="near"><span>${esc(j.title)}<br><span class="sub">${j.status === 'done' ? dayLabel(j.doneAt) + ' · ' + usd(j.result ? j.result.pay : j.pay) : 'Accepted'}${j.rating ? ' · ' + j.rating + ' stars' : ''}</span></span><button class="btn sm" type="button" data-act="info" data-id="${j.id}">Info</button></div>`).join('') : '<p class="sub">No jobs yet.</p>'}
      ${revs.length ? `<p class="sub" style="margin-top:8px">${revs.length} review${revs.length > 1 ? 's' : ''} collected</p>` : ''}</div>`;
}

/* ---------- Backup ---------- */
function openImport() {
  const e = openSheet('Restore backup', `<p class="hint" style="margin-top:0">Paste a backup you copied from GigRun. This replaces what is on this phone now.</p><textarea id="imp-text" class="in" style="min-height:160px" placeholder="Paste backup"></textarea>`,
    `<button class="btn dark block" type="button" id="impGo">Restore</button>`);
  $('#impGo', e.el).onclick = () => {
    try {
      const d = JSON.parse(val('imp-text'));
      if (!d || d.v !== 1 || !Array.isArray(d.jobs) || !Array.isArray(d.customers)) throw new Error('shape');
      S = d; S.reviews = S.reviews || []; S.price = S.price || {}; S.owned = S.owned || {};
      recomputeSamples(); saveState(); closeSheet(); ui.fitted = false; renderAll(); toast('Backup restored.');
    } catch (err) { toast('That does not look like a GigRun backup.'); }
  };
}

/* ---------- click handlers ---------- */
Object.assign(ACT, {
  'sheet-close'() { closeSheet(); },
  cat(d) { ui.cat = d.v; renderAll(); },
  sort(d) { ui.sort = d.v; renderAll(); },
  seg(d) { ui.seg = d.v; renderAll(); },
  mapf(d) { ui.mapFilter = d.v; if (ui.sel && !mapJobs().some(j => j.id === ui.sel)) ui.sel = null; renderAll(); },
  zin() { gmap.zoomBy(1); }, zout() { gmap.zoomBy(-1); },
  mloc() { const h = here(); gmap.setView(h.lat, h.lng, 15); if (!RT.me) startGPS(); },
  mfit() { gmap.fit([here(), ...mapJobs()], 50); },
  mroute() {
    ui.route = !ui.route; if (ui.route) ui.sel = null;
    renderAll();
    if (ui.route) { const p = routePlan(); if (p.stops.length) gmap.fit([here(), ...p.stops.map(s => s.job)], 50); }
  },
  add() { openAddJob(); },
  info(d) { openInfo(d.id); },
  go(d) { const j = byId(d.id); if (j) navigateTo(j); },
  accept(d) {
    const j = byId(d.id); if (!j) return;
    j.status = 'accepted'; j.acceptedAt = Date.now();
    const c = customerFor(j.contact); if (c) j.custId = c.id;
    saveState(); renderAll();
    toast('Accepted. Call to confirm, then tap GO.');
  },
  decline(d) {
    const j = byId(d.id); if (!j) return;
    j.status = 'declined'; if (ui.sel === j.id) ui.sel = null;
    saveState();
    const top = sheetStack[sheetStack.length - 1];
    if (top && top.kind === 'info' && top.id === j.id) closeSheet();
    renderAll();
    toast('Job passed.', 'Undo', () => { j.status = 'new'; saveState(); renderAll(); });
  },
  restore(d) { const j = byId(d.id); if (!j) return; j.status = 'new'; saveState(); renderAll(); toast('Back in your open jobs.'); },
  done(d) { const top = sheetStack[sheetStack.length - 1]; if (top && top.kind === 'info') closeSheet(); openDone(d.id); },
  own(d) { S.owned[d.t] = !S.owned[d.t]; saveState(); renderAll(); },
  cust(d) { openCustomer(d.id); },
  gps() { startGPS(); toast('Checking GPS…'); },
  export() { copyText(JSON.stringify(S)).then(() => toast('Backup copied. Paste it somewhere safe.')); },
  'import-open'() { openImport(); },
  'clear-samples'() {
    confirmSheet('Remove sample data', 'This deletes the example jobs and customers. Your own jobs stay.', 'Remove', () => {
      const ids = new Set(S.customers.filter(c => c.sample).map(c => c.id));
      S.jobs = S.jobs.filter(j => !j.sample && !ids.has(j.custId));
      S.customers = S.customers.filter(c => !c.sample);
      S.reviews = S.reviews.filter(r => !ids.has(r.custId));
      saveState(); ui.sel = null; renderAll(); toast('Sample data removed.');
    });
  },
  reset() {
    confirmSheet('Erase everything', 'This deletes all jobs, customers, ratings, reviews and settings on this phone. It cannot be undone.', 'Erase', () => {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      loadState(); ui.sel = null; ui.fitted = false; renderAll(); toast('Erased.');
    });
  },
  async 'base-search'() {
    const q = val('base-q').trim(); if (!q) return;
    $('#base-res').innerHTML = '<p class="hint">Searching…</p>';
    try {
      const r = await geocode(q); window.__baseRes = r;
      $('#base-res').innerHTML = r.length ? r.map((x, i) => `<button type="button" class="btn sm block" style="margin-top:8px;text-align:left;justify-content:flex-start" data-act="base-pick" data-i="${i}">${esc(x.name.slice(0, 70))}</button>`).join('') : '<p class="hint">No match. Try adding the city.</p>';
    } catch (e) { $('#base-res').innerHTML = '<p class="hint">Cannot reach the address search. Check your connection.</p>'; }
  },
  'base-pick'(d) {
    const x = window.__baseRes[+d.i]; if (!x) return;
    S.anchor = { lat: x.lat, lng: x.lng, real: true, label: x.name.slice(0, 80) };
    recomputeSamples(); saveState(); ui.fitted = false; renderAll(); toast('Base set.');
  },
  /* add job */
  'aj-parse'() {
    const p = parseListing(val('aj-paste'));
    if (p.title && !val('aj-title')) $('#aj-title').value = p.title;
    if (p.cat) { $('#aj-cat').value = p.cat; }
    if (p.pay) $('#aj-pay').value = p.pay;
    if (p.phone) $('#aj-phone').value = p.phone;
    if (p.email) $('#aj-email').value = p.email;
    if (p.hours) { $('#aj-hours').value = p.hours; aj.touched = true; } else ajEstimate();
    $('#aj-desc').value = val('aj-paste').trim().slice(0, 600);
    toast('Filled in what I could read. Check the rest.');
  },
  'aj-size'(d) { aj.size = d.v; $$('#aj-sizes .chip').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); ajEstimate(); },
  async 'aj-find'() {
    const q = val('aj-addr').trim(); if (!q) return;
    $('#aj-results').innerHTML = '<p class="hint">Searching…</p>';
    try {
      aj.results = await geocode(q);
      $('#aj-results').innerHTML = aj.results.length ? aj.results.map((x, i) => `<button type="button" class="btn sm block" style="margin-top:8px;text-align:left;justify-content:flex-start" data-act="aj-pick" data-i="${i}">${esc(x.name.slice(0, 70))}</button>`).join('') : '<p class="hint">No match. Try adding the city.</p>';
    } catch (e) { $('#aj-results').innerHTML = '<p class="hint">Cannot reach the address search. Use "I am here" or check your connection.</p>'; }
  },
  'aj-pick'(d) { const x = aj.results[+d.i]; if (x) ajPlace(x.lat, x.lng, x.name.slice(0, 60)); },
  'aj-here'() { const h = here(); ajPlace(h.lat, h.lng, RT.me ? 'your current spot' : 'your base area'); },
  'aj-save'() {
    const title = val('aj-title').trim(), pay = num(val('aj-pay'));
    if (!title) return toast('Give the job a name.');
    if (!(pay > 0)) return toast('Enter the pay offered.');
    if (aj.lat == null) return toast('Place the job: find the address or tap I am here.');
    const cat = val('aj-cat') || 'other';
    const j = { id: uid('j'), sample: false, cat, title, desc: val('aj-desc').trim(), pay: Math.round(pay), size: aj.size,
      hours: Math.max(0.25, num(val('aj-hours'), 1.5)), effort: clamp(Math.round(num(val('aj-effort'), 2)), 1, 5), supplies: num(val('aj-supplies')),
      tools: null, lat: aj.lat, lng: aj.lng, addr: val('aj-addr').trim() || aj.label, posted: Date.now(), when: val('aj-when').trim(), status: 'new',
      contact: { name: val('aj-name').trim(), phone: val('aj-phone').trim(), email: val('aj-email').trim() } };
    S.jobs.push(j); saveState(); closeSheet(); ui.cat = 'all'; ui.sort = 'new';
    if (ui.tab !== 'jobs') setTab('jobs'); else renderAll();
    toast('Added. It shows what you would really keep.');
  },
  /* finish job */
  'dn-star'(d) { dn.stars = +d.n; $$('#dn-stars button').forEach((b, i) => b.classList.toggle('on', i < dn.stars)); },
  'dn-tag'(d, el) { const i = dn.tags.indexOf(d.t); if (i >= 0) dn.tags.splice(i, 1); else dn.tags.push(d.t); el.classList.toggle('on', i < 0); },
  'dn-rem'(d) {
    dn.rem = d.d === 'none' ? null : d.d;
    $$('#dn-rem .chip').forEach(b => b.classList.toggle('on', b.dataset.d === d.d));
    $('#dn-remmore').hidden = !dn.rem; $('#dn-datewrap').hidden = dn.rem !== 'date';
  },
  'dn-save'(d) { dnSave(d.review === '1'); },
  /* customer */
  'c-star'(d) { const c = custById(d.id); c.rating = +d.n; c.manualRating = true; saveState(); renderAll(); },
  'c-tag'(d) { const c = custById(d.id), i = c.tags.indexOf(d.t); if (i >= 0) c.tags.splice(i, 1); else c.tags.push(d.t); saveState(); renderAll(); },
  'c-rem'(d) {
    const c = custById(d.id); let when;
    if (d.d === 'date') { const v = val('cr-date'); if (!v) return toast('Pick a date first.'); when = new Date(v + 'T09:00:00').getTime(); }
    else when = atNine(Date.now() + parseInt(d.d, 10) * DAY);
    const r = { id: uid('r'), when, text: val('cr-text').trim() || 'Check in about more work', done: false };
    c.reminders.push(r); nativeRemind(c, r, true); saveState(); renderAll(); toast('Reminder set for ' + dayLabel(when) + '.');
  },
  'c-rem-done'(d) { const c = custById(d.id), r = c.reminders.find(x => x.id === d.r); if (r) { r.done = true; nativeCancel(r); } saveState(); renderAll(); },
  'c-rem-del'(d) { const c = custById(d.id), r = c.reminders.find(x => x.id === d.r); if (r) nativeCancel(r); c.reminders = c.reminders.filter(x => x.id !== d.r); saveState(); renderAll(); }
});
