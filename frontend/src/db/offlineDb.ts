import Dexie, { type Table } from 'dexie';
import type {
  PendingFieldInspection,
  AnalyseHistoryItem,
  EquipementSummary,
  DashboardKPIs,
} from '../types';

export interface CachedFleetState {
  id: string;
  kpis: DashboardKPIs;
  equipements: EquipementSummary[];
  updated_at: string;
}

export class TransfoDiagIndexedDB extends Dexie {
  // Clé explicite requise par le cahier des charges : pending_field_inspections
  pending_field_inspections!: Table<PendingFieldInspection, number>;
  // Mise en cache des 100 derniers rapports d'analyse
  cached_reports!: Table<AnalyseHistoryItem, string>;
  // Mise en cache du parc de transformateurs pour sélection hors-ligne
  cached_fleet!: Table<CachedFleetState, string>;

  constructor() {
    super('TransfoDiagOfflineVault');
    this.version(1).stores({
      pending_field_inspections: '++local_id, id_analyse, id_equipement, site, created_at',
      cached_reports: 'id_analyse, id_equipement, date_prelevement',
      cached_fleet: 'id',
    });
  }
}

export const offlineDb = new TransfoDiagIndexedDB();

export async function saveFieldInspectionOffline(
  inspection: PendingFieldInspection
): Promise<number> {
  return await offlineDb.pending_field_inspections.add(inspection);
}

export async function getPendingFieldInspections(): Promise<PendingFieldInspection[]> {
  return await offlineDb.pending_field_inspections.orderBy('created_at').toArray();
}

export async function clearPendingFieldInspections(ids: number[]): Promise<void> {
  await offlineDb.pending_field_inspections.bulkDelete(ids);
}

export async function cacheRecentReports(reports: AnalyseHistoryItem[]): Promise<void> {
  const top100 = reports.slice(0, 100);
  await offlineDb.cached_reports.clear();
  await offlineDb.cached_reports.bulkPut(top100);
}

export async function getCachedRecentReports(): Promise<AnalyseHistoryItem[]> {
  return await offlineDb.cached_reports.reverse().sortBy('date_prelevement');
}
