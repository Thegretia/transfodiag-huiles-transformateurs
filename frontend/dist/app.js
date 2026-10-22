/**
 * TransfoDiag Pro — Application PWA Offline-First (IndexedDB + Triangle de Duval 1 SVG + Auto-Mapping + Exports)
 * 100 % autonome, zéro dépendance CDN externe.
 */

// ============================================================================
// 1. Moteur de Stockage Local IndexedDB (pending_field_inspections & cached_reports)
// ============================================================================
const IDB_NAME = 'TransfoDiagOfflineVault';
const IDB_VERSION = 1;

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_field_inspections')) {
        db.createObjectStore('pending_field_inspections', { keyPath: 'local_id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('cached_reports')) {
        db.createObjectStore('cached_reports', { keyPath: 'id_analyse' });
      }
      if (!db.objectStoreNames.contains('cached_fleet')) {
        db.createObjectStore('cached_fleet', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAddPendingInspection(record) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_field_inspections', 'readwrite');
    const store = tx.objectStore('pending_field_inspections');
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetPendingInspections() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_field_inspections', 'readonly');
    const req = tx.objectStore('pending_field_inspections').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbClearPendingInspections(keys) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_field_inspections', 'readwrite');
    const store = tx.objectStore('pending_field_inspections');
    keys.forEach((k) => store.delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbCacheReports(reports) {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cached_reports', 'readwrite');
    const store = tx.objectStore('cached_reports');
    store.clear();
    reports.slice(0, 100).forEach((r) => store.put(r));
    tx.oncomplete = () => resolve();
  });
}

async function idbGetCachedReports() {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cached_reports', 'readonly');
    const req = tx.objectStore('cached_reports').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function idbCacheFleet(dashboardData) {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cached_fleet', 'readwrite');
    tx.objectStore('cached_fleet').put({ id: 'fleet_main', data: dashboardData, updated_at: new Date().toISOString() });
    tx.oncomplete = () => resolve();
  });
}

async function idbGetCachedFleet() {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cached_fleet', 'readonly');
    const req = tx.objectStore('cached_fleet').get('fleet_main');
    req.onsuccess = () => resolve(req.result ? req.result.data : null);
    req.onerror = () => resolve(null);
  });
}

// ============================================================================
// 2. État Global de l'Application
// ============================================================================
const state = {
  activeTab: 'dashboard', // 'dashboard' | 'detail' | 'import' | 'field' | 'export'
  isOnline: true,
  pendingCount: 0,
  dashboard: null,
  searchQuery: '',
  statusFilter: 'ALL',
  siteFilter: 'ALL',
  ieeeFilter: 'ALL',
  visibleCards: 36,
  selectedEquipmentId: 'T0214',
  equipmentDetail: null,
  selectedAnalyse: null,
  // État Import
  importInspection: null,
  importFile: null,
  importMapping: {},
  importSheet: '',
  importAccessTable: '',
  importAccessSql: '',
  importDupStrategy: 'overwrite',
  importResult: null,
  importError: null,
  importLoading: false,
  // État Formulaire Terrain 3 Étapes
  fieldStep: 1,
  fieldQuickAdd: false,
  fieldData: {
    id_equipement: 'T0214',
    site: 'Alcan BKP',
    localisation: 'Poste Nord',
    date_prelevement: new Date().toISOString().slice(0, 16),
    code_motif: 'Routine',
    charge_pct: '75',
    temperature_huile: '62',
    temperature_ambiante: '22',
    compteur_heures: '48500',
    pression_manometre: 'Normal (0.1 - 0.3 bar)',
    h2: '',
    ch4: '',
    c2h2: '',
    c2h4: '',
    c2h6: '',
    teneur_eau: '',
    rigidite_dielectrique: '',
    niveau_huile: 'Normal',
    couleur_silice: 'Bleu',
    fuite_detectee: false,
    bruit_vibration: false,
    remarques: '',
  },
  fieldBanner: null,
  // État Export
  exportEq: 'T0214',
  exportScopeAll: false,
  exportDateDebut: '1995-01-01',
  exportDateFin: new Date().toISOString().slice(0, 10),
  cachedReportsCount: 0,
};

// ============================================================================
// 3. Synchronisation Réseau & API
// ============================================================================
async function refreshPendingBadge() {
  const pending = await idbGetPendingInspections();
  state.pendingCount = pending.length;
}

async function tryAutoSyncPendingInspections() {
  const pending = await idbGetPendingInspections();
  if (!pending.length) return 0;
  try {
    const res = await fetch('/api/field-inspections/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspections: pending }),
    });
    if (res.ok) {
      await idbClearPendingInspections(pending.map((p) => p.local_id));
      await refreshPendingBadge();
      return pending.length;
    }
  } catch {
    // Hors-ligne
  }
  return 0;
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('HTTP error');
    const data = await res.json();
    state.dashboard = data;
    state.isOnline = true;
    await idbCacheFleet(data);

    // Mettre en cache les 100 derniers rapports dans IndexedDB
    fetch('/api/recent-reports?limit=100')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (reports) => {
        if (reports && Array.isArray(reports)) {
          await idbCacheReports(reports);
          state.cachedReportsCount = reports.length;
        }
      })
      .catch(() => {});
  } catch {
    state.isOnline = false;
    const cached = await idbGetCachedFleet();
    if (cached) state.dashboard = cached;
    const cachedReps = await idbGetCachedReports();
    state.cachedReportsCount = cachedReps.length;
  }
  await refreshPendingBadge();
  renderApp();
}

async function openEquipmentDetail(idEq) {
  state.selectedEquipmentId = idEq;
  state.exportEq = idEq;
  state.activeTab = 'detail';
  state.equipmentDetail = null;
  renderApp();

  try {
    const res = await fetch(`/api/equipements/${encodeURIComponent(idEq)}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    state.equipmentDetail = data;
    state.selectedAnalyse =
      data.history.find((h) => h.gaz_dissous && h.gaz_dissous.tdcg !== null) ||
      data.history[0] ||
      null;
  } catch {
    const cachedReps = await idbGetCachedReports();
    const eqHist = cachedReps.filter((r) => r.id_equipement === idEq);
    const eqCard = (state.dashboard?.equipements || []).find((e) => e.id_equipement === idEq) || {
      id_equipement: idEq,
      nom_equipement: `Transformateur ${idEq}`,
      type_equipement: 'Transformateur',
      site: 'Site Local',
      localisation: 'Poste HT',
    };
    state.equipmentDetail = { equipement: eqCard, history: eqHist };
    state.selectedAnalyse = eqHist[0] || null;
  }
  renderApp();
}

// ============================================================================
// 4. Géométrie Vectorielle SVG du Triangle de Duval 1 (CEI 60599)
// ============================================================================
const X0 = 75;
const Y0 = 325;
const SIDE = 305;
const SQRT3_2 = Math.sqrt(3) / 2;

function toDuvalSvg(pCh4, pC2h4) {
  const fCh4 = pCh4 / 100;
  const fC2h4 = pC2h4 / 100;
  return [X0 + SIDE * (fC2h4 + 0.5 * fCh4), Y0 - SIDE * SQRT3_2 * fCh4];
}

function polyStr(pts) {
  return pts
    .map(([c1, c2]) => {
      const [x, y] = toDuvalSvg(c1, c2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const DUVAL_ZONES = [
  { code: 'PD', fill: 'rgba(56,189,248,0.35)', pts: [[98,2],[100,0],[98,0]], lbl: [98.5,0.8] },
  { code: 'T1', fill: 'rgba(250,204,21,0.32)', pts: [[98,2],[80,20],[76,20],[96,0],[98,0]], lbl: [87,11] },
  { code: 'T2', fill: 'rgba(251,146,60,0.36)', pts: [[80,20],[50,50],[46,50],[76,20]], lbl: [63,35] },
  { code: 'T3', fill: 'rgba(239,68,68,0.38)', pts: [[50,50],[0,100],[0,85],[35,50]], lbl: [20,72] },
  { code: 'D1', fill: 'rgba(99,102,241,0.36)', pts: [[87,0],[64,23],[0,23],[0,0]], lbl: [35,10] },
  { code: 'D2', fill: 'rgba(168,85,247,0.38)', pts: [[64,23],[47,40],[31,40],[0,71],[0,23]], lbl: [22,38] },
  { code: 'DT', fill: 'rgba(236,72,153,0.34)', pts: [[96,0],[76,20],[46,50],[35,50],[0,85],[0,71],[31,40],[47,40],[87,0]], lbl: [55,34] },
];

function renderDuvalTriangleHtml(history, activeAnalyse) {
  const dgaItems = (history || []).filter((h) => {
    const gd = h.gaz_dissous;
    return gd && (gd.ch4 || 0) + (gd.c2h4 || 0) + (gd.c2h2 || 0) > 0;
  });

  const topV = toDuvalSvg(100, 0);
  const rightV = toDuvalSvg(0, 100);
  const leftV = toDuvalSvg(0, 0);

  const zonesSvg = DUVAL_ZONES.map((z) => {
    const [lx, ly] = toDuvalSvg(z.lbl[0], z.lbl[1]);
    return `
      <g>
        <polygon points="${polyStr(z.pts)}" fill="${z.fill}" stroke="#475569" stroke-width="1.2"></polygon>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc" font-size="11" font-weight="800">${z.code}</text>
      </g>
    `;
  }).join('');

  const pointsSvg = dgaItems
    .map((item, idx) => {
      const gd = item.gaz_dissous;
      const sum = (gd.ch4 || 0) + (gd.c2h4 || 0) + (gd.c2h2 || 0);
      const pCh4 = ((gd.ch4 || 0) / sum) * 100;
      const pC2h4 = ((gd.c2h4 || 0) / sum) * 100;
      const [cx, cy] = toDuvalSvg(pCh4, pC2h4);
      const isSel = activeAnalyse && activeAnalyse.id_analyse === item.id_analyse;
      return `
        <g style="cursor:pointer" onclick="window.selectAnalysePoint('${item.id_analyse}')">
          ${isSel ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-dasharray="3 2"></circle>` : ''}
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isSel ? 6.5 : idx === 0 ? 5.5 : 4.2}" fill="${isSel ? '#ef4444' : idx === 0 ? '#f59e0b' : '#e2e8f0'}" stroke="#020617" stroke-width="1.5">
            <title>${item.date_prelevement.slice(0, 10)} — Zone ${item.diagnostic?.code_duval || ''} | CH4:${gd.ch4} C2H4:${gd.c2h4} C2H2:${gd.c2h2} ppm</title>
          </circle>
        </g>
      `;
    })
    .join('');

  const sel = activeAnalyse && activeAnalyse.gaz_dissous ? activeAnalyse : dgaItems[0] || null;
  let infoHtml = `<div style="color:#94a3b8;font-size:12px;">Aucun point DGA disponible.</div>`;
  if (sel && sel.gaz_dissous) {
    const gd = sel.gaz_dissous;
    const sum = Math.max(0.0001, (gd.ch4 || 0) + (gd.c2h4 || 0) + (gd.c2h2 || 0));
    const pCh4 = (((gd.ch4 || 0) / sum) * 100).toFixed(1);
    const pC2h4 = (((gd.c2h4 || 0) / sum) * 100).toFixed(1);
    const pC2h2 = (((gd.c2h2 || 0) / sum) * 100).toFixed(1);
    infoHtml = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:11px;font-weight:800;color:#38bdf8;text-transform:uppercase;">Point Sélectionné (Clic Interactif)</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #1e293b;padding-bottom:6px;">
          <span style="color:#94a3b8;">Date Prélèvement :</span>
          <strong>${sel.date_prelevement.slice(0, 10)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #1e293b;padding-bottom:6px;">
          <span style="color:#94a3b8;">Zone de Duval 1 :</span>
          <span class="pill pill-SURVEILLANCE">${sel.diagnostic?.code_duval || 'NORMAL'}</span>
        </div>
        <div style="font-size:12px;background:#020617;padding:10px;border-radius:10px;border:1px solid #1e293b;color:#cbd5e1;">
          ${sel.diagnostic?.diagnostic_duval || 'Fonctionnement normal'}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
          <div style="background:#020617;padding:8px;border-radius:8px;border:1px solid #1e293b;">
            <div style="font-size:10px;color:#38bdf8;font-weight:700;">%CH₄</div>
            <div style="font-size:14px;font-weight:800;">${pCh4}%</div>
            <div style="font-size:10px;color:#94a3b8;">${gd.ch4 ?? 0} ppm</div>
          </div>
          <div style="background:#020617;padding:8px;border-radius:8px;border:1px solid #1e293b;">
            <div style="font-size:10px;color:#fbbf24;font-weight:700;">%C₂H₄</div>
            <div style="font-size:14px;font-weight:800;">${pC2h4}%</div>
            <div style="font-size:10px;color:#94a3b8;">${gd.c2h4 ?? 0} ppm</div>
          </div>
          <div style="background:#020617;padding:8px;border-radius:8px;border:1px solid #1e293b;">
            <div style="font-size:10px;color:#fb7185;font-weight:700;">%C₂H₂</div>
            <div style="font-size:14px;font-weight:800;">${pC2h2}%</div>
            <div style="font-size:10px;color:#94a3b8;">${gd.c2h2 ?? 0} ppm</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;">
      <div style="flex:1;min-width:300px;">
        <svg viewBox="0 0 460 365" style="width:100%;height:auto;max-width:440px;">
          ${zonesSvg}
          <text x="${topV[0]}" y="${topV[1] - 12}" text-anchor="middle" fill="#38bdf8" font-size="12" font-weight="800">100% CH₄ (Méthane)</text>
          <text x="${rightV[0] + 10}" y="${rightV[1] + 24}" text-anchor="end" fill="#fbbf24" font-size="12" font-weight="800">100% C₂H₄ (Éthylène)</text>
          <text x="${leftV[0] - 10}" y="${leftV[1] + 24}" text-anchor="start" fill="#fb7185" font-size="12" font-weight="800">100% C₂H₂ (Acétylène)</text>
          ${pointsSvg}
        </svg>
      </div>
      <div style="width:270px;background:#020617;border:1px solid #1e293b;border-radius:14px;padding:14px;">
        ${infoHtml}
      </div>
    </div>
  `;
}

// ============================================================================
// 5. Rendu des 5 Écrans Métier
// ============================================================================
function renderDashboardScreen() {
  if (!state.dashboard) {
    return `<div class="panel" style="text-align:center;padding:48px;">Chargement du parc de transformateurs (HuileData2003)...</div>`;
  }
  const { kpis, equipements } = state.dashboard;

  const filtered = equipements.filter((eq) => {
    if (state.statusFilter !== 'ALL' && eq.statut_global !== state.statusFilter) return false;
    if (state.siteFilter !== 'ALL' && eq.site !== state.siteFilter) return false;
    if (state.ieeeFilter !== 'ALL' && String(eq.condition_ieee) !== String(state.ieeeFilter)) return false;
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      const m =
        eq.id_equipement.toLowerCase().includes(q) ||
        (eq.nom_equipement || '').toLowerCase().includes(q) ||
        (eq.site || '').toLowerCase().includes(q) ||
        (eq.localisation || '').toLowerCase().includes(q) ||
        (eq.code_duval || '').toLowerCase().includes(q);
      if (!m) return false;
    }
    return true;
  });

  const cardsHtml = filtered
    .slice(0, state.visibleCards)
    .map((eq) => {
      const st = eq.statut_global || 'BON';
      const label =
        st === 'CRITIQUE'
          ? 'INTERVENTION URGENTE'
          : st === 'SURVEILLANCE'
          ? 'SURVEILLANCE RENFORCÉE'
          : 'ÉTAT SAIN (NORMAL)';
      return `
        <div class="eq-card status-${st}" onclick="window.handleOpenEq('${eq.id_equipement}')">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:18px;font-weight:900;color:#fff;">${eq.id_equipement}</span>
                  <span style="font-size:11px;padding:2px 8px;border-radius:6px;background:#1e293b;color:#cbd5e1;font-weight:700;">${eq.site}</span>
                </div>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${eq.nom_equipement} • ${eq.localisation}</div>
              </div>
              <span class="pill pill-${st}">${label}</span>
            </div>

            <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:12px;margin-top:14px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;">
                <span style="color:#94a3b8;">Indice de Santé Global (THI)</span>
                <strong style="color:#fff;">${Number(eq.health_index || 100).toFixed(1)} %</strong>
              </div>
              <div class="thi-bar-bg">
                <div class="thi-bar-fill ${st}" style="width:${Math.max(6, Math.min(100, eq.health_index || 100))}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;">
                <span>IEEE C57.104 : <strong>Cond. ${eq.condition_ieee}</strong></span>
                <span>Duval 1 : <strong style="color:#38bdf8;">${eq.code_duval || 'NORMAL'}</strong></span>
                <span>CO₂/CO : <strong>${eq.ratio_co2_co ?? '-'}</strong></span>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;text-align:center;">
              <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:7px;">
                <div style="font-size:10px;color:#94a3b8;">TDCG / C₂H₂</div>
                <div style="font-size:12px;font-weight:800;margin-top:2px;">${eq.tdcg !== null ? Math.round(eq.tdcg) + ' ppm' : '-'} / <span style="color:#fb7185;">${eq.c2h2 ?? '-'}</span></div>
              </div>
              <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:7px;">
                <div style="font-size:10px;color:#94a3b8;">Eau (ppm)</div>
                <div style="font-size:12px;font-weight:800;margin-top:2px;color:#38bdf8;">${eq.teneur_eau ?? '-'}</div>
              </div>
              <div style="background:#020617;border:1px solid #1e293b;border-radius:8px;padding:7px;">
                <div style="font-size:10px;color:#94a3b8;">Rigidité (kV)</div>
                <div style="font-size:12px;font-weight:800;margin-top:2px;color:#fbbf24;">${eq.rigidite_dielectrique ?? '-'}</div>
              </div>
            </div>
          </div>

          <div style="margin-top:14px;padding-top:10px;border-top:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
            <span style="color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72%;">${eq.recommandation_action}</span>
            <span style="color:#60a5fa;font-weight:800;">Détails &rarr;</span>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <!-- 4 Cartes KPIs -->
      <div class="grid-4">
        <button class="kpi-card ${state.statusFilter === 'ALL' ? 'active-all' : ''}" onclick="window.setStatusFilter('ALL')">
          <div style="font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;">Parc Total & Historique</div>
          <div style="font-size:28px;font-weight:900;color:#fff;margin-top:6px;">${kpis.total_equipements} <span style="font-size:13px;font-weight:600;color:#94a3b8;">appareils (${kpis.total_analyses} analyses)</span></div>
        </button>
        <button class="kpi-card ${state.statusFilter === 'BON' ? 'active-bon' : ''}" onclick="window.setStatusFilter('BON')">
          <div style="font-size:11px;font-weight:800;color:#34d399;text-transform:uppercase;">Vert — État Sain (BON)</div>
          <div style="font-size:28px;font-weight:900;color:#6ee7b7;margin-top:6px;">${kpis.status_counts?.BON || 0} <span style="font-size:13px;font-weight:600;color:#94a3b8;">conformes</span></div>
        </button>
        <button class="kpi-card ${state.statusFilter === 'SURVEILLANCE' ? 'active-surv' : ''}" onclick="window.setStatusFilter('SURVEILLANCE')">
          <div style="font-size:11px;font-weight:800;color:#fbbf24;text-transform:uppercase;">Orange — Surveillance Renforcée</div>
          <div style="font-size:28px;font-weight:900;color:#fcd34d;margin-top:6px;">${kpis.status_counts?.SURVEILLANCE || 0} <span style="font-size:13px;font-weight:600;color:#94a3b8;">à surveiller</span></div>
        </button>
        <button class="kpi-card ${state.statusFilter === 'CRITIQUE' ? 'active-crit' : ''}" onclick="window.setStatusFilter('CRITIQUE')">
          <div style="font-size:11px;font-weight:800;color:#f87171;text-transform:uppercase;">Rouge — Intervention Urgente</div>
          <div style="font-size:28px;font-weight:900;color:#fca5a5;margin-top:6px;">${kpis.status_counts?.CRITIQUE || 0} <span style="font-size:13px;font-weight:600;color:#94a3b8;">critiques</span></div>
        </button>
      </div>

      <!-- Barre de Filtres -->
      <div class="panel" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;">
        <input
          type="text"
          style="width:360px;max-width:100%;"
          placeholder="Rechercher par ID (ex. T0214, D0905A), site, cellule, zone Duval..."
          value="${state.searchQuery}"
          oninput="window.handleSearchInput(this.value)"
        />
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          <select onchange="window.setSiteFilter(this.value)">
            <option value="ALL">Tous les sites (${(kpis.sites || []).length})</option>
            ${(kpis.sites || [])
              .map(
                (s) =>
                  `<option value="${s}" ${state.siteFilter === s ? 'selected' : ''}>Site : ${s}</option>`
              )
              .join('')}
          </select>
          <select onchange="window.setIeeeFilter(this.value)">
            <option value="ALL" ${state.ieeeFilter === 'ALL' ? 'selected' : ''}>Toutes Conditions IEEE C57.104</option>
            <option value="1" ${state.ieeeFilter === '1' ? 'selected' : ''}>Condition IEEE 1 (Normal)</option>
            <option value="2" ${state.ieeeFilter === '2' ? 'selected' : ''}>Condition IEEE 2 (Avertissement)</option>
            <option value="3" ${state.ieeeFilter === '3' ? 'selected' : ''}>Condition IEEE 3 (Action Requise)</option>
            <option value="4" ${state.ieeeFilter === '4' ? 'selected' : ''}>Condition IEEE 4 (Danger Imminent)</option>
          </select>
          <span style="font-size:12px;color:#94a3b8;"><strong>${filtered.length}</strong> appareils affichés</span>
        </div>
      </div>

      <!-- Grille des Cartes Transformateurs -->
      <div class="grid-3">
        ${cardsHtml}
      </div>

      ${
        filtered.length > state.visibleCards
          ? `<div style="text-align:center;margin-top:8px;">
              <button class="btn btn-slate" onclick="window.loadMoreCards()">Afficher plus de transformateurs (${filtered.length - state.visibleCards} restants)</button>
            </div>`
          : ''
      }
    </div>
  `;
}

function renderDetailScreen() {
  if (!state.equipmentDetail) {
    return `<div class="panel" style="text-align:center;padding:48px;">Chargement du diagnostic expert et du Triangle de Duval pour <strong>${state.selectedEquipmentId}</strong>...</div>`;
  }
  const { equipement, history } = state.equipmentDetail;
  const active = state.selectedAnalyse || history[0] || {};
  const diag = active.diagnostic || {};
  const dga = active.gaz_dissous || (history.find((h) => h.gaz_dissous) || {}).gaz_dissous || {};
  const phys = active.qualite_physicochimique || (history.find((h) => h.qualite_physicochimique) || {}).qualite_physicochimique || {};
  const pcb = active.pcb_metaux || (history.find((h) => h.pcb_metaux) || {}).pcb_metaux || {};

  // Courbe chronologique SVG (Gaz + Charge + Température)
  const chrono = [...history].filter((h) => h.gaz_dissous).reverse().slice(-18);
  const maxVal = Math.max(100, ...chrono.map((c) => Math.max(c.gaz_dissous?.tdcg || 0, c.gaz_dissous?.co || 0, c.gaz_dissous?.h2 || 0)));

  const buildPolyline = (getter, color) => {
    if (!chrono.length) return '';
    const pts = chrono
      .map((item, i) => {
        const x = chrono.length > 1 ? 65 + (i / (chrono.length - 1)) * 690 : 410;
        const y = 195 - Math.min(1, Math.max(0, getter(item))) * 165;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `<polyline fill="none" stroke="${color}" stroke-width="2.2" points="${pts}"></polyline>`;
  };

  return `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <!-- En-tête + Exports 1-clic -->
      <div class="panel" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <button class="btn btn-slate" onclick="window.switchTab('dashboard')">&larr; Retour Parc</button>
          <div>
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 style="font-size:22px;font-weight:900;">${equipement.id_equipement} — ${equipement.nom_equipement}</h2>
              <span class="pill pill-${diag.statut_global || 'BON'}">${diag.statut_global || 'BON'} • THI ${Number(diag.health_index ?? 100).toFixed(1)}%</span>
            </div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px;">
              Site : <strong style="color:#e2e8f0;">${equipement.site}</strong> | Cellule : <strong style="color:#e2e8f0;">${equipement.localisation}</strong> | Tension : <strong>${equipement.tension_nominale || 0} kV</strong> | Volume Huile : <strong>${equipement.litre_huile || 0} L</strong>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <a class="btn btn-red" href="/api/export/pdf/${encodeURIComponent(equipement.id_equipement)}" target="_blank">Rapport PDF (4 pages)</a>
          <a class="btn btn-blue" href="/api/export/docx/${encodeURIComponent(equipement.id_equipement)}" target="_blank">Rapport Word (.docx)</a>
          <a class="btn btn-green" href="/api/export/xlsx?id_equipement=${encodeURIComponent(equipement.id_equipement)}" target="_blank">Classeur Excel (.xlsx)</a>
        </div>
      </div>

      <!-- Bandeau Prescription Active -->
      <div class="panel" style="border-left:4px solid #3b82f6;">
        <div style="font-size:11px;font-weight:800;color:#60a5fa;text-transform:uppercase;">Prescription Technique & Diagnostic Expert (Analyse ${active.id_analyse || '-'})</div>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-top:4px;">${diag.recommandation_action || 'Exploitation normale.'}</div>
        <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:8px;font-size:12px;color:#94a3b8;">
          <span>Condition IEEE C57.104 : <strong style="color:#fff;">Condition ${diag.condition_ieee || 1} / 4</strong></span>
          <span>Zone Duval 1 : <strong style="color:#fbbf24;">${diag.code_duval || 'NORMAL'} (${diag.diagnostic_duval || ''})</strong></span>
          <span>Ratio Cellulose CO₂/CO : <strong style="color:#34d399;">${diag.ratio_co2_co ?? 'N/A'}</strong></span>
          <span>Ordre de travail GMAO : <strong style="color:#38bdf8;">${diag.billet_travail || 'Aucun'}</strong></span>
        </div>
      </div>

      <!-- Triangle de Duval 1 + Tableau IEEE C57.104 -->
      <div class="grid-2">
        <div class="panel">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:4px;">Triangle de Duval 1 Interactif (CEI 60599)</h3>
          <p style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Cliquez sur un point pour inspecter la date et les concentrations de gaz dissous.</p>
          ${renderDuvalTriangleHtml(history, active)}
        </div>

        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;margin-bottom:4px;">Seuils Normatifs IEEE C57.104 & Physico-Chimie</h3>
            <p style="font-size:12px;color:#94a3b8;margin-bottom:10px;">Comparaison des gaz mesurés (ppm) aux 4 conditions IEEE C57.104.</p>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Gaz</th><th>Mesure (ppm)</th><th>Cond. 1</th><th>Cond. 2</th><th>Cond. 3</th><th>Cond. 4</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>H₂</strong></td><td><strong>${dga.h2 ?? '-'}</strong></td><td>&lt; 100</td><td>100-700</td><td>700-1800</td><td>&gt; 1800</td></tr>
                <tr><td><strong>CH₄</strong></td><td><strong>${dga.ch4 ?? '-'}</strong></td><td>&lt; 120</td><td>120-400</td><td>400-1000</td><td>&gt; 1000</td></tr>
                <tr><td><strong>C₂H₂</strong></td><td><strong style="color:#fb7185;">${dga.c2h2 ?? '-'}</strong></td><td>&lt; 1</td><td>1-9</td><td>9-35</td><td>&gt; 35</td></tr>
                <tr><td><strong>C₂H₄</strong></td><td><strong>${dga.c2h4 ?? '-'}</strong></td><td>&lt; 50</td><td>50-100</td><td>100-200</td><td>&gt; 200</td></tr>
                <tr><td><strong>C₂H₆</strong></td><td><strong>${dga.c2h6 ?? '-'}</strong></td><td>&lt; 65</td><td>65-100</td><td>100-150</td><td>&gt; 150</td></tr>
                <tr><td><strong>CO</strong></td><td><strong>${dga.co ?? '-'}</strong></td><td>&lt; 350</td><td>350-570</td><td>570-1400</td><td>&gt; 1400</td></tr>
                <tr><td><strong>TDCG</strong></td><td><strong style="color:#38bdf8;">${dga.tdcg ?? '-'}</strong></td><td>&lt; 720</td><td>720-1920</td><td>1920-4630</td><td>&gt; 4630</td></tr>
              </tbody>
            </table>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center;">
            <div style="background:#020617;padding:10px;border-radius:10px;border:1px solid #1e293b;">
              <div style="font-size:11px;color:#38bdf8;">Eau (ppm)</div>
              <div style="font-size:15px;font-weight:800;margin-top:3px;">${phys.teneur_eau ?? '-'}</div>
            </div>
            <div style="background:#020617;padding:10px;border-radius:10px;border:1px solid #1e293b;">
              <div style="font-size:11px;color:#fbbf24;">Acidité (KOH)</div>
              <div style="font-size:15px;font-weight:800;margin-top:3px;">${phys.acidite ?? '-'}</div>
            </div>
            <div style="background:#020617;padding:10px;border-radius:10px;border:1px solid #1e293b;">
              <div style="font-size:11px;color:#34d399;">Rigidité (kV)</div>
              <div style="font-size:15px;font-weight:800;margin-top:3px;">${phys.rigidite_dielectrique ?? '-'}</div>
            </div>
            <div style="background:#020617;padding:10px;border-radius:10px;border:1px solid #1e293b;">
              <div style="font-size:11px;color:#c084fc;">PCB Total</div>
              <div style="font-size:15px;font-weight:800;margin-top:3px;">${pcb.pcb_total ?? '0.0'} ppm</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Courbes Chronologiques Superposées -->
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <h3 style="font-size:16px;font-weight:800;">Courbes Chronologiques Superposées (TDCG, H₂, CH₄, C₂H₂ & Charge %)</h3>
          <div style="display:flex;gap:14px;font-size:12px;">
            <span style="color:#3b82f6;font-weight:700;">■ TDCG</span>
            <span style="color:#10b981;font-weight:700;">■ H₂</span>
            <span style="color:#f59e0b;font-weight:700;">■ CH₄</span>
            <span style="color:#f43f5e;font-weight:700;">■ C₂H₂</span>
            <span style="color:#a855f7;font-weight:700;">■ Charge (%)</span>
          </div>
        </div>
        <svg viewBox="0 0 800 225" style="width:100%;height:auto;">
          <rect x="55" y="15" width="715" height="180" fill="#020617" rx="8" stroke="#1e293b"></rect>
          ${buildPolyline((it) => (it.gaz_dissous?.tdcg || 0) / maxVal, '#3b82f6')}
          ${buildPolyline((it) => (it.gaz_dissous?.h2 || 0) / maxVal, '#10b981')}
          ${buildPolyline((it) => (it.gaz_dissous?.ch4 || 0) / maxVal, '#f59e0b')}
          ${buildPolyline((it) => (it.gaz_dissous?.c2h2 || 0) / maxVal, '#f43f5e')}
          ${buildPolyline((it) => Math.min(1, (it.charge_pct || 0) / 180), '#a855f7')}
        </svg>
      </div>
    </div>
  `;
}

function renderImportScreen() {
  const insp = state.importInspection;
  return `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <div class="panel" style="border:2px dashed #3b82f6;text-align:center;padding:36px;">
        <h2 style="font-size:19px;font-weight:900;">Module d'Ingestion Multi-Formats & Auto-Mapping par Correspondance Floue</h2>
        <p style="font-size:13px;color:#94a3b8;max-width:680px;margin:8px auto 18px;">
          Formats supportés (1 à 25 000 lignes) : <strong>Excel (.xlsx, .xls)</strong>, <strong>Délimités (.csv, .tsv, .txt)</strong> et <strong>Bases Access (.mdb, .accdb)</strong>.
          Conversion automatique des mentions <code>&lt; 1</code>, <code>&lt; 0.5</code>, <code>ND</code>, <code>Trace</code>.
        </p>
        <label class="btn btn-blue" style="cursor:pointer;">
          <span>Sélectionner un fichier (.xlsx, .xls, .csv, .tsv, .mdb, .accdb)</span>
          <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.mdb,.accdb" style="display:none;" onchange="window.handleFileUpload(this)" />
        </label>
      </div>

      ${state.importLoading ? `<div class="panel" style="text-align:center;color:#38bdf8;font-weight:700;">Analyse et Auto-Mapping Fuzzy Matching en cours...</div>` : ''}
      ${state.importError ? `<div class="panel" style="border-color:#ef4444;color:#fca5a5;"><strong>Erreur :</strong> ${state.importError}</div>` : ''}
      ${
        state.importResult
          ? `<div class="panel" style="border-color:#10b981;background:rgba(16,185,129,0.1);">
              <strong style="color:#6ee7b7;">Importation Réussie :</strong> ${state.importResult.imported_rows} lignes importées et diagnostiquées (${state.importResult.duplicates_handled} doublons gérés).
            </div>`
          : ''
      }

      ${
        insp
          ? `
        <div class="panel" style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">
            <div>
              <h3 style="font-size:16px;font-weight:800;">Fichier : ${insp.filename} (${insp.total_rows} lignes détectées)</h3>
              <p style="font-size:12px;color:#94a3b8;">Format : ${insp.metadata.format} ${insp.metadata.encoding ? `| Encodage : ${insp.metadata.encoding} | Délimiteur : ${insp.metadata.delimiter}` : ''}</p>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <select onchange="window.setDupStrategy(this.value)">
                <option value="overwrite" ${state.importDupStrategy === 'overwrite' ? 'selected' : ''}>Doublons : Écraser l'existant</option>
                <option value="archive" ${state.importDupStrategy === 'archive' ? 'selected' : ''}>Doublons : Archiver séparément</option>
              </select>
              <button class="btn btn-green" onclick="window.commitImportNow()">Valider et Importer (${insp.total_rows} lignes)</button>
            </div>
          </div>

          ${
            insp.metadata.access_tables
              ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:10px;border-top:1px solid #1e293b;">
              <div>
                <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:4px;">Table Access cible :</label>
                <select style="width:100%;" onchange="window.changeAccessTable(this.value)">
                  ${insp.metadata.access_tables.map((t) => `<option value="${t}" ${state.importAccessTable === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:4px;">Ou Requête SQL Access personnalisée :</label>
                <div style="display:flex;gap:8px;">
                  <input type="text" id="accessSqlInput" style="flex:1;" value="${state.importAccessSql}" placeholder="SELECT TOP 100 * FROM [Gaz Dissous]" />
                  <button class="btn btn-blue" onclick="window.runAccessSql()">Exécuter</button>
                </div>
              </div>
            </div>
          `
              : ''
          }

          <table class="data-table">
            <thead>
              <tr>
                <th>Colonne Source</th>
                <th>Confiance Auto-Mapping</th>
                <th>Champ Canonique Cible (Modification Manuelle)</th>
                <th>Catégorie</th>
              </tr>
            </thead>
            <tbody>
              ${insp.auto_mapping
                .map((m) => {
                  const cur = state.importMapping[m.source_column] || '__IGNORE__';
                  const badgeCls =
                    m.confidence_level === 'exact'
                      ? 'pill-BON'
                      : m.confidence_level === 'medium'
                      ? 'pill-SURVEILLANCE'
                      : 'pill-CRITIQUE';
                  return `
                  <tr>
                    <td><strong>${m.source_column}</strong></td>
                    <td><span class="pill ${badgeCls}">${m.confidence_level.toUpperCase()} (${m.confidence_score}%)</span></td>
                    <td>
                      <select onchange="window.updateColMapping('${m.source_column.replace(/'/g, "\\'")}', this.value)">
                        <option value="__IGNORE__">-- Ignorer --</option>
                        ${insp.canonical_fields
                          .map(
                            (cf) =>
                              `<option value="${cf.field}" ${cur === cf.field ? 'selected' : ''}>${cf.label} (${cf.field})</option>`
                          )
                          .join('')}
                      </select>
                    </td>
                    <td style="color:#94a3b8;">${m.category}</td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>

          <h4 style="font-size:14px;font-weight:800;margin-top:10px;">Prévisualisation Dynamique des 10 Premières Lignes Nettoyées</h4>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  ${Object.keys(insp.preview_rows[0] || {}).map((k) => `<th>${k}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${insp.preview_rows
                  .map(
                    (r) =>
                      `<tr>${Object.keys(insp.preview_rows[0] || {})
                        .map((k) => `<td>${r[k] ?? '-'}</td>`)
                        .join('')}</tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderFieldScreen() {
  const fd = state.fieldData;
  const eqList = (state.dashboard?.equipements || []).slice(0, 250);

  return `
    <div style="max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:18px;">
      <div class="panel" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">
        <div>
          <h2 style="font-size:18px;font-weight:900;">Formulaire de Collecte Terrain Hors-Ligne (Offline-First PWA)</h2>
          <p style="font-size:12px;color:#94a3b8;">Enregistrement immédiat dans IndexedDB (clé <code>pending_field_inspections</code>) et synchronisation SQLite automatique.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="pill ${state.pendingCount > 0 ? 'pill-SURVEILLANCE' : 'pill-BON'}">${state.pendingCount} relevé(s) en attente</span>
          ${state.pendingCount > 0 ? `<button class="btn btn-blue" onclick="window.forceSyncNow()">Synchroniser maintenant</button>` : ''}
        </div>
      </div>

      ${state.fieldBanner ? `<div class="panel" style="border-color:#10b981;background:rgba(16,185,129,0.12);color:#6ee7b7;font-weight:700;">${state.fieldBanner}</div>` : ''}

      <!-- Sélecteur des 3 Étapes -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <button class="touch-btn ${state.fieldStep === 1 ? 'selected-blue' : ''}" onclick="window.setFieldStep(1)">Étape 1 : Identification</button>
        <button class="touch-btn ${state.fieldStep === 2 ? 'selected-blue' : ''}" onclick="window.setFieldStep(2)">Étape 2 : Mesures Directes</button>
        <button class="touch-btn ${state.fieldStep === 3 ? 'selected-blue' : ''}" onclick="window.setFieldStep(3)">Étape 3 : Inspection Visuelle</button>
      </div>

      <div class="panel">
        ${
          state.fieldStep === 1
            ? `
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">Étape 1 — Identification de l'Appareil & Horodatage</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Transformateur :</label>
              <select style="width:100%;padding:12px;" onchange="window.updateField('id_equipement', this.value)">
                ${eqList.map((e) => `<option value="${e.id_equipement}" ${fd.id_equipement === e.id_equipement ? 'selected' : ''}>${e.id_equipement} — ${e.nom_equipement} (${e.site})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Date & Heure :</label>
              <input type="datetime-local" style="width:100%;padding:12px;" value="${fd.date_prelevement}" onchange="window.updateField('date_prelevement', this.value)" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Site :</label>
              <input type="text" style="width:100%;padding:12px;" value="${fd.site}" oninput="window.updateField('site', this.value)" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Localisation / Cellule :</label>
              <input type="text" style="width:100%;padding:12px;" value="${fd.localisation}" oninput="window.updateField('localisation', this.value)" />
            </div>
          </div>
          <div style="margin-top:18px;text-align:right;">
            <button class="btn btn-blue" style="padding:14px 24px;" onclick="window.setFieldStep(2)">Suivant : Mesures Directes &rarr;</button>
          </div>
        `
            : state.fieldStep === 2
            ? `
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">Étape 2 — Mesures Directes (Charge %, Températures, Compteur & Manomètres)</h3>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Charge (%) :</label>
              <input type="number" style="width:100%;padding:12px;" value="${fd.charge_pct}" oninput="window.updateField('charge_pct', this.value)" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Temp. Huile (°C) :</label>
              <input type="number" style="width:100%;padding:12px;" value="${fd.temperature_huile}" oninput="window.updateField('temperature_huile', this.value)" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Temp. Ambiante (°C) :</label>
              <input type="number" style="width:100%;padding:12px;" value="${fd.temperature_ambiante}" oninput="window.updateField('temperature_ambiante', this.value)" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Compteur (h) :</label>
              <input type="number" style="width:100%;padding:12px;" value="${fd.compteur_heures}" oninput="window.updateField('compteur_heures', this.value)" />
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:20px;">
            <button class="btn btn-slate" onclick="window.setFieldStep(1)">&larr; Retour Étape 1</button>
            <button class="btn btn-blue" style="padding:14px 24px;" onclick="window.setFieldStep(3)">Suivant : Inspection Visuelle &rarr;</button>
          </div>
        `
            : `
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">Étape 3 — Inspection Visuelle & Validation Tactile</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:8px;">Niveau d'Huile Visible :</label>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${['Bas', 'Normal', 'Haut']
                  .map(
                    (n) =>
                      `<button class="touch-btn ${fd.niveau_huile === n ? (n === 'Normal' ? 'selected-green' : 'selected-amber') : ''}" onclick="window.updateField('niveau_huile','${n}',true)">${n}</button>`
                  )
                  .join('')}
              </div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:8px;">Gel de Silice (Déshydrateur) :</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button class="touch-btn ${fd.couleur_silice === 'Bleu' ? 'selected-blue' : ''}" onclick="window.updateField('couleur_silice','Bleu',true)">Bleu (Actif)</button>
                <button class="touch-btn ${fd.couleur_silice === 'Rose' ? 'selected-pink' : ''}" onclick="window.updateField('couleur_silice','Rose',true)">Rose (Saturé)</button>
              </div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:8px;">Détection de Fuites :</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button class="touch-btn ${!fd.fuite_detectee ? 'selected-green' : ''}" onclick="window.updateFieldBool('fuite_detectee',false)">Non (Étanche)</button>
                <button class="touch-btn ${fd.fuite_detectee ? 'selected-red' : ''}" onclick="window.updateFieldBool('fuite_detectee',true)">OUI (Fuite)</button>
              </div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:8px;">Bruit ou Vibration Anormale :</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button class="touch-btn ${!fd.bruit_vibration ? 'selected-green' : ''}" onclick="window.updateFieldBool('bruit_vibration',false)">Non (Normal)</button>
                <button class="touch-btn ${fd.bruit_vibration ? 'selected-red' : ''}" onclick="window.updateFieldBool('bruit_vibration',true)">OUI (Anormal)</button>
              </div>
            </div>
          </div>
          <div style="margin-top:14px;">
            <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Observations Opérateur :</label>
            <textarea rows="3" style="width:100%;" oninput="window.updateField('remarques', this.value)">${fd.remarques}</textarea>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:20px;">
            <button class="btn btn-slate" onclick="window.setFieldStep(2)">&larr; Retour Étape 2</button>
            <button class="btn btn-green" style="padding:14px 28px;font-size:14px;" onclick="window.submitFieldInspection()">Enregistrer dans IndexedDB & Synchroniser</button>
          </div>
        `
        }
      </div>
    </div>
  `;
}

function renderExportScreen() {
  const eqList = (state.dashboard?.equipements || []).slice(0, 300);
  const qParams = `date_debut=${encodeURIComponent(state.exportDateDebut)}&date_fin=${encodeURIComponent(state.exportDateFin)}`;
  const tabTarget = state.exportScopeAll ? 'ALL' : state.exportEq;

  return `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <div class="panel">
        <h2 style="font-size:18px;font-weight:900;">Centre d'Exportation Multi-Formats (PDF 4 Pages, Word .docx, Excel 4 Onglets, CSV GMAO)</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px;">
          <div>
            <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Transformateur Cible :</label>
            <select style="width:100%;" onchange="window.setExportEq(this.value)">
              ${eqList.map((e) => `<option value="${e.id_equipement}" ${state.exportEq === e.id_equipement ? 'selected' : ''}>${e.id_equipement} — ${e.nom_equipement} (${e.statut_global})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Date Début :</label>
            <input type="date" style="width:100%;" value="${state.exportDateDebut}" onchange="window.setExportDateDebut(this.value)" />
          </div>
          <div>
            <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px;">Date Fin :</label>
            <input type="date" style="width:100%;" value="${state.exportDateFin}" onchange="window.setExportDateFin(this.value)" />
          </div>
        </div>
      </div>

      <div class="grid-3">
        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#fca5a5;">1. Rapport Exécutif & Technique PDF (4 Pages)</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Synthèse décisionnelle, Triangle de Duval vectoriel, seuils IEEE C57.104, courbes chronologiques et Bon de travail GMAO prêt à signer.</p>
          </div>
          <a class="btn btn-red" href="/api/export/pdf/${encodeURIComponent(state.exportEq)}?${qParams}" target="_blank">Télécharger le Rapport PDF (${state.exportEq})</a>
        </div>

        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#93c5fd;">2. Rapport d'Ingénierie Éditable Word (.docx)</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Format Word paginé ("Page X sur Y") avec tableaux d'ingénierie contrastés, encadrés d'alertes critiques et cartouche de signature.</p>
          </div>
          <a class="btn btn-blue" href="/api/export/docx/${encodeURIComponent(state.exportEq)}?${qParams}" target="_blank">Télécharger le Rapport Word (.docx)</a>
        </div>

        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#6ee7b7;">3. Classeur Structuré Excel (.xlsx — 4 Onglets)</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Onglets : 1. Tableau de Bord | 2. Données Nettoyées | 3. Historique DGA & Ratios (%Duval, CO₂/CO, TDCG) | 4. Recommandations.</p>
          </div>
          <a class="btn btn-green" href="/api/export/xlsx?id_equipement=${encodeURIComponent(tabTarget)}&${qParams}" target="_blank">Télécharger le Classeur Excel (4 Onglets)</a>
        </div>

        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#fcd34d;">4. Fichier Plat CSV (SAP PM / Maximo / SCADA)</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Export UTF-8 normalisé pour réinjection directe dans un progiciel de GMAO ou un historien SCADA.</p>
          </div>
          <a class="btn btn-amber" href="/api/export/csv?id_equipement=${encodeURIComponent(tabTarget)}&${qParams}" target="_blank">Exporter le Fichier CSV GMAO</a>
        </div>

        <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#d8b4fe;">5. Base Locale SQLite (transformers_vault.db)</h3>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px;">Archive intégrale de la base SQLite initialisée depuis HuileData2003(1).mdb avec les 6 tables canoniques.</p>
          </div>
          <a class="btn btn-purple" href="/api/export/sqlite" target="_blank">Télécharger transformers_vault.db</a>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// 6. Contrôleurs Globaux & Rendu Principal
// ============================================================================
window.switchTab = (tab) => {
  state.activeTab = tab;
  renderApp();
};

window.setStatusFilter = (st) => {
  state.statusFilter = state.statusFilter === st ? 'ALL' : st;
  renderApp();
};

window.setSiteFilter = (s) => {
  state.siteFilter = s;
  renderApp();
};

window.setIeeeFilter = (v) => {
  state.ieeeFilter = v;
  renderApp();
};

window.handleSearchInput = (val) => {
  state.searchQuery = val;
  renderApp();
};

window.loadMoreCards = () => {
  state.visibleCards += 36;
  renderApp();
};

window.handleOpenEq = (idEq) => {
  openEquipmentDetail(idEq);
};

window.selectAnalysePoint = (idAn) => {
  if (!state.equipmentDetail) return;
  const found = state.equipmentDetail.history.find((h) => h.id_analyse === idAn);
  if (found) {
    state.selectedAnalyse = found;
    renderApp();
  }
};

window.handleFileUpload = async (input) => {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  state.importFile = file;
  state.importLoading = true;
  state.importError = null;
  state.importResult = null;
  renderApp();

  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/import/inspect', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Erreur de lecture du fichier');
    const data = await res.json();
    state.importInspection = data;
    state.importMapping = data.active_mapping || {};
    state.importAccessTable = data.metadata?.selected_table || '';
  } catch (e) {
    state.importError = e.message;
  } finally {
    state.importLoading = false;
    renderApp();
  }
};

window.updateColMapping = async (srcCol, targetField) => {
  state.importMapping[srcCol] = targetField === '__IGNORE__' ? null : targetField;
  if (!state.importInspection) return;
  const fd = new FormData();
  fd.append('file_token', state.importInspection.file_token);
  fd.append('filename', state.importInspection.filename);
  fd.append('mapping_json', JSON.stringify(state.importMapping));
  if (state.importAccessTable) fd.append('access_table', state.importAccessTable);
  if (state.importAccessSql) fd.append('access_sql', state.importAccessSql);
  try {
    const res = await fetch('/api/import/preview-remap', { method: 'POST', body: fd });
    if (res.ok) {
      const p = await res.json();
      state.importInspection.preview_rows = p.preview_rows;
      state.importInspection.total_rows = p.total_rows;
      renderApp();
    }
  } catch {}
};

window.changeAccessTable = async (tbl) => {
  state.importAccessTable = tbl;
  state.importAccessSql = '';
  if (!state.importFile) return;
  const fd = new FormData();
  fd.append('file', state.importFile);
  fd.append('access_table', tbl);
  const res = await fetch('/api/import/inspect', { method: 'POST', body: fd });
  if (res.ok) {
    const data = await res.json();
    state.importInspection = data;
    state.importMapping = data.active_mapping || {};
    renderApp();
  }
};

window.runAccessSql = async () => {
  const el = document.getElementById('accessSqlInput');
  const sql = el ? el.value : '';
  state.importAccessSql = sql;
  if (!state.importFile || !sql.trim()) return;
  const fd = new FormData();
  fd.append('file', state.importFile);
  fd.append('access_sql', sql);
  const res = await fetch('/api/import/inspect', { method: 'POST', body: fd });
  if (res.ok) {
    const data = await res.json();
    state.importInspection = data;
    state.importMapping = data.active_mapping || {};
    renderApp();
  }
};

window.setDupStrategy = (val) => {
  state.importDupStrategy = val;
};

window.commitImportNow = async () => {
  if (!state.importInspection) return;
  state.importLoading = true;
  renderApp();
  const fd = new FormData();
  fd.append('file_token', state.importInspection.file_token);
  fd.append('filename', state.importInspection.filename);
  fd.append('mapping_json', JSON.stringify(state.importMapping));
  fd.append('duplicate_strategy', state.importDupStrategy);
  if (state.importAccessTable) fd.append('access_table', state.importAccessTable);
  if (state.importAccessSql) fd.append('access_sql', state.importAccessSql);
  try {
    const res = await fetch('/api/import/commit', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Échec import');
    state.importResult = await res.json();
    await loadDashboard();
  } catch (e) {
    state.importError = e.message;
  } finally {
    state.importLoading = false;
    renderApp();
  }
};

window.setFieldStep = (s) => {
  state.fieldStep = s;
  renderApp();
};

window.updateField = (k, v, rerender = false) => {
  state.fieldData[k] = v;
  if (rerender) renderApp();
};

window.updateFieldBool = (k, v) => {
  state.fieldData[k] = v;
  renderApp();
};

window.submitFieldInspection = async () => {
  const fd = state.fieldData;
  const payload = {
    id_analyse: 'TER-' + Date.now().toString(36).toUpperCase(),
    id_equipement: fd.id_equipement,
    site: fd.site,
    localisation: fd.localisation,
    date_prelevement: new Date(fd.date_prelevement).toISOString(),
    charge_pct: fd.charge_pct ? Number(fd.charge_pct) : null,
    temperature_huile: fd.temperature_huile ? Number(fd.temperature_huile) : null,
    temperature_ambiante: fd.temperature_ambiante ? Number(fd.temperature_ambiante) : null,
    compteur_heures: fd.compteur_heures ? Number(fd.compteur_heures) : null,
    pression_manometre: fd.pression_manometre,
    code_motif: fd.code_motif,
    laboratoire: 'Kit Portable / Terrain Offline',
    niveau_huile: fd.niveau_huile,
    couleur_silice: fd.couleur_silice,
    fuite_detectee: fd.fuite_detectee,
    bruit_vibration: fd.bruit_vibration,
    remarques: fd.remarques,
    created_at: new Date().toISOString(),
  };

  await idbAddPendingInspection(payload);
  await refreshPendingBadge();
  const synced = await tryAutoSyncPendingInspections();
  if (synced > 0) {
    state.fieldBanner = `Relevé enregistré dans IndexedDB (pending_field_inspections) et synchronisé immédiatement avec SQLite (${synced} synchronisé) !`;
    await loadDashboard();
  } else {
    state.fieldBanner = `Mode Hors-Ligne : Relevé stocké dans IndexedDB (pending_field_inspections). Il sera synchronisé dès que le serveur local sera joignable.`;
  }
  state.fieldStep = 1;
  renderApp();
};

window.forceSyncNow = async () => {
  const synced = await tryAutoSyncPendingInspections();
  if (synced > 0) {
    state.fieldBanner = `${synced} relevé(s) synchronisé(s) avec succès vers SQLite !`;
    await loadDashboard();
  }
  renderApp();
};

window.setExportEq = (v) => {
  state.exportEq = v;
  renderApp();
};
window.setExportDateDebut = (v) => {
  state.exportDateDebut = v;
  renderApp();
};
window.setExportDateFin = (v) => {
  state.exportDateFin = v;
  renderApp();
};

function renderApp() {
  const root = document.getElementById('root');
  if (!root) return;

  let mainContent = '';
  if (state.activeTab === 'dashboard') mainContent = renderDashboardScreen();
  else if (state.activeTab === 'detail') mainContent = renderDetailScreen();
  else if (state.activeTab === 'import') mainContent = renderImportScreen();
  else if (state.activeTab === 'field') mainContent = renderFieldScreen();
  else if (state.activeTab === 'export') mainContent = renderExportScreen();

  root.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand" onclick="window.switchTab('dashboard')">
          <div class="brand-icon">⚡</div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;font-weight:900;color:#fff;">TransfoDiag Pro</span>
              <span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;background:rgba(37,99,235,0.25);color:#93c5fd;border:1px solid rgba(59,130,246,0.4);">PWA OFFLINE-FIRST</span>
            </div>
            <div style="font-size:11px;color:#94a3b8;">IEEE C57.104 • CEI 60599 • Triangle de Duval 1 • Base HuileData2003</div>
          </div>
        </div>

        <nav class="nav-tabs">
          <button class="nav-btn ${state.activeTab === 'dashboard' || state.activeTab === 'detail' ? 'active' : ''}" onclick="window.switchTab('dashboard')">
            Parc & Diagnostics
          </button>
          <button class="nav-btn ${state.activeTab === 'import' ? 'active' : ''}" onclick="window.switchTab('import')">
            Import & Auto-Mapping
          </button>
          <button class="nav-btn ${state.activeTab === 'field' ? 'active' : ''}" onclick="window.switchTab('field')">
            Saisie Terrain Hors-Ligne
            ${state.pendingCount > 0 ? `<span class="badge-count">${state.pendingCount}</span>` : ''}
          </button>
          <button class="nav-btn ${state.activeTab === 'export' ? 'active' : ''}" onclick="window.switchTab('export')">
            Centre d'Exportation
          </button>
        </nav>

        <div>
          <span class="pill ${state.isOnline ? 'pill-BON' : 'pill-SURVEILLANCE'}">
            ${state.isOnline ? '● Moteur Local SQLite Connecté' : '● Mode Autonome Hors-Ligne (IndexedDB)'}
          </span>
        </div>
      </div>
    </header>

    <main class="container">
      ${mainContent}
    </main>
  `;
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setInterval(async () => {
    const synced = await tryAutoSyncPendingInspections();
    if (synced > 0) await loadDashboard();
  }, 10000);
});
