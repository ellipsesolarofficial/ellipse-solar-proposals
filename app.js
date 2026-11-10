'use strict';

/* =====================================================================
   Ellipse Solar — rooftop design & proposal app (frontend only)
   Proposals are stored in this browser (localStorage).
   Prices are read from rates.json (live from the Ellipse sales portal,
   with a bundled copy as fallback). Pricing maths lives in pricing.js.
   ===================================================================== */

/* ---------------- Helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const n0 = (v) => (Number.isFinite(+v) ? +v : 0);
const num = (n, d = 0) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const rs = (n) => 'Rs. ' + Math.round(n || 0).toLocaleString('en-IN'); // PDF fonts have no ₹ glyph
const kw = (n) => (Math.round(n * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate = (t) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const STATUSES = ['Draft', 'Sent', 'Negotiation', 'Won', 'Lost'];
const OPEN_STATUSES = ['Draft', 'Sent', 'Negotiation'];
const CATEGORIES = ['Residential', 'Commercial', 'Industrial'];
const MOUNTS = { elevated: 'Elevated structure (RCC roof)', flush: 'Low / flush structure (RCC roof)', tinshed: 'Tin shed / metal roof' };
const PANEL_CATS = [['dcr', 'DCR (Domestic Content)'], ['nonDcr', 'Non-DCR (Imported Cells)'], ['mixed', 'Mixed (DCR + Non-DCR)']];
const PANEL_TYPES = [['monoperc_bifacial', 'MonoPERC Bifacial'], ['topcon_bifacial', 'TOPCon Bifacial']];
const PHASES = [['1phase', '1 Phase'], ['3phase', '3 Phase']];
// Typical monthly irradiance shape (kWh/m²/day) until site data loads
const DEFAULT_GHI = [4.3, 5.1, 6.0, 6.6, 6.7, 5.9, 5.0, 4.9, 5.3, 5.2, 4.6, 4.1];
const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LIVE_RATES_URL = 'https://ellipsesolarofficial.github.io/ellipse-solar-sales-platform/rates.json';
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzs-81APX5QnQyuftPkB3lz6zlHunk79R8Gvx_FrnALhwHk6RrNIFJefnVZ2z5l6WDeYw/exec';

function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, path, v) {
  const ks = path.split('.');
  let a = o;
  ks.slice(0, -1).forEach((k) => { if (a[k] == null) a[k] = {}; a = a[k]; });
  a[ks[ks.length - 1]] = v;
}
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function deepMerge(base, over) {
  if (!isObj(over)) return base;
  for (const k of Object.keys(over)) {
    if (isObj(base[k]) && isObj(over[k])) deepMerge(base[k], over[k]);
    else if (over[k] !== undefined) base[k] = over[k];
  }
  return base;
}
function hexRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [232, 98, 31];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareOrDownload(blob, name, title, text) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(blob, name);
  return 'downloaded';
}
function waPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}
const assetCache = {};
async function assetDataUrl(path) {
  if (assetCache[path] !== undefined) return assetCache[path];
  try {
    const b = await (await fetch(path)).blob();
    assetCache[path] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch (e) { assetCache[path] = null; }
  return assetCache[path];
}
function imgSize(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res(null); im.src = src; });
}

/* ---------------- Storage ---------------- */
const KEY = 'ellipseSolar.v1';
const GHI_KEY = 'ellipseSolar.ghiCache';
const RATES_KEY = 'ellipseSolar.rates';

const DEFAULT_SETTINGS = {
  company: {
    name: 'Ellipse Solar', tagline: 'Rooftop solar power plants', color: '#E8621F',
    address: 'Plot No. 14, AB Heights, Baba Market, Teachers Colony, DCM, Ajmer Road, Jaipur - 302021',
    phone: '9216054155, 9216054156', email: '', website: '', gstin: '08GSYPM5879P1Z0',
    logo: null, signature: null, signatory: 'Saurav Gautam, Authorized Signatory', bank: '',
  },
  team: ['Saurav Gautam'],
  currentUser: 'Saurav Gautam',
  managerCode: 'racecar',
  ratesUrl: LIVE_RATES_URL,
  sheet: { enabled: true, url: SHEET_URL },
  energy: { genModel: 'standard', unitsPerKwDay: 5.15, tariff: 7.5, exportRate: 3.26, escalation: 0, degradation: 0, years: 30, pr: 0.77, tiltFactor: 1.05, co2: 0.82 },
  finance: { maxLoanAmount: 200000, cappedInterestRate: 5.75, fullLoanInterestRate: 9, privateFinanceRate: 9 },
  layout: { setback: 0.6, gap: 0.02, rowGapElevated: 0.8, rowGapFlat: 0.05 },
  proposal: {
    prefix: 'ELS', nextSeq: 1, validity: 2,
    sections: [
      { title: 'Payment Terms', body: '10% - Mobilization advance against Work Order.\n85% - Before delivery of material.\n5% - After successful commissioning of plant.' },
      { title: 'Project Completion', body: '10-15 days from the clear order and advance payment.' },
      { title: 'Validity of Offer', body: '{validity} days from the date of offer. After this period a confirmation must be taken.' },
      { title: 'Client Scope', body: 'Cleaning of solar modules in your scope.\nOne person from client side for basic training of operation of the solar PV system.\nRoof to be arranged and provided by the client.\nElectricity & water shall be provided by client during the construction.\nProvide safe storage space for the material being used for the solar power plant.\nProvide electricity supply to synchronize the inverter on commissioning.\nProvide connection space in the LT panel to connect the inverter output.\nInternet connection to be provided by the client for remote monitoring.' },
      { title: 'Transportation', body: 'All transportation of the above-mentioned BOM up to the site of installation is included.' },
      { title: 'Official Fees', body: 'Included.' },
      { title: 'Solar System Warranty', body: '5 year complete system warranty.\nSolar module performance warranty {panelWarranty} years (as per MNRE norms).\nSolar inverter {inverterWarranty} years.' },
      { title: 'Space Requirement', body: 'Shadow-free space for installation of solar modules.' },
    ],
  },
};

let db;
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || typeof db !== 'object') db = {};
  const saved = db.settings || {};
  db.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
  if (Array.isArray(saved.proposal?.sections)) db.settings.proposal.sections = saved.proposal.sections;
  db.proposals = (Array.isArray(db.proposals) ? db.proposals : []).filter((p) => !isEmptyProposal(p));
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save. Storage may be full; try smaller logo/signature images.'); }
}
const getProposal = (id) => db.proposals.find((p) => p.id === id);
function isEmptyProposal(p) {
  return !p.customer?.name && !(p.site?.roofs || []).some((r) => r.points?.length);
}
function persist(p) {
  if (p) {
    p.updatedAt = Date.now();
    if (!p.number && !isEmptyProposal(p)) {
      const P = db.settings.proposal;
      p.number = `${P.prefix || 'ELS'}-${new Date(p.createdAt).getFullYear()}-${String(P.nextSeq || 1).padStart(4, '0')}`;
      P.nextSeq = (+P.nextSeq || 1) + 1;
    }
  }
  save();
}
function defaultDesign() {
  return {
    mode: 'map', mount: 'elevated', systemType: 'ongrid', panelBrand: 'ina', panelType: 'monoperc_bifacial', panelCategory: 'dcr', phase: '1phase',
    systemKw: null, panelWatt: null, panelCount: null, dcrKw: null, inverterBrand: 'polycab', inverterTierKey: '', kitSku: '',
    battery: { on: false, chemistry: 'lead_acid', brand: '', option: '', qty: 1, invBrand: '', invOption: '' },
    structureBrand: 'tata', floors: 1,
  };
}
function newProposal() {
  const S = db.settings;
  const p = {
    id: uid(), number: null, createdAt: Date.now(), updatedAt: Date.now(), status: 'Draft',
    salesperson: S.currentUser || S.team[0] || '',
    customer: { name: '', phone: '', email: '', address: '', category: 'Residential', monthlyBill: null, monthlyUnits: null, freeUnits: false, load: null, notes: '' },
    site: { center: null, zoom: null, roofs: [] },
    design: defaultDesign(),
    pricing: { commission: 0, discount: 0, priceMode: 'components', perWatt: null, stateSubsidy: false, loan: { on: false, type: 'upto2l', repay: 'lowerEmi', years: 10 } },
    ghi: null, ghiSource: null, ghiKey: null,
  };
  db.proposals.unshift(p);
  return p;
}
// Sample proposal on a real Jaipur rooftop, for demos and training (#/demo)
const DEMO_OBSTACLES = () => [
  { id: uid(), kind: 'obstacle', name: 'Mumty (stair room)', height: 2.7, points: [[26.9057349, 75.7438617], [26.9057349, 75.7438919], [26.9057035, 75.7438919], [26.9057035, 75.7438617]] },
  { id: uid(), kind: 'obstacle', name: 'Water tank', height: 1.8, points: [[26.905724, 75.7439539], [26.905724, 75.74397], [26.9057096, 75.74397], [26.9057096, 75.7439539]] },
];
function demoProposal() {
  const existing = db.proposals.find((x) => x.demo);
  if (existing) {
    if (!existing.site.obstacles || !existing.site.obstacles.length) { existing.site.obstacles = DEMO_OBSTACLES(); persist(existing); }
    return existing;
  }
  const p = newProposal();
  Object.assign(p, { demo: true, status: 'Draft' });
  Object.assign(p.customer, { name: 'Demo - Sharma Residence', phone: '9876543210', address: 'Vaishali Nagar, Jaipur', monthlyBill: 3500, notes: 'Demo proposal for training. Safe to delete.' });
  p.site = { center: [26.90564, 75.74391], zoom: 20, roofs: [{ id: uid(), name: 'Roof 1', orientation: 'portrait', points: [[26.9057412, 75.7438547], [26.9057329, 75.7439801], [26.9055391, 75.743976], [26.9055463, 75.7438439]] }], obstacles: DEMO_OBSTACLES() };
  p.design.floors = 2;
  p.pricing.stateSubsidy = true;
  persist(p);
  return p;
}
function upgradeProposal(p) {
  p.design = deepMerge(defaultDesign(), p.design || {});
  p.pricing = deepMerge({ commission: 0, discount: 0, priceMode: 'components', perWatt: null, stateSubsidy: false, loan: { on: false, type: 'upto2l', repay: 'lowerEmi', years: 10 } }, p.pricing || {});
  p.customer = { freeUnits: false, ...p.customer };
  if (!Array.isArray(p.site.obstacles)) p.site.obstacles = [];
  if (!Array.isArray(p.site.panels)) p.site.panels = [];
  if (!p.design.layoutMode) p.design.layoutMode = 'auto';
  if (p.design.parapet == null) p.design.parapet = 0.9;
}

/* ---------------- Manager mode ---------------- */
function isMgr() { try { return sessionStorage.getItem('ellipseSolar.mgr') === '1'; } catch (e) { return !!window.__mgr; } }
function setMgr(on) { window.__mgr = on; try { on ? sessionStorage.setItem('ellipseSolar.mgr', '1') : sessionStorage.removeItem('ellipseSolar.mgr'); } catch (e) { /* ignore */ } }
function tryUnlock(code) {
  if (code && code === db.settings.managerCode) { setMgr(true); toast('Manager mode on'); return true; }
  toast('Wrong code');
  return false;
}

/* ---------------- Price list (rates.json) ---------------- */
const ratesInfo = { source: '', at: null, url: '' };
async function loadRates({ force = false } = {}) {
  const url = db.settings.ratesUrl || LIVE_RATES_URL;
  const valid = (j) => j && j.solarPanels && j.components && j.inverters;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), force ? 15000 : 8000);
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    const j = await res.json();
    if (!valid(j)) throw new Error('invalid');
    Q.setRates(j);
    Object.assign(ratesInfo, { source: 'live', at: Date.now(), url });
    try { localStorage.setItem(RATES_KEY, JSON.stringify({ data: j, at: Date.now(), url })); } catch (e) { /* ignore */ }
    return true;
  } catch (e) {
    try {
      const c = JSON.parse(localStorage.getItem(RATES_KEY));
      if (c && valid(c.data)) { Q.setRates(c.data); Object.assign(ratesInfo, { source: 'saved', at: c.at, url: c.url }); return false; }
    } catch (e2) { /* ignore */ }
    try {
      const j = await (await fetch('rates.json')).json();
      if (valid(j)) { Q.setRates(j); Object.assign(ratesInfo, { source: 'bundled', at: null, url: 'rates.json' }); return false; }
    } catch (e3) { /* ignore */ }
    return false;
  }
}

/* ---------------- Geometry & panel layout ---------------- */
function toLocal(points) {
  const lat0 = sum(points.map((p) => p[0])) / points.length;
  const lon0 = sum(points.map((p) => p[1])) / points.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  const fwd = ([la, lo]) => [(lo - lon0) * kx, (la - lat0) * ky];
  return { pts: points.map(fwd), fwd, back: ([x, y]) => [y / ky + lat0, x / kx + lon0] };
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a / 2);
}
function inPoly([x, y], poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function distSeg([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// Every panel is drawn as 8 ft x 4 ft (2.4384 m x 1.2192 m), as the team designs on site
const PANEL_LEN = 2.4384, PANEL_WID = 1.2192;
const panelDims = () => [PANEL_LEN, PANEL_WID];

/* ---- Hand-placed panels (manual layout): oriented rectangles in local metres ---- */
const SNAP_DIST = 0.35, PANEL_GAP = 0.02;
const pnSize = (pn) => (pn.landscape ? [PANEL_LEN, PANEL_WID] : [PANEL_WID, PANEL_LEN]); // [along angle, across]
function pnLocal(pn, F) { const [x, y] = F.to([pn.lat, pn.lng]); const [su, sv] = pnSize(pn); return { x, y, a: pn.angle, hu: su / 2, hv: sv / 2 }; }
function obbCorners(o) {
  const c = Math.cos(o.a), s = Math.sin(o.a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [o.x + i * o.hu * c - j * o.hv * s, o.y + i * o.hu * s + j * o.hv * c]);
}
function inObb([px, py], o) {
  const dx = px - o.x, dy = py - o.y, c = Math.cos(o.a), s = Math.sin(o.a);
  return Math.abs(dx * c + dy * s) < o.hu - 1e-3 && Math.abs(-dx * s + dy * c) < o.hv - 1e-3;
}
function obbOverlap(A, B) {
  const ca = obbCorners(A), cb = obbCorners(B);
  return [A.a, A.a + Math.PI / 2, B.a, B.a + Math.PI / 2].every((t) => {
    const ax = [Math.cos(t), Math.sin(t)];
    const pa = ca.map((q) => q[0] * ax[0] + q[1] * ax[1]), pb = cb.map((q) => q[0] * ax[0] + q[1] * ax[1]);
    return Math.max(...pa) > Math.min(...pb) + 2e-3 && Math.max(...pb) > Math.min(...pa) + 2e-3;
  });
}
function siteGeom(p, F) {
  return {
    roofs: p.site.roofs.filter((r) => r.points.length >= 3).map((r) => r.points.map(F.to)),
    obs: (p.site.obstacles || []).filter((o) => o.points.length >= 3).map((o) => o.points.map(F.to)),
  };
}
// A panel may sit only fully on one roof, off obstacles, and not touching another panel
function panelFits(o, others, G) {
  const cs = obbCorners(o);
  if (!G.roofs.some((poly) => cs.every((q) => inPoly(q, poly)))) return false;
  if (G.obs.some((poly) => cs.some((q) => inPoly(q, poly)) || poly.some((q) => inObb(q, o)))) return false;
  return !others.some((b) => obbOverlap(o, b));
}
// Magnetic snap: line up with a nearby parallel panel (same row/column, edge to edge)
function snapPanel(o, others) {
  let best = null;
  others.forEach((B) => {
    const d = o.a - B.a, sd = Math.abs(Math.sin(d)), cd = Math.abs(Math.cos(d));
    if (Math.min(sd, cd) > 0.06) return; // not parallel
    if (Math.hypot(o.x - B.x, o.y - B.y) > 6) return;
    const eu = cd * o.hu + sd * o.hv, ev = sd * o.hu + cd * o.hv; // o's half-extent along B's axes
    const c = Math.cos(B.a), s = Math.sin(B.a), dx = o.x - B.x, dy = o.y - B.y;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const near = (val, list) => list.reduce((acc, t) => (Math.abs(val - t) < SNAP_DIST && (acc == null || Math.abs(val - t) < Math.abs(val - acc)) ? t : acc), null);
    const uT = near(u, [B.hu + eu + PANEL_GAP, -(B.hu + eu + PANEL_GAP), 0, B.hu - eu, eu - B.hu]);
    const vT = near(v, [B.hv + ev + PANEL_GAP, -(B.hv + ev + PANEL_GAP), 0, B.hv - ev, ev - B.hv]);
    if (uT == null && vT == null) return;
    const nu = uT ?? u, nv = vT ?? v;
    const score = (uT != null ? Math.abs(u - uT) : SNAP_DIST) + (vT != null ? Math.abs(v - vT) : SNAP_DIST);
    if (!best || score < best.score) best = { score, o: { ...o, a: B.a + Math.round(d / (Math.PI / 2)) * (Math.PI / 2), x: B.x + nu * c - nv * s, y: B.y + nu * s + nv * c } };
  });
  return best ? best.o : null;
}
function longestEdgeAngle(poly) {
  let best = 0, ang = 0;
  poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } });
  return ang;
}
function rectToPanel(c, F) {
  const q = c.map(F.to);
  const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1]], e2 = [q[2][0] - q[1][0], q[2][1] - q[1][1]];
  const [la, lo] = F.back([sum(q.map((v) => v[0])) / 4, sum(q.map((v) => v[1])) / 4]);
  return { id: uid(), lat: la, lng: lo, angle: Math.atan2(e1[1], e1[0]), landscape: Math.hypot(...e1) > Math.hypot(...e2) };
}
function autoRects(p) {
  const prev = p.design.layoutMode;
  p.design.layoutMode = 'auto';
  const saved = p.design.panelCount;
  const r = compute(p);
  p.design.layoutMode = prev;
  p.design.panelCount = saved;
  return { r, rects: r.layouts.flatMap((l) => l.rects) };
}
// Fill missing panels from the automatic layout, skipping spots already taken
function autoPlaceRest(p) {
  const F = shadeFrame(p), G = siteGeom(p, F);
  const { r } = autoRects(p);
  const need = r.count - p.site.panels.length;
  if (need <= 0) return 0;
  const prevMode = p.design.layoutMode, prevPanels = p.site.panels;
  // the auto layout limited to the quote picks centre-first; ask for every spot that fits instead
  p.design.layoutMode = 'auto';
  const all = p.site.roofs.flatMap((roof) => layoutRoof(roof, 0, p.design.mount, p.site.obstacles).rects);
  p.design.layoutMode = prevMode;
  const placed = prevPanels.map((pn) => pnLocal(pn, F));
  let added = 0;
  for (const c of all) {
    if (added >= need) break;
    const pn = rectToPanel(c, F), o = pnLocal(pn, F);
    if (panelFits(o, placed, G)) { prevPanels.push(pn); placed.push(o); added++; }
  }
  return added;
}

const layoutMemo = new Map();
function layoutRoof(roof, watt, mount, obstacles = []) {
  const L = db.settings.layout;
  const obs = obstacles.filter((o) => o.points && o.points.length >= 3);
  const key = JSON.stringify([roof.points, roof.orientation, mount, watt, L, obs.map((o) => o.points)]);
  if (layoutMemo.has(key)) return layoutMemo.get(key);
  const out = { rects: [], area: 0, count: 0 };
  if (!roof.points || roof.points.length < 3) return out;
  const { pts, back, fwd } = toLocal(roof.points);
  out.area = polyArea(pts);
  let best = 0, ang = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) { best = len; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  });
  const rp = pts.map((p) => rot(p, -ang));
  const edges = rp.map((a, i) => [a, rp[(i + 1) % rp.length]]);
  const [lenM, widM] = panelDims(watt);
  const [pw, ph] = roof.orientation === 'landscape' ? [lenM, widM] : [widM, lenM];
  const setback = Math.max(0, n0(L.setback)), gap = Math.max(0, n0(L.gap));
  const rowGap = Math.max(0, n0(mount === 'elevated' ? L.rowGapElevated : L.rowGapFlat));
  const colPitch = pw + gap, rowPitch = ph + rowGap;
  const xs = rp.map((p) => p[0]), ys = rp.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if ((maxX - minX) * (maxY - minY) > 200000) return out;
  // obstacles (tank, mumty…) in the same rotated frame, kept clear by a small gap
  const ob = obs.map((o) => o.points.map((q) => rot(fwd(q), -ang)));
  const obClear = (c) => ob.every((poly) => !inPoly(c, poly) && poly.every((v, i) => distSeg(c, v, poly[(i + 1) % poly.length]) >= 0.3));
  const okCorner = (c) => inPoly(c, rp) && edges.every(([a, b]) => distSeg(c, a, b) >= setback - 1e-6) && obClear(c);
  let bestRects = [];
  for (const fx of [0, 1 / 3, 2 / 3]) {
    for (const fy of [0, 0.5]) {
      const rects = [];
      for (let y = minY + setback + fy * rowPitch; y + ph <= maxY - setback + 1e-6; y += rowPitch) {
        for (let x = minX + setback + fx * colPitch; x + pw <= maxX - setback + 1e-6; x += colPitch) {
          const c = [[x, y], [x + pw, y], [x + pw, y + ph], [x, y + ph]];
          if (!c.every(okCorner)) continue;
          const inRect = ([vx, vy]) => vx > x - 0.3 && vx < x + pw + 0.3 && vy > y - 0.3 && vy < y + ph + 0.3;
          if (rp.some(([vx, vy]) => vx > x && vx < x + pw && vy > y && vy < y + ph) || ob.some((poly) => poly.some(inRect))) continue;
          rects.push(c);
        }
      }
      if (rects.length > bestRects.length) bestRects = rects;
    }
  }
  // When fewer panels are quoted than fit, take them from the middle of the roof as a compact block
  const cx = sum(rp.map((p) => p[0])) / rp.length, cy = sum(rp.map((p) => p[1])) / rp.length;
  const dist = (c) => Math.abs((c[0][1] + c[2][1]) / 2 - cy) * 100 + Math.abs((c[0][0] + c[2][0]) / 2 - cx); // whole rows, centre first
  bestRects.sort((a, b) => dist(a) - dist(b));
  out.rects = bestRects.map((c) => c.map((p) => back(rot(p, ang))));
  out.count = out.rects.length;
  if (layoutMemo.size > 80) layoutMemo.clear();
  layoutMemo.set(key, out);
  return out;
}
const roofCentroid = (pts) => [sum(pts.map((p) => p[0])) / pts.length, sum(pts.map((p) => p[1])) / pts.length];
function siteCenter(p) {
  const pts = p.site.roofs.flatMap((r) => r.points || []);
  return pts.length ? roofCentroid(pts) : p.site.center || null;
}

/* ---------------- Calculations ---------------- */
function consumptionOf(p) {
  if (n0(p.customer.monthlyUnits) > 0) return n0(p.customer.monthlyUnits);
  if (n0(p.customer.monthlyBill) > 0) return Q.unitsFromBill(n0(p.customer.monthlyBill), !!p.customer.freeUnits);
  return 0;
}
// Resolve every "auto" choice into concrete portal parameters
function buildParams(p, fitPanels) {
  const R = Q.rates(), d = p.design, E = db.settings.energy;
  const brand = R.solarPanels[d.panelBrand] ? d.panelBrand : 'ina';
  const systemType = R.systemTypes[d.systemType] ? d.systemType : 'ongrid';
  const isKit = Q.isKitBrand(brand);
  let category = d.panelCategory;
  if (isKit && category === 'mixed') category = 'dcr';
  const monthly = consumptionOf(p);
  const recKw = monthly > 0 ? Math.ceil(monthly / 30 / (n0(E.unitsPerKwDay) || 5.15)) : 0;

  // auto size: bill recommendation, limited by what fits on the roof
  const autoWatt0 = Q.defaultWattage(brand, d.panelType, recKw || 3);
  const roofKw = fitPanels > 0 ? Math.floor((fitPanels * autoWatt0) / 1000) : 0;
  let target = recKw || roofKw || 3;
  if (recKw && roofKw) target = Math.min(recKw, Math.max(3, roofKw));
  let size, sizes, kitList = [];
  if (isKit) {
    kitList = Q.listKits(brand, systemType, category);
    sizes = Q.kitCapacities(kitList);
    size = sizes.find((s) => Math.abs(s - n0(d.systemKw)) < 0.001) ?? (sizes.length ? sizes.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] : target);
  } else {
    sizes = Q.STANDARD_SIZES;
    size = d.systemKw && sizes.includes(+d.systemKw) ? +d.systemKw : Math.min(50, Math.max(3, Math.round(target)));
  }
  const autoSize = isKit ? size : Math.min(50, Math.max(3, Math.round(target)));

  const { capacities } = Q.capacityConfig(brand, d.panelType);
  const watt = d.panelWatt && capacities.includes(+d.panelWatt) ? +d.panelWatt : Q.defaultWattage(brand, d.panelType, size);
  const invBrands = Q.inverterBrands(systemType);
  const invBrand = invBrands.some((b) => b.key === d.inverterBrand) ? d.inverterBrand : invBrands[0]?.key;
  const tiers = Q.inverterTiers(systemType, invBrand);
  const tier = tiers.find((t) => t.key === d.inverterTierKey) || Q.defaultTier(tiers, size, d.phase);
  const sizeKits = kitList.filter((k) => Math.abs(k.dcKw - size) < 0.001);
  const kitSku = sizeKits.some((k) => k.id === d.kitSku) ? d.kitSku : '';
  const dcr = category === 'mixed' ? Math.min(size, Math.max(0, d.dcrKw == null ? Math.ceil(size / 2) : n0(d.dcrKw))) : 0;
  const recPanels = Q.nearestPanelCount(size, watt);
  const count = d.panelCount ? Math.min(recPanels + Q.PANEL_COUNT_MAX_EXTRA, Math.max(1, Math.round(d.panelCount))) : null;

  const b = d.battery || {};
  const battOn = !!b.on;
  const chem = (R.batteryChemistries || {})[b.chemistry] ? b.chemistry : 'lead_acid';
  const bBrands = Q.batteryBrands(chem);
  const bBrand = bBrands.find((x) => x.key === b.brand) || bBrands[0];
  const bOpt = bBrand && ((bBrand.options || []).find((o) => o.id === b.option) || (bBrand.options || [])[0]);
  const biBrands = Object.entries(R.batteryInverters || {});
  const biEntry = biBrands.find(([k]) => k === b.invBrand) || biBrands[0];
  const biOpt = biEntry && ((biEntry[1].options || []).find((o) => o.id === b.invOption) || (biEntry[1].options || [])[0]);

  const P = p.pricing;
  const params = {
    systemSize: size, panelBrand: brand, panelCapacity: watt, panelType: d.panelType, panelCategory: category,
    dcrCapacity: dcr, nonDcrCapacity: category === 'mixed' ? Math.round((size - dcr) * 1000) / 1000 : 0,
    inverterCapacity: tier ? tier.kw : size, inverterBrand: invBrand, inverterTierKey: tier ? tier.key : '',
    systemType, batteryBackup: battOn ? 'yes' : 'no', batteryChemistry: chem, batteryBrand: bBrand?.key, batteryOption: bOpt?.id,
    batteryQuantity: Math.max(1, Math.round(n0(b.qty) || 1)), batteryInverterBrand: biEntry?.[0], batteryInverterOption: biOpt?.id,
    structureBrand: R.structureBrands[d.structureBrand] ? d.structureBrand : 'tata', phaseType: d.phase, numberOfFloors: n0(d.floors) || 1,
    commission: n0(P.commission), discount: n0(P.discount), perWattRate: P.priceMode === 'perWatt' ? n0(P.perWatt) : 0,
    panelCountOverride: count || '', kitSku,
  };
  return { params, meta: { isKit, sizes, size, autoSize, recKw, watt, recPanels, tiers, tier, invBrands, sizeKits, bBrands, bBrand, bOpt, biBrands, biEntry, biOpt, chem, category } };
}

function compute(p) {
  upgradeProposal(p);
  const S = db.settings, E = S.energy, d = p.design;
  const R = Q.rates();
  // roof capacity, using the panel wattage that will be quoted
  const rawFor = (watt) => (d.mode === 'map' ? p.site.roofs.map((roof) => layoutRoof(roof, watt, d.mount, p.site.obstacles || [])) : []);
  let raw = rawFor(Q.defaultWattage(R.solarPanels[d.panelBrand] ? d.panelBrand : 'ina', d.panelType, 3));
  let fit = sum(raw.map((l) => l.count));
  const { params, meta } = buildParams(p, fit);
  raw = rawFor(meta.watt);
  fit = sum(raw.map((l) => l.count));
  const area = sum(raw.map((l) => l.area));

  let q = null, err = null;
  try { q = Q.quote(params); } catch (e) { err = e.message; }
  const count = q ? q.panelCount : 0;
  const kwp = q ? q.actualSystemCapacity : 0;
  let layouts;
  const manual = d.mode === 'map' && d.layoutMode === 'manual' && p.site.roofs.some((x) => x.points.length >= 3);
  if (manual) {
    // hand-placed panels, grouped under the roof they sit on
    const F = shadeFrame(p), G = siteGeom(p, F);
    layouts = raw.map((l) => ({ area: l.area, fit: l.count, rects: [], ids: [], count: 0 }));
    (p.site.panels || []).forEach((pn) => {
      const o = pnLocal(pn, F);
      let i = G.roofs.findIndex((poly) => inPoly([o.x, o.y], poly));
      if (i < 0) i = 0;
      const li = p.site.roofs.indexOf(p.site.roofs.filter((x) => x.points.length >= 3)[i]);
      const L0 = layouts[li >= 0 ? li : 0];
      if (!L0) return;
      L0.rects.push(obbCorners(o).map(F.back)); L0.ids.push(pn.id); L0.count++;
    });
  } else {
    let left = count;
    layouts = raw.map((l) => { const take = Math.min(l.rects.length, left); left -= take; return { area: l.area, fit: l.count, rects: l.rects.slice(0, take), count: take }; });
  }
  const placed = sum(layouts.map((l) => l.count));

  // Generation: Ellipse standard (units/kW/day) or site satellite data
  const ghi = Array.isArray(p.ghi) && p.ghi.length === 12 ? p.ghi : DEFAULT_GHI;
  const shape = ghi.map((g, i) => g * DAYS[i]);
  let monthly;
  if (E.genModel === 'site') monthly = shape.map((v) => kwp * v * (n0(E.pr) || 0.77) * (n0(E.tiltFactor) || 1));
  else { const annual0 = kwp * (n0(E.unitsPerKwDay) || 5.15) * 365; monthly = shape.map((v) => (annual0 * v) / sum(shape)); }
  const annual = sum(monthly);
  const specYield = kwp ? annual / kwp : 0;

  const monthlyUnits = consumptionOf(p);
  const consumption = monthlyUnits * 12;
  const total = q ? q.breakdown.finalAmount : 0;
  const eligible = !!q && q.panelCategory !== 'nonDcr' && p.customer.category === 'Residential';
  const centerSub = q ? Q.centerSubsidy(q.systemSize, eligible) : 0;
  const stateSub = eligible && p.pricing.stateSubsidy ? Q.stateSubsidyAmount() : 0;
  const subsidy = Math.min(centerSub + stateSub, total);
  const net = total - subsidy;

  const yearsN = Math.max(1, Math.min(40, Math.round(n0(E.years) || 30)));
  const deg = n0(E.degradation) / 100, escR = n0(E.escalation) / 100;
  const years = [];
  let cumulative = 0, payback = null;
  for (let y = 1; y <= yearsN; y++) {
    const gen = annual * Math.pow(1 - deg, y - 1);
    const t = n0(E.tariff) * Math.pow(1 + escR, y - 1);
    const self = consumption > 0 ? Math.min(gen, consumption) : gen;
    const exported = consumption > 0 ? Math.max(0, gen - consumption) : 0;
    const savings = self * t + exported * n0(E.exportRate);
    const prev = cumulative;
    cumulative += savings;
    if (payback == null && net > 0 && cumulative >= net && savings > 0) payback = y - 1 + (net - prev) / savings;
    years.push({ year: y, gen, tariff: t, savings, cumulative });
  }
  const loan = q && p.pricing.loan.on
    ? Q.loan({ finalAmount: total, subsidyTotal: subsidy, loanType: p.pricing.loan.type, repayMode: p.pricing.loan.repay, months: (n0(p.pricing.loan.years) || 10) * 12, cfg: S.finance })
    : null;

  return {
    q, err, meta, params, layouts, fit, placed, area, count, kwp, ghi, monthly, annual, specYield, monthlyUnits, consumption,
    total, eligible, centerSub, stateSub, subsidy, net, years, payback, loan,
    savings1: years[0]?.savings || 0, savingsLife: cumulative, roi: net > 0 ? ((cumulative - net) / net) * 100 : 0,
    co2Year: (annual * n0(E.co2)) / 1000, co2Life: (sum(years.map((y) => y.gen)) * n0(E.co2)) / 1000,
    offsetPct: consumption > 0 ? (annual / consumption) * 100 : 0,
  };
}
const paybackText = (r) => (r.payback == null ? '—' : `${num(r.payback, 1)} yrs`);
const phaseShort = (ph) => (Q.phaseKey(ph) === '3ph' ? '3Ph' : '1Ph');

/* ---------------- Solar data (NASA POWER) ---------------- */
function ghiCache() { try { return JSON.parse(localStorage.getItem(GHI_KEY)) || {}; } catch (e) { return {}; } }
async function fetchGhi(p, { silent = false, force = false } = {}) {
  const c = siteCenter(p);
  if (!c) { if (!silent) toast('Mark the site on the map first'); return false; }
  const key = `${c[0].toFixed(2)},${c[1].toFixed(2)}`;
  const cache = ghiCache();
  let arr = force ? null : cache[key];
  if (!arr) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${c[1].toFixed(4)}&latitude=${c[0].toFixed(4)}&format=JSON`;
      const j = await (await fetch(url, { signal: ctl.signal })).json();
      clearTimeout(timer);
      const v = j?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
      arr = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => +v?.[m]);
      if (arr.some((x) => !(x > 0 && x < 15))) throw new Error('bad data');
      cache[key] = arr;
      try { localStorage.setItem(GHI_KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ }
    } catch (e) {
      if (!silent) toast('Could not reach NASA solar data. Using typical values.');
      return false;
    }
  }
  p.ghi = arr; p.ghiKey = key; p.ghiSource = `NASA POWER satellite climatology at ${key}`;
  persist(p);
  if (!silent) toast('Site solar data updated');
  return true;
}
function autoGhi(p) {
  const c = siteCenter(p);
  if (c && p.ghiKey !== `${c[0].toFixed(2)},${c[1].toFixed(2)}`) fetchGhi(p, { silent: true }).then((ok) => ok && refreshLive());
}

/* ---------------- Google Sheet log (same as the sales portal) ---------------- */
function logToSheet(p, r) {
  const sh = db.settings.sheet;
  if (!sh?.enabled || !sh.url || !r.q) return;
  const params = new URLSearchParams({
    date: new Date().toLocaleDateString('en-IN'), salesperson: p.salesperson || '', customerName: p.customer.name || '',
    phone: p.customer.phone || '', location: (p.customer.address || '').replace(/\s+/g, ' '), systemSize: r.q.systemSize, panelBrand: r.q.panelBrand,
  });
  const img = new Image();
  img.src = sh.url + '?' + params.toString();
}

/* ---------------- Router ---------------- */
let cur = null, curStep = 1, liveHook = null;
function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const page = parts[0];
  if (cur && !(page === 'edit' && parts[1] === cur.id)) {
    if (isEmptyProposal(cur)) { db.proposals = db.proposals.filter((x) => x.id !== cur.id); save(); }
    stopDrawing();
    cur = null;
  }
  liveHook = null;
  stopPlay();
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (page === 'edit' ? 'new' : page)));
  if (!Q.rates()) { $('#view').innerHTML = `<div class="card empty"><h2>Price list not available</h2><p>Connect to the internet once so the app can download rates.json, then reload.</p><button class="btn primary" onclick="location.reload()">Reload</button></div>`; return; }
  if (page === 'new') { const p = newProposal(); location.replace(`#/edit/${p.id}/1`); return; }
  if (page === 'demo') { const p = demoProposal(); location.replace(`#/edit/${p.id}/${parts[1] || 2}`); return; }
  if (page === 'edit') {
    const p = getProposal(parts[1]);
    if (!p) { location.replace('#/proposals'); return; }
    renderEditor(p, Math.min(4, Math.max(1, +parts[2] || 1)));
  } else if (page === 'proposals') renderProposals();
  else if (page === 'settings') renderSettings();
  else renderDashboard();
  updateChrome();
  window.scrollTo(0, 0);
}
function updateChrome() {
  const S = db.settings;
  $('#brandName').textContent = S.company.name || 'Ellipse Solar';
  $('#whoami').innerHTML = `This device: <b>${esc(S.currentUser || '—')}</b>${isMgr() ? '<span class="pill Won" style="margin-top:6px">Manager mode</span>' : ''}`;
  document.title = `${S.company.name || 'Ellipse Solar'} · Proposals`;
}

/* ---------------- Dashboard ---------------- */
const dashState = { period: 'month', person: '' };
function inPeriod(t, period) {
  const d = new Date(t), now = new Date();
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === 'last') { const l = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === l.getMonth() && d.getFullYear() === l.getFullYear(); }
  if (period === 'quarter') return now - d <= 92 * 864e5;
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return true;
}
function renderDashboard() {
  const S = db.settings;
  const all = db.proposals.filter((p) => !isEmptyProposal(p));
  const list = all.filter((p) => inPeriod(p.createdAt, dashState.period) && (!dashState.person || p.salesperson === dashState.person));
  const rows = list.map((p) => ({ p, r: compute(p) }));
  const by = (st) => rows.filter((x) => x.p.status === st);
  const won = by('Won'), lost = by('Lost');
  const open = rows.filter((x) => OPEN_STATUSES.includes(x.p.status));
  const conv = won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null;
  const people = [...new Set([...S.team, ...all.map((p) => p.salesperson).filter(Boolean)])];
  const statusRows = STATUSES.map((st) => { const xs = by(st); return { st, n: xs.length, kw: sum(xs.map((x) => x.r.kwp)), v: sum(xs.map((x) => x.r.total)) }; });
  const maxN = Math.max(1, ...statusRows.map((s) => s.n));
  const team = people.map((name) => {
    const xs = rows.filter((x) => x.p.salesperson === name);
    const w = xs.filter((x) => x.p.status === 'Won'), l = xs.filter((x) => x.p.status === 'Lost');
    return { name, n: xs.length, kw: sum(xs.map((x) => x.r.kwp)), won: w.length, wonV: sum(w.map((x) => x.r.total)), conv: w.length + l.length ? (w.length / (w.length + l.length)) * 100 : null };
  }).filter((t) => t.n > 0 || S.team.includes(t.name));
  const rateNote = ratesInfo.source === 'live' ? '' : `<div class="callout warn" style="margin-bottom:16px">Using a ${ratesInfo.source === 'saved' ? `saved copy of the price list from ${fmtDate(ratesInfo.at)}` : 'bundled copy of the price list'}: the live price list could not be reached. Prices update automatically when you are back online.</div>`;

  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>Dashboard</h1><p>Pipeline for ${dashState.person ? esc(dashState.person) : 'the whole team'}</p></div>
      <div class="row">
        <select id="dPeriod" style="width:auto">${[['month', 'This month'], ['last', 'Last month'], ['quarter', 'Last 90 days'], ['year', 'This year'], ['all', 'All time']].map(([v, l]) => `<option value="${v}" ${dashState.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="dPerson" style="width:auto"><option value="">Everyone</option>${people.map((n) => `<option ${dashState.person === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <a class="btn accent" href="#/new">+ New proposal</a>
      </div>
    </div>
    ${rateNote}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="kpi"><div class="label">Proposals</div><div class="value">${rows.length}</div><div class="sub">${kw(sum(rows.map((x) => x.r.kwp)))} kWp quoted</div></div>
      <div class="kpi"><div class="label">Open pipeline</div><div class="value">${inr(sum(open.map((x) => x.r.total)))}</div><div class="sub">${open.length} proposals · ${kw(sum(open.map((x) => x.r.kwp)))} kWp</div></div>
      <div class="kpi"><div class="label">Won</div><div class="value">${inr(sum(won.map((x) => x.r.total)))}</div><div class="sub">${won.length} orders · ${kw(sum(won.map((x) => x.r.kwp)))} kWp</div></div>
      <div class="kpi"><div class="label">Conversion</div><div class="value">${conv == null ? '—' : num(conv) + '%'}</div><div class="sub">won ÷ (won + lost)</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h2>By status</h2>
        <table class="tbl"><thead><tr><th>Status</th><th style="width:36%"></th><th class="num">Count</th><th class="num">kWp</th><th class="num">Value</th></tr></thead><tbody>
        ${statusRows.map((s) => `<tr><td><span class="pill ${s.st}">${s.st}</span></td><td><div class="bar"><i style="width:${(s.n / maxN) * 100}%"></i></div></td><td class="num">${s.n}</td><td class="num">${kw(s.kw)}</td><td class="num">${inr(s.v)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="card"><h2>Team performance</h2>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Salesperson</th><th class="num">Proposals</th><th class="num">kWp</th><th class="num">Won</th><th class="num">Won value</th><th class="num">Conv.</th></tr></thead><tbody>
        ${team.length ? team.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${t.n}</td><td class="num">${kw(t.kw)}</td><td class="num">${t.won}</td><td class="num">${inr(t.wonV)}</td><td class="num">${t.conv == null ? '—' : num(t.conv) + '%'}</td></tr>`).join('') : `<tr><td colspan="6" class="muted">No proposals yet</td></tr>`}
        </tbody></table></div>
        <p class="hint">Each phone keeps its own proposals. To see everyone's here, import the backup files your team sends (Settings → Data & backup).</p></div>
    </div>
    <div class="card"><div class="card-head"><h2>Recent proposals</h2><a href="#/proposals" class="btn sm">View all</a></div>
      ${rows.length ? `<div class="plist">${rows.slice(0, 6).map(({ p, r }) => proposalCard(p, r)).join('')}</div>` : `<div class="empty"><h2>No proposals in this period</h2><p>Create one to see it here.</p><a class="btn accent" href="#/new">+ New proposal</a></div>`}
    </div>`;
  $('#dPeriod').onchange = (e) => { dashState.period = e.target.value; renderDashboard(); };
  $('#dPerson').onchange = (e) => { dashState.person = e.target.value; renderDashboard(); };
  bindCardActions($('#view'), renderDashboard);
}

/* ---------------- Proposals list ---------------- */
const listState = { q: '', status: '', person: '' };
function proposalCard(p, r) {
  return `<div class="pcard" data-id="${p.id}">
    <div>
      <div class="title">${esc(p.customer.name || 'Unnamed customer')} <span class="pill ${p.status}">${p.status}</span></div>
      <div class="meta">${esc(p.number || 'Unsaved')} · ${fmtDate(p.createdAt)} · ${esc(p.salesperson || '—')}${p.customer.phone ? ' · ' + esc(p.customer.phone) : ''}</div>
      <div class="figs"><span><b>${kw(r.kwp)}</b> kWp ${r.q ? esc(r.q.brandName) : ''}</span><span><b>${inr(r.total)}</b></span>${r.subsidy ? `<span>after subsidy <b>${inr(r.net)}</b></span>` : ''}<span>Payback <b>${paybackText(r)}</b></span></div>
    </div>
    <div class="actions">
      <select class="status-select" data-act="status" aria-label="Status">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <a class="btn sm" href="#/edit/${p.id}/1">Open</a>
      <button class="btn sm" data-act="pdf">PDF</button>
      <button class="btn sm ghost" data-act="dup">Copy</button>
    </div>
  </div>`;
}
function bindCardActions(root, rerender) {
  $$('.pcard', root).forEach((el) => {
    const p = getProposal(el.dataset.id);
    if (!p) return;
    $('[data-act="status"]', el).onchange = (e) => { p.status = e.target.value; persist(p); toast(`Marked as ${p.status}`); rerender(); };
    $('[data-act="pdf"]', el).onclick = (e) => sharePdf(p, e.currentTarget);
    $('[data-act="dup"]', el).onclick = () => {
      const c = structuredClone(p);
      Object.assign(c, { id: uid(), number: null, createdAt: Date.now(), updatedAt: Date.now(), status: 'Draft' });
      c.customer.name = c.customer.name ? c.customer.name + ' (copy)' : '';
      db.proposals.unshift(c);
      persist(c);
      location.hash = `#/edit/${c.id}/1`;
    };
  });
}
function renderProposals() {
  const S = db.settings;
  const all = db.proposals.filter((p) => !isEmptyProposal(p));
  const people = [...new Set([...S.team, ...all.map((p) => p.salesperson).filter(Boolean)])];
  const q = listState.q.trim().toLowerCase();
  const list = all.filter((p) => (!listState.status || p.status === listState.status) && (!listState.person || p.salesperson === listState.person) &&
    (!q || [p.customer.name, p.customer.phone, p.number, p.customer.address].join(' ').toLowerCase().includes(q)));
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Proposals</h1><p>${all.length} saved on this device</p></div>
      <div class="row"><button class="btn" id="csvBtn">Export CSV</button><a class="btn accent" href="#/new">+ New proposal</a></div></div>
    <div class="filters">
      <input class="search" id="fq" placeholder="Search name, phone, number…" value="${esc(listState.q)}" />
      <select id="fs"><option value="">All statuses</option>${STATUSES.map((s) => `<option ${listState.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="fp"><option value="">Everyone</option>${people.map((n) => `<option ${listState.person === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    </div>
    ${list.length ? `<div class="plist">${list.map((p) => proposalCard(p, compute(p))).join('')}</div>`
      : `<div class="card empty"><h2>${all.length ? 'No matches' : 'No proposals yet'}</h2><p>${all.length ? 'Try a different search or filter.' : 'Create your first proposal: draw the roof, price it, share the PDF.'}</p>${all.length ? '' : '<a class="btn accent" href="#/new">+ New proposal</a>'}</div>`}`;
  $('#fq').oninput = (e) => { listState.q = e.target.value; const pos = e.target.selectionStart; renderProposals(); const f = $('#fq'); f.focus(); f.setSelectionRange(pos, pos); };
  $('#fs').onchange = (e) => { listState.status = e.target.value; renderProposals(); };
  $('#fp').onchange = (e) => { listState.person = e.target.value; renderProposals(); };
  $('#csvBtn').onclick = () => exportCsv(list);
  bindCardActions($('#view'), renderProposals);
}
function exportCsv(list) {
  const head = ['Number', 'Date', 'Customer', 'Phone', 'Category', 'Address', 'Salesperson', 'Status', 'System type', 'Brand', 'DCR', 'Size kW', 'DC kWp', 'Panels', 'Annual units', 'Final amount', 'Subsidy', 'After subsidy', 'Payback yrs'];
  const rows = list.map((p) => {
    const r = compute(p), q = r.q;
    return [p.number, new Date(p.createdAt).toISOString().slice(0, 10), p.customer.name, p.customer.phone, p.customer.category, p.customer.address, p.salesperson, p.status,
      q?.systemTypeName, q?.brandName, q?.panelCategoryLabel, q?.systemSize, r.kwp.toFixed(3), r.count, Math.round(r.annual), r.total, r.subsidy, r.net, r.payback == null ? '' : r.payback.toFixed(1)];
  });
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download(new Blob(['﻿' + csv], { type: 'text/csv' }), `proposals-${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ---------------- Field helpers ---------------- */
function field(label, path, o = {}) {
  const attr = o.settings ? 'data-sbind' : 'data-bind';
  const v = getPath(o.settings ? db.settings : cur, path);
  const extra = `${attr}="${path}" ${o.num ? 'data-num' : ''} ${o.rerender ? 'data-rerender' : ''} ${o.attrs || ''}`;
  let input;
  if (o.options) {
    input = `<select ${extra}>${o.options.map((opt) => { const [val, lab] = Array.isArray(opt) ? opt : [opt, opt]; return `<option value="${esc(val)}" ${String(v ?? '') === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  } else if (o.type === 'textarea') {
    input = `<textarea ${extra} placeholder="${esc(o.ph || '')}">${esc(v)}</textarea>`;
  } else {
    const t = o.type === 'number' ? 'number" inputmode="decimal" step="any' : o.type || 'text';
    input = `<input type="${t}" ${extra} ${o.type === 'number' ? 'data-num' : ''} value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}" />`;
  }
  return `<label class="field ${o.cls || ''}"><span>${label}</span>${input}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</label>`;
}
function readInput(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.hasAttribute('data-bool')) return el.value === 'yes';
  if (el.hasAttribute('data-num')) return el.value === '' ? null : parseFloat(el.value);
  return el.value;
}
const yesNo = (label, path, o = {}) => {
  const v = getPath(cur, path);
  return `<label class="field"><span>${label}</span><select data-bind="${path}" data-bool data-rerender><option value="no" ${!v ? 'selected' : ''}>No</option><option value="yes" ${v ? 'selected' : ''}>Yes</option></select>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</label>`;
};

/* ---------------- Editor ---------------- */
const STEP_NAMES = ['Customer', 'Roof', 'System & price', 'Proposal'];
function renderEditor(p, step) {
  cur = p;
  curStep = step;
  upgradeProposal(p);
  if (step !== 2) stopDrawing();
  $('#view').innerHTML = `
    <div class="page-head">
      <div><h1>${esc(p.customer.name || 'New proposal')}</h1><p>${esc(p.number || 'Not saved yet. Enter the customer name to start.')}${p.number ? ' · ' + fmtDate(p.createdAt) : ''}</p></div>
      <div class="row">
        <select class="status-select" id="edStatus" aria-label="Status">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="btn danger sm" id="edDelete">Delete</button>
      </div>
    </div>
    <div class="steps">${STEP_NAMES.map((n, i) => `<button data-step="${i + 1}" class="${step === i + 1 ? 'active' : ''}"><i>${i + 1}</i>${n}</button>`).join('')}</div>
    <div id="stepBody">${[stepCustomer, stepRoof, stepSystem, stepProposal][step - 1](p)}</div>
    <div class="livebar" id="livebar"></div>`;
  $$('.steps button').forEach((b) => (b.onclick = () => { location.hash = `#/edit/${p.id}/${b.dataset.step}`; }));
  $('#edStatus').onchange = (e) => { p.status = e.target.value; persist(p); toast(`Marked as ${p.status}`); };
  $('#edDelete').onclick = () => {
    if (!confirm(`Delete proposal ${p.number || ''} for ${p.customer.name || 'this customer'}? This cannot be undone.`)) return;
    db.proposals = db.proposals.filter((x) => x.id !== p.id);
    save();
    cur = null;
    location.hash = '#/proposals';
  };
  const body = $('#stepBody');
  body.addEventListener('input', onBind);
  body.addEventListener('change', onBind);
  [afterCustomer, afterRoof, afterSystem, afterProposal][step - 1](p);
  refreshLive();
}
// When a choice changes, clear the dependent choices so they re-default
const RESETS = {
  // switching to manual starts from the automatic layout, so the user only adjusts it
  'design.layoutMode': (p, v) => { selPanel = null; if (v === 'manual' && !p.site.panels.length && p.site.roofs.some((x) => x.points.length >= 3)) { const F = shadeFrame(p); p.site.panels = autoRects(p).rects.map((c) => rectToPanel(c, F)); } },
  'design.systemType': (p, v) => { p.design.inverterTierKey = ''; p.design.kitSku = ''; p.design.battery.on = v !== 'ongrid'; },
  'design.panelBrand': (p) => { p.design.panelWatt = null; p.design.kitSku = ''; p.design.panelCount = null; p.design.systemKw = Q.isKitBrand(p.design.panelBrand) ? null : p.design.systemKw; },
  'design.panelCategory': (p) => { p.design.panelCount = null; p.design.kitSku = ''; p.design.dcrKw = null; },
  'design.panelType': (p) => { p.design.panelWatt = null; p.design.panelCount = null; },
  'design.panelWatt': (p) => { p.design.panelCount = null; },
  'design.systemKw': (p) => { p.design.panelCount = null; p.design.inverterTierKey = ''; p.design.kitSku = ''; p.design.dcrKw = null; },
  'design.phase': (p) => { p.design.inverterTierKey = ''; p.design.kitSku = ''; },
  'design.inverterBrand': (p) => { p.design.inverterTierKey = ''; },
  'design.battery.chemistry': (p) => { p.design.battery.brand = ''; p.design.battery.option = ''; },
  'design.battery.brand': (p) => { p.design.battery.option = ''; },
  'design.battery.invBrand': (p) => { p.design.battery.invOption = ''; },
};
function onBind(e) {
  const el = e.target;
  const path = el.getAttribute('data-bind');
  if (!path || !cur) return;
  if (e.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox')) return;
  const v = readInput(el);
  setPath(cur, path, v);
  if (RESETS[path] && e.type === 'change') RESETS[path](cur, v);
  persist(cur);
  if (path === 'customer.name') {
    $('.page-head h1').textContent = cur.customer.name || 'New proposal';
    if (cur.number) $('.page-head p').textContent = `${cur.number} · ${fmtDate(cur.createdAt)}`;
  }
  if (el.hasAttribute('data-rerender') && e.type === 'change') { const y = window.scrollY; renderEditor(cur, curStep); window.scrollTo(0, y); return; }
  if (el.hasAttribute('data-shade')) { drawRoofs(); return; }
  if (el.hasAttribute('data-relayout')) { drawRoofs(); renderRoofList(); }
  refreshLive();
}
function refreshLive() {
  if (!cur) return;
  const r = compute(cur);
  const lb = $('#livebar');
  if (lb) {
    lb.innerHTML = `
      ${curStep > 1 ? `<button class="btn sm" id="lbBack" aria-label="Back">‹</button>` : ''}
      <div class="figs">
        <div><span>System</span><b>${r.q ? kw(r.q.systemSize) + ' kW' : '—'}</b></div>
        <div class="hide-sm"><span>Panels</span><b>${r.count}</b></div>
        <div><span>Final</span><b>${inr(r.total)}</b></div>
        <div class="hide-sm"><span>After subsidy</span><b>${inr(r.net)}</b></div>
      </div>
      ${curStep < 4 ? `<button class="btn accent" id="lbNext">Next: ${STEP_NAMES[curStep]} ›</button>` : `<button class="btn accent" id="lbShare">Share PDF</button>`}`;
    const go = (s) => { location.hash = `#/edit/${cur.id}/${s}`; };
    if ($('#lbBack')) $('#lbBack').onclick = () => go(curStep - 1);
    if ($('#lbNext')) $('#lbNext').onclick = () => {
      if (curStep === 1 && !cur.customer.name.trim()) { toast('Enter the customer name first'); $('[data-bind="customer.name"]')?.focus(); return; }
      go(curStep + 1);
    };
    if ($('#lbShare')) $('#lbShare').onclick = (e) => sharePdf(cur, e.currentTarget);
  }
  if (liveHook) liveHook(r);
}

/* ---- Step 1: customer ---- */
function stepCustomer(p) {
  const team = [...new Set([...db.settings.team, p.salesperson].filter(Boolean))];
  return `<div class="card">
    <h2>Customer details</h2>
    <div class="grid grid-2">
      ${field('Customer name *', 'customer.name', { ph: 'e.g. Ramesh Kumar', attrs: 'autocomplete="off"' })}
      ${field('WhatsApp / mobile number', 'customer.phone', { type: 'tel', ph: '98xxxxxxxx' })}
      ${field('Site address', 'customer.address', { type: 'textarea', ph: 'House no, street, area, city' })}
      <div class="grid">
        ${field('Email', 'customer.email', { type: 'email', ph: 'optional' })}
        ${field('Customer type', 'customer.category', { options: CATEGORIES, rerender: true, hint: 'PM Surya Ghar subsidy applies to residential only.' })}
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Bill-based recommendation</h2>
    <div class="grid grid-3">
      ${field('Average monthly bill (₹)', 'customer.monthlyBill', { type: 'number', ph: 'e.g. 3500' })}
      <label class="field"><span>State govt. free 100 units?</span><select data-bind="customer.freeUnits" data-bool><option value="no" ${!p.customer.freeUnits ? 'selected' : ''}>No, not getting free units</option><option value="yes" ${p.customer.freeUnits ? 'selected' : ''}>Yes, getting 100 free units</option></select></label>
      ${field('Or monthly units (kWh)', 'customer.monthlyUnits', { type: 'number', ph: 'overrides bill', hint: 'Units from the bill are the most accurate.' })}
    </div>
    <div id="recBox" style="margin-top:14px"></div>
  </div>
  <div class="card">
    <div class="grid grid-2">
      ${field('Salesperson', 'salesperson', { options: team })}
      ${field('Sanctioned load (kW)', 'customer.load', { type: 'number', ph: 'from the bill' })}
    </div>
    <div style="margin-top:14px">${field('Internal notes (not printed)', 'customer.notes', { type: 'textarea', ph: 'Site visit notes, follow-up date, decision maker…' })}</div>
  </div>`;
}
function afterCustomer() {
  liveHook = (r) => {
    const box = $('#recBox');
    if (!box) return;
    const rec = r.meta.recKw;
    if (rec > 0) {
      const loadNote = n0(cur.customer.load) > 0 && rec > n0(cur.customer.load) ? ` This is above the sanctioned load of ${kw(cur.customer.load)} kW; a load increase may be needed.` : '';
      box.innerHTML = `<div class="callout ok">Monthly consumption <b>${num(r.monthlyUnits)} units</b> (${num(r.monthlyUnits / 30, 1)} units/day). Recommended system: <b>${rec} kW</b>.${loadNote}</div>`;
    } else box.innerHTML = `<div class="callout">Enter the monthly bill (JVVNL domestic tariff) or units to get a recommended size.</div>`;
  };
}

/* ---- Step 2: roof ---- */
let map = null, roofLayer = null, mapHost = null, drawing = null;
function stepRoof(p) {
  const L = db.settings.layout;
  return `<div class="card">
    <div class="card-head">
      <div><h2>Roof & panel layout</h2><p class="hint">Find the building, then trace each roof by tapping its corners. Panels are placed automatically.</p></div>
      <div class="seg"><button data-mode="map" class="${p.design.mode === 'map' ? 'on' : ''}">Draw on map</button><button data-mode="manual" class="${p.design.mode === 'manual' ? 'on' : ''}">Skip map</button></div>
    </div>
    ${p.design.mode === 'map' ? `
      <div id="mapSlot"></div>
      <div id="shadeCard" class="shade-card"></div>
      <div class="grid grid-2" style="margin-top:14px">
        ${field('Panel layout', 'design.layoutMode', { options: [['auto', 'Automatic (fill the roof)'], ['manual', 'Manual (tap, drag & arrange panels)']], rerender: true, hint: p.design.layoutMode === 'manual' ? 'Tap the roof to add a panel. Hold and drag to move; it snaps in line with nearby panels and cannot overlap them. Tap a panel to rotate or delete it.' : 'Panels are 8 ft × 4 ft. Switch to Manual to arrange them yourself.' })}
        ${field('Mounting (for panel spacing)', 'design.mount', { options: Object.entries(MOUNTS), attrs: 'data-relayout', hint: `Auto layout: edge setback ${L.setback} m · row gap ${L.rowGapElevated} m elevated / ${L.rowGapFlat} m low.` })}
      </div>
      <div id="roofCap" style="margin-top:12px"></div>
      <div id="roofList" style="margin-top:4px"></div>`
    : `<p class="hint">No roof drawing. The system size comes from the bill recommendation or your choice in the next step. Drawing the roof checks that the panels fit and adds the layout image to the PDF.</p>`}
  </div>`;
}
function afterRoof(p) {
  $$('[data-mode]').forEach((b) => (b.onclick = () => { p.design.mode = b.dataset.mode; persist(p); renderEditor(p, 2); }));
  if (p.design.mode !== 'map') return;
  mountMap(p);
  renderRoofList();
  renderShadeCard();
  drawShadows();
  liveHook = (r) => {
    const box = $('#roofCap');
    if (!box) return;
    if (!r.fit) { box.innerHTML = ''; return; }
    const fitKw = (r.fit * r.meta.watt) / 1000;
    if (cur.design.layoutMode === 'manual') {
      const placed = cur.site.panels.length;
      box.innerHTML = placed === r.count
        ? `<div class="callout ok">All <b>${r.count} panels</b> for the ${kw(r.q?.systemSize || 0)} kW system are placed (${r.meta.watt} W each, drawn 8 ft × 4 ft).</div>`
        : `<div class="callout warn">${placed < r.count ? `Place <b>${r.count - placed} more</b>` : `Remove <b>${placed - r.count}</b>`}: the ${kw(r.q?.systemSize || 0)} kW system needs <b>${r.count} panels</b> of ${r.meta.watt} W. ${placed} placed so far.</div>`;
      return;
    }
    box.innerHTML = r.count > r.fit
      ? `<div class="callout warn">The roof fits <b>${r.fit} panels (${kw(fitKw)} kWp)</b> but the quote needs <b>${r.count}</b>. Add another roof, try landscape, or pick a smaller size in the next step.</div>`
      : `<div class="callout ok">The roof fits up to <b>${r.fit} panels (${kw(fitKw)} kWp)</b> of ${r.meta.watt} W. The quote uses <b>${r.count}</b>.</div>`;
  };
}
function ensureMapHost() {
  if (mapHost) return mapHost;
  mapHost = document.createElement('div');
  mapHost.id = 'mapHost';
  mapHost.innerHTML = `
    <div id="map"></div>
    <div class="map-tools">
      <input id="mapSearch" placeholder="Search address, area or landmark" enterkeyhint="search" />
      <button class="btn" id="mapSearchBtn">Search</button>
      <button class="btn" id="gpsBtn" title="Go to my location" aria-label="Go to my location"><svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.06A7 7 0 0 0 13 5.06V3h-2v2.06A7 7 0 0 0 5.06 11H3v2h2.06A7 7 0 0 0 11 18.94V21h2v-2.06A7 7 0 0 0 18.94 13H21zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg></button>
    </div>
    <div class="map-results" id="mapResults" hidden></div>
    <div class="draw-hint" id="drawHint" hidden><span id="drawHintText"></span><button class="btn sm" id="undoPt">Undo</button><button class="btn sm accent" id="finishRoof">Finish</button></div>
    <div class="sun-dial" id="sunDial" hidden></div>
    <div class="shade-bar" id="shadeBar" hidden></div>
    <div class="panel-bar" id="panelBar" hidden></div>`;
  return mapHost;
}
function mountMap(p) {
  const host = ensureMapHost();
  $('#mapSlot').appendChild(host);
  if (!map) {
    map = L.map($('#map', host), { zoomControl: true, maxZoom: 21 });
    const sat = L.tileLayer(ESRI_TILES, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).addTo(map);
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap contributors' });
    L.control.layers({ Satellite: sat, Streets: osm }, null, { position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    roofLayer = L.layerGroup().addTo(map);
    map.createPane('shadePane').style.zIndex = 450; // shadows above roofs and panels, below markers and labels
    map.getPane('shadePane').style.pointerEvents = 'none';
    shadowLayer = L.layerGroup().addTo(map);
    panelLayer = L.layerGroup().addTo(map);
    map.on('zoomend', () => { if (cur && cur.design.layoutMode === 'manual') drawManualPanels(compute(cur)); });
    map.on('click', onMapClick);
    map.on('moveend', () => { if (!cur) return; const c = map.getCenter(); cur.site.center = [c.lat, c.lng]; cur.site.zoom = map.getZoom(); save(); });
    $('#mapSearchBtn', host).onclick = doSearch;
    $('#mapSearch', host).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
    $('#gpsBtn', host).onclick = () => {
      if (!navigator.geolocation) return toast('Location not available on this device');
      toast('Finding your location…');
      navigator.geolocation.getCurrentPosition((pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 19), () => toast('Could not get location. Allow location access and try again.'), { enableHighAccuracy: true, timeout: 15000 });
    };
    $('#undoPt', host).onclick = (e) => { L.DomEvent.stop(e); if (!drawing) return; drawing.points.pop(); updateDrawHint(); drawRoofs(); };
    $('#finishRoof', host).onclick = (e) => { L.DomEvent.stop(e); finishDrawing(); };
    ['.map-tools', '#drawHint', '#mapResults', '#sunDial', '#shadeBar', '#panelBar'].forEach((s) => { L.DomEvent.disableClickPropagation($(s, host)); L.DomEvent.disableScrollPropagation($(s, host)); });
  }
  $('#mapSearch', host).value = '';
  $('#mapResults', host).hidden = true;
  const pts = p.site.roofs.flatMap((r) => r.points);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { maxZoom: 21, padding: [40, 40] });
  else if (p.site.center) map.setView(p.site.center, p.site.zoom || 18);
  else { map.setView([26.9124, 75.7873], 12); if (p.customer.address) $('#mapSearch', host).value = p.customer.address.replace(/\s+/g, ' ').trim(); }
  setTimeout(() => map.invalidateSize(), 60);
  drawRoofs();
}
async function doSearch() {
  const q = $('#mapSearch').value.trim();
  const box = $('#mapResults');
  if (!q) return;
  box.hidden = false;
  box.innerHTML = `<div style="padding:12px" class="muted small"><span class="spin"></span> Searching…</div>`;
  try {
    const list = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } })).json();
    if (!list.length) { box.innerHTML = `<div style="padding:12px" class="small">No results. Try a shorter address (area + city), or pan the map by hand.</div>`; return; }
    box.innerHTML = list.map((x, i) => `<button data-i="${i}">${esc(x.display_name)}</button>`).join('');
    $$('button', box).forEach((b) => (b.onclick = () => { const x = list[+b.dataset.i]; map.setView([+x.lat, +x.lon], x.class === 'building' || x.type === 'house' ? 20 : 18); box.hidden = true; }));
  } catch (e) { box.innerHTML = `<div style="padding:12px" class="small">Search unavailable right now. Pan and zoom the map by hand.</div>`; }
}
function startDrawing(kind = 'roof') {
  stopPlay();
  let item;
  if (kind === 'obstacle') {
    item = { id: uid(), kind: 'obstacle', name: `Obstacle ${cur.site.obstacles.length + 1}`, points: [], height: 2 };
    cur.site.obstacles.push(item);
  } else {
    item = { id: uid(), name: `Roof ${cur.site.roofs.length + 1}`, points: [], orientation: 'portrait' };
    cur.site.roofs.push(item);
  }
  drawing = item;
  updateDrawHint();
  renderRoofList();
  if (map.getZoom() < 17) toast('Zoom in to the building first for accurate corners');
}
function stopDrawing() {
  if (drawing && cur) {
    if (drawing.points.length < 3) {
      cur.site.roofs = cur.site.roofs.filter((r) => r !== drawing);
      cur.site.obstacles = (cur.site.obstacles || []).filter((r) => r !== drawing);
    }
    persist(cur);
  }
  drawing = null;
  if (mapHost) $('#drawHint', mapHost).hidden = true;
}
function finishDrawing() {
  if (!drawing) return;
  if (drawing.points.length < 3) { toast('A roof needs at least 3 corners'); return; }
  stopDrawing(); drawRoofs(); renderRoofList(); refreshLive(); autoGhi(cur);
}
function updateDrawHint() {
  const h = $('#drawHint', mapHost);
  if (!drawing) { h.hidden = true; return; }
  h.hidden = false;
  const n = drawing.points.length;
  const what = drawing.kind === 'obstacle' ? 'the obstacle (tank, mumty, tree, building)' : 'the roof';
  $('#drawHintText', mapHost).textContent = n < 3 ? `Tap corner ${n + 1} of ${what}` : `${n} corners. Tap more or Finish`;
  $('#undoPt', mapHost).disabled = n === 0;
}
function onMapClick(e) {
  $('#mapResults').hidden = true;
  if (!drawing) {
    if (cur && cur.design.mode === 'map' && cur.design.layoutMode === 'manual') {
      if (selPanel) { selPanel = null; drawRoofs(); return; } // first tap just deselects
      addPanelAt(e.latlng);
    }
    return;
  }
  drawing.points.push([e.latlng.lat, e.latlng.lng]);
  updateDrawHint();
  drawRoofs();
}
function drawRoofs() {
  if (!map || !cur || !roofLayer) return;
  roofLayer.clearLayers();
  const r = compute(cur);
  const manual = cur.design.layoutMode === 'manual';
  cur.site.roofs.forEach((roof, i) => {
    const pts = roof.points;
    let shape = null;
    if (pts.length >= 3) shape = L.polygon(pts, { color: '#E8621F', weight: 2.5, fillOpacity: 0.12, interactive: false }).addTo(roofLayer);
    else if (pts.length === 2) shape = L.polyline(pts, { color: '#E8621F', weight: 2.5, dashArray: '6 6', interactive: false }).addTo(roofLayer);
    const lay = r.layouts[i];
    if (lay && roof !== drawing && !manual) lay.rects.forEach((c) => L.polygon(c, { color: '#bfdbfe', weight: 0.7, fillColor: '#1e3a8a', fillOpacity: 0.88, interactive: false }).addTo(roofLayer));
    if (pts.length >= 3 && roof !== drawing) L.tooltip({ permanent: true, direction: 'center', className: 'roof-label', interactive: false }).setLatLng(roofCentroid(pts)).setContent(`${esc(roof.name)} · ${lay ? lay.count : 0}/${lay ? lay.fit : 0} panels`).addTo(roofLayer);
    addVertices(roof, shape);
  });
  (cur.site.obstacles || []).forEach((ob) => {
    const pts = ob.points;
    let shape = null;
    if (pts.length >= 3) shape = L.polygon(pts, { color: '#475569', weight: 2, dashArray: '5 4', fillColor: '#64748b', fillOpacity: 0.45, interactive: false }).addTo(roofLayer);
    else if (pts.length === 2) shape = L.polyline(pts, { color: '#475569', weight: 2, dashArray: '5 4', interactive: false }).addTo(roofLayer);
    if (pts.length >= 3 && ob !== drawing) L.tooltip({ permanent: true, direction: 'center', className: 'roof-label obs-label', interactive: false }).setLatLng(roofCentroid(pts)).setContent(`${esc(ob.name)} · ${num(n0(ob.height), 1)} m`).addTo(roofLayer);
    addVertices(ob, shape);
  });
  drawManualPanels(r);
  drawShadows();
}

/* ---- Manual panels on the map: tap to add, hold & drag to move, snap, no overlap ---- */
let panelLayer = null, selPanel = null;
const panelMarkers = {};
function drawManualPanels(r) {
  if (!panelLayer) return;
  panelLayer.clearLayers();
  Object.keys(panelMarkers).forEach((k) => delete panelMarkers[k]);
  const on = cur && cur.design.mode === 'map' && cur.design.layoutMode === 'manual' && cur.site.roofs.some((x) => x.points.length >= 3);
  renderPanelBar(r, on);
  if (!on) return;
  const F = shadeFrame(cur), G = siteGeom(cur, F);
  const z = map.getZoom();
  cur.site.panels.forEach((pn) => {
    const mpp = (40075016.686 * Math.cos(pn.lat * DEG)) / 2 ** (z + 8);
    const [su, sv] = pnSize(pn);
    const w = su / mpp, h = sv / mpp, box = Math.ceil(Math.hypot(w, h)) + 4;
    const icon = L.divIcon({
      className: 'pn-icon', iconSize: [box, box],
      html: `<div class="pn ${selPanel === pn.id ? 'sel' : ''}" style="width:${w}px;height:${h}px;transform:translate(-50%,-50%) rotate(${-pn.angle}rad)"></div>`,
    });
    const m = L.marker([pn.lat, pn.lng], { icon, draggable: true, keyboard: false, autoPan: true, zIndexOffset: selPanel === pn.id ? 1000 : 0 }).addTo(panelLayer);
    panelMarkers[pn.id] = m;
    let last = { lat: pn.lat, lng: pn.lng };
    m.on('dragstart', () => { stopPlay(); selPanel = pn.id; m.getElement()?.querySelector('.pn')?.classList.add('sel', 'moving'); });
    m.on('drag', (e) => {
      const ll = e.target.getLatLng();
      const others = cur.site.panels.filter((x) => x !== pn).map((x) => pnLocal(x, F));
      const [x, y] = F.to([ll.lat, ll.lng]);
      const o = { ...pnLocal(pn, F), x, y };
      const snapped = snapPanel(o, others);
      let ok = null, didSnap = false;
      if (snapped && panelFits(snapped, others, G)) { ok = snapped; didSnap = true; }
      else if (panelFits(o, others, G)) ok = o;
      const el = m.getElement()?.querySelector('.pn');
      if (ok) {
        const [la, lo] = F.back([ok.x, ok.y]);
        pn.lat = la; pn.lng = lo; pn.angle = ok.a;
        last = { lat: la, lng: lo };
        if (el) { el.classList.toggle('snapped', didSnap); el.classList.remove('blocked'); el.style.transform = `translate(-50%,-50%) rotate(${-pn.angle}rad)`; }
      } else if (el) el.classList.add('blocked');
      m.setLatLng([last.lat, last.lng]);
    });
    // redraw after Leaflet has finished its own drag/click handling of this marker
    m.on('dragend', () => { persist(cur); setTimeout(() => { drawRoofs(); refreshLive(); }, 0); });
    m.on('click', () => { selPanel = selPanel === pn.id ? null : pn.id; setTimeout(drawRoofs, 0); });
  });
}
function renderPanelBar(r, on) {
  const bar = mapHost && $('#panelBar', mapHost);
  if (!bar) return;
  bar.hidden = !on || !!drawing;
  if (!on) return;
  const placed = cur.site.panels.length, need = r.count;
  const sel = cur.site.panels.find((x) => x.id === selPanel);
  const status = placed < need ? `<b>${placed} / ${need}</b> panels placed · tap the roof to add`
    : placed > need ? `<b style="color:var(--bad)">${placed} / ${need}</b> · remove ${placed - need} extra`
    : `<b style="color:var(--ok)">${placed} / ${need}</b> panels placed ✓`;
  bar.innerHTML = `<span class="pb-status">${status}</span>
    ${sel ? `<button class="btn sm" data-pb="rotate">Rotate 90°</button><button class="btn sm danger" data-pb="delete">Delete</button>`
      : `${placed < need ? '<button class="btn sm" data-pb="fill">Auto-place rest</button>' : ''}${placed ? '<button class="btn sm ghost" data-pb="clear">Clear all</button>' : ''}`}`;
  $$('[data-pb]', bar).forEach((b) => (b.onclick = (e) => {
    L.DomEvent.stop(e);
    const act = b.dataset.pb;
    if (act === 'delete') { cur.site.panels = cur.site.panels.filter((x) => x !== sel); selPanel = null; }
    if (act === 'rotate') {
      const F = shadeFrame(cur), G = siteGeom(cur, F);
      const turned = { ...sel, landscape: !sel.landscape };
      const others = cur.site.panels.filter((x) => x !== sel).map((x) => pnLocal(x, F));
      if (panelFits(pnLocal(turned, F), others, G)) sel.landscape = !sel.landscape;
      else toast('No room to rotate here. Move the panel first.');
    }
    if (act === 'fill') { const n = autoPlaceRest(cur); toast(n ? `Placed ${n} more panel${n > 1 ? 's' : ''}` : 'No free space found for more panels'); }
    if (act === 'clear') { if (!confirm('Remove all placed panels?')) return; cur.site.panels = []; selPanel = null; }
    persist(cur); drawRoofs(); refreshLive();
  }));
}
function addPanelAt(latlng) {
  const r = compute(cur);
  if (cur.site.panels.length >= r.count) { toast(`All ${r.count} panels are placed. Increase the system capacity to add more.`); return; }
  const F = shadeFrame(cur), G = siteGeom(cur, F);
  const [x, y] = F.to([latlng.lat, latlng.lng]);
  const roofI = G.roofs.findIndex((poly) => inPoly([x, y], poly));
  if (roofI < 0) { toast('Tap inside a roof to place a panel'); return; }
  const others = cur.site.panels.map((pn) => pnLocal(pn, F));
  // new panels follow the nearest placed panel's direction, else the roof's longest edge
  let near = null, nd = Infinity;
  cur.site.panels.forEach((pn) => { const o = pnLocal(pn, F), dd = Math.hypot(o.x - x, o.y - y); if (dd < nd) { nd = dd; near = pn; } });
  const pn = { id: uid(), lat: latlng.lat, lng: latlng.lng, angle: near ? near.angle : longestEdgeAngle(G.roofs[roofI]), landscape: near ? near.landscape : false };
  const o = pnLocal(pn, F);
  const snapped = snapPanel(o, others);
  const pick = snapped && panelFits(snapped, others, G) ? snapped : panelFits(o, others, G) ? o : null;
  if (!pick) { toast('No room for a panel here (roof edge, obstacle or another panel)'); return; }
  [pn.lat, pn.lng] = F.back([pick.x, pick.y]);
  pn.angle = pick.a;
  cur.site.panels.push(pn);
  persist(cur); drawRoofs(); refreshLive();
}
function addVertices(item, shape) {
  item.points.forEach((ll, j) => {
    const m = L.marker(ll, { draggable: true, icon: L.divIcon({ className: item.kind === 'obstacle' ? 'vtx vtx-obs' : 'vtx', iconSize: [18, 18] }), keyboard: false }).addTo(roofLayer);
    m.on('drag', (ev) => { const q = ev.target.getLatLng(); item.points[j] = [q.lat, q.lng]; if (shape) shape.setLatLngs(item.points); });
    m.on('dragend', () => { persist(cur); drawRoofs(); renderRoofList(); refreshLive(); });
  });
}
function renderRoofList() {
  const box = $('#roofList');
  if (!box || !cur) return;
  const r = compute(cur);
  const roofs = cur.site.roofs;
  box.innerHTML = `
    <div class="card-head" style="margin:8px 0 0"><h3>Roofs (${roofs.filter((x) => x.points.length >= 3).length})</h3>
      <button class="btn ${roofs.length ? '' : 'accent'}" id="addRoof" ${drawing ? 'disabled' : ''}>+ ${roofs.length ? 'Add another roof' : 'Draw roof'}</button></div>
    ${roofs.length ? roofs.map((roof, i) => {
      const lay = r.layouts[i] || { area: 0, count: 0, fit: 0 };
      return `<div class="roof-item" data-rid="${roof.id}">
        <div><b>${esc(roof.name)}</b>${roof === drawing ? ' <span class="pill Negotiation">drawing…</span>' : ''}
          <div class="small muted">${num(lay.area)} m² (${num(lay.area * 10.7639)} sq ft) · fits ${lay.fit} panels · using ${lay.count}</div></div>
        <div class="ctrls">
          <select data-orient aria-label="Panel orientation"><option value="portrait" ${roof.orientation !== 'landscape' ? 'selected' : ''}>Portrait</option><option value="landscape" ${roof.orientation === 'landscape' ? 'selected' : ''}>Landscape</option></select>
          <button class="btn sm" data-zoom ${roof.points.length ? '' : 'disabled'}>Zoom</button>
          <button class="btn sm danger" data-del>Delete</button>
        </div></div>`;
    }).join('') : `<p class="hint">No roof yet. Search the address above, zoom in until the building fills the map, then tap <b>Draw roof</b>.</p>`}
    ${roofs.some((x) => x.points.length >= 3) ? `
    <div class="card-head" style="margin:18px 0 0"><div><h3>Shadow-casting obstacles (${cur.site.obstacles.filter((x) => x.points.length >= 3).length})</h3>
      <p class="hint">Water tank, mumty / staircase room, taller neighbouring building, tree. Panels are kept off them, and their shadows are shown below.</p></div>
      <button class="btn" id="addObs" ${drawing ? 'disabled' : ''}>+ Add obstacle</button></div>
    ${cur.site.obstacles.map((ob, i) => `<div class="roof-item" data-oid="${ob.id}">
        <div class="obs-fields"><input data-bind="site.obstacles.${i}.name" data-shade value="${esc(ob.name)}" aria-label="Obstacle name" />
          <label class="obs-h"><input type="number" inputmode="decimal" step="any" data-num data-bind="site.obstacles.${i}.height" data-shade value="${esc(ob.height)}" aria-label="Height above roof" /> m above roof</label>
          ${ob === drawing ? '<span class="pill Negotiation">drawing…</span>' : ''}</div>
        <div class="ctrls"><button class="btn sm danger" data-del-obs>Delete</button></div></div>`).join('')}
    <div style="max-width:260px;margin-top:10px">${field('Parapet wall height (m)', 'design.parapet', { type: 'number', attrs: 'data-shade', hint: 'Shadow of the roof\'s own boundary wall. 0 if none.' })}</div>` : ''}`;
  $('#addRoof', box).onclick = () => startDrawing('roof');
  if ($('#addObs', box)) $('#addObs', box).onclick = () => startDrawing('obstacle');
  const sc = $('#shadeCard'), hasRoof = roofs.some((x) => x.points.length >= 3);
  if (sc && hasRoof !== !!sc.innerHTML.trim()) { renderShadeCard(); drawShadows(); }
  $$('[data-oid]', box).forEach((el) => {
    const ob = cur.site.obstacles.find((x) => x.id === el.dataset.oid);
    $('[data-del-obs]', el).onclick = () => {
      if (drawing === ob) drawing = null;
      cur.site.obstacles = cur.site.obstacles.filter((x) => x !== ob);
      updateDrawHint(); persist(cur); drawRoofs(); renderRoofList(); refreshLive();
    };
  });
  $$('.roof-item[data-rid]', box).forEach((el) => {
    const roof = cur.site.roofs.find((x) => x.id === el.dataset.rid);
    $('[data-orient]', el).onchange = (e) => { roof.orientation = e.target.value; persist(cur); drawRoofs(); renderRoofList(); refreshLive(); };
    $('[data-zoom]', el).onclick = () => map.fitBounds(L.latLngBounds(roof.points), { maxZoom: 21, padding: [40, 40] });
    $('[data-del]', el).onclick = () => {
      if (roof.points.length >= 3 && !confirm(`Delete ${roof.name}?`)) return;
      if (drawing === roof) drawing = null;
      cur.site.roofs = cur.site.roofs.filter((x) => x !== roof);
      updateDrawHint(); persist(cur); drawRoofs(); renderRoofList(); refreshLive();
    };
  });
}

/* ---------------- Sun path & shadow analysis (2D, on the map) ---------------- */
const DEG = Math.PI / 180;
const DOY21 = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];
const SHADE_HOURS = Array.from({ length: 27 }, (_, i) => 6 + i * 0.5); // 6:00 … 19:00
// Sun elevation/azimuth on the 21st of a month at an IST clock time
function sunAt(lat, lon, month, hourIST) {
  const n = DOY21[month];
  const decl = 23.45 * Math.sin((2 * Math.PI * (284 + n)) / 365) * DEG;
  const B = (2 * Math.PI * (n - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const solar = hourIST + ((lon - 82.5) * 4 + eot) / 60;
  const H = 15 * (solar - 12) * DEG, phi = lat * DEG;
  const el = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI + 2 * Math.PI) % (2 * Math.PI);
  return { el, az };
}
const compassDir = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / DEG / 45) % 8];
const fmtHour = (h) => { const hh = Math.floor(h + 1e-6), mm = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; };
function hull(points) {
  const P = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function shadeFrame(p) {
  const [lat0, lon0] = siteCenter(p);
  const kx = 111320 * Math.cos(lat0 * DEG), ky = 111320;
  return { lat0, lon0, to: ([la, lo]) => [(lo - lon0) * kx, (la - lat0) * ky], back: ([x, y]) => [lat0 + y / ky, lon0 + x / kx] };
}
// Shadow polygons (local metres) cast on the roof plane by obstacles and the parapet
function shadowPolys(p, F, s) {
  if (s.el <= 0.02) return null;
  const k = 1 / Math.tan(s.el);
  const dx = -Math.sin(s.az) * k, dy = -Math.cos(s.az) * k; // shadow offset per metre of height
  const out = [];
  (p.site.obstacles || []).forEach((o) => {
    const h = n0(o.height);
    if (o.points.length < 3 || h <= 0) return;
    const pts = o.points.map(F.to);
    out.push(hull([...pts, ...pts.map(([x, y]) => [x + dx * h, y + dy * h])]));
  });
  const ph = n0(p.design.parapet);
  if (ph > 0) p.site.roofs.filter((r) => r.points.length >= 3).forEach((r) => {
    const pts = r.points.map(F.to);
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const mid = [(a[0] + b[0]) / 2 + dx * ph * 0.5, (a[1] + b[1]) / 2 + dy * ph * 0.5];
      if (inPoly(mid, pts)) out.push([a, b, [b[0] + dx * ph, b[1] + dy * ph], [a[0] + dx * ph, a[1] + dy * ph]]);
    });
  });
  return out;
}
const sampleMemo = new Map();
// Grid of points over the usable roof (obstacle footprints excluded)
function roofSamples(p, F) {
  const key = JSON.stringify([p.site.roofs.map((r) => r.points), (p.site.obstacles || []).map((o) => o.points)]);
  if (sampleMemo.has(key)) return sampleMemo.get(key);
  const roofs = p.site.roofs.filter((r) => r.points.length >= 3).map((r) => r.points.map(F.to));
  const obs = (p.site.obstacles || []).filter((o) => o.points.length >= 3).map((o) => o.points.map(F.to));
  const area = sum(roofs.map(polyArea));
  const step = Math.max(0.4, Math.sqrt(area / 700));
  const pts = [];
  roofs.forEach((poly) => {
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step)
        if (inPoly([x, y], poly) && !obs.some((o) => inPoly([x, y], o))) pts.push([x, y]);
  });
  const res = { pts, step };
  if (sampleMemo.size > 20) sampleMemo.clear();
  sampleMemo.set(key, res);
  return res;
}
const shadedShare = (pts, polys) => (pts.length ? pts.filter((q) => polys.some((sp) => inPoly(q, sp))).length / pts.length : 0);
function dayProfile(p, F, month) {
  const S = roofSamples(p, F);
  return SHADE_HOURS.map((h) => {
    const s = sunAt(F.lat0, F.lon0, month, h);
    const polys = shadowPolys(p, F, s);
    return { h, el: s.el, sunlit: polys ? 1 - shadedShare(S.pts, polys) : null };
  });
}
// Share of the year's sunshine (weighted by sun height) each roof point loses to shade
function yearShade(p, F) {
  const S = roofSamples(p, F);
  const shadedW = new Float64Array(S.pts.length);
  let totalW = 0;
  for (let m = 0; m < 12; m++) for (const h of SHADE_HOURS) {
    const s = sunAt(F.lat0, F.lon0, m, h);
    if (s.el <= 0.05) continue;
    const w = Math.sin(s.el);
    totalW += w;
    const polys = shadowPolys(p, F, s);
    S.pts.forEach((q, i) => { if (polys.some((sp) => inPoly(q, sp))) shadedW[i] += w; });
  }
  return { S, loss: Array.from(shadedW, (v) => (totalW ? v / totalW : 0)) };
}

const shade = { month: new Date().getMonth(), hour: 9, timer: null, yearMap: false };
let shadowLayer = null;
function stopPlay() {
  if (shade.timer) { clearInterval(shade.timer); shade.timer = null; }
  const b = $('#shadePlay');
  if (b) b.textContent = '▶ Play';
}
function renderShadeCard() {
  const box = $('#shadeCard');
  if (!box || !cur) return;
  if (!cur.site.roofs.some((r) => r.points.length >= 3)) { box.innerHTML = ''; return; }
  const bar = mapHost && $('#shadeBar', mapHost);
  if (bar) bar.innerHTML = `
    <div class="shade-ctrl">
      <button class="btn sm accent" id="shadePlay">${shade.timer ? '❚❚ Pause' : '▶ Play'}</button>
      <select id="shadeMonth" aria-label="Date">${MONTHS.map((m, i) => `<option value="${i}" ${i === shade.month ? 'selected' : ''}>21 ${m}</option>`).join('')}</select>
      <b id="shadeTime" class="shade-time">${fmtHour(shade.hour)}</b>
    </div>
    <input type="range" id="shadeHour" min="6" max="19" step="0.25" value="${shade.hour}" aria-label="Time of day" ${shade.yearMap ? 'disabled' : ''} />
    <div class="shade-scale"><span>6 am</span><span>9</span><span>12 pm</span><span>3</span><span>6 pm</span></div>`;
  box.innerHTML = `
    <div class="card-head" style="margin-bottom:8px"><div><h2>Shadow analysis</h2><p class="hint">Drag the time slider on the map, or press Play, to watch the sun cross the sky and the shadows move over the terrace.</p></div>
      <div class="seg"><button data-sm="day" class="${shade.yearMap ? '' : 'on'}">Hour by hour</button><button data-sm="year" class="${shade.yearMap ? 'on' : ''}">Yearly shade map</button></div></div>
    <div id="shadeInfo" class="shade-info"></div>
    <div id="shadeDay" class="chart"></div>
    <div id="shadeBest" class="hint" style="margin-top:6px"></div>`;
  $('#shadeMonth').onchange = (e) => { shade.month = +e.target.value; drawShadows(); };
  $('#shadeHour').oninput = (e) => { stopPlay(); shade.hour = +e.target.value; drawShadows(); };
  $$('[data-sm]', box).forEach((b) => (b.onclick = () => { stopPlay(); shade.yearMap = b.dataset.sm === 'year'; renderShadeCard(); drawShadows(); }));
  $('#shadePlay').onclick = () => {
    if (shade.timer) { stopPlay(); return; }
    if (shade.yearMap) { shade.yearMap = false; renderShadeCard(); }
    $('#shadePlay').textContent = '❚❚ Pause';
    shade.timer = setInterval(() => {
      shade.hour = shade.hour >= 19 ? 6 : Math.round((shade.hour + 0.1) * 100) / 100;
      const r = $('#shadeHour');
      if (!r) { stopPlay(); return; }
      r.value = shade.hour;
      drawShadows();
    }, 90);
  };
}
function drawDial(F, s, state) {
  const dial = mapHost && $('#sunDial', mapHost);
  if (!dial) return;
  dial.hidden = false;
  const R = 54, c = 64;
  const P = (el, az) => { const r = R * (1 - Math.max(0, el) / (Math.PI / 2)); return [c + r * Math.sin(az), c - r * Math.cos(az)]; };
  const path = [];
  for (let h = 4; h <= 21; h += 0.25) { const q = sunAt(F.lat0, F.lon0, shade.month, h); if (q.el > 0) path.push(P(q.el, q.az)); }
  const [sx, sy] = P(s.el, s.az);
  dial.innerHTML = `<svg viewBox="0 0 128 128" width="128" height="128" aria-label="Sun path">
    <circle cx="${c}" cy="${c}" r="${R}" fill="#f8fafc" stroke="#cbd5e1"/>
    <circle cx="${c}" cy="${c}" r="${R * (1 - 30 / 90)}" fill="none" stroke="#e2e8f0"/><circle cx="${c}" cy="${c}" r="${R * (1 - 60 / 90)}" fill="none" stroke="#e2e8f0"/>
    <line x1="${c}" y1="${c - R}" x2="${c}" y2="${c + R}" stroke="#e2e8f0"/><line x1="${c - R}" y1="${c}" x2="${c + R}" y2="${c}" stroke="#e2e8f0"/>
    <text x="${c}" y="8" text-anchor="middle" class="dl">N</text><text x="${c}" y="126" text-anchor="middle" class="dl">S</text>
    <text x="124" y="${c + 4}" text-anchor="end" class="dl">E</text><text x="4" y="${c + 4}" class="dl">W</text>
    ${path.length > 1 ? `<polyline points="${path.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 3"/>` : ''}
    ${s.el > 0 && !state.year ? `<line x1="${c}" y1="${c}" x2="${sx}" y2="${sy}" stroke="#f59e0b" stroke-width="1"/><circle cx="${sx}" cy="${sy}" r="8" fill="#fbbf24" stroke="#ea580c" stroke-width="2"/>` : ''}
  </svg><div class="dial-cap">${state.year ? 'Sun path · 21 ' + MONTHS[shade.month] : s.el > 0 ? `${Math.round(s.el / DEG)}° high · ${compassDir(s.az)}` : 'Sun down'}</div>`;
}
function drawShadows() {
  if (!map || !shadowLayer) return;
  shadowLayer.clearLayers();
  const dial = mapHost && $('#sunDial', mapHost), bar = mapHost && $('#shadeBar', mapHost);
  const ready = cur && curStep === 2 && cur.design.mode === 'map' && cur.site.roofs.some((r) => r.points.length >= 3);
  if (bar) bar.hidden = !ready || !!drawing || !bar.innerHTML.trim();
  if (!ready || drawing) { if (dial) dial.hidden = true; if (!ready) return; }
  const F = shadeFrame(cur);
  const s = sunAt(F.lat0, F.lon0, shade.month, shade.hour);
  const info = $('#shadeInfo'), dayBox = $('#shadeDay'), best = $('#shadeBest');
  if ($('#shadeTime')) $('#shadeTime').textContent = shade.yearMap ? 'All year' : fmtHour(shade.hour);
  drawDial(F, s, { year: shade.yearMap });
  const opts = { pane: 'shadePane', interactive: false };

  if (shade.yearMap) {
    const { S, loss } = yearShade(cur, F);
    const h = S.step / 2;
    const col = (v) => (v < 0.03 ? '#16a34a' : v < 0.1 ? '#84cc16' : v < 0.2 ? '#facc15' : v < 0.35 ? '#f97316' : '#dc2626');
    S.pts.forEach(([x, y], i) => L.polygon([[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]].map(F.back), { ...opts, stroke: false, fillColor: col(loss[i]), fillOpacity: 0.55 }).addTo(shadowLayer));
    const avg = loss.length ? sum(loss) / loss.length : 0;
    const good = loss.length ? loss.filter((v) => v < 0.05).length / loss.length : 0;
    if (info) info.innerHTML = `Across the whole year the terrace loses <b>${num(avg * 100, 1)}%</b> of its sunshine to shade. <b>${num(good * 100)}%</b> of the roof gets near-full sun (green).`;
    if (dayBox) dayBox.innerHTML = `<div class="legend"><span><i style="background:#16a34a"></i>&lt;3% shade</span><span><i style="background:#84cc16"></i>3–10%</span><span><i style="background:#facc15"></i>10–20%</span><span><i style="background:#f97316"></i>20–35%</span><span><i style="background:#dc2626"></i>&gt;35%</span></div>`;
    if (best) best.textContent = 'Place panels on the green area. Red areas are shaded for a large part of the year.';
    return;
  }

  const polys = shadowPolys(cur, F, s);
  const r = compute(cur);
  const S = roofSamples(cur, F);
  if (!polys) {
    cur.site.roofs.filter((x) => x.points.length >= 3).forEach((x) => L.polygon(x.points, { ...opts, stroke: false, fillColor: '#0b1220', fillOpacity: 0.5 }).addTo(shadowLayer));
    if (info) info.innerHTML = `<b>${fmtHour(shade.hour)}</b>: the sun is below the horizon.`;
  } else {
    polys.forEach((sp) => L.polygon(sp.map(F.back), { ...opts, stroke: false, fillColor: '#0b1220', fillOpacity: 0.42 }).addTo(shadowLayer));
    let shadedPanels = 0;
    r.layouts.forEach((l) => l.rects.forEach((c, k) => {
      const loc = c.map(F.to);
      const ctr = [sum(loc.map((q) => q[0])) / 4, sum(loc.map((q) => q[1])) / 4];
      const hit = [...loc, ctr].some((q) => polys.some((sp) => inPoly(q, sp)));
      const el = l.ids && panelMarkers[l.ids[k]]?.getElement()?.querySelector('.pn');
      if (el) el.classList.toggle('shaded', hit);
      if (hit) {
        shadedPanels++;
        if (!el) L.polygon(c, { ...opts, color: '#ef4444', weight: 2.5, fill: false }).addTo(shadowLayer);
      }
    }));
    const sunlit = 1 - shadedShare(S.pts, polys);
    if (info) info.innerHTML = `<b>${fmtHour(shade.hour)}</b> on 21 ${MONTHS[shade.month]} · sun <b>${Math.round(s.el / DEG)}°</b> high from the <b>${compassDir(s.az)}</b> · terrace in sunlight <b>${num(sunlit * 100)}%</b>${r.count ? ` · <span style="color:${shadedPanels ? 'var(--bad)' : 'var(--ok)'}">${shadedPanels} of ${r.count} panels shaded</span>` : ''}`;
  }

  // hour-by-hour sunlight on the terrace for the chosen date
  const prof = dayProfile(cur, F, shade.month);
  if (dayBox) {
    const W = 600, H = 120, bw = W / prof.length;
    dayBox.innerHTML = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Sunlight on the terrace through the day">
      ${prof.map((q, i) => {
        const v = q.sunlit == null ? 0 : q.sunlit * Math.min(1, Math.sin(Math.max(0, q.el)) * 1.4);
        const bh = Math.max(2, v * H), col = q.sunlit == null ? '#cbd5e1' : q.sunlit > 0.95 ? '#f59e0b' : q.sunlit > 0.8 ? '#fbbf24' : '#94a3b8';
        const on = Math.abs(q.h - shade.hour) < 0.26;
        return `<rect data-h="${q.h}" x="${i * bw + 1.5}" y="${H - bh}" width="${bw - 3}" height="${bh}" rx="2" fill="${col}" ${on ? 'stroke="#0F2A44" stroke-width="2.5"' : ''} style="cursor:pointer"><title>${fmtHour(q.h)}: ${q.sunlit == null ? 'sun down' : num(q.sunlit * 100) + '% of terrace in sun'}</title></rect>`;
      }).join('')}
      ${[6, 9, 12, 15, 18].map((h) => `<text x="${(h - 6) * 2 * bw + bw / 2}" y="${H + 14}" text-anchor="middle">${fmtHour(h).replace(':00', '')}</text>`).join('')}
    </svg>`;
    $$('rect[data-h]', dayBox).forEach((rc) => (rc.onclick = () => { stopPlay(); shade.hour = +rc.dataset.h; if ($('#shadeHour')) $('#shadeHour').value = shade.hour; drawShadows(); }));
  }
  if (best) {
    const full = prof.filter((q) => q.sunlit != null && q.sunlit > 0.88 && q.el > 12 * DEG);
    best.innerHTML = full.length
      ? `Bar height = strength of sunshine on the terrace. <b>Best sun on 21 ${MONTHS[shade.month]}: ${fmtHour(full[0].h)} – ${fmtHour(full[full.length - 1].h + 0.5)}</b> (terrace about 90% or more in sun). Grey bars = significant shade.`
      : 'Bar height = strength of sunshine on the terrace. The terrace is partly shaded for most of this day.';
  }
}

/* ---- Step 3: system & price ---- */
function stepSystem(p) {
  const R = Q.rates(), d = p.design;
  let r = compute(p), m = r.meta;
  if (m.isKit && m.sizes.length && !(Math.abs(n0(d.systemKw) - m.size) < 0.001)) { d.systemKw = m.size; r = compute(p); m = r.meta; }
  const mgr = isMgr();
  const brandOpts = Q.brands().map((b) => [b.key, b.name + (b.pending ? ' (kit, price pending)' : b.kit ? ' (kit)' : '')]);
  const sizeOpts = m.isKit ? m.sizes.map((s) => [s, `${kw(s)} kW kit`]) : [['', `Auto (${m.autoSize} kW)`], ...m.sizes.map((s) => [s, `${s} kW`])];
  const { capacities } = Q.capacityConfig(r.params.panelBrand, d.panelType);
  const showBattery = d.systemType !== 'ongrid' || d.battery.on;
  const chemOpts = Object.entries(R.batteryChemistries || {}).map(([k, v]) => [k, v.name]);
  const S = (i) => [i * 1000, i ? `S${i}` : 'None'];
  const D = (i) => [i * 1000, i ? `D${i}` : 'None'];
  return `<div class="grid grid-2" style="align-items:start">
  <div>
    <div class="card">
      <h2>System configuration</h2>
      <div class="grid grid-2">
        ${field('System type', 'design.systemType', { options: Object.entries(R.systemTypes).map(([k, v]) => [k, v.name]), rerender: true })}
        ${field('Phase', 'design.phase', { options: PHASES, rerender: true })}
        ${field('Panel brand', 'design.panelBrand', { options: brandOpts, rerender: true })}
        ${field('DCR / Non-DCR', 'design.panelCategory', { options: m.isKit ? PANEL_CATS.slice(0, 2) : PANEL_CATS, rerender: true, hint: 'DCR panels are required for subsidy.' })}
        ${field('System capacity', 'design.systemKw', { options: sizeOpts, num: true, rerender: true, hint: m.recKw ? `Bill recommends ${m.recKw} kW.` : '' })}
        ${m.isKit
          ? field('Kit inverter', 'design.kitSku', { options: [['', 'Auto (matching phase)'], ...m.sizeKits.map((k) => [k.id, Q.kitLabel(k)])], rerender: true })
          : field('Panel type', 'design.panelType', { options: PANEL_TYPES, rerender: true })}
        ${m.isKit ? '' : field('Panel wattage', 'design.panelWatt', { options: [['', `Auto (${m.watt} W)`], ...capacities.map((w) => [w, `${w} W`])], num: true, rerender: true })}
        ${m.category === 'mixed' ? field('DCR part (kW)', 'design.dcrKw', { type: 'number', ph: String(Math.ceil(m.size / 2)), attrs: 'data-rerender', hint: `Non-DCR part = ${kw(m.size - n0(r.params.dcrCapacity))} kW` }) : ''}
      </div>
      ${m.isKit ? '' : `<div class="field" style="margin-top:14px"><span class="small" style="font-weight:600;display:block;margin-bottom:6px">Panel count</span>
        <div class="row"><button class="btn sm" id="pcMinus" ${r.count <= 1 ? 'disabled' : ''}>−</button><b style="min-width:150px;text-align:center">${r.count} panels = ${num(r.count * m.watt)} W</b><button class="btn sm" id="pcPlus" ${r.count >= m.recPanels + Q.PANEL_COUNT_MAX_EXTRA ? 'disabled' : ''}>+</button>${d.panelCount ? '<button class="btn sm ghost" id="pcReset">Reset</button>' : ''}</div>
        <div class="hint">${d.panelCount ? `Recommended ${m.recPanels} panels.` : 'Recommended count for this size. Use − / + to adjust.'}</div></div>`}
    </div>
    ${m.isKit ? '' : `<div class="card"><h2>Inverter</h2><div class="grid grid-2">
      ${field('Inverter brand', 'design.inverterBrand', { options: m.invBrands.map((b) => [b.key, b.name]), rerender: true })}
      ${field('Inverter capacity', 'design.inverterTierKey', { options: [['', `Auto (${m.tier ? m.tier.label : '—'})`], ...m.tiers.map((t) => [t.key, t.label])], rerender: true })}
    </div></div>`}
    <div class="card"><h2>Battery bank</h2>
      <div class="grid grid-2">
        ${yesNo('Battery backup required?', 'design.battery.on', { hint: d.systemType === 'ongrid' ? 'On-grid backup adds a separate battery inverter.' : 'Off-grid and hybrid systems need batteries.' })}
        ${showBattery ? field('Battery type', 'design.battery.chemistry', { options: chemOpts, rerender: true }) : ''}
        ${showBattery && d.battery.on ? `
          ${field('Battery brand', 'design.battery.brand', { options: m.bBrands.map((b) => [b.key, b.name]), rerender: true })}
          ${field('Battery capacity', 'design.battery.option', { options: (m.bBrand?.options || []).map((o) => [o.id, Q.batteryOptionLabel(o)]), rerender: true })}
          ${field('Quantity', 'design.battery.qty', { type: 'number', ph: '1', attrs: 'data-rerender', hint: m.bOpt ? `Bank: ${Q.batteryKwh(m.bOpt.ah, m.bOpt.voltage, n0(d.battery.qty) || 1)} kWh` : '' })}
          ${d.systemType === 'ongrid' ? `
            ${field('Battery inverter brand', 'design.battery.invBrand', { options: m.biBrands.map(([k, v]) => [k, v.name]), rerender: true })}
            ${field('Battery inverter capacity', 'design.battery.invOption', { options: (m.biEntry?.[1].options || []).map((o) => [o.id, o.label]), rerender: true })}` : ''}` : ''}
      </div>
    </div>
    <div class="card"><h2>Structure & installation</h2><div class="grid grid-2">
      ${field('Structure brand', 'design.structureBrand', { options: Object.entries(R.structureBrands).map(([k, v]) => [k, v.name]), rerender: true })}
      ${field('Number of floors', 'design.floors', { options: Array.from({ length: 10 }, (_, i) => [i + 1, `${i + 1} Floor${i ? 's' : ''}`]), num: true, rerender: true, hint: 'Affects earthing and cable lengths.' })}
    </div></div>
    <div class="card"><h2>For salesperson</h2><div class="grid grid-2">
      ${field('Sales category', 'pricing.commission', { options: Array.from({ length: 51 }, (_, i) => S(i)), num: true, rerender: true })}
      ${field('Discount', 'pricing.discount', { options: Array.from({ length: 21 }, (_, i) => D(i)), num: true, rerender: true })}
      ${mgr ? `
        ${field('Final price', 'pricing.priceMode', { options: [['components', 'From components'], ['perWatt', 'Per watt (GST included)']], rerender: true })}
        ${p.pricing.priceMode === 'perWatt' ? field('Rate per watt (₹)', 'pricing.perWatt', { type: 'number', ph: 'e.g. 62', attrs: 'data-rerender', hint: 'Final = system kW × 1,000 × rate. GST is inside it.' }) : ''}` : ''}
    </div>
    ${mgr ? `<p class="hint" style="margin-top:10px">Manager mode is on. <a href="#" id="mgrOff">Turn off</a></p>` : `<div class="row" style="margin-top:12px"><input type="password" id="mgrCode" placeholder="Manager access code" style="max-width:220px" autocomplete="off" /><button class="btn sm" id="mgrOn">Unlock</button></div><p class="hint">Unlocks per-watt pricing and the cost breakdown.</p>`}
    </div>
  </div>
  <div>
    <div class="card" id="offerBox"></div>
    <div class="card"><h2>Subsidy & loan</h2>
      <div class="grid grid-2">
        ${r.eligible ? yesNo(`Avail state subsidy (${inr(Q.stateSubsidyAmount())})?`, 'pricing.stateSubsidy') : `<p class="hint" style="grid-column:1/-1">${p.customer.category !== 'Residential' ? 'Subsidy applies to residential customers only.' : 'Non-DCR panels get no central or state subsidy.'}</p>`}
        ${yesNo('Avail loan?', 'pricing.loan.on')}
        ${p.pricing.loan.on ? `
          ${field('Loan type', 'pricing.loan.type', { options: [['upto2l', 'Loan up to ₹2 lakhs'], ['full', 'Full loan'], ['private', 'Private finance']], rerender: true })}
          ${field('After subsidy', 'pricing.loan.repay', { options: [['lowerEmi', 'Lower EMI, same tenure'], ['sameEmi', 'Same EMI, shorter tenure']], rerender: true })}
          ${field('Tenure', 'pricing.loan.years', { options: Array.from({ length: 8 }, (_, i) => [i + 3, `${i + 3} years`]), num: true, rerender: true })}` : ''}
      </div>
      <div id="loanBox" style="margin-top:12px"></div>
    </div>
    ${mgr ? `<div class="card"><div class="card-head"><h2>Cost breakdown</h2><span class="pill">Manager only</span></div><div id="costBox"></div></div>` : ''}
    <div class="card"><div class="card-head"><h2>Generation</h2>${siteCenter(p) ? '<button class="btn sm" id="ghiBtn">Refresh site data</button>' : ''}</div>
      <p class="small muted" id="ghiSrc"></p><div class="chart" id="genChart" style="margin-top:8px"></div></div>
  </div>
  </div>`;
}
function offerHtml(r) {
  if (r.err) return `<h2>Customer offer</h2><div class="callout warn">${esc(r.err)}</div>`;
  const q = r.q;
  const diffW = r.count * q.panelCapacity - q.systemSize * 1000;
  return `<h2>Customer offer</h2>
    <div class="sum" style="margin-bottom:12px;border-color:var(--accent)"><span>Final amount (GST included)</span><b style="font-size:1.6rem">${inr(r.total)}</b>
      ${q.perWatt ? `<div class="hint">${inr(q.perWatt.rate)}/W × ${num(q.perWatt.watts)} W</div>` : ''}</div>
    ${r.centerSub ? `<div class="cost-row sub"><span>Central subsidy</span><b>− ${inr(r.centerSub)}</b></div>` : ''}
    ${r.stateSub ? `<div class="cost-row sub"><span>State subsidy</span><b>− ${inr(r.stateSub)}</b></div>` : ''}
    ${!r.subsidy ? `<div class="cost-row"><span>Subsidy</span><b>${q.panelCategory === 'nonDcr' ? 'None (Non-DCR)' : 'None'}</b></div>` : ''}
    <div class="cost-row total"><span>Price after subsidy</span><b>${inr(r.net)}</b></div>
    <div class="sumgrid" style="margin-top:12px;grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="sum"><span>System</span><b>${kw(q.systemSize)} kW ${q.systemTypeName}</b></div>
      <div class="sum"><span>Panels</span><b>${r.count} × ${q.panelCapacity} W</b></div>
      <div class="sum"><span>Generation</span><b>${num(r.annual)} units/yr</b></div>
      <div class="sum"><span>Annual savings</span><b>${inr(r.savings1)}</b></div>
      <div class="sum"><span>Payback</span><b>${paybackText(r)}</b></div>
      <div class="sum"><span>Inverter</span><b>${esc(q.inverterSpec)}</b></div>
    </div>
    ${Math.abs(diffW) > 10 ? `<p class="hint" style="margin-top:8px">${num(r.count * q.panelCapacity)} W DC is ${diffW > 0 ? num(diffW) + ' W more' : num(-diffW) + ' W less'} than ${kw(q.systemSize)} kW.</p>` : ''}
    ${r.fit && r.count > r.fit ? `<div class="callout warn" style="margin-top:10px">Only ${r.fit} panels fit on the drawn roof.</div>` : ''}`;
}
function loanHtml(r) {
  const l = r.loan;
  if (!l) return '';
  return `<div class="cost-row"><span>${esc(l.label)} @ ${l.rate}% ${l.style === 'flat' ? 'flat' : 'reducing'}</span><b>${inr(l.sanctioned)}</b></div>
    ${l.upfront ? `<div class="cost-row"><span>Cash upfront</span><b>${inr(l.upfront)}</b></div>` : ''}
    ${l.subsidyApplied ? `<div class="cost-row sub"><span>Subsidy credited to loan</span><b>− ${inr(l.subsidyApplied)}</b></div>` : ''}
    <div class="cost-row total"><span>EMI</span><b>${inr(l.emi)} × ${l.months} months</b></div>
    <div class="cost-row"><span>Total interest</span><b>${inr(l.totalInterest)}</b></div>
    <p class="hint">${l.subsidyApplied ? (l.keepEmi ? 'Same EMI, finishes sooner once subsidy is credited.' : 'Lower EMI once subsidy is credited.') : ''} Monthly bill saving ≈ ${inr(r.savings1 / 12)}.</p>`;
}
function costHtml(r) {
  if (!r.q) return '<p class="hint">—</p>';
  const b = r.q.breakdown;
  const row = (k, v, cls = '') => `<div class="cost-row ${cls}"><span>${k}</span><b>${inr(v)}</b></div>`;
  return `${b.kitCost ? row('Kit (basic price)', b.kitCost) : ''}
    ${b.panelCost ? row(`Panels (${r.q.panelSegments.map((s) => `${s.label} ₹${s.pricePerWatt}/W`).join(', ')})`, b.panelCost) : ''}
    ${b.inverterCost ? row('Inverter', b.inverterCost) : ''}
    ${b.batteryCost ? row('Batteries', b.batteryCost) : ''}${b.batteryInverterCost ? row('Battery inverter', b.batteryInverterCost) : ''}
    <details style="margin:6px 0"><summary class="small" style="cursor:pointer">Components ${inr(b.componentsTotal)}</summary>
      ${Object.values(b.components).map((c) => `<div class="cost-row small"><span>${esc(c.name)}</span><b>${inr(c.total)}</b></div>`).join('')}</details>
    <details style="margin:6px 0"><summary class="small" style="cursor:pointer">Additional charges ${inr(b.extraTotal)}</summary>
      ${Object.entries(b.extra).map(([k, v]) => `<div class="cost-row small"><span>${esc(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</span><b>${inr(v)}</b></div>`).join('')}</details>
    ${row('Material total', b.material, 'total')}
    ${row('Profit', b.profit, b.profit >= 0 ? 'sub' : '')}
    ${b.commission ? row('Sales category', b.commission) : ''}${b.discount ? row('Discount', -b.discount) : ''}
    ${row('Before GST', b.beforeGst)}${row(`GST (${num(Q.rates().gstRate * 100, 1)}%)`, b.gst)}${row('Final amount', b.finalAmount, 'total')}`;
}
function afterSystem(p) {
  const d = p.design;
  const adj = (delta) => { const r = compute(p); d.panelCount = Math.max(1, r.count + delta); persist(p); const y = window.scrollY; renderEditor(p, 3); window.scrollTo(0, y); };
  if ($('#pcMinus')) $('#pcMinus').onclick = () => adj(-1);
  if ($('#pcPlus')) $('#pcPlus').onclick = () => adj(1);
  if ($('#pcReset')) $('#pcReset').onclick = () => { d.panelCount = null; persist(p); renderEditor(p, 3); };
  if ($('#mgrOn')) $('#mgrOn').onclick = () => { if (tryUnlock($('#mgrCode').value)) { updateChrome(); renderEditor(p, 3); } };
  if ($('#mgrCode')) $('#mgrCode').onkeydown = (e) => { if (e.key === 'Enter') $('#mgrOn').click(); };
  if ($('#mgrOff')) $('#mgrOff').onclick = (e) => { e.preventDefault(); setMgr(false); p.pricing.priceMode = 'components'; persist(p); updateChrome(); renderEditor(p, 3); };
  if ($('#ghiBtn')) $('#ghiBtn').onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>'; await fetchGhi(p, { force: true }); b.disabled = false; b.textContent = 'Refresh site data'; refreshLive(); };
  liveHook = (r) => {
    $('#offerBox').innerHTML = offerHtml(r);
    $('#loanBox').innerHTML = loanHtml(r);
    if ($('#costBox')) $('#costBox').innerHTML = costHtml(r);
    const E = db.settings.energy;
    $('#ghiSrc').innerHTML = E.genModel === 'site'
      ? (p.ghi ? `Site data: ${esc(p.ghiSource)}.` : 'Using typical values until site data loads.') + ` ${num(r.specYield)} units/kWp/yr.`
      : `Ellipse standard: ${num(E.unitsPerKwDay, 2)} units/kW/day (${num(r.specYield)} units/kWp/yr). Monthly split ${p.ghi ? 'from site satellite data' : 'from typical values'}.`;
    $('#genChart').innerHTML = barChartSvg(r.monthly, MONTHS, `${num(r.annual)} units / year`);
  };
  autoGhi(p);
}
function barChartSvg(values, labels, title) {
  const W = 600, H = 220, pl = 8, pb = 24, pt = 26;
  const max = Math.max(1, ...values) * 1.12;
  const bw = (W - pl * 2) / values.length;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    <text x="${pl}" y="14" style="font-weight:700;fill:#0f172a;font-size:13px">${esc(title)}</text>
    ${values.map((v, i) => {
      const h = (v / max) * (H - pb - pt), x = pl + i * bw + bw * 0.16, y = H - pb - h;
      return `<rect x="${x}" y="${y}" width="${bw * 0.68}" height="${h}" rx="3" fill="#0F2A44"><title>${labels[i]}: ${num(v)} units</title></rect>
        <text x="${x + bw * 0.34}" y="${y - 4}" text-anchor="middle" style="font-size:10px">${v >= 1000 ? num(v / 1000, 1) + 'k' : num(v)}</text>
        <text x="${x + bw * 0.34}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>`;
    }).join('')}
  </svg>`;
}
function lineChartSvg(years, net) {
  const W = 600, H = 220, pl = 52, pb = 24, pt = 14, pr = 10;
  const max = Math.max(net, ...years.map((y) => y.cumulative), 1) * 1.08;
  const x = (i) => pl + (i / (years.length - 1 || 1)) * (W - pl - pr);
  const y = (v) => H - pb - (v / max) * (H - pb - pt);
  const path = years.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative savings">
    ${[0, 0.25, 0.5, 0.75, 1].map((f) => f * max).map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${t >= 1e5 ? num(t / 1e5, 1) + 'L' : num(t / 1000) + 'k'}</text>`).join('')}
    <line x1="${pl}" x2="${W - pr}" y1="${y(net)}" y2="${y(net)}" stroke="#b91c1c" stroke-dasharray="5 4"/>
    <text x="${W - pr}" y="${y(net) - 5}" text-anchor="end" style="fill:#b91c1c">Investment ${inr(net)}</text>
    <path d="${path}" fill="none" stroke="#15803d" stroke-width="3"/>
    ${years.filter((_, i) => i % 5 === 4 || i === 0).map((p) => `<text x="${x(p.year - 1)}" y="${H - 6}" text-anchor="middle">Yr ${p.year}</text>`).join('')}
  </svg>`;
}

/* ---- Step 4: proposal ---- */
function stepProposal() {
  return `<div id="reviewBox"></div>
  <div class="card">
    <h2>Send to customer</h2>
    <div class="row">
      <button class="btn primary" id="pdfShare">Share PDF</button>
      <button class="btn" id="pdfDl">Download PDF</button>
      <button class="btn wa" id="waMsg">WhatsApp summary</button>
    </div>
    <p class="hint" style="margin-top:8px">On phones, <b>Share PDF</b> opens WhatsApp, email and more. On PCs it downloads the file.${db.settings.sheet.enabled ? ' Each PDF is also logged to the team Google Sheet.' : ''}</p>
  </div>`;
}
function afterProposal(p) {
  autoGhi(p);
  let imgUrl = null;
  siteImage(p, compute(p)).then((u) => { imgUrl = u; const el = $('#siteImg'); if (el && u) el.src = u; });
  liveHook = (r) => {
    const box = $('#reviewBox');
    if (!box) return;
    const warn = [];
    if (r.err) warn.push(r.err);
    if (!p.customer.phone) warn.push('No customer mobile number. WhatsApp sharing needs it.');
    if (r.fit && r.count > r.fit) warn.push(`The quote has ${r.count} panels but only ${r.fit} fit on the drawn roof.`);
    const q = r.q;
    box.innerHTML = `
      ${warn.length ? `<div class="callout warn" style="margin-bottom:16px">${warn.map(esc).join('<br>')}</div>` : ''}
      <div class="card">
        <h2 style="margin-bottom:12px">${q ? `${kw(q.systemSize)} kW (${phaseShort(q.phaseType)}) ${esc(q.systemTypeDocumentLabel)} power plant` : 'System'}</h2>
        <div class="sumgrid">
          <div class="sum"><span>Final amount</span><b>${inr(r.total)}</b></div>
          <div class="sum"><span>After subsidy</span><b>${inr(r.net)}</b></div>
          <div class="sum"><span>Annual generation</span><b>${num(r.annual)} units</b></div>
          <div class="sum"><span>Annual savings</span><b>${inr(r.savings1)}</b></div>
          <div class="sum"><span>Payback</span><b>${paybackText(r)}</b></div>
          <div class="sum"><span>${n0(db.settings.energy.years)}-yr savings</span><b>${inr(r.savingsLife)}</b></div>
          <div class="sum"><span>Panels</span><b>${q ? `${r.count} × ${q.panelCapacity} W` : '—'}</b></div>
          <div class="sum"><span>${r.loan ? 'EMI' : 'CO₂ avoided / yr'}</span><b>${r.loan ? `${inr(r.loan.emi)} × ${r.loan.months}` : num(r.co2Year, 1) + ' t'}</b></div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h2>Savings over time</h2><div class="chart">${lineChartSvg(r.years, r.net)}</div></div>
        <div class="card"><h2>Monthly generation</h2><div class="chart">${barChartSvg(r.monthly, MONTHS, `${num(r.annual)} units / year`)}</div></div>
      </div>
      ${p.site.roofs.some((x) => x.points.length >= 3) ? `<div class="card"><h2>Site layout</h2><img id="siteImg" alt="Roof layout on satellite image" style="width:100%;border-radius:10px;margin-top:4px;background:#e2e8f0;min-height:120px" ${imgUrl ? `src="${imgUrl}"` : ''}/></div>` : ''}`;
  };
  $('#pdfShare').onclick = (e) => sharePdf(p, e.currentTarget);
  $('#pdfDl').onclick = (e) => sharePdf(p, e.currentTarget, { download: true });
  $('#waMsg').onclick = () => {
    const r = compute(p), C = db.settings.company, q = r.q;
    if (!q) return toast(r.err || 'Complete the system first');
    const msg = `Namaste ${p.customer.name || ''} ji,\n\nThank you for your interest in solar with ${C.name}. Summary of proposal ${p.number || ''}:\n\n` +
      `• System: ${kw(q.systemSize)} kW ${q.systemTypeName} (${r.count} × ${q.panelCapacity} W ${q.brandName} panels)\n• Generation: ${num(r.annual)} units/year\n` +
      `• Final amount: ${inr(r.total)} (GST included)\n${r.subsidy ? `• Subsidy: ${inr(r.subsidy)} → after subsidy ${inr(r.net)}\n` : ''}• Annual savings: ${inr(r.savings1)}\n• Payback: ${paybackText(r)}\n` +
      `${r.loan ? `• EMI: ${inr(r.loan.emi)} × ${r.loan.months} months\n` : ''}\nThe detailed proposal PDF is shared separately.\n\n${p.salesperson || ''}\n${C.name}${C.phone ? '\n' + C.phone : ''}`;
    window.open(`https://wa.me/${waPhone(p.customer.phone)}?text=${encodeURIComponent(msg)}`, '_blank');
  };
}

/* ---------------- Site image (satellite + layout) ---------------- */
function merc(lat, lng, z) {
  const s = 256 * 2 ** z, sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}
function loadImg(src, ms = 9000) {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), ms);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = src;
  });
}
async function siteImage(p, r) {
  const roofs = p.site.roofs.map((roof, i) => ({ roof, lay: r.layouts[i] })).filter((x) => x.roof.points.length >= 3);
  if (!roofs.length) return null;
  const CW = 1200, CH = 760, pad = 130;
  const all = roofs.flatMap((x) => x.roof.points);
  // Zoom so the roofs fill about half the picture; above zoom 19 the imagery is enlarged
  let z = 21, bb;
  for (; z >= 12; z--) {
    const px = all.map(([la, lo]) => merc(la, lo, z));
    bb = { minX: Math.min(...px.map((q) => q[0])), maxX: Math.max(...px.map((q) => q[0])), minY: Math.min(...px.map((q) => q[1])), maxY: Math.max(...px.map((q) => q[1])) };
    if (bb.maxX - bb.minX <= CW - 2 * pad && bb.maxY - bb.minY <= CH - 2 * pad) break;
  }
  const tz = Math.min(z, 19), ts = 256 * 2 ** (z - tz);
  const ox = (bb.minX + bb.maxX) / 2 - CW / 2, oy = (bb.minY + bb.maxY) / 2 - CH / 2;
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d');
  const tiles = [];
  for (let tx = Math.floor(ox / ts); tx <= Math.floor((ox + CW) / ts); tx++)
    for (let ty = Math.floor(oy / ts); ty <= Math.floor((oy + CH) / ts); ty++)
      tiles.push({ tx, ty, p: loadImg(ESRI_TILES.replace('{z}', tz).replace('{y}', ty).replace('{x}', tx)) });
  const imgs = await Promise.all(tiles.map((t) => t.p));
  const paint = (withTiles) => {
    ctx.fillStyle = '#dfe5ec'; ctx.fillRect(0, 0, CW, CH);
    ctx.imageSmoothingQuality = 'high';
    if (withTiles) tiles.forEach((t, i) => { if (imgs[i]) ctx.drawImage(imgs[i], t.tx * ts - ox, t.ty * ts - oy, ts, ts); });
    const P = ([la, lo]) => { const [x, y] = merc(la, lo, z); return [x - ox, y - oy]; };
    const poly = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
    roofs.forEach(({ roof, lay }) => {
      poly(roof.points); ctx.fillStyle = 'rgba(232,98,31,0.15)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#E8621F'; ctx.stroke();
      (lay?.rects || []).forEach((c) => { poly(c); ctx.fillStyle = '#1e3a8a'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#bfdbfe'; ctx.stroke(); });
      const pxs = roof.points.map(P);
      const cx = sum(pxs.map((q) => q[0])) / pxs.length, cy = Math.max(24, Math.min(...pxs.map((q) => q[1])) - 24);
      const label = `${roof.name}: ${lay?.count || 0} panels`;
      ctx.font = 'bold 20px sans-serif';
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(15,42,68,0.9)'; ctx.fillRect(cx - w / 2, cy - 15, w, 30);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, cy);
    });
    (p.site.obstacles || []).filter((o) => o.points.length >= 3).forEach((o) => {
      poly(o.points); ctx.fillStyle = 'rgba(71,85,105,0.55)'; ctx.fill(); ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#334155'; ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(CW - 50, 50, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0F2A44'; ctx.beginPath(); ctx.moveTo(CW - 50, 26); ctx.lineTo(CW - 60, 56); ctx.lineTo(CW - 40, 56); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', CW - 50, 70);
    const mpp = (156543.03392 * Math.cos((all[0][0] * Math.PI) / 180)) / 2 ** z;
    const meters = [5, 10, 20, 50, 100, 200, 500].find((m) => m / mpp >= 90) || 500;
    const len = meters / mpp;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(18, CH - 52, len + 24, 36);
    ctx.fillStyle = '#0F2A44'; ctx.fillRect(30, CH - 26, len, 5);
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${meters} m`, 30, CH - 36);
    if (withTiles) { ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('Imagery © Esri, Maxar, Earthstar Geographics', CW - 10, CH - 10); }
  };
  try { paint(true); return cv.toDataURL('image/jpeg', 0.85); }
  catch (e) { paint(false); try { return cv.toDataURL('image/jpeg', 0.85); } catch (e2) { return null; } }
}

/* ---------------- PDF proposal ---------------- */
async function buildPdf(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const S = db.settings, C = S.company, E = S.energy, r = compute(p), q = r.q;
  if (!q) throw new Error(r.err || 'System not configured');
  const accent = hexRgb(C.color), navy = [15, 42, 68], ink = [15, 23, 42], muted = [100, 116, 139], line = [226, 232, 240];
  const W = 210, H = 297, M = 15, CWm = W - 2 * M;
  const logo = C.logo || (await assetDataUrl('assets/company_logo.png'));
  const sign = C.signature || (await assetDataUrl('assets/sign-and-seal.png'));
  const logoDim = logo ? await imgSize(logo) : null;
  const signDim = sign ? await imgSize(sign) : null;
  const site = await siteImage(p, r);
  const created = new Date(p.createdAt);
  const validDays = n0(S.proposal.validity);
  const valid = new Date(p.createdAt + validDays * 864e5);
  const ph = phaseShort(q.phaseType);
  const fmt = (s) => String(s || '').replace(/\{validity\}/g, validDays).replace(/\{panelWarranty\}/g, q.panelWarranty).replace(/\{inverterWarranty\}/g, q.inverterConfig.warranty || 10);

  const T = (txt, x, y, o = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 10); doc.setTextColor(...(o.color || ink));
    doc.text(String(txt), x, y, { align: o.align || 'left', maxWidth: o.maxWidth });
  };
  const fitImg = (src, fmtType, dim, x, y, bw, bh) => {
    if (!src || !dim) return;
    const s = Math.min(bw / dim[0], bh / dim[1]), w = dim[0] * s, h = dim[1] * s;
    try { doc.addImage(src, fmtType, x + (bw - w) / 2, y + (bh - h) / 2, w, h); } catch (e) { /* bad image */ }
  };
  const imgFmt = (src) => (src && src.startsWith('data:image/png') ? 'PNG' : 'JPEG');
  const header = (title) => {
    doc.addPage();
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 24, 'F');
    fitImg(logo, imgFmt(logo), logoDim, M, 3, 34, 17);
    T(title, W - M, 14, { size: 10, color: muted, align: 'right' });
    doc.setFillColor(...accent); doc.rect(0, 23, W, 1.2, 'F');
    return 36;
  };
  const h2 = (txt, y) => { T(txt, M, y, { bold: true, size: 14 }); doc.setFillColor(...accent); doc.rect(M, y + 2.2, 14, 1, 'F'); return y + 10; };
  const tableStyle = { theme: 'grid', styles: { fontSize: 9, cellPadding: 2.4, lineColor: line, lineWidth: 0.2, textColor: ink }, headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: M, right: M } };

  /* Page 1 — cover letter */
  doc.setFillColor(...accent); doc.rect(0, 0, W, 4, 'F');
  fitImg(logo, imgFmt(logo), logoDim, M, 10, 46, 24);
  T(C.name.toUpperCase(), W - M, 20, { bold: true, size: 18, color: navy, align: 'right' });
  if (C.tagline) T(C.tagline, W - M, 26, { size: 9.5, color: muted, align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
  doc.text(doc.splitTextToSize(C.address || '', 110), W - M, 31, { align: 'right' });
  T([C.gstin ? `GSTIN: ${C.gstin}` : '', C.phone ? `Mob: ${C.phone}` : ''].filter(Boolean).join('  |  '), W - M, 41, { size: 8.5, color: muted, align: 'right' });
  doc.setDrawColor(...line); doc.line(M, 46, W - M, 46);

  let y = 56;
  T(`Ref: ${p.number || '—'}`, M, y, { size: 9.5, color: muted });
  T(`Date: ${created.toLocaleDateString('en-IN')}`, W - M, y, { size: 9.5, color: muted, align: 'right' });
  y += 10;
  T('To,', M, y, { size: 10 }); y += 6;
  T(`${p.customer.name || ''} ji`, M, y, { bold: true, size: 12 }); y += 5.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted);
  const addr = doc.splitTextToSize(p.customer.address || '', 100).slice(0, 4);
  if (addr.length) { doc.text(addr, M, y); y += addr.length * 4.8; }
  if (p.customer.phone) { T(p.customer.phone, M, y, { color: muted }); y += 5; }
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink);
  const subj = doc.splitTextToSize(`Sub: Proposal for Design, Erection & Commissioning of ${kw(q.systemSize)} KW (${ph}) ${q.systemTypeDocumentLabel} Power Plant.`, CWm);
  doc.text(subj, M, y); y += subj.length * 5.5 + 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const intro = doc.splitTextToSize(`With reference to our discussion, we are very pleased to offer you our best proposal for a rooftop ${q.systemTypeDocumentLabel} power plant. The following pages cover the system design for your roof, expected generation, bill of material, commercial offer${r.loan ? ', loan option' : ''} and terms.`, CWm);
  doc.text(intro, M, y, { lineHeightFactor: 1.45 }); y += intro.length * 5.2 + 8;

  const boxes = [['System size', `${kw(q.systemSize)} kW ${ph}`], ['Annual generation', `${num(r.annual)} units`], ['Price after subsidy', rs(r.net)], ['Payback period', r.payback == null ? '—' : `${num(r.payback, 1)} years`]];
  const bw = (CWm - 3 * 4) / 4;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + 4);
    doc.setFillColor(254, 243, 237); doc.roundedRect(x, y, bw, 26, 2, 2, 'F');
    doc.setFillColor(...accent); doc.rect(x, y, 1.2, 26, 'F');
    T(k, x + 5, y + 8, { size: 8, color: muted }); T(v, x + 5, y + 18, { bold: true, size: v.length > 13 ? 10.5 : 12.5 });
  });
  y += 36;
  doc.setFillColor(236, 253, 245); doc.roundedRect(M, y, CWm, 16, 2, 2, 'F');
  T(`Your plant will avoid about ${num(r.co2Life)} tonnes of CO2 over ${n0(E.years)} years.`, M + 6, y + 9.5, { size: 10, color: [20, 83, 45] });
  y += 26;
  [['Prepared by', p.salesperson || '—'], ['Valid until', fmtDate(valid)]].forEach(([k, v], i) => { T(k, M, y + i * 6.5, { size: 9.5, color: muted }); T(v, M + 34, y + i * 6.5, { bold: true, size: 9.5 }); });

  /* Page 2 — design & site */
  y = header('System design');
  y = h2('System design & site layout', y);
  if (site) {
    const ih = CWm * (760 / 1200);
    doc.addImage(site, 'JPEG', M, y, CWm, ih);
    y += ih + 4;
    T('Indicative panel layout on your roof. The final layout is confirmed after the site survey.', M, y, { size: 8, color: muted });
    y += 7;
  }
  doc.autoTable({
    ...tableStyle, startY: y, head: [['Parameter', 'Details']],
    body: [
      ['Plant capacity', `${kw(q.systemSize)} kW (${ph}) ${q.systemTypeName} · ${kw(r.kwp)} kWp DC`],
      ['Solar modules', `${r.count} x ${q.brandName} ${q.kit ? '' : q.panelTypeName + ' '}${q.panelCapacity} Wp (${q.panelCategoryLabel})`],
      ['Inverter', `${q.inverterConfig.name} ${q.inverterSpec}`],
      ...(q.battery ? [['Battery bank', `${q.battery.brand} ${q.battery.label} x ${q.battery.quantity} (${q.battery.kwhTotal} kWh)`]] : []),
      ...(q.batteryInverter ? [['Battery inverter', `${q.batteryInverter.brand} ${q.batteryInverter.label}`]] : []),
      ['Mounting structure', `${q.structureDesc || q.structureName} · ${MOUNTS[p.design.mount] || ''}`],
      ...(r.area ? [['Roof area traced', `${num(r.area)} sq m (${num(r.area * 10.7639)} sq ft)`]] : []),
      ['Estimated generation', `${num(r.annual)} units per year (${num(r.annual / 365, 1)} per day)`],
      ...(r.consumption ? [['Your consumption', `${num(r.monthlyUnits)} units/month · solar covers ~${num(Math.min(r.offsetPct, 999))}%`]] : []),
    ],
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 10;
  if (y < 230) {
    T('Monthly generation (units)', M, y, { bold: true, size: 11 }); y += 4;
    const chH = Math.min(40, 270 - y - 12), cbw = CWm / 12, maxV = Math.max(1, ...r.monthly) * 1.15;
    r.monthly.forEach((v, i) => {
      const bh = (v / maxV) * chH, x = M + i * cbw + cbw * 0.17;
      doc.setFillColor(...navy); doc.rect(x, y + chH - bh, cbw * 0.66, bh, 'F');
      T(num(v), x + cbw * 0.33, y + chH - bh - 1.5, { size: 6.5, color: muted, align: 'center' });
      T(MONTHS[i], x + cbw * 0.33, y + chH + 4.5, { size: 7.5, color: muted, align: 'center' });
    });
  }

  /* Page 3 — BOM & commercial offer */
  y = header('Bill of material & offer');
  y = h2(`Bill of Material - ${q.systemTypeDocumentLabel} System`, y);
  const dc = (q.dcCable && q.dcCable.spec) || '1C x 4 SQmm Copper';
  const ac = (q.acCable && q.acCable.spec) || (ph === '1Ph' ? '2C x 6 SQmm Aluminium' : '4C x 10 SQmm Copper');
  const R = Q.rates();
  const drain = r.count * ((R.components.drainClip && R.components.drainClip.quantityPerPanel) || 2);
  const bom = [
    ...(q.kit ? [['System Kit', q.kitBrand, `${q.kit.dcKw} kW kit`, '1']] : []),
    ['Solar Module', `${q.brandName} (Bifacial)`, `${kw(q.systemSize)} kW`, String(r.count)],
    ['PCU/Inverter', q.inverterConfig.name, q.inverterSpec || `${q.inverterCapacity}kW (${ph})`, '1'],
    ...(q.batteryInverter ? [['Battery Inverter', q.batteryInverter.brand, q.batteryInverter.label, '1']] : []),
    ...(q.battery ? [['Battery', `${q.battery.brand} (${q.battery.chemistry})`, q.battery.model ? `${q.battery.label} · ${q.battery.model}` : q.battery.label, String(q.battery.quantity)]] : []),
    ['Complete Set of Structure', 'G.I Standard (Tata/Apollo)', 'As per MNRE Standards', '1 Set'],
    ['DC Cable', 'Polycab', dc, 'As per Site'],
    ['Armoured Cable', 'Polycab', ac, 'As per Site'],
    ['Drain Clip', 'Universal 30mm', '30 MM', String(drain)],
    ['Earthing Set with LA', 'Standard', 'Set', '3'],
    ['DCDB', 'Polycab', 'Set', '1'],
    ['ACDB', 'Polycab', 'Set', '1'],
    ['Balance of system', 'Standard', 'Set', 'As per System'],
    ['Solar Meter', (R.components.solarMeter && R.components.solarMeter.brand) || 'L&T / Lauritz Knudsen', 'Set', '1'],
  ].map((row, i) => [String(i + 1), ...row]);
  doc.autoTable({ ...tableStyle, startY: y, head: [['Sr.', 'Technical Details', 'Makes', 'Capacity', 'Quantity']], body: bom, styles: { ...tableStyle.styles, fontSize: 8.5, cellPadding: 1.9 }, columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { fontStyle: 'bold' } } });
  y = doc.lastAutoTable.finalY + 10;
  if (y > 200) y = header('Commercial offer');
  y = h2('Commercial Offer', y);
  const offer = [['Plant size', `${kw(q.systemSize)} KW (${ph})`]];
  if (q.perWatt) offer.push(['Rate', `INR ${q.perWatt.rate} per watt x ${num(q.perWatt.watts)} W`]);
  offer.push(['System cost', `INR ${num(r.total)}/- (GST PAID)`]);
  if (r.centerSub) offer.push(['Central subsidy', `- INR ${num(r.centerSub)}/-`]);
  if (r.stateSub) offer.push(['State subsidy', `- INR ${num(r.stateSub)}/-`]);
  if (!r.subsidy) offer.push(['Subsidy', q.panelCategory === 'nonDcr' ? 'None (Non-DCR)' : 'None']);
  offer.push(['Price after subsidy', `INR ${num(r.net)}/-`], ['Annual generation', `${num(r.annual)} units/year`], ['Annual savings', `INR ${num(r.savings1)}/-`],
    ['Payback', r.payback == null ? '—' : `${num(r.payback, 1)} years`], ['Extra', 'NIL'], ['Discom charge', 'Included']);
  doc.autoTable({
    ...tableStyle, startY: y, body: offer, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    didParseCell: (d) => { const k = d.row.raw[0]; if (k === 'System cost' || k === 'Price after subsidy') { d.cell.styles.fillColor = navy; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10.5; } },
  });
  y = doc.lastAutoTable.finalY + 4;
  if (r.subsidy) T('Subsidy is credited by the government directly to the customer\'s bank (or loan) account after commissioning and inspection.', M, y + 1, { size: 8, color: muted, maxWidth: CWm });

  /* Page 4 — savings & loan */
  y = header('Savings & finance');
  y = h2(`${n0(E.years)}-year savings`, y);
  const fin = [['Investment after subsidy', rs(r.net)], ['Annual savings', rs(r.savings1)], ['Payback', r.payback == null ? '—' : `${num(r.payback, 1)} years`], [`${n0(E.years)}-year savings`, rs(r.savingsLife)]];
  fin.forEach(([k, v], i) => {
    const x = M + i * (bw + 4);
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...line); doc.roundedRect(x, y, bw, 20, 2, 2, 'FD');
    T(k, x + 4, y + 7, { size: 7.5, color: muted }); T(v, x + 4, y + 15, { bold: true, size: 11 });
  });
  y += 28;
  const gH = 50, gW = CWm - 16, gx = M + 16;
  const gMax = Math.max(r.net, ...r.years.map((v) => v.cumulative), 1) * 1.08;
  const gxF = (i) => gx + (i / Math.max(1, r.years.length - 1)) * gW, gyF = (v) => y + gH - (v / gMax) * gH;
  doc.setDrawColor(...line); doc.setLineWidth(0.2);
  [0, 0.5, 1].forEach((f) => { doc.line(gx, gyF(f * gMax), gx + gW, gyF(f * gMax)); T(f * gMax >= 1e5 ? num((f * gMax) / 1e5, 1) + 'L' : num((f * gMax) / 1000) + 'k', gx - 2, gyF(f * gMax) + 1, { size: 7, color: muted, align: 'right' }); });
  doc.setDrawColor(185, 28, 28); doc.setLineDashPattern([1.5, 1.2], 0); doc.line(gx, gyF(r.net), gx + gW, gyF(r.net)); doc.setLineDashPattern([], 0);
  T('Investment', gx + gW, gyF(r.net) - 1.5, { size: 7, color: [185, 28, 28], align: 'right' });
  doc.setDrawColor(21, 128, 61); doc.setLineWidth(0.8);
  for (let i = 1; i < r.years.length; i++) doc.line(gxF(i - 1), gyF(r.years[i - 1].cumulative), gxF(i), gyF(r.years[i].cumulative));
  doc.setLineWidth(0.2);
  T('Cumulative savings', gx + 2, y + 3, { size: 8, color: [21, 128, 61], bold: true });
  [0, 4, 9, 14, 19, 24, 29].filter((i) => i < r.years.length).forEach((i) => T(`Yr ${i + 1}`, gxF(i), y + gH + 4.5, { size: 7, color: muted, align: 'center' }));
  y += gH + 11;
  T(`Assumes ${r.consumption ? `your ${num(r.monthlyUnits)} units/month are saved at Rs. ${num(E.tariff, 2)}/unit and surplus is sold to the DISCOM at Rs. ${num(E.exportRate, 2)}/unit` : `all units are used at Rs. ${num(E.tariff, 2)}/unit`}${n0(E.escalation) ? `, tariff rising ${num(E.escalation, 1)}% a year` : ''}${n0(E.degradation) ? `, panel output falling ${num(E.degradation, 1)}% a year` : ''}.`, M, y, { size: 8, color: muted, maxWidth: CWm });
  y += 10;
  if (r.loan) {
    const l = r.loan;
    y = h2('Loan option', y);
    const lr = [['Loan type', `${l.label.replace('₹', 'Rs. ')} @ ${l.rate}% (${l.style === 'flat' ? 'flat' : 'reducing balance'})`], ['Loan amount', rs(l.sanctioned)]];
    if (l.upfront) lr.push(['Cash paid upfront', rs(l.upfront)]);
    if (l.subsidyApplied) lr.push(['Subsidy credited to loan', '- ' + rs(l.subsidyApplied)]);
    lr.push(['EMI', `${rs(l.emi)} x ${l.months} months`], ['Total interest', rs(l.totalInterest)], ['Monthly bill saving (approx.)', rs(r.savings1 / 12)]);
    doc.autoTable({ ...tableStyle, startY: y, body: lr, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } }, didParseCell: (d) => { if (d.row.raw[0] === 'EMI') { d.cell.styles.fillColor = navy; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = 'bold'; } } });
    y = doc.lastAutoTable.finalY + 4;
    if (l.subsidyApplied) T(l.keepEmi ? 'After the subsidy is credited, the same EMI continues and the loan finishes sooner.' : 'After the subsidy is credited, the EMI is recalculated lower for the same tenure.', M, y + 1, { size: 8, color: muted, maxWidth: CWm });
  }

  /* Page 5 — terms */
  y = header('Terms & conditions');
  const secs = (S.proposal.sections || []).filter((s) => s.title || s.body);
  secs.forEach((s, i) => {
    const lines = String(fmt(s.body)).split('\n').filter((x) => x.trim());
    if (y > 250) y = header('Terms & conditions');
    T(`${i + 1}. ${s.title}`, M, y, { bold: true, size: 10.5 }); y += 5.5;
    lines.forEach((ln) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const wr = doc.splitTextToSize(ln.trim(), CWm - 8);
      if (y + wr.length * 4.4 > 272) y = header('Terms & conditions');
      if (lines.length > 1) { doc.setFillColor(...accent); doc.circle(M + 3, y - 1.1, 0.7, 'F'); }
      doc.setTextColor(...ink); doc.text(wr, M + 6, y, { lineHeightFactor: 1.35 });
      y += wr.length * 4.3 + 1.2;
    });
    y += 3.5;
  });
  if (y + 62 > 280) y = header('Terms & conditions');
  y += 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ink);
  const close = doc.splitTextToSize('Hope the above is in line with your requirements. If you need further information, please feel free to contact us. Thanking you and assuring you of our very best and prompt attention at all times.', CWm);
  doc.text(close, M, y, { lineHeightFactor: 1.4 }); y += close.length * 4.8 + 6;
  T('Yours faithfully,', M, y, { size: 10 }); y += 5.5;
  T(`For, ${C.name.toUpperCase()}`, M, y, { bold: true, size: 10 });
  if (sign && signDim) fitImg(sign, imgFmt(sign), signDim, W - M - 62, y - 8, 62, 36);
  y += 32;
  T(C.signatory || 'Authorized Signatory', W - M, y, { bold: true, size: 9.5, align: 'right' });
  T('Customer acceptance: ____________________', M, y, { size: 9.5, color: muted });
  if (C.bank) {
    y += 10;
    if (y > 255) y = header('Bank details');
    T("Company's bank details", M, y, { bold: true, size: 10 }); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink);
    const bl = doc.splitTextToSize(C.bank, CWm); doc.text(bl, M, y, { lineHeightFactor: 1.4 });
  }

  /* Footer */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(M, H - 14, W - M, H - 14);
    T([C.name, C.phone, C.email, C.website].filter(Boolean).join('  ·  '), M, H - 8.5, { size: 7.5, color: muted, maxWidth: 150 });
    T(`${p.number || ''}  ·  Page ${i} of ${pages}`, W - M, H - 8.5, { size: 7.5, color: muted, align: 'right' });
  }
  return doc;
}
async function sharePdf(p, btn, { download: forceDl = false } = {}) {
  if (!window.jspdf) { toast('PDF library not loaded. Check your internet and reload.'); return; }
  const r0 = compute(p);
  if (!r0.q) { toast(r0.err || 'Complete the system first'); return; }
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Preparing…'; }
  try {
    if (!p.ghi && siteCenter(p)) await fetchGhi(p, { silent: true });
    const doc = await buildPdf(p);
    logToSheet(p, compute(p));
    const blob = doc.output('blob');
    const name = `${(p.number || 'Proposal').replace(/[^\w-]+/g, '_')}_${(p.customer.name || 'customer').replace(/[^\w-]+/g, '_')}.pdf`;
    const how = forceDl ? (download(blob, name), 'downloaded') : await shareOrDownload(blob, name, `Solar proposal ${p.number || ''}`, `Solar proposal for ${p.customer.name || ''} from ${db.settings.company.name}`);
    if (how === 'shared' && p.status === 'Draft') { p.status = 'Sent'; persist(p); toast('Shared. Status set to Sent.'); if (cur === p && $('#edStatus')) $('#edStatus').value = 'Sent'; }
    else if (how === 'downloaded') toast('PDF downloaded');
  } catch (e) {
    console.error(e);
    toast('Could not create the PDF: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const S = db.settings, mgr = isMgr();
  const sf = (label, path, o = {}) => field(label, path, { ...o, settings: true });
  const R = Q.rates();
  const priceSrc = ratesInfo.source === 'live' ? `<span class="pill Won">Live</span> loaded ${new Date(ratesInfo.at).toLocaleTimeString('en-IN')}`
    : ratesInfo.source === 'saved' ? `<span class="pill Negotiation">Saved copy</span> from ${fmtDate(ratesInfo.at)}` : '<span class="pill Lost">Bundled copy</span>';
  const imgPick = (label, key, def) => `<div><span class="small" style="font-weight:600;display:block;margin-bottom:6px">${label}</span>
    <div class="row"><div class="logo-prev"><img src="${S.company[key] || def}" alt="${label}" /></div>
    ${mgr ? `<label class="btn sm">Change<input type="file" accept="image/*" data-img="${key}" hidden /></label>${S.company[key] ? `<button class="btn sm" data-img-reset="${key}">Use default</button>` : ''}` : ''}</div></div>`;

  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>${mgr ? 'Manager mode: all settings can be changed.' : 'Enter the manager code to change prices, company details and assumptions.'}</p></div>
      ${mgr ? '<button class="btn" id="lockBtn">Lock</button>' : `<div class="row"><input type="password" id="mgrCode" placeholder="Manager access code" style="width:200px" autocomplete="off" /><button class="btn primary" id="mgrOn">Unlock</button></div>`}</div>

    <details class="card" open><summary><div>This device<small>Who is using this phone or PC</small></div></summary>
      ${sf('This device belongs to', 'currentUser', { options: S.team, attrs: 'data-chrome', hint: 'New proposals on this device are assigned to this person.' })}
    </details>

    <details class="card" ${mgr ? '' : 'open'}><summary><div>Price list<small>rates.json shared with the Ellipse sales portal</small></div></summary>
      <p style="margin-bottom:10px">${priceSrc}</p>
      <p class="small" style="margin-bottom:12px">Prices, profits, kits and components are read from <code>${esc(ratesInfo.url || S.ratesUrl)}</code>. Update that file once and both this app and the sales portal use the new prices. ${Object.keys(R.solarPanels).length} panel brands · ${R.kits?.tata?.skus?.length || 0} Tata kits · GST ${num(R.gstRate * 100, 1)}% · central subsidy up to ${inr(R.subsidy?.center?.['3+'] || 0)}.</p>
      <div class="row"><button class="btn" id="reloadRates">Reload price list now</button></div>
      ${mgr ? `<div style="margin-top:14px">${sf('Price list URL', 'ratesUrl', { hint: 'Leave as is to follow the live sales portal.' })}</div>` : ''}
    </details>

    ${mgr ? `
    <details class="card"><summary><div>Company & branding<small>Printed on every proposal</small></div></summary>
      <div class="grid grid-2">
        ${sf('Company name', 'company.name', { attrs: 'data-chrome' })} ${sf('Tagline', 'company.tagline')}
        ${sf('Phone', 'company.phone', { type: 'tel' })} ${sf('Email', 'company.email', { type: 'email' })}
        ${sf('Website', 'company.website')} ${sf('GSTIN', 'company.gstin')}
        ${sf('Office address', 'company.address', { type: 'textarea' })} ${sf('Bank details (printed at the end)', 'company.bank', { type: 'textarea', ph: 'Bank name, A/c no., branch & IFSC' })}
        ${sf('Signatory (printed under the seal)', 'company.signatory')}
        <label class="field"><span>Brand colour</span><input type="color" data-sbind="company.color" value="${esc(S.company.color)}" style="padding:4px;height:44px" /></label>
        ${imgPick('Logo', 'logo', 'assets/company_logo.png')} ${imgPick('Signature & seal', 'signature', 'assets/sign-and-seal.png')}
      </div>
    </details>

    <details class="card"><summary><div>Team & access<small>Salespeople, manager code and Google Sheet log</small></div></summary>
      <div>${S.team.map((n, i) => `<div class="row" style="margin-bottom:8px"><input data-team="${i}" value="${esc(n)}" style="flex:1" /><button class="btn sm danger" data-team-del="${i}" ${S.team.length < 2 ? 'disabled' : ''}>Remove</button></div>`).join('')}</div>
      <button class="btn sm" id="teamAdd">+ Add person</button>
      <div class="grid grid-2" style="margin-top:16px">
        ${sf('Manager access code', 'managerCode', { hint: 'Unlocks per-watt pricing, cost breakdown and settings. This is a convenience lock, not real security: anyone who can read the app files can find it.' })}
        <div>
          <label class="check" style="margin-bottom:10px"><input type="checkbox" data-sbind="sheet.enabled" ${S.sheet.enabled ? 'checked' : ''} /> Log each PDF to the team Google Sheet</label>
          ${sf('Google Apps Script URL', 'sheet.url', { hint: 'Same sheet the sales portal logs to: date, salesperson, customer, phone, location, size, brand.' })}
        </div>
      </div>
    </details>

    <details class="card"><summary><div>Generation & savings<small>How units and savings are estimated</small></div></summary>
      <div class="grid grid-3">
        ${sf('Generation model', 'energy.genModel', { options: [['standard', 'Ellipse standard (units/kW/day)'], ['site', 'Site satellite data (NASA)']] })}
        ${sf('Units per kW per day', 'energy.unitsPerKwDay', { type: 'number', hint: 'Sales portal uses 5.15' })}
        ${sf('Performance ratio (site model)', 'energy.pr', { type: 'number' })}
        ${sf('Tilt gain (site model)', 'energy.tiltFactor', { type: 'number' })}
        ${sf('Saving per self-used unit ₹', 'energy.tariff', { type: 'number', hint: 'Sales portal uses 7.5' })}
        ${sf('Govt buy-back ₹/unit', 'energy.exportRate', { type: 'number', hint: 'Sales portal uses 3.26' })}
        ${sf('Tariff increase % / year', 'energy.escalation', { type: 'number' })}
        ${sf('Panel degradation % / year', 'energy.degradation', { type: 'number' })}
        ${sf('Analysis period (years)', 'energy.years', { type: 'number' })}
        ${sf('Grid CO₂ kg/unit', 'energy.co2', { type: 'number' })}
      </div>
    </details>

    <details class="card"><summary><div>Loan<small>Same rules as the sales portal</small></div></summary>
      <div class="grid grid-2">
        ${sf('Low-rate loan limit ₹', 'finance.maxLoanAmount', { type: 'number' })}
        ${sf('Rate up to the limit %', 'finance.cappedInterestRate', { type: 'number' })}
        ${sf('Full loan rate %', 'finance.fullLoanInterestRate', { type: 'number' })}
        ${sf('Private finance flat rate %', 'finance.privateFinanceRate', { type: 'number' })}
      </div>
    </details>

    <details class="card"><summary><div>Roof layout rules<small>Automatic panel placement</small></div></summary>
      <div class="grid grid-2">
        ${sf('Edge setback (m)', 'layout.setback', { type: 'number', hint: 'Walkway kept clear from the roof edge' })}
        ${sf('Gap between panels (m)', 'layout.gap', { type: 'number' })}
        ${sf('Row gap, elevated structure (m)', 'layout.rowGapElevated', { type: 'number', hint: 'Spacing to avoid row-to-row shading' })}
        ${sf('Row gap, low / tin shed (m)', 'layout.rowGapFlat', { type: 'number' })}
      </div>
    </details>

    <details class="card"><summary><div>Proposal content<small>Numbering and terms sections</small></div></summary>
      <div class="grid grid-3" style="margin-bottom:14px">
        ${sf('Number prefix', 'proposal.prefix', { hint: 'Use a different prefix per salesperson, e.g. ELS-AK' })}
        ${sf('Next number', 'proposal.nextSeq', { type: 'number' })}
        ${sf('Offer valid for (days)', 'proposal.validity', { type: 'number' })}
      </div>
      <p class="hint" style="margin-bottom:8px">One point per line. You can use {validity}, {panelWarranty} and {inverterWarranty}.</p>
      ${S.proposal.sections.map((s, i) => `<div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;margin-bottom:10px">
        <div class="row" style="margin-bottom:8px"><input data-sbind="proposal.sections.${i}.title" value="${esc(s.title)}" style="flex:1;font-weight:600" /><button class="btn sm danger" data-sec-del="${i}">Remove</button></div>
        <textarea data-sbind="proposal.sections.${i}.body">${esc(s.body)}</textarea></div>`).join('')}
      <button class="btn sm" id="secAdd">+ Add section</button>
    </details>` : ''}

    <details class="card"><summary><div>Data & backup<small>Move data between devices, collect team proposals</small></div></summary>
      <p class="small" style="margin-bottom:12px">Proposals are stored only in this browser. Back up regularly. Salespeople send their backup to a manager, who imports it to see everyone's proposals on the dashboard.</p>
      <div class="row" style="margin-bottom:10px">
        <button class="btn primary" id="bkShare">Share / download backup</button>
        <label class="btn">Import team proposals<input type="file" accept="application/json,.json" id="bkMerge" hidden /></label>
        ${mgr ? `<label class="btn">Restore full backup<input type="file" accept="application/json,.json" id="bkRestore" hidden /></label>` : ''}
      </div>
      <p class="hint"><b>Import team proposals</b> adds proposals from a backup file and keeps your settings.${mgr ? ' <b>Restore full backup</b> also copies company settings (use it to set up a new salesperson\'s phone).' : ''}</p>
      ${mgr ? '<div class="row" style="margin-top:16px"><button class="btn danger" id="resetAll">Erase all data on this device</button></div>' : ''}
    </details>
    <p class="hint" style="text-align:center;margin-top:8px">Satellite imagery © Esri · Maps © OpenStreetMap · Solar data © NASA POWER</p>`;

  const view = $('#view');
  const onS = (e) => {
    const el = e.target, path = el.getAttribute('data-sbind');
    if (!path) return;
    if (e.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox')) return;
    setPath(S, path, readInput(el));
    layoutMemo.clear();
    save();
    if (el.hasAttribute('data-chrome')) updateChrome();
  };
  view.addEventListener('input', onS);
  view.addEventListener('change', onS);
  const rerender = () => { const open = $$('details', view).map((d) => d.open); renderSettings(); $$('details', $('#view')).forEach((d, i) => { d.open = !!open[i]; }); };
  const on = (sel, fn) => { const el = $(sel, view); if (el) el.onclick = fn; };

  on('#mgrOn', () => { if (tryUnlock($('#mgrCode').value)) { updateChrome(); renderSettings(); } });
  if ($('#mgrCode')) $('#mgrCode').onkeydown = (e) => { if (e.key === 'Enter') $('#mgrOn').click(); };
  on('#lockBtn', () => { setMgr(false); updateChrome(); renderSettings(); });
  on('#reloadRates', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> Loading…';
    const ok = await loadRates({ force: true });
    toast(ok ? 'Price list updated' : 'Could not reach the live price list');
    renderSettings();
  });
  $$('[data-team]', view).forEach((el) => (el.onchange = () => {
    const i = +el.dataset.team, old = S.team[i], nw = el.value.trim() || old;
    S.team[i] = nw;
    if (S.currentUser === old) S.currentUser = nw;
    db.proposals.forEach((p) => { if (p.salesperson === old) p.salesperson = nw; });
    save(); updateChrome(); rerender();
  }));
  $$('[data-team-del]', view).forEach((b) => (b.onclick = () => { const [gone] = S.team.splice(+b.dataset.teamDel, 1); if (S.currentUser === gone) S.currentUser = S.team[0]; save(); updateChrome(); rerender(); }));
  on('#teamAdd', () => { S.team.push(`Salesperson ${S.team.length + 1}`); save(); rerender(); });
  on('#secAdd', () => { S.proposal.sections.push({ title: 'New section', body: '' }); save(); rerender(); });
  $$('[data-sec-del]', view).forEach((b) => (b.onclick = () => { S.proposal.sections.splice(+b.dataset.secDel, 1); save(); rerender(); }));
  $$('[data-img-reset]', view).forEach((b) => (b.onclick = () => { S.company[b.dataset.imgReset] = null; save(); rerender(); }));
  $$('[data-img]', view).forEach((inp) => (inp.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
    const dim = await imgSize(url);
    if (!dim) return toast('Could not read that image');
    const s = Math.min(1, 700 / dim[0], 500 / dim[1]);
    const cv = document.createElement('canvas');
    cv.width = Math.round(dim[0] * s); cv.height = Math.round(dim[1] * s);
    const im = new Image(); im.src = url; await im.decode();
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    S.company[inp.dataset.img] = cv.toDataURL('image/png');
    save(); rerender(); toast('Image saved');
  }));

  on('#bkShare', async () => {
    const blob = new Blob([JSON.stringify({ app: 'ellipse-solar-proposals', version: 1, exportedAt: new Date().toISOString(), from: S.currentUser, ...db })], { type: 'application/json' });
    const name = `ellipse-backup-${(S.currentUser || 'device').replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    const how = await shareOrDownload(blob, name, 'Ellipse Solar backup', `Proposal backup from ${S.currentUser}`);
    if (how !== 'cancelled') toast(how === 'shared' ? 'Backup shared' : 'Backup downloaded');
  });
  const readBackup = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { try { const j = JSON.parse(fr.result); if (!Array.isArray(j.proposals)) throw new Error(); res(j); } catch (e) { rej(new Error('Not a valid backup file')); } }; fr.readAsText(file); });
  if ($('#bkMerge')) $('#bkMerge').onchange = async (e) => {
    try {
      const j = await readBackup(e.target.files[0]);
      let added = 0, updated = 0;
      j.proposals.forEach((p) => {
        const i = db.proposals.findIndex((x) => x.id === p.id);
        if (i < 0) { db.proposals.push(p); added++; }
        else if ((p.updatedAt || 0) > (db.proposals[i].updatedAt || 0)) { db.proposals[i] = p; updated++; }
        if (p.salesperson && !S.team.includes(p.salesperson)) S.team.push(p.salesperson);
      });
      db.proposals.sort((a, b) => b.createdAt - a.createdAt);
      save(); toast(`Imported: ${added} new, ${updated} updated`); rerender();
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };
  if ($('#bkRestore')) $('#bkRestore').onchange = async (e) => {
    try {
      const j = await readBackup(e.target.files[0]);
      if (!confirm('Replace settings with the ones in this backup and add its proposals? Current proposals are kept.')) return;
      const me = S.currentUser;
      db.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), j.settings || {});
      if (Array.isArray(j.settings?.proposal?.sections)) db.settings.proposal.sections = j.settings.proposal.sections;
      if (db.settings.team.includes(me)) db.settings.currentUser = me;
      j.proposals.forEach((p) => { if (!db.proposals.some((x) => x.id === p.id)) db.proposals.push(p); });
      layoutMemo.clear(); save(); updateChrome(); toast('Backup restored'); renderSettings();
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };
  on('#resetAll', () => {
    if (!confirm('Erase ALL proposals and settings on this device?')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    localStorage.removeItem(KEY);
    load(); updateChrome(); renderSettings(); toast('All data erased');
  });
}

/* ---------------- Boot ---------------- */
(async function boot() {
  load();
  $('#view').innerHTML = `<div class="empty"><span class="spin"></span><p style="margin-top:10px">Loading price list…</p></div>`;
  await loadRates();
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', () => { if (cur && isEmptyProposal(cur)) { db.proposals = db.proposals.filter((x) => x !== cur); save(); } });
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
