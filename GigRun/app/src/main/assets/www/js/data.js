'use strict';
/* GigRun data layer: catalog, estimates, money math, storage, sample data. */

const ROAD_FACTOR = 1.3;       // straight-line miles -> estimated road miles
const EARTH_MI = 3958.8;

const rad = d => d * Math.PI / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(x)));
}
const roadMiles = (a, b) => haversine(a, b) * ROAD_FACTOR;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* ---------- Catalog ---------- */
const CATS = {
  lawn:  { label: 'Lawn & yard',   icon: 'lawn',  hrs: 1.5, effort: 3, tools: ['mower', 'trimmer', 'blower'], extras: ['gloves', 'bags'] },
  clean: { label: 'Cleaning',      icon: 'clean', hrs: 2.5, effort: 2, tools: ['cleankit'],                   extras: ['vac'] },
  car:   { label: 'Car wash',      icon: 'car',   hrs: 1.5, effort: 2, tools: ['carkit'],                     extras: ['vac', 'pwasher'] },
  move:  { label: 'Moving',        icon: 'move',  hrs: 3,   effort: 5, tools: ['dolly', 'straps'],            extras: ['blankets', 'truck'] },
  haul:  { label: 'Junk haul',     icon: 'haul',  hrs: 2,   effort: 4, tools: ['gloves', 'bags', 'truck'],    extras: ['dolly'] },
  handy: { label: 'Handyman',      icon: 'handy', hrs: 2,   effort: 3, tools: ['toolbag'],                    extras: ['ladder'] },
  wash:  { label: 'Pressure wash', icon: 'wash',  hrs: 3,   effort: 3, tools: ['pwasher'],                    extras: ['gloves'] },
  other: { label: 'Other',         icon: 'other', hrs: 1.5, effort: 2, tools: [],                             extras: [] }
};

/* buy = typical new price, rent = typical one-day rental or per-job wear. Editable in You > Gear. */
const TOOLS = {
  mower:    { name: 'Push mower',               buy: 260, rent: 45 },
  trimmer:  { name: 'String trimmer',           buy: 130, rent: 30 },
  blower:   { name: 'Leaf blower',              buy: 140, rent: 30 },
  gloves:   { name: 'Work gloves + rake',       buy: 45,  rent: 8 },
  bags:     { name: 'Contractor trash bags',    buy: 25,  rent: 12 },
  cleankit: { name: 'Cleaning caddy + supplies', buy: 55, rent: 15 },
  vac:      { name: 'Shop vac',                 buy: 90,  rent: 25 },
  carkit:   { name: 'Buckets, mitts, microfiber', buy: 45, rent: 12 },
  pwasher:  { name: 'Pressure washer',          buy: 230, rent: 55 },
  dolly:    { name: 'Hand truck / dolly',       buy: 75,  rent: 20 },
  straps:   { name: 'Ratchet + moving straps',  buy: 30,  rent: 10 },
  blankets: { name: 'Furniture blankets',       buy: 50,  rent: 15 },
  truck:    { name: 'Pickup or van',            buy: 0,   rent: 70 },
  toolbag:  { name: 'Basic tool bag',           buy: 90,  rent: 25 },
  ladder:   { name: 'Ladder',                   buy: 120, rent: 30 },
  hedge:    { name: 'Hedge trimmer',            buy: 120, rent: 30 }
};

const SIZES = {
  S:  { label: 'Small',  f: 0.6, e: -0.5 },
  M:  { label: 'Medium', f: 1,   e: 0 },
  L:  { label: 'Large',  f: 1.7, e: 0.5 },
  XL: { label: 'Huge',   f: 2.6, e: 1 }
};

const EFFORT = [
  '',
  { name: 'Light',  tip: 'Easy on the body. You will not need a break.' },
  { name: 'Easy',   tip: 'Mostly walking and light lifting.' },
  { name: 'Steady', tip: 'Real work. Bring water and expect to be tired after.' },
  { name: 'Heavy',  tip: 'Lots of lifting or hours on your feet. Stretch first and take a break halfway.' },
  { name: 'Brutal', tip: 'Heavy loads or long hours. Only take it if the pay is clearly worth it, and bring a second person if you can.' }
];

const TAGS = [
  { id: 'easy',     label: 'Easy to work with', tone: 'good' },
  { id: 'generous', label: 'Generous tipper',   tone: 'good' },
  { id: 'keep',     label: 'Keep in touch',     tone: 'good' },
  { id: 'more',     label: 'More work coming',  tone: 'good' },
  { id: 'hard',     label: 'Hard to work with', tone: 'bad' },
  { id: 'slowpay',  label: 'Pays slow',         tone: 'warn' },
  { id: 'flaky',    label: 'Cancels late',      tone: 'warn' }
];

function estimate(cat, size) {
  const c = CATS[cat] || CATS.other, s = SIZES[size] || SIZES.M;
  return {
    hours: Math.max(0.5, Math.round(c.hrs * s.f * 4) / 4),
    effort: clamp(Math.round(c.effort + s.e), 1, 5)
  };
}

/* ---------- Formatting ---------- */
const usd = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const usd2 = n => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
function hrs(h) {
  const m = Math.round(h * 60);
  if (m < 60) return m + ' min';
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}
const mins = h => Math.max(1, Math.round(h * 60)) + ' min';
const mi1 = m => (m < 10 ? m.toFixed(1) : Math.round(m).toString());
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ---------- State ---------- */
const STORE_KEY = 'gigrun.v1';
let S = null;                       // persisted state
const RT = { me: null, gps: 'idle' };  // runtime only: live position and GPS status

function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function offsetPoint(anchor, dx, dy) {
  const lat = anchor.lat + dy / 69;
  return { lat, lng: anchor.lng + dx / (69.17 * Math.cos(rad(lat))) };
}

function seedState() {
  const now = Date.now(), H = 3600000, M = 60000, D = 86400000;
  const st = {
    v: 1,
    profile: { name: '', mpg: 24, gas: 4.2, wear: 0.1, target: 20, speed: 28 },
    anchor: { lat: 37.7749, lng: -122.4194, real: false },
    owned: { gloves: true, bags: true },
    price: {},
    jobs: [], customers: [], reviews: []
  };
  const mk = (o) => Object.assign({
    id: uid('j'), sample: true, status: 'new', supplies: 0, tools: null, size: 'M',
    contact: { name: '', phone: '', email: '' }, when: 'Anytime today'
  }, o);

  st.jobs = [
    mk({ cat: 'lawn', title: 'Mow and edge front and back lawn', pay: 55, size: 'M', hours: 1.5, effort: 3, supplies: 3,
         off: [1.2, 0.6], addr: 'Alder St', posted: now - 6 * M, when: 'Today before 4 pm',
         desc: 'About 2,000 sq ft total. Gate is unlocked. Clippings can go in the green bin by the garage. Gas mower is fine, we do not have one.',
         contact: { name: 'Dana M.', phone: '(555) 010-0142', email: 'dana.m@example.com' } }),
    mk({ cat: 'car', title: 'Wash and vacuum a mid-size SUV', pay: 40, size: 'M', hours: 1.25, effort: 2,
         off: [0.4, -0.9], addr: 'Birch Ave', posted: now - 11 * M, when: 'Today, any time',
         desc: 'Outside wash and wax-free dry. Vacuum seats and cargo area. Hose and outdoor outlet are on site.',
         contact: { name: 'Marcus T.', phone: '(555) 010-0177', email: '' } }),
    mk({ cat: 'move', title: 'Help load a 2-bedroom into a truck', pay: 140, size: 'L', hours: 3, effort: 5,
         off: [3.1, 1.9], addr: 'Cedar Ct', posted: now - 25 * M, when: 'Tomorrow 9 am',
         desc: 'Truck is already rented. Two flights of stairs, a sofa and a dresser are the heavy items. You will be one of two helpers.',
         contact: { name: 'Priya S.', phone: '(555) 010-0119', email: 'priya.s@example.com' } }),
    mk({ cat: 'haul', title: 'Haul away an old couch and mattress', pay: 60, size: 'M', hours: 1.5, effort: 4, supplies: 15,
         off: [-2.2, 0.8], addr: 'Dogwood Ln', posted: now - 40 * M, when: 'This week',
         desc: 'Both are on the curb side of the driveway. You need a truck. Dump fee is on you, about $15.',
         contact: { name: 'Leon K.', phone: '(555) 010-0163', email: '' } }),
    mk({ cat: 'clean', title: 'Clean out and sweep a two-car garage', pay: 90, size: 'L', hours: 3, effort: 3,
         off: [-0.9, -2.4], addr: 'Elm St', posted: now - 55 * M, when: 'Saturday morning',
         desc: 'Sort into keep, donate, trash. Sweep and hose the floor at the end. Bags provided.',
         contact: { name: 'Tomas R.', phone: '(555) 010-0188', email: 'tomas.r@example.com' } }),
    mk({ cat: 'wash', title: 'Pressure wash a driveway (about 600 sq ft)', pay: 85, size: 'M', hours: 1.75, effort: 3,
         off: [2.0, -1.3], addr: 'Fir Rd', posted: now - 70 * M, when: 'Sunday',
         desc: 'Oil stain near the garage door. Water hookup is at the side of the house. Machine is not provided.',
         contact: { name: 'Hannah B.', phone: '(555) 010-0131', email: 'hannah.b@example.com' } }),
    mk({ cat: 'handy', title: 'Hang three shelves and patch a drywall hole', pay: 75, size: 'M', hours: 2, effort: 2,
         off: [-3.6, 2.9], addr: 'Grove Way', posted: now - 95 * M, when: 'This week',
         desc: 'Shelves and anchors are bought. Hole is about the size of a fist. Paint is already matched.',
         contact: { name: 'Owen D.', phone: '(555) 010-0155', email: 'owen.d@example.com' } }),
    mk({ cat: 'lawn', title: 'Weekly mow, small yard (ongoing)', pay: 35, size: 'S', hours: 0.75, effort: 2, supplies: 2,
         off: [0.7, -0.3], addr: 'Hazel St', posted: now - 2 * H, when: 'Every Friday',
         desc: 'Small front yard and strip along the side. Good one to keep: weekly and close to you.',
         contact: { name: 'Beth W.', phone: '(555) 010-0124', email: '' } }),
    mk({ cat: 'lawn', title: 'Rake and bag leaves, small yard', pay: 70, size: 'M', hours: 2, effort: 3,
         off: [-1.4, 1.5], addr: 'Ivy Pl', posted: now - 3 * H, when: 'This weekend',
         desc: 'Two big maples. Leaves go in paper yard bags, about 15 expected. Bags are on the porch.',
         contact: { name: 'Carol N.', phone: '(555) 010-0191', email: 'carol.n@example.com' } }),
    mk({ cat: 'move', title: 'Carry a couch down two flights', pay: 45, size: 'S', hours: 1, effort: 4,
         off: [5.6, -4.2], addr: 'Juniper Dr', posted: now - 5 * H, when: 'Tomorrow evening',
         desc: 'Sofa only, from the 3rd floor to a van on the street. Another person will take the other end.',
         contact: { name: 'Sam V.', phone: '(555) 010-0166', email: '' } }),
    mk({ cat: 'clean', title: 'Move-out clean, 1-bedroom apartment', pay: 120, size: 'M', hours: 3, effort: 3,
         off: [4.2, 3.8], addr: 'Kestrel Apts', posted: now - 7 * H, when: 'Monday',
         desc: 'Kitchen, bath, floors, windows. Supplies are on site. Landlord inspects at 5 pm.',
         contact: { name: 'Nina F.', phone: '(555) 010-0108', email: 'nina.f@example.com' } }),
    mk({ cat: 'handy', title: 'Hang holiday lights along the roofline', pay: 110, size: 'M', hours: 2.5, effort: 3,
         off: [1.8, 2.5], addr: 'Linden Ct', posted: now - 9 * H, when: 'This week',
         desc: 'Single-story house. Lights and clips are supplied. You need a ladder and someone to spot it.',
         contact: { name: 'Greg A.', phone: '(555) 010-0172', email: 'greg.a@example.com' } })
  ];

  /* Two past customers so the People tab and weekly totals show real structure. */
  const ruth = { id: uid('c'), sample: true, name: 'Ruth P.', phone: '(555) 010-0199', email: 'ruth.p@example.com',
    rating: 5, tags: ['generous', 'keep', 'more'], notes: 'Pays in cash on the spot. Has a big back yard and a gutter job she keeps putting off.',
    reminders: [{ id: uid('r'), when: now + 1 * D, text: 'Ask Ruth about leaf cleanup and gutters', done: false }] };
  const gary = { id: uid('c'), sample: true, name: 'Gary L.', phone: '(555) 010-0145', email: '',
    rating: 2, tags: ['hard', 'slowpay'], notes: 'Changed the job scope twice. Paid after a week of texting.', reminders: [] };
  st.customers = [ruth, gary];

  const done = (o) => mk(Object.assign({ status: 'done' }, o));
  st.jobs.push(
    done({ cat: 'lawn', title: 'Mow and edge, large yard', pay: 60, hours: 1.5, effort: 3, off: [1.0, 1.0], addr: 'Maple Dr',
           posted: now - 5 * D, acceptedAt: now - 3 * D - 3 * H, doneAt: now - 3 * D, custId: ruth.id, rating: 5,
           contact: { name: 'Ruth P.', phone: ruth.phone, email: ruth.email },
           result: { pay: 70, hours: 1.6, miles: 4.6, travel: 1.2, gear: 0, supplies: 3, net: 65.8, tip: 10 } }),
    done({ cat: 'haul', title: 'Haul a broken dresser', pay: 50, hours: 1, effort: 4, off: [-1.5, -1.0], addr: 'Oak St',
           posted: now - 4 * D, acceptedAt: now - 2 * D - 4 * H, doneAt: now - 2 * D, custId: gary.id, rating: 2,
           contact: { name: 'Gary L.', phone: gary.phone, email: '' },
           result: { pay: 50, hours: 1.6, miles: 5.0, travel: 1.4, gear: 70, supplies: 12, net: -33.4, tip: 0 } }),
    done({ cat: 'lawn', title: 'Rake leaves, front yard', pay: 45, hours: 1.25, effort: 3, off: [1.1, 0.9], addr: 'Maple Dr',
           posted: now - 2 * D, acceptedAt: now - D - 3 * H, doneAt: now - D, custId: ruth.id, rating: 5,
           contact: { name: 'Ruth P.', phone: ruth.phone, email: ruth.email },
           result: { pay: 55, hours: 1.4, miles: 4.7, travel: 1.3, gear: 0, supplies: 0, net: 53.7, tip: 10 } })
  );
  return st;
}

function recomputeSamples() {
  S.jobs.forEach(j => {
    if (j.off) { const p = offsetPoint(S.anchor, j.off[0], j.off[1]); j.lat = p.lat; j.lng = p.lng; }
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { S = JSON.parse(raw); if (S && S.v === 1) return; }
  } catch (e) { /* fall through to seed */ }
  S = seedState();
  recomputeSamples();
  saveState();
}
let saveFailed = false;
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); saveFailed = false; return true; }
  catch (e) { saveFailed = true; return false; }
}

/* ---------- Money math ---------- */
const here = () => RT.me || S.anchor;
const costPerMile = () => S.profile.gas / S.profile.mpg + S.profile.wear;
const toolInfo = id => Object.assign({}, TOOLS[id], S.price[id] || {});
const jobTools = j => j.tools || (CATS[j.cat] || CATS.other).tools;

function calc(j) {
  const p = S.profile;
  if (j.status === 'done' && j.result) {
    const r = j.result, work = r.hours;
    return { miles: r.miles / 2, round: r.miles, travel: r.travel, gear: r.gear, gearList: [], supplies: r.supplies,
      costs: r.travel + r.gear + r.supplies, net: r.net, drive: 0, work, total: work, rate: work ? r.net / work : 0,
      verdict: verdictFor(r.net, work ? r.net / work : 0), cpm: costPerMile(), done: true };
  }
  const miles = roadMiles(here(), j);
  const round = miles * 2;
  const cpm = costPerMile();
  const travel = round * cpm;
  const gearList = jobTools(j).map(id => {
    const t = toolInfo(id);
    return { id, name: t.name, rent: t.rent, buy: t.buy, owned: !!S.owned[id] };
  });
  const gear = gearList.reduce((s, g) => s + (g.owned ? 0 : g.rent), 0);
  const supplies = j.supplies || 0;
  const costs = travel + gear + supplies;
  const net = j.pay - costs;
  const drive = round / p.speed;
  const work = j.hours;
  const total = work + drive;
  const rate = total ? net / total : 0;
  return { miles, round, travel, gear, gearList, supplies, costs, net, drive, work, total, rate, verdict: verdictFor(net, rate), cpm };
}
function verdictFor(net, rate) {
  const t = S.profile.target;
  if (net <= 0) return 'poor';
  if (rate >= t) return 'good';
  if (rate >= t * 0.7) return 'ok';
  return 'poor';
}
const VERDICT = { good: 'Worth it', ok: 'Marginal', poor: 'Skip it' };

/* ---------- Customers ---------- */
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function customerFor(contact) {
  if (!contact || !contact.name) return null;
  let c = S.customers.find(x => slug(x.name) === slug(contact.name));
  if (!c) {
    c = { id: uid('c'), name: contact.name, phone: contact.phone || '', email: contact.email || '', rating: 0, tags: [], notes: '', reminders: [] };
    S.customers.push(c);
  } else {
    if (contact.phone && !c.phone) c.phone = contact.phone;
    if (contact.email && !c.email) c.email = contact.email;
  }
  return c;
}
function customerJobs(cid) { return S.jobs.filter(j => j.custId === cid); }
