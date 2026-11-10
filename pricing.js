'use strict';
/* =====================================================================
   Ellipse Solar pricing engine.
   Ported from the Ellipse Solar Sales Portal (script.js v1.25) so the
   same inputs give the same price. All prices come from rates.json.
   ===================================================================== */
const Q = (() => {
  let R = null;
  const setRates = (r) => { R = r; };
  const rates = () => R;
  const phaseKey = (p) => (p === '3phase' || p === '3ph' ? '3ph' : '1ph');
  const STANDARD_SIZES = Array.from({ length: 48 }, (_, i) => i + 3); // 3..50 kW
  const PANEL_COUNT_MAX_EXTRA = 15;

  // JVVNL domestic tariff (FY 2025-26), used to turn a bill amount into units
  const JVVNL = {
    slabs: [
      { uptoUnits: 50, ratePerUnit: 4.75, fixedCharge: 150 },
      { uptoUnits: 150, ratePerUnit: 6.0, fixedCharge: 150 },
      { uptoUnits: 300, ratePerUnit: 7.25, fixedCharge: 200 },
      { uptoUnits: 500, ratePerUnit: 7.95, fixedCharge: 250 },
      { uptoUnits: 99999, ratePerUnit: 8.5, fixedCharge: 300 },
    ],
    surchargePerUnit: 1.0,
  };
  function billFromUnits(totalUnits, freeUnits) {
    const billable = freeUnits ? Math.max(0, totalUnits - 100) : totalUnits;
    let energy = 0, fixed = 0, remaining = billable, prev = 0;
    for (const s of JVVNL.slabs) if (billable <= s.uptoUnits) { fixed = s.fixedCharge; break; }
    for (const s of JVVNL.slabs) {
      if (remaining <= 0) break;
      const u = Math.min(remaining, s.uptoUnits - prev);
      energy += u * s.ratePerUnit;
      remaining -= u;
      prev = s.uptoUnits;
    }
    return energy + fixed + billable * JVVNL.surchargePerUnit;
  }
  function unitsFromBill(bill, freeUnits) {
    if (!(bill > 0)) return 0;
    for (let u = 1; u <= 5000; u++) if (billFromUnits(u, freeUnits) >= bill) return u;
    return 5000;
  }

  /* ---------- Catalogue helpers ---------- */
  function brands() {
    return Object.entries(R.solarPanels).map(([key, b]) => ({ key, name: b.name, kit: !!b.kitBased, pending: isKitPending(key) }));
  }
  function capacityConfig(brand, panelType) {
    const techKey = panelType === 'monoperc_bifacial' ? 'monoperc' : 'topcon';
    const b = R.solarPanels[brand] || R.solarPanels.ina;
    const tech = b[techKey] || {};
    const capacities = Array.isArray(tech.capacities) && tech.capacities.length ? tech.capacities : techKey === 'topcon' ? [600, 610, 615, 620] : [540, 545, 550];
    const defaultCapacity = capacities.includes(tech.defaultCapacity) ? tech.defaultCapacity : capacities[0];
    return { capacities, defaultCapacity, techKey };
  }
  function isKitBrand(brand) { const b = R.solarPanels[brand]; return !!(b && b.kitBased); }
  function kitCatalog(brand) {
    const b = R.solarPanels[brand] || {};
    if (b.kitPricePending) return null;
    return (R.kits && R.kits[b.kitCatalog || brand]) || null;
  }
  function isKitPending(brand) {
    const b = R.solarPanels[brand];
    if (!b || !b.kitBased) return false;
    if (b.kitPricePending) return true;
    const c = kitCatalog(brand);
    return !c || !(c.skus || []).length;
  }
  function listKits(brand, systemType, category) {
    const c = kitCatalog(brand);
    if (!c) return [];
    const cat = category === 'nonDcr' ? 'nonDcr' : 'dcr';
    let list = (c.skus || []).filter((s) => s.systemType === systemType && s.category === cat);
    if (!list.length && systemType === 'hybrid') list = (c.skus || []).filter((s) => s.systemType === 'hybrid');
    return list.filter((s) => s.dcKw <= 50.5);
  }
  function kitCapacities(kits) {
    const seen = [];
    (kits || []).forEach((s) => { if (!seen.some((d) => Math.abs(d - s.dcKw) < 0.001)) seen.push(s.dcKw); });
    return seen.sort((a, b) => a - b);
  }
  function kitLabel(s) {
    let l = `${s.inverterKw} kW ${s.phase === '3ph' ? '3 Phase' : '1 Phase'}`;
    if (s.inverterLabel) l = `${s.inverterLabel} · ${l}`;
    if (s.batteryKwh) l += ` · ${s.batteryKwh} kWh battery`;
    return l;
  }
  function findKit({ brand, systemType, category, phase, systemSize, inverterKw, ignoreInverter, kitId }) {
    const c = kitCatalog(brand);
    if (!c) return null;
    if (kitId) { const byId = (c.skus || []).find((s) => s.id === kitId); if (byId) return byId; }
    const st = R.systemTypes[systemType] ? systemType : 'ongrid';
    const cat = category === 'nonDcr' ? 'nonDcr' : 'dcr';
    let list = (c.skus || []).filter((s) => s.systemType === st && s.category === cat);
    if (!list.length && st === 'hybrid') list = (c.skus || []).filter((s) => s.systemType === 'hybrid');
    if (!list.length) return null;
    const pk = phaseKey(phase), size = parseFloat(systemSize) || 0;
    const exact = list.filter((s) => Math.abs(s.dcKw - size) < 0.001);
    if (exact.length) { const sp = exact.filter((s) => s.phase === pk); list = sp.length ? sp : exact; }
    else { const sp = list.filter((s) => s.phase === pk); if (sp.length) list = sp; }
    const inv = parseFloat(inverterKw);
    if (!ignoreInverter && inv) { const m = list.filter((s) => Math.abs(s.inverterKw - inv) < 0.05); if (m.length) list = m; }
    return list.slice().sort((a, b) => {
      const da = Math.abs(a.dcKw - size), db = Math.abs(b.dcKw - size);
      if (da !== db) return da - db;
      return Math.abs(a.inverterKw - (inv || size)) - Math.abs(b.inverterKw - (inv || size));
    })[0];
  }
  const kitIncludes = (kit, item) => !!(kit && Array.isArray(kit.includes) && kit.includes.includes(item));

  function nearestPanelCount(kw, watt) {
    const target = kw * 1000, exact = target / watt;
    let best = Math.floor(exact), diffBest = Infinity;
    [Math.floor(exact), Math.round(exact), Math.ceil(exact)].forEach((c) => {
      const d = Math.abs(target - c * watt);
      if (d < diffBest) { diffBest = d; best = c; }
    });
    return best < 1 ? 1 : best;
  }
  function bestWattageForSize(capacities, kw) {
    const watts = (capacities || []).map((w) => parseInt(w, 10)).filter((w) => w > 0);
    if (!watts.length) return null;
    const size = parseFloat(kw) || 0;
    if (size <= 0) return watts[0];
    const target = size * 1000;
    let best = watts[0], bestDiff = Infinity, bestDc = 0;
    watts.forEach((w) => {
      const dc = nearestPanelCount(size, w) * w, diff = Math.abs(dc - target);
      if (diff < bestDiff || (diff === bestDiff && dc >= target && bestDc < target)) { bestDiff = diff; best = w; bestDc = dc; }
    });
    return best;
  }
  function defaultWattage(brand, panelType, kw) {
    const { capacities, defaultCapacity } = capacityConfig(brand, panelType);
    return brand === 'waree' && capacities.includes(defaultCapacity) ? defaultCapacity : bestWattageForSize(capacities, kw) || defaultCapacity;
  }

  function dcCable(kw) {
    const c = R.components.dcWire || {};
    const band = (c.byCapacity || []).find((b) => kw <= b.maxKw);
    if (!band) return { size: c.size || '1 core 4 sq mm', spec: '1C x 4 SQmm Copper', ratePerMeter: c.ratePerMeter || 0 };
    return { ...band, ratePerMeter: c.ratePerMeter || 0 };
  }
  function acCable(kw, phase) {
    const c = R.components.acWire || {};
    const pk = phaseKey(phase);
    const priced = (c.pricing && c.pricing[pk]) || {};
    if (kw >= 10 && c.byCapacity && c.byCapacity.length) {
      const band = c.byCapacity.find((b) => kw <= b.maxKw) || c.byCapacity[c.byCapacity.length - 1];
      return { ...band, ratePerMeter: priced.ratePerMeter || 0 };
    }
    return { size: priced.size || '2 core 6 sq mm ALU', spec: priced.spec || (pk === '3ph' ? '4C x 10 SQmm Copper' : '2C x 6 SQmm Aluminium'), ratePerMeter: priced.ratePerMeter || 0 };
  }

  function inverterBrands(systemType) {
    const set = R.inverters[systemType] || R.inverters.ongrid;
    return Object.entries(set).map(([key, v]) => ({ key, name: v.name }));
  }
  function inverterTiers(systemType, brand) {
    const cfg = ((R.inverters || {})[systemType] || {})[brand] || {};
    const rows = [];
    Object.entries(cfg.pricingTiers || {}).forEach(([key, t]) => {
      const m = String(key).match(/^(\d+\.?\d*)/);
      const kw = parseFloat(t.kw != null ? t.kw : m && m[1]);
      if (!kw) return;
      const pl = t.phase === '3Ph' ? '3 Phase' : t.phase === '1Ph' ? '1 Phase' : '';
      rows.push({ key, kw, mppt: t.mppt, phase: t.phase || '', label: `${kw} kW${pl ? ' ' + pl : ''}${t.mppt ? ` · ${t.mppt} MPPT` : ''}` });
    });
    return rows.sort((a, b) => a.kw - b.kw || (a.mppt || 0) - (b.mppt || 0) || String(a.phase).localeCompare(String(b.phase)));
  }
  function defaultTier(tiers, size, phase) {
    const pl = phaseKey(phase) === '3ph' ? '3Ph' : '1Ph';
    const same = tiers.filter((t) => !t.phase || t.phase === pl);
    const pool = same.length ? same : tiers;
    let cands = pool.filter((t) => t.kw === size);
    if (!cands.length) {
      const c = pool.slice().sort((a, b) => Math.abs(a.kw - size) - Math.abs(b.kw - size) || (a.mppt || 0) - (b.mppt || 0))[0];
      if (c) cands = pool.filter((t) => t.kw === c.kw);
    }
    return cands.slice().sort((a, b) => (a.mppt || 0) - (b.mppt || 0) || String(a.key).localeCompare(String(b.key)))[0];
  }
  function inverterSpec(cfg, kw, tierKey) {
    const t = cfg && cfg.pricingTiers && cfg.pricingTiers[tierKey];
    if (!t) return `${kw}kW`;
    const m = String(tierKey).match(/^(\d+\.?\d*)/);
    const bits = [`${t.kw != null ? t.kw : m ? m[1] : kw}kW`];
    if (t.phase) bits.push(t.phase);
    if (t.mppt) bits.push(`${t.mppt} MPPT`);
    return bits.join(' · ');
  }
  function inverterPrice(cfg, kw, phase, tierKey) {
    if (cfg.pricePerKW) return kw * cfg.pricePerKW;
    if (cfg.pricingTiers) {
      const sel = tierKey && cfg.pricingTiers[tierKey];
      if (sel && sel.price != null) return Number(sel.price) || 0;
      let ph = phaseKey(phase) === '3ph' ? '3Ph' : '1Ph';
      if (kw <= 4) ph = '1Ph';
      const m = [];
      for (const [key, t] of Object.entries(cfg.pricingTiers)) {
        const k = key.match(/^(\d+\.?\d*)/);
        if (t.phase === ph && k) m.push({ kw: parseFloat(k[1]), price: t.price, mppt: t.mppt });
      }
      m.sort((a, b) => a.kw - b.kw || (a.mppt || 0) - (b.mppt || 0));
      const ex = m.find((t) => t.kw === kw); if (ex) return ex.price;
      const hi = m.find((t) => t.kw >= kw); if (hi) return hi.price;
      if (m.length) return m[m.length - 1].price;
      const all = [];
      for (const [key, t] of Object.entries(cfg.pricingTiers)) { const k = key.match(/^(\d+\.?\d*)/); if (k) all.push({ kw: parseFloat(k[1]), price: t.price }); }
      all.sort((a, b) => a.kw - b.kw);
      const f = all.find((t) => t.kw >= kw); if (f) return f.price;
      if (all.length) return all[all.length - 1].price;
    }
    return kw * 44450;
  }
  function brandProfit(cfg, size) {
    const key = String(Math.round(size));
    const t = cfg && cfg.profitByCapacity;
    if (t && t[key] != null) return Number(t[key]) || 0;
    if (cfg && cfg.kitCatalog === 'tata' && R.solarPanels.tata) {
      const tt = R.solarPanels.tata.profitByCapacity || {};
      if (tt[key] != null) return Number(tt[key]) || 0;
    }
    return 0;
  }

  const batteryKwh = (ah, v, q) => Math.round(((ah * v * (q || 1)) / 1000) * 100) / 100;
  function batteryBrands(chem) { return Object.entries(R.batteries || {}).filter(([, c]) => (c.chemistry || 'lead_acid') === chem).map(([key, c]) => ({ key, ...c })); }
  function batteryOptionLabel(o) { const k = batteryKwh(o.ah, o.voltage, 1); return o.model ? `${o.label} · ${o.model} (${k} kWh)` : `${o.label} (${k} kWh)`; }

  /* ---------- Quotation (same maths as the portal) ---------- */
  function quote(params) {
    if (!R) throw new Error('Price list not loaded');
    const {
      systemSize, panelBrand, panelCapacity, panelType, panelCategory, dcrCapacity, nonDcrCapacity, inverterCapacity, inverterBrand, inverterTierKey,
      systemType, batteryBackup, batteryChemistry, batteryBrand, batteryOption, batteryQuantity, batteryInverterBrand, batteryInverterOption,
      structureBrand, phaseType, numberOfFloors, commission, discount, perWattRate, panelCountOverride, kitSku,
    } = params;
    const size = parseFloat(systemSize) || 0;
    const { capacities } = capacityConfig(panelBrand, panelType);
    const parsedCap = parseInt(panelCapacity, 10);
    const watt = capacities.includes(parsedCap) ? parsedCap : defaultWattage(panelBrand, panelType, size);
    const invKw = parseFloat(inverterCapacity) || size;
    const floors = parseInt(numberOfFloors, 10) || 1;
    const stKey = R.systemTypes[systemType] ? systemType : 'ongrid';
    const stCfg = R.systemTypes[stKey];
    const techKey = panelType === 'monoperc_bifacial' ? 'monoperc' : 'topcon';
    const b = R.solarPanels[panelBrand] || R.solarPanels.ina;
    const rateFor = (key) => {
      const bucket = (b[techKey] && b[techKey][key]) || {};
      const spec = (bucket.pricePerWattByCapacity || {})[String(watt)];
      return spec != null ? spec : bucket.pricePerWatt || 24;
    };
    const catalog = b.kitBased ? kitCatalog(panelBrand) : null;
    const kit = b.kitBased ? findKit({ brand: panelBrand, systemType: stKey, category: panelCategory === 'nonDcr' ? 'nonDcr' : panelCategory === 'mixed' ? null : panelCategory, phase: phaseType, systemSize: size, inverterKw: invKw, kitId: kitSku }) : null;
    if (b.kitBased && panelCategory === 'mixed') throw new Error(`${b.name} is a kit brand and cannot use a mixed DCR split. Choose DCR or Non-DCR.`);
    if (b.kitBased && (b.kitPricePending || !catalog)) throw new Error(`${b.name} kit prices are not in the price list yet.`);
    if (b.kitBased && !kit) throw new Error(`No ${b.name} kit for ${size} kW ${phaseKey(phaseType)} ${stCfg.name}.`);

    const isMixed = panelCategory === 'mixed';
    let req;
    if (isMixed) {
      req = [{ key: 'dcr', kW: parseFloat(dcrCapacity) || 0 }, { key: 'nonDcr', kW: parseFloat(nonDcrCapacity) || 0 }].filter((s) => s.kW > 0);
      if (!req.length) throw new Error('Enter the DCR and Non-DCR split');
      const tot = req.reduce((a, s) => a + s.kW, 0);
      if (Math.abs(tot - size) > 0.001) throw new Error(`DCR + Non-DCR split is ${tot} kW but the system is ${size} kW`);
    } else req = [{ key: panelCategory === 'nonDcr' ? 'nonDcr' : 'dcr', kW: size }];

    const ov = parseInt(panelCountOverride, 10);
    const hasOv = Number.isInteger(ov) && ov >= 1;
    const segs = req.map((s) => {
      let panels = nearestPanelCount(s.kW, watt);
      if (hasOv && req.length === 1) panels = ov;
      const ppw = rateFor(s.key);
      return { key: s.key, label: s.key === 'nonDcr' ? 'Non-DCR' : 'DCR', requestedKW: s.kW, panels, capacityW: panels * watt, pricePerWatt: ppw, cost: Math.round(ppw * panels * watt) };
    });
    if (hasOv && segs.length > 1) {
      const rec = segs.reduce((a, s) => a + s.panels, 0);
      const last = segs[segs.length - 1];
      last.panels = Math.max(1, last.panels + (ov - rec));
      last.capacityW = last.panels * watt;
      last.cost = Math.round(last.pricePerWatt * last.capacityW);
    }
    const catLabel = isMixed ? segs.map((s) => `${s.requestedKW}kW ${s.label}`).join(' + ') : segs[0].label;
    let panelCount = segs.reduce((a, s) => a + s.panels, 0);
    let watts = segs.reduce((a, s) => a + s.capacityW, 0);
    if (kit) {
      segs.splice(0, segs.length, { key: kit.category, label: kit.category === 'nonDcr' ? 'Non-DCR' : 'DCR', requestedKW: size, panels: kit.panels, capacityW: kit.panels * kit.panelWatt, pricePerWatt: 0, cost: 0 });
      panelCount = kit.panels;
      watts = kit.panels * kit.panelWatt;
    }
    const invSet = R.inverters[stKey] || R.inverters.ongrid;
    const invCfg = kit ? { name: kit.inverterLabel || (catalog && catalog.inverterLabel) || 'Kit inverter', warranty: (catalog && catalog.inverterWarranty) || 10 } : invSet[inverterBrand] || Object.values(invSet)[0];
    const structCfg = R.structureBrands[structureBrand] || R.structureBrands.tata;
    const actualKw = kit ? kit.dcKw : watts / 1000;
    const panelCost = kit ? 0 : segs.reduce((a, s) => a + s.cost, 0);
    const invCost = kit ? 0 : inverterPrice(invCfg, invKw, phaseType, inverterTierKey);
    const invSpecTxt = kit ? `${kit.inverterKw}kW` : inverterSpec(invCfg, invKw, inverterTierKey);
    const kitCost = kit ? Number(kit.basicPrice) || 0 : 0;

    // Battery bank
    const bq = parseInt(batteryQuantity, 10) || 0;
    let battery = null, batteryCost = 0;
    if (batteryBackup === 'yes' && bq > 0) {
      const chem = batteryChemistry || (R.batteries[batteryBrand] && R.batteries[batteryBrand].chemistry) || 'lead_acid';
      const list = batteryBrands(chem);
      const reqB = R.batteries[batteryBrand];
      const bc = reqB && (reqB.chemistry || 'lead_acid') === chem ? reqB : list[0] || Object.values(R.batteries)[0];
      const opt = (bc.options || []).find((o) => o.id === batteryOption) || (bc.options || [])[0];
      if (opt) {
        batteryCost = opt.price * bq;
        battery = { brand: bc.name, chemistry: ((R.batteryChemistries || {})[bc.chemistry || chem] || { name: 'Lead-Acid' }).name, model: opt.model || null, label: opt.label, quantity: bq, kwhTotal: batteryKwh(opt.ah, opt.voltage, bq), warranty: bc.warranty, total: Math.round(batteryCost) };
      }
    }
    let batInv = null, batInvCost = 0;
    if (batteryBackup === 'yes' && stKey === 'ongrid') {
      const bis = R.batteryInverters || {};
      const bic = bis[batteryInverterBrand] || Object.values(bis)[0];
      const sel = bic && ((bic.options || []).find((o) => o.id === batteryInverterOption) || (bic.options || [])[0]);
      if (sel) { batInvCost = sel.price; batInv = { brand: bic.name, label: sel.label, capacityKW: sel.capacityKW, warranty: bic.warranty, total: Math.round(sel.price) }; }
    }
    if (kit && kitIncludes(kit, 'battery')) {
      batteryCost = 0; batInvCost = 0; batInv = null;
      battery = { brand: kit.batteryBrand || 'Mysine', chemistry: 'Lithium-Ion (LiFePO4)', model: null, label: `${kit.batteryKwh} kWh`, quantity: 1, kwhTotal: kit.batteryKwh, warranty: 10, total: 0, includedInKit: true };
    }

    // Components
    const comps = {};
    let compTotal = 0;
    const add = (key, name, brand, rate, qty, cost) => { comps[key] = { name, brand, rate, quantity: qty, total: Math.round(cost) }; compTotal += cost; };
    Object.keys(R.components).forEach((key) => {
      const c = { ...R.components[key] };
      const ph = phaseKey(phaseType);
      if (kit && kitIncludes(kit, key)) { comps[key] = { name: `${typeof c.displayName === 'string' ? c.displayName : c.description || key} (included in kit)`, brand: c.brand, rate: 0, quantity: 0, total: 0, includedInKit: true }; return; }
      if (key === 'structure') { const v = c.pricingByCapacity[String(Math.round(size))] || c.pricingByCapacity['10'] || 25099.6; add(key, c.description || 'Structure', c.brand, v, 1, v); return; }
      if (key === 'acdb-dcdb-combo') {
        const sz = kit ? kit.dcKw : size;
        const pk = ph === '1ph' ? '1ph_1_6' : sz <= 10 ? '3ph_5_10' : '3ph_10_20';
        const parts = (c.breakdown && c.breakdown[pk]) || {};
        let charge = c.pricing[pk], name = c.description || 'ACDB + DCDB Combo';
        const ia = kitIncludes(kit, 'acdb'), id = kitIncludes(kit, 'dcdb');
        if (ia && id) { charge = 0; name += ' (included in kit)'; } else if (ia) { charge = parts.dcdb || 0; name = 'DCDB (ACDB included in kit)'; } else if (id) { charge = parts.acdb || 0; name = 'ACDB (DCDB included in kit)'; }
        add(key, name, c.brand, charge, 1, charge); return;
      }
      if (key === 'earthingWire') { const w = c.pricing[ph]; const len = c.baseLength + (floors - 1) * c.perFloorExtra; add(key, `${c.description} (${w.size}, ${len}m)`, c.brand, w.ratePerMeter, len, w.ratePerMeter * len); return; }
      if (key === 'dcWire') { const cb = dcCable(size); const len = c.baseLength + (floors - 1) * c.perFloorExtra; add(key, `${c.description} (${cb.size}, ${len}m)`, c.brand, cb.ratePerMeter, len, cb.ratePerMeter * len); return; }
      if (key === 'blackPipe') { const e = R.components.earthingWire; const len = e.baseLength + (floors - 1) * e.perFloorExtra; add(key, `${c.description} (${len}m)`, c.brand, c.ratePerMeter, len, c.ratePerMeter * len); return; }
      if (key === 'acWire') { const cb = acCable(size, phaseType); add(key, `${c.description} (${cb.size}, ${c.length}m)`, c.brand, cb.ratePerMeter, c.length, cb.ratePerMeter * c.length); return; }
      if (key === 'solarMeter' && c.pricing) { const pr = c.pricing[ph]; add(key, 'Solar Meter', c.brand, pr, 1, pr); return; }
      if (key === 'mc4Connector') c.quantity = panelCount + 4;
      if (key === 'drainClip') c.quantity = panelCount * (c.quantityPerPanel || 2);
      add(key, c.description || c.displayName || key, c.brand, c.rate, c.quantity, (c.rate || 0) * (c.quantity || 0));
    });

    const extra = { ...R.additionalCharges };
    extra.civilWorkMaterial = Math.round(extra.civilWorkMaterialPerKW * size);
    delete extra.civilWorkMaterialPerKW;
    extra.batteryInstallation = battery ? Number(extra.batteryInstallation) || 3000 : 0;
    const extraTotal = Object.values(extra).reduce((a, v) => a + (Number(v) || 0), 0);
    const profit = brandProfit(b, kit ? kit.dcKw : size);
    const material = kitCost + panelCost + invCost + batteryCost + batInvCost + compTotal;
    const comm = parseFloat(commission) || 0, disc = parseFloat(discount) || 0, pw = parseFloat(perWattRate) || 0;
    let beforeGst = material + profit + extraTotal + comm - disc;
    let gst = beforeGst * R.gstRate;
    let total = beforeGst + gst;
    let perWatt = null;
    if (pw > 0) {
      const w = Math.round(size * 1000), amt = Math.round(w * pw), bg = Math.round(amt / (1 + R.gstRate));
      const adj = bg - Math.round(material) - Math.round(extraTotal) - Math.round(comm) + Math.round(disc);
      beforeGst = bg; gst = amt - bg; total = amt;
      perWatt = { watts: w, rate: pw, amount: amt, baseProfit: Math.round(profit), profitAdjustment: adj - Math.round(profit) };
    }
    return {
      systemSize: size, actualSystemCapacity: actualKw, phaseType, panelBrand, brandName: b.name, panelCapacity: kit ? kit.panelWatt : watt,
      panelCategory, panelCategoryLabel: catLabel, panelSegments: segs, panelTypeName: (R.panelTypes[panelType] || {}).name || panelType,
      inverterCapacity: kit ? kit.inverterKw : invKw, inverterSpec: invSpecTxt, inverterConfig: invCfg, kit, kitBrand: b.name,
      systemType: stKey, systemTypeName: stCfg.name, systemTypeDocumentLabel: stCfg.documentLabel,
      battery, batteryInverter: batInv, structureName: structCfg.name, structureDesc: structCfg.description, floors,
      dcCable: dcCable(size), acCable: acCable(size, phaseType), perWatt, panelCount, panelWarranty: b.warranty || 25,
      breakdown: {
        panelCost: Math.round(panelCost), kitCost: Math.round(kitCost), inverterCost: Math.round(invCost), batteryCost: Math.round(batteryCost), batteryInverterCost: Math.round(batInvCost),
        components: comps, componentsTotal: Math.round(compTotal), extra, extraTotal: Math.round(extraTotal), material: Math.round(material),
        profit: perWatt ? perWatt.baseProfit + perWatt.profitAdjustment : Math.round(profit), commission: Math.round(comm), discount: Math.round(disc),
        beforeGst: Math.round(beforeGst), gst: Math.round(gst), finalAmount: Math.round(total),
      },
    };
  }

  function centerSubsidy(size, eligible) {
    const c = (R.subsidy && R.subsidy.center) || { 1: 30000, 2: 60000, '3+': 78000 };
    if (!eligible) return 0;
    if (size >= 3) return c['3+'];
    if (size >= 2) return c[2];
    if (size >= 1) return c[1];
    return 0;
  }
  const stateSubsidyAmount = () => (R.subsidy && R.subsidy.state) || 17000;

  /* ---------- Loan (same maths as the portal) ---------- */
  function reducingEmi(P, rate, n) {
    if (P <= 0 || n <= 0) return 0;
    const r = rate / 100 / 12;
    if (r === 0) return Math.round(P / n);
    return Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  }
  function flatEmi(P, rate, n) { if (P <= 0 || n <= 0) return 0; return Math.round((P + P * (rate / 100) * (n / 12)) / n); }
  function reducingPayoff(P, emi, rate) {
    if (P <= 0 || emi <= 0) return { months: 0, totalPaid: 0, totalInterest: 0 };
    const r = rate / 100 / 12;
    let bal = P, m = 0, paid = 0;
    while (bal > 1 && m < 600) {
      const i = bal * r, pay = Math.min(emi, bal + i);
      bal = bal + i - pay; paid += pay; m++;
      if (pay + 0.5 < emi) break;
    }
    return { months: m, totalPaid: Math.round(paid), totalInterest: Math.round(paid - P) };
  }
  function flatPayoff(P, emi, rate) {
    if (P <= 0 || emi <= 0) return { months: 0, totalPaid: 0, totalInterest: 0 };
    const mi = (P * (rate / 100)) / 12, mp = emi - mi;
    if (mp <= 0) return { months: 0, totalPaid: 0, totalInterest: 0 };
    const months = Math.ceil(P / mp), full = Math.max(0, months - 1);
    const paid = emi * full + Math.max(0, P - mp * full) + mi;
    return { months, totalPaid: Math.round(paid), totalInterest: Math.round(paid - P) };
  }
  function loan({ finalAmount, subsidyTotal, loanType, repayMode, months, cfg }) {
    const priv = loanType === 'private';
    const full = loanType === 'full' || priv;
    const cost = Math.round(finalAmount);
    const sanctioned = full ? cost : Math.min(cost, cfg.maxLoanAmount);
    const upfront = cost - sanctioned;
    const applied = Math.min(subsidyTotal, sanctioned);
    const principal = sanctioned - applied;
    const style = priv ? 'flat' : 'reducing';
    const rate = priv ? cfg.privateFinanceRate : sanctioned > cfg.maxLoanAmount ? cfg.fullLoanInterestRate : cfg.cappedInterestRate;
    const emiOf = (P, n) => (style === 'flat' ? flatEmi(P, rate, n) : reducingEmi(P, rate, n));
    const keep = repayMode !== 'lowerEmi' && applied > 0;
    let emi = 0, actual = 0, payable = 0, interest = 0;
    if (principal > 0 && keep) {
      emi = emiOf(sanctioned, months);
      const p = style === 'flat' ? flatPayoff(principal, emi, rate) : reducingPayoff(principal, emi, rate);
      actual = p.months || months; payable = p.totalPaid; interest = p.totalInterest;
    } else if (principal > 0) {
      emi = emiOf(principal, months); actual = months; payable = emi * months; interest = payable - principal;
    }
    return {
      label: priv ? 'Private finance' : loanType === 'full' ? 'Full loan' : 'Loan up to ₹2 lakh', style, rate, sanctioned, upfront, subsidyApplied: applied,
      principal, emi, months: actual, selectedMonths: months, totalPayable: payable, totalInterest: interest, keepEmi: keep,
    };
  }

  return {
    setRates, rates, phaseKey, STANDARD_SIZES, PANEL_COUNT_MAX_EXTRA, unitsFromBill, billFromUnits, brands, capacityConfig, isKitBrand, isKitPending,
    listKits, kitCapacities, kitLabel, findKit, nearestPanelCount, defaultWattage, inverterBrands, inverterTiers, defaultTier, batteryBrands,
    batteryOptionLabel, batteryKwh, quote, centerSubsidy, stateSubsidyAmount, loan,
  };
})();
