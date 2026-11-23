'use strict';
/* GigRun boot: global event wiring and startup. */

function getPath(path) {
  const p = path.split('.');
  if (p[0] === 'price') return toolInfo(p[1])[p[2]];
  return p.reduce((o, k) => (o ? o[k] : undefined), S);
}
function setPath(path, v) {
  const p = path.split('.');
  let o = S;
  for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
  o[p[p.length - 1]] = v;
}
function onBind(el) {
  const path = el.dataset.bind;
  if (path === 'profile.name') { setPath(path, el.value.trim()); saveState(); return; }
  const v = num(el.value, NaN);
  const positive = path === 'profile.mpg' || path === 'profile.speed';
  if (!isFinite(v) || v < 0 || (positive && v <= 0)) { el.value = getPath(path); return; }
  setPath(path, v);
  saveState(); updateCpm(); renderChrome();
}

let searchDebounce = null;
let lastDue = 0;

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind) onBind(el);
  else if (el.dataset.cnotes) { const c = custById(el.dataset.cnotes); if (c) { c.notes = el.value; saveState(); } }
  else if (el.id === 'aj-cat') ajEstimate();
  else if (el.id === 'rv-file') { rvFile(el.files && el.files[0]); el.value = ''; }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.touch && aj) aj.touched = true;
  if (el.id === 'rv-q') { clearTimeout(searchDebounce); searchDebounce = setTimeout(rvSearch, 450); }
  if (el.id === 'rv-text') { rv.text = el.value; $('#rv-count').textContent = el.value.length + ' / 160'; rvUpdate(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'rv-q') { e.preventDefault(); rvSearch(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.p-song[role=button]')) { e.preventDefault(); ACT['p-toggle'](); }
});
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  while (sheetStack.length) closeSheet();
  setTab(b.dataset.tab);
});
$('#locChip').addEventListener('click', () => { startGPS(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

loadState();
renderAll();
startGPS();
rescheduleAll();
lastDue = dueReminders().length;
setInterval(() => {
  const d = dueReminders().length;
  if (d !== lastDue) { lastDue = d; renderAll(); }
}, 60000);
