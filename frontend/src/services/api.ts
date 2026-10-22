import type {
  DashboardResponse,
  EquipementDetailResponse,
  PendingFieldInspection,
  FileInspectionResponse,
  AnalyseHistoryItem,
} from '../types';
import {
  offlineDb,
  getPendingFieldInspections,
  clearPendingFieldInspections,
  cacheRecentReports,
  getCachedRecentReports,
} from '../db/offlineDb';

const API_BASE = '/api';

export async function checkBackendOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchDashboard(): Promise<{ data: DashboardResponse; isOfflineCache: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/dashboard`);
    if (!res.ok) throw new Error('Backend error');
    const data: DashboardResponse = await res.json();
    await offlineDb.cached_fleet.put({
      id: 'fleet_main',
      kpis: data.kpis,
      equipements: data.equipements,
      updated_at: new Date().toISOString(),
    });
    // Rafraîchir également les 100 derniers rapports dans IndexedDB en arrière-plan
    fetch(`${API_BASE}/recent-reports?limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((reports) => {
        if (reports && Array.isArray(reports)) {
          cacheRecentReports(reports).catch(() => {});
        }
      })
      .catch(() => {});

    return { data, isOfflineCache: false };
  } catch {
    const cached = await offlineDb.cached_fleet.get('fleet_main');
    if (cached) {
      return {
        data: { kpis: cached.kpis, equipements: cached.equipements },
        isOfflineCache: true,
      };
    }
    throw new Error('Serveur local hors-ligne et aucun cache IndexedDB disponible.');
  }
}

export async function fetchEquipementDetail(idEquipement: string): Promise<EquipementDetailResponse> {
  try {
    const res = await fetch(`${API_BASE}/equipements/${encodeURIComponent(idEquipement)}`);
    if (!res.ok) throw new Error('Equipement non trouvé');
    return await res.json();
  } catch {
    // Fallback hors-ligne depuis les 100 derniers rapports et le cache parc IndexedDB
    const cachedFleet = await offlineDb.cached_fleet.get('fleet_main');
    const eqSummary = cachedFleet?.equipements.find((e) => e.id_equipement === idEquipement);
    const allReports = await getCachedRecentReports();
    const eqHistory = allReports.filter((r) => r.id_equipement === idEquipement);
    if (eqSummary) {
      return {
        equipement: {
          id_equipement: eqSummary.id_equipement,
          nom_equipement: eqSummary.nom_equipement,
          type_equipement: eqSummary.type_equipement,
          site: eqSummary.site,
          localisation: eqSummary.localisation,
          litre_huile: eqSummary.litre_huile,
          no_serie: eqSummary.no_serie,
          tension_nominale: eqSummary.tension_nominale,
          date_mise_en_service: eqSummary.date_mise_en_service,
        },
        history: eqHistory,
      };
    }
    throw new Error(`Impossible de charger les détails de ${idEquipement} en mode hors-ligne.`);
  }
}

export async function syncPendingInspectionsWithBackend(): Promise<number> {
  const pending = await getPendingFieldInspections();
  if (pending.length === 0) return 0;

  const isOnline = await checkBackendOnline();
  if (!isOnline) return 0;

  const res = await fetch(`${API_BASE}/field-inspections/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspections: pending }),
  });

  if (res.ok) {
    const ids = pending.map((p) => p.local_id!).filter((id) => id !== undefined);
    await clearPendingFieldInspections(ids);
    return pending.length;
  }
  return 0;
}

export async function inspectUploadedFile(
  file: File,
  options?: { sheetName?: string; accessTable?: string; accessSql?: string }
): Promise<FileInspectionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.sheetName) formData.append('sheet_name', options.sheetName);
  if (options?.accessTable) formData.append('access_table', options.accessTable);
  if (options?.accessSql) formData.append('access_sql', options.accessSql);

  const res = await fetch(`${API_BASE}/import/inspect`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erreur lors de l’analyse du fichier' }));
    throw new Error(err.detail || 'Erreur de lecture du fichier');
  }
  return await res.json();
}

export async function previewRemappedColumns(params: {
  fileToken: string;
  filename: string;
  mapping: Record<string, string | null>;
  sheetName?: string;
  accessTable?: string;
  accessSql?: string;
}): Promise<{ total_rows: number; preview_rows: Record<string, any>[]; alerts: string[] }> {
  const formData = new FormData();
  formData.append('file_token', params.fileToken);
  formData.append('filename', params.filename);
  formData.append('mapping_json', JSON.stringify(params.mapping));
  if (params.sheetName) formData.append('sheet_name', params.sheetName);
  if (params.accessTable) formData.append('access_table', params.accessTable);
  if (params.accessSql) formData.append('access_sql', params.accessSql);

  const res = await fetch(`${API_BASE}/import/preview-remap`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Erreur lors de la mise à jour de la prévisualisation');
  return await res.json();
}

export async function commitFileImport(params: {
  fileToken: string;
  filename: string;
  mapping: Record<string, string | null>;
  duplicateStrategy: 'overwrite' | 'archive';
  sheetName?: string;
  accessTable?: string;
  accessSql?: string;
}): Promise<{
  imported_rows: number;
  duplicates_handled: number;
  duplicate_strategy: string;
  alerts_count: number;
  alerts: string[];
}> {
  const formData = new FormData();
  formData.append('file_token', params.fileToken);
  formData.append('filename', params.filename);
  formData.append('mapping_json', JSON.stringify(params.mapping));
  formData.append('duplicate_strategy', params.duplicateStrategy);
  if (params.sheetName) formData.append('sheet_name', params.sheetName);
  if (params.accessTable) formData.append('access_table', params.accessTable);
  if (params.accessSql) formData.append('access_sql', params.accessSql);

  const res = await fetch(`${API_BASE}/import/commit`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erreur lors de l’importation' }));
    throw new Error(err.detail || 'Échec de l’importation');
  }
  return await res.json();
}

export async function fetchCachedOrOnlineReports(): Promise<AnalyseHistoryItem[]> {
  try {
    const res = await fetch(`${API_BASE}/recent-reports?limit=100`);
    if (res.ok) {
      const data: AnalyseHistoryItem[] = await res.json();
      await cacheRecentReports(data);
      return data;
    }
  } catch {
    // Fallback IndexedDB
  }
  return await getCachedRecentReports();
}
