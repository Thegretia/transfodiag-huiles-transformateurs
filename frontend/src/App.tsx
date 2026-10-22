import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Upload,
  ClipboardCheck,
  Download,
  Wifi,
  WifiOff,
  RefreshCw,
  Zap,
} from 'lucide-react';
import type { DashboardResponse } from './types';
import {
  fetchDashboard,
  checkBackendOnline,
  syncPendingInspectionsWithBackend,
} from './services/api';
import { getPendingFieldInspections } from './db/offlineDb';
import { DashboardView } from './components/DashboardView';
import { EquipmentDetailView } from './components/EquipmentDetailView';
import { FileImportView } from './components/FileImportView';
import { FieldInspectionView } from './components/FieldInspectionView';
import { ExportCenterView } from './components/ExportCenterView';

type ActiveTab = 'dashboard' | 'detail' | 'import' | 'field' | 'export';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('T0214');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshPendingCount = useCallback(async () => {
    const items = await getPendingFieldInspections();
    setPendingCount(items.length);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      const { data, isOfflineCache } = await fetchDashboard();
      setDashboard(data);
      setIsOnline(!isOfflineCache);
    } catch {
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    refreshPendingCount();

    // Boucle de surveillance réseau et synchronisation automatique en arrière-plan (Offline-First)
    const interval = setInterval(async () => {
      const online = await checkBackendOnline();
      setIsOnline(online);
      if (online) {
        const synced = await syncPendingInspectionsWithBackend();
        if (synced > 0) {
          await refreshPendingCount();
          await loadDashboardData();
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [loadDashboardData, refreshPendingCount]);

  const handleSelectEquipment = (id: string) => {
    setSelectedEquipmentId(id);
    setActiveTab('detail');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Barre de Navigation Principale */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  TransfoDiag Pro
                </h1>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  PWA Offline-First
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                IEEE C57.104 • CEI 60599 • Triangle de Duval 1 • Base HuileData2003
              </p>
            </div>
          </div>

          {/* Onglets de Navigation */}
          <nav className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'dashboard' || activeTab === 'detail'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Parc &amp; Diagnostics</span>
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'import'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Import &amp; Auto-Mapping</span>
            </button>

            <button
              onClick={() => setActiveTab('field')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'field'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Saisie Terrain</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'export'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Centre d&apos;Exportation</span>
            </button>
          </nav>

          {/* Indicateur d'État Réseau / Synchronisation */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                isOnline
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Moteur Local Connecté</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Mode Autonome Hors-Ligne</span>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      {/* Contenu Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {loading && !dashboard ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-300 font-semibold">
              Chargement de la base locale transformers_vault.db (901 équipements, 11 702 analyses)...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && dashboard && (
              <DashboardView
                kpis={dashboard.kpis}
                equipements={dashboard.equipements}
                onSelectEquipement={handleSelectEquipment}
              />
            )}

            {activeTab === 'detail' && (
              <EquipmentDetailView
                idEquipement={selectedEquipmentId}
                onBack={() => setActiveTab('dashboard')}
              />
            )}

            {activeTab === 'import' && (
              <FileImportView
                onImportComplete={() => {
                  loadDashboardData();
                }}
              />
            )}

            {activeTab === 'field' && (
              <FieldInspectionView
                equipements={dashboard?.equipements || []}
                sites={dashboard?.kpis.sites || ['Alcan BKP']}
                pendingCount={pendingCount}
                onPendingChange={() => {
                  refreshPendingCount();
                  loadDashboardData();
                }}
              />
            )}

            {activeTab === 'export' && (
              <ExportCenterView equipements={dashboard?.equipements || []} />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
