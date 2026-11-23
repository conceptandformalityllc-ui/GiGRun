'use strict';
/* GigMap: a small slippy map. OpenStreetMap tiles when online, a grid when not.
   Pins stay tappable and distances keep working with no connection at all. */
class GigMap {
  constructor(root, opts = {}) {
    this.root = root;
    this.view = { lat: opts.lat || 37.7749, lng: opts.lng || -122.4194, z: opts.z || 13 };
    this.tileUrl = opts.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.tiles = new Map();
    this.pinEls = new Map();
    this.pins = [];
    this.lines = [];
    this.me = null;
    this.onPin = null;
    this.onTap = null;
    this.ptrs = new Map();
    this.tapStart = null;

    root.classList.add('gm');
    root.innerHTML =
      '<div class="gm-tiles"></div>' +
      '<svg class="gm-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>' +
      '<div class="gm-pins"></div>' +
      '<div class="gm-scale"><i></i><span></span></div>';
    this.tileLayer = root.querySelector('.gm-tiles');
    this.svg = root.querySelector('.gm-svg');
    this.pinLayer = root.querySelector('.gm-pins');
    this.scaleBar = root.querySelector('.gm-scale i');
    this.scaleText = root.querySelector('.gm-scale span');

    root.addEventListener('pointerdown', e => this._down(e));
    root.addEventListener('pointermove', e => this._move(e));
    root.addEventListener('pointerup', e => this._up(e));
    root.addEventListener('pointercancel', e => this._up(e));
    root.addEventListener('wheel', e => {
      e.preventDefault();
      const r = root.getBoundingClientRect();
      this.zoomAt(this.view.z - e.deltaY * 0.0025, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    this.pinLayer.addEventListener('click', e => {
      const b = e.target.closest('.pin');
      if (b && this.onPin) this.onPin(b.dataset.id);
    });
    if (window.ResizeObserver) new ResizeObserver(() => this.render()).observe(root);
  }

  /* ----- projection ----- */
  static world(lat, lng, z) {
    const s = 256 * Math.pow(2, z);
    const sin = Math.sin(lat * Math.PI / 180);
    const cl = Math.max(-0.9999, Math.min(0.9999, sin));
    return { x: (lng + 180) / 360 * s, y: (0.5 - Math.log((1 + cl) / (1 - cl)) / (4 * Math.PI)) * s };
  }
  static unworld(x, y, z) {
    const s = 256 * Math.pow(2, z);
    const n = Math.PI - 2 * Math.PI * y / s;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: x / s * 360 - 180 };
  }
  size() { return { w: this.root.clientWidth, h: this.root.clientHeight }; }
  toScreen(lat, lng) {
    const { w, h } = this.size(), z = this.view.z;
    const c = GigMap.world(this.view.lat, this.view.lng, z), p = GigMap.world(lat, lng, z);
    return { x: p.x - c.x + w / 2, y: p.y - c.y + h / 2 };
  }

  /* ----- public API ----- */
  setView(lat, lng, z) {
    this.view.lat = lat; this.view.lng = lng;
    if (z != null) this.view.z = Math.max(3, Math.min(19, z));
    this.render();
  }
  setMe(p) { this.me = p; this.render(); }
  setLines(lines) { this.lines = lines || []; this.render(); }
  setPins(pins) {
    this.pins = pins;
    const keep = new Set();
    pins.forEach(p => {
      keep.add(p.id);
      let el = this.pinEls.get(p.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.id = p.id;
        this.pinLayer.appendChild(el);
        this.pinEls.set(p.id, el);
      }
      const cls = 'pin ' + (p.cls || '');
      if (el.className !== cls) el.className = cls;
      if (el.__html !== p.html) { el.innerHTML = p.html; el.__html = p.html; }
      el.setAttribute('aria-label', p.label || '');
    });
    this.pinEls.forEach((el, id) => { if (!keep.has(id)) { el.remove(); this.pinEls.delete(id); } });
    this.render();
  }
  fit(points, pad = 56) {
    const pts = points.filter(Boolean);
    const { w, h } = this.size();
    if (!pts.length || !w) return;
    if (pts.length === 1) { this.setView(pts[0].lat, pts[0].lng, 15); return; }
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    const n = Math.max(...lats), s = Math.min(...lats), e = Math.max(...lngs), wst = Math.min(...lngs);
    let z = 18;
    for (; z > 3; z--) {
      const a = GigMap.world(n, wst, z), b = GigMap.world(s, e, z);
      if (Math.abs(b.x - a.x) <= w - pad * 2 && Math.abs(b.y - a.y) <= h - pad * 2 - 90) break;
    }
    this.setView((n + s) / 2, (e + wst) / 2, z);
  }
  zoomBy(d) { const { w, h } = this.size(); this.zoomAt(this.view.z + d, w / 2, h / 2); }
  zoomAt(nz, sx, sy) {
    nz = Math.max(3, Math.min(19, nz));
    const { w, h } = this.size(), z = this.view.z;
    const c = GigMap.world(this.view.lat, this.view.lng, z);
    const ll = GigMap.unworld(c.x + sx - w / 2, c.y + sy - h / 2, z);
    const a = GigMap.world(ll.lat, ll.lng, nz);
    const cc = GigMap.unworld(a.x - (sx - w / 2), a.y - (sy - h / 2), nz);
    this.view = { lat: cc.lat, lng: cc.lng, z: nz };
    this.render();
  }

  /* ----- gestures ----- */
  _down(e) {
    if (e.target.closest('.pin')) return;
    this.root.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tapStart = this.ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    if (this.ptrs.size === 2) this._pd = this._dist();
  }
  _dist() { const [a, b] = [...this.ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  _move(e) {
    const prev = this.ptrs.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (this.ptrs.size === 1) {
      const c = GigMap.world(this.view.lat, this.view.lng, this.view.z);
      const ll = GigMap.unworld(c.x - (cur.x - prev.x), c.y - (cur.y - prev.y), this.view.z);
      this.view.lat = ll.lat; this.view.lng = ll.lng;
      this.render();
    } else if (this.ptrs.size === 2) {
      this.ptrs.set(e.pointerId, cur);
      const d = this._dist(), r = this.root.getBoundingClientRect();
      const [a, b] = [...this.ptrs.values()];
      this.zoomAt(this.view.z + Math.log2(d / this._pd), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      this._pd = d;
    }
    this.ptrs.set(e.pointerId, cur);
    if (this.tapStart && Math.hypot(cur.x - this.tapStart.x, cur.y - this.tapStart.y) > 8) this.tapStart = null;
  }
  _up(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    if (this.tapStart && e.type === 'pointerup' && Date.now() - this.tapStart.t < 450 && this.onTap) this.onTap();
    this.tapStart = null;
  }

  /* ----- drawing ----- */
  render() {
    const { w, h } = this.size();
    if (!w || !h) return;
    const { lat, lng, z } = this.view;
    const c = GigMap.world(lat, lng, z);
    this.root.style.setProperty('--gx', (w / 2 - c.x) % 64 + 'px');
    this.root.style.setProperty('--gy', (h / 2 - c.y) % 64 + 'px');
    this._tiles(w, h);
    this._pinsAndLines(w, h, c);
    this._scale(lat, z);
  }
  _tiles(w, h) {
    const zi = Math.max(3, Math.min(18, Math.floor(this.view.z)));
    const scale = Math.pow(2, this.view.z - zi), ts = 256 * scale, n = Math.pow(2, zi);
    const cw = GigMap.world(this.view.lat, this.view.lng, zi);
    const x0 = Math.floor((cw.x - w / 2 / scale) / 256), x1 = Math.floor((cw.x + w / 2 / scale) / 256);
    const y0 = Math.floor((cw.y - h / 2 / scale) / 256), y1 = Math.floor((cw.y + h / 2 / scale) / 256);
    const need = new Set();
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n || tx < 0 || tx >= n) continue;
        const key = zi + '/' + tx + '/' + ty;
        need.add(key);
        let el = this.tiles.get(key);
        if (!el) {
          el = new Image();
          el.className = 'gm-tile';
          el.alt = ''; el.draggable = false; el.decoding = 'async';
          el.onerror = () => { el.style.visibility = 'hidden'; };
          el.src = this.tileUrl.replace('{z}', zi).replace('{x}', tx).replace('{y}', ty);
          this.tileLayer.appendChild(el);
          this.tiles.set(key, el);
        }
        el.style.width = el.style.height = ts + 0.5 + 'px';
        el.style.transform = `translate(${(tx * 256 - cw.x) * scale + w / 2}px,${(ty * 256 - cw.y) * scale + h / 2}px)`;
      }
    }
    this.tiles.forEach((el, key) => { if (!need.has(key)) { el.remove(); this.tiles.delete(key); } });
  }
  _pinsAndLines(w, h) {
    this.pins.forEach(p => {
      const el = this.pinEls.get(p.id);
      if (!el) return;
      const s = this.toScreen(p.lat, p.lng);
      el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
      el.style.zIndex = p.z || 1;
    });
    let meEl = this.pinLayer.querySelector('.me');
    if (this.me) {
      if (!meEl) { meEl = document.createElement('div'); meEl.className = 'me'; meEl.innerHTML = '<i></i><b></b>'; this.pinLayer.appendChild(meEl); }
      const s = this.toScreen(this.me.lat, this.me.lng);
      meEl.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;
    } else if (meEl) meEl.remove();

    this.svg.setAttribute('width', w); this.svg.setAttribute('height', h);
    let out = '';
    this.lines.forEach(l => {
      const pts = l.pts.map(p => this.toScreen(p.lat, p.lng));
      out += `<polyline class="${l.cls || ''}" points="${pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')}"/>`;
      if (l.label && pts.length >= 2) {
        const a = pts[0], b = pts[pts.length - 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const tw = l.label.length * 6.6 + 12;
        out += `<g class="leg"><rect x="${(mx - tw / 2).toFixed(1)}" y="${(my - 10).toFixed(1)}" width="${tw.toFixed(1)}" height="20" rx="10"/>` +
               `<text x="${mx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle">${l.label.replace(/[<&>]/g, '')}</text></g>`;
      }
    });
    this.svg.innerHTML = out;
  }
  _scale(lat, z) {
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    const steps = [[100, '330 ft'], [152.4, '500 ft'], [402.3, '0.25 mi'], [804.7, '0.5 mi'], [1609.3, '1 mi'], [3218.7, '2 mi'],
      [8046.7, '5 mi'], [16093.4, '10 mi'], [40233.6, '25 mi'], [80467.2, '50 mi']];
    let pick = steps[0];
    steps.forEach(s => { if (s[0] / mpp <= 110) pick = s; });
    this.scaleBar.style.width = Math.max(18, pick[0] / mpp) + 'px';
    this.scaleText.textContent = pick[1];
  }
}
