import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Search,
  Filter,
  Droplets,
  Zap,
  Flame,
  ArrowUpRight,
  FileText,
} from 'lucide-react';
import type { DashboardKPIs, EquipementSummary, StatutGlobal } from '../types';

interface DashboardViewProps {
  kpis: DashboardKPIs;
  equipements: EquipementSummary[];
  onSelectEquipement: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  kpis,
  equipements,
  onSelectEquipement,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StatutGlobal>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [ieeeFilter, setIeeeFilter] = useState<number | 'ALL'>('ALL');
  const [visibleLimit, setVisibleLimit] = useState<number>(36);

  const filtered = useMemo(() => {
    return equipements.filter((eq) => {
      if (statusFilter !== 'ALL' && eq.statut_global !== statusFilter) return false;
      if (siteFilter !== 'ALL' && eq.site !== siteFilter) return false;
      if (ieeeFilter !== 'ALL' && eq.condition_ieee !== ieeeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          eq.id_equipement.toLowerCase().includes(q) ||
          eq.nom_equipement.toLowerCase().includes(q) ||
          eq.site.toLowerCase().includes(q) ||
          eq.localisation.toLowerCase().includes(q) ||
          (eq.code_duval && eq.code_duval.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [equipements, search, statusFilter, siteFilter, ieeeFilter]);

  const statusBadge = (statut: StatutGlobal) => {
    if (statut === 'CRITIQUE') {
      return {
        border: 'border-red-500/60 hover:border-red-400',
        badge: 'bg-red-500/20 text-red-300 border-red-500/40',
        bar: 'bg-red-500',
        label: 'INTERVENTION URGENTE',
      };
    }
    if (statut === 'SURVEILLANCE') {
      return {
        border: 'border-amber-500/60 hover:border-amber-400',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        bar: 'bg-amber-500',
        label: 'SURVEILLANCE RENFORCÉE',
      };
    }
    return {
      border: 'border-emerald-500/40 hover:border-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      bar: 'bg-emerald-500',
      label: 'ÉTAT SAIN (NORMAL)',
    };
  };

  return (
    <div className="space-y-6">
      {/* Cartes KPIs Globales du Parc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`text-left p-5 rounded-2xl border transition-all ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 border-blue-500 shadow-lg shadow-blue-950/40'
              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Parc Total & Campagnes
            </span>
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-white">
              {kpis.total_equipements}
            </span>
            <span className="text-xs text-slate-400">
              appareils ({kpis.total_analyses.toLocaleString('fr-FR')} analyses)
            </span>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'BON' ? 'ALL' : 'BON')}
          className={`text-left p-5 rounded-2xl border transition-all ${
            statusFilter === 'BON'
              ? 'bg-emerald-950/40 border-emerald-500'
              : 'bg-slate-900/70 border-slate-800 hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Vert — État Sain (BON)
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-300">
              {kpis.status_counts?.BON || 0}
            </span>
            <span className="text-xs text-slate-400">transformateurs conformes</span>
          </div>
        </button>

        <button
          onClick={() =>
            setStatusFilter(statusFilter === 'SURVEILLANCE' ? 'ALL' : 'SURVEILLANCE')
          }
          className={`text-left p-5 rounded-2xl border transition-all ${
            statusFilter === 'SURVEILLANCE'
              ? 'bg-amber-950/40 border-amber-500'
              : 'bg-slate-900/70 border-slate-800 hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Orange — Surveillance Renforcée
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-300">
              {kpis.status_counts?.SURVEILLANCE || 0}
            </span>
            <span className="text-xs text-slate-400">suivi rapproché requis</span>
          </div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'CRITIQUE' ? 'ALL' : 'CRITIQUE')}
          className={`text-left p-5 rounded-2xl border transition-all ${
            statusFilter === 'CRITIQUE'
              ? 'bg-red-950/40 border-red-500'
              : 'bg-slate-900/70 border-slate-800 hover:border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Rouge — Intervention Urgente
            </span>
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-red-300">
              {kpis.status_counts?.CRITIQUE || 0}
            </span>
            <span className="text-xs text-slate-400">défaut actif / seuil critique</span>
          </div>
        </button>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par ID (ex. T0214, D0905A), site, cellule, zone Duval..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Site :</span>
          </div>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tous les sites ({kpis.sites?.length || 0})</option>
            {kpis.sites?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={ieeeFilter}
            onChange={(e) =>
              setIeeeFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
            }
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Toutes Conditions IEEE C57.104</option>
            <option value={1}>Condition IEEE 1 (Normal)</option>
            <option value={2}>Condition IEEE 2 (Avertissement)</option>
            <option value={3}>Condition IEEE 3 (Action Requise)</option>
            <option value={4}>Condition IEEE 4 (Danger Imminent)</option>
          </select>

          <span className="text-xs text-slate-400 ml-auto md:ml-2">
            <strong className="text-white">{filtered.length}</strong> appareils affichés
          </span>
        </div>
      </div>

      {/* Grille de Cartes Récapitulatives des Transformateurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.slice(0, visibleLimit).map((eq) => {
          const st = statusBadge(eq.statut_global);
          return (
            <div
              key={eq.id_equipement}
              onClick={() => onSelectEquipement(eq.id_equipement)}
              className={`group cursor-pointer bg-slate-900/90 border-2 ${st.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-white tracking-tight">
                        {eq.id_equipement}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                        {eq.site}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                      {eq.nom_equipement} • {eq.localisation}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${st.badge}`}
                  >
                    {st.label}
                  </span>
                </div>

                {/* Jauge Health Index THI */}
                <div className="mt-4 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      Indice de Santé Global (THI)
                    </span>
                    <span className="font-bold text-white">{eq.health_index.toFixed(1)} %</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${st.bar} transition-all`}
                      style={{ width: `${Math.min(100, Math.max(5, eq.health_index))}%` }}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-300">
                    <span>
                      IEEE C57.104 :{' '}
                      <strong className="text-white">Cond. {eq.condition_ieee}</strong>
                    </span>
                    <span>
                      Duval 1 :{' '}
                      <strong className="text-blue-300">{eq.code_duval || 'NORMAL'}</strong>
                    </span>
                    <span>
                      CO₂/CO :{' '}
                      <strong className="text-slate-200">
                        {eq.ratio_co2_co !== null ? eq.ratio_co2_co : '-'}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Indicateurs clés DGA & Physico-chimie */}
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-slate-950/60 border border-slate-800/70 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                      <Flame className="w-3 h-3 text-amber-400" />
                      <span>TDCG / C₂H₂</span>
                    </div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {eq.tdcg !== null ? `${eq.tdcg.toFixed(0)} ppm` : '-'} /{' '}
                      <span className="text-rose-400">
                        {eq.c2h2 !== null ? eq.c2h2 : '-'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/70 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                      <Droplets className="w-3 h-3 text-sky-400" />
                      <span>Eau / Acidité</span>
                    </div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {eq.teneur_eau !== null ? `${eq.teneur_eau} ppm` : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800/70 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      <span>Rigidité</span>
                    </div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {eq.rigidite_dielectrique !== null
                        ? `${eq.rigidite_dielectrique} kV`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 line-clamp-1 max-w-[70%]">
                  {eq.recommandation_action}
                </span>
                <span className="inline-flex items-center gap-1 text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  <span>Diagnostic</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > visibleLimit && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleLimit((prev) => prev + 36)}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white border border-slate-700 transition"
          >
            Afficher plus de transformateurs ({filtered.length - visibleLimit} restants)
          </button>
        </div>
      )}
    </div>
  );
};
