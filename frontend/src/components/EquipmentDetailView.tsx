import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  FileDown,
  FileText,
  FileSpreadsheet,
  AlertOctagon,
  CheckCircle,
  Thermometer,
  Gauge,
  Droplets,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import type { EquipementDetailResponse, AnalyseHistoryItem } from '../types';
import { fetchEquipementDetail } from '../services/api';
import { DuvalTriangle } from './DuvalTriangle';

interface EquipmentDetailViewProps {
  idEquipement: string;
  onBack: () => void;
}

export const EquipmentDetailView: React.FC<EquipmentDetailViewProps> = ({
  idEquipement,
  onBack,
}) => {
  const [detail, setDetail] = useState<EquipementDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnalyse, setSelectedAnalyse] = useState<AnalyseHistoryItem | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchEquipementDetail(idEquipement)
      .then((res) => {
        if (!mounted) return;
        setDetail(res);
        const firstWithDga =
          res.history.find((h) => h.gaz_dissous && h.gaz_dissous.tdcg !== null) ||
          res.history[0] ||
          null;
        setSelectedAnalyse(firstWithDga);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Erreur de chargement');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [idEquipement]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        Chargement de l&apos;historique DGA, physico-chimique et du Triangle de Duval pour{' '}
        <strong className="text-white">{idEquipement}</strong>...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="bg-red-950/40 border border-red-500/50 rounded-2xl p-6 text-red-200">
        <p className="font-bold">Erreur : {error}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-slate-800 rounded-lg text-xs text-white"
        >
          Retour au parc
        </button>
      </div>
    );
  }

  const { equipement, history } = detail;
  const activeItem = selectedAnalyse || history[0] || null;
  const activeDiag = activeItem?.diagnostic;
  const activeDga =
    activeItem?.gaz_dissous ||
    history.find((h) => h.gaz_dissous !== null)?.gaz_dissous ||
    null;
  const activePhys =
    activeItem?.qualite_physicochimique ||
    history.find((h) => h.qualite_physicochimique !== null)?.qualite_physicochimique ||
    null;
  const activePcb =
    activeItem?.pcb_metaux ||
    history.find((h) => h.pcb_metaux !== null)?.pcb_metaux ||
    null;

  // Préparer les données chronologiques pour le graphique SVG multi-séries (Gaz + Charge + Température)
  const chronological = [...history]
    .filter((h) => h.gaz_dissous || h.qualite_physicochimique)
    .reverse()
    .slice(-20);

  const maxTdcg = Math.max(
    100,
    ...chronological.map((c) =>
      Math.max(
        c.gaz_dissous?.tdcg || 0,
        c.gaz_dissous?.co || 0,
        c.gaz_dissous?.h2 || 0,
        c.gaz_dissous?.ch4 || 0
      )
    )
  );

  return (
    <div className="space-y-6">
      {/* En-tête Équipement + Actions d'Export Rapides */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title="Retour au parc"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-extrabold text-white">
                {equipement.id_equipement} — {equipement.nom_equipement}
              </h2>
              <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-semibold">
                {equipement.type_equipement}
              </span>
              {activeDiag && (
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                    activeDiag.statut_global === 'CRITIQUE'
                      ? 'bg-red-500/20 text-red-300 border-red-500/50'
                      : activeDiag.statut_global === 'SURVEILLANCE'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  }`}
                >
                  {activeDiag.statut_global} • THI {activeDiag.health_index.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Site : <strong className="text-slate-200">{equipement.site}</strong> | Cellule :{' '}
              <strong className="text-slate-200">{equipement.localisation}</strong> | Tension :{' '}
              <strong className="text-slate-200">{equipement.tension_nominale || 0} kV</strong> |
              Volume d&apos;huile :{' '}
              <strong className="text-slate-200">{equipement.litre_huile || 0} L</strong> | N°
              Série : <strong className="text-slate-200">{equipement.no_serie || '-'}</strong>
            </p>
          </div>
        </div>

        {/* Boutons d'exportation 1-clic pour cet appareil */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/export/pdf/${encodeURIComponent(equipement.id_equipement)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Rapport PDF (4 pages)</span>
          </a>
          <a
            href={`/api/export/docx/${encodeURIComponent(equipement.id_equipement)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow transition"
          >
            <FileText className="w-4 h-4" />
            <span>Rapport Word (.docx)</span>
          </a>
          <a
            href={`/api/export/xlsx?id_equipement=${encodeURIComponent(equipement.id_equipement)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel (.xlsx)</span>
          </a>
        </div>
      </div>

      {/* Bandeau Diagnostic Expert & Prescription Active */}
      {activeDiag && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <ShieldAlert className="w-4 h-4" />
              <span>
                Diagnostic Expert Consolidé (Analyse {activeItem?.id_analyse} du{' '}
                {activeItem?.date_prelevement.slice(0, 10)})
              </span>
            </div>
            <p className="text-sm font-semibold text-white leading-relaxed">
              {activeDiag.recommandation_action}
            </p>
            <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-400">
              <span>
                Condition IEEE C57.104 :{' '}
                <strong className="text-white">Niveau {activeDiag.condition_ieee} / 4</strong>
              </span>
              <span>
                Zone Duval 1 :{' '}
                <strong className="text-amber-300">
                  {activeDiag.code_duval} ({activeDiag.diagnostic_duval})
                </strong>
              </span>
              <span>
                Ratio Cellulose CO₂/CO :{' '}
                <strong
                  className={
                    activeDiag.ratio_co2_co !== null && activeDiag.ratio_co2_co < 3
                      ? 'text-red-400 font-bold'
                      : 'text-emerald-300'
                  }
                >
                  {activeDiag.ratio_co2_co ?? 'N/A'}
                </strong>
              </span>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-center items-center text-center">
            <span className="text-[11px] text-slate-400">Ordre de Travail GMAO</span>
            <span className="text-base font-extrabold text-blue-400 mt-1">
              {activeDiag.billet_travail || `OT-${equipement.id_equipement}-STD`}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">
              Source : {activeItem?.source_donnees}
            </span>
          </div>
        </div>
      )}

      {/* Section Principale : Triangle de Duval 1 Interactif + Seuils IEEE C57.104 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-base font-bold text-white mb-1">
            Triangle de Duval 1 Interactif (CEI 60599)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Cliquez sur un point d&apos;analyse pour inspecter ses coordonnées ternaires (%CH₄,
            %C₂H₄, %C₂H₂) et le défaut électrique ou thermique associé.
          </p>
          <DuvalTriangle
            history={history}
            selectedAnalyseId={activeItem?.id_analyse || null}
            onSelectAnalyse={(item) => setSelectedAnalyse(item)}
          />
        </div>

        {/* Tableau Comparatif Norme IEEE C57.104 & Physico-Chimie */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-bold text-white mb-1">
              Évaluation Normative IEEE C57.104 & Vieillissement de l&apos;Huile
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Comparaison des concentrations mesurées (ppm) aux 4 conditions opérationnelles IEEE
              C57.104.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-2 px-3">Gaz Dissous</th>
                    <th className="py-2 px-3">Mesure (ppm)</th>
                    <th className="py-2 px-3">Cond. 1</th>
                    <th className="py-2 px-3">Cond. 2</th>
                    <th className="py-2 px-3">Cond. 3</th>
                    <th className="py-2 px-3">Cond. 4</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[
                    { key: 'h2', label: 'Hydrogène (H₂)', val: activeDga?.h2, c: ['< 100', '100-700', '700-1800', '> 1800'], t: [100, 700, 1800] },
                    { key: 'ch4', label: 'Méthane (CH₄)', val: activeDga?.ch4, c: ['< 120', '120-400', '400-1000', '> 1000'], t: [120, 400, 1000] },
                    { key: 'c2h2', label: 'Acétylène (C₂H₂)', val: activeDga?.c2h2, c: ['< 1', '1-9', '9-35', '> 35'], t: [1, 9, 35] },
                    { key: 'c2h4', label: 'Éthylène (C₂H₄)', val: activeDga?.c2h4, c: ['< 50', '50-100', '100-200', '> 200'], t: [50, 100, 200] },
                    { key: 'c2h6', label: 'Éthane (C₂H₆)', val: activeDga?.c2h6, c: ['< 65', '65-100', '100-150', '> 150'], t: [65, 100, 150] },
                    { key: 'co', label: 'Monoxyde (CO)', val: activeDga?.co, c: ['< 350', '350-570', '570-1400', '> 1400'], t: [350, 570, 1400] },
                    { key: 'tdcg', label: 'TDCG Total', val: activeDga?.tdcg, c: ['< 720', '720-1920', '1920-4630', '> 4630'], t: [720, 1920, 4630] },
                  ].map((g) => {
                    const v = g.val ?? 0;
                    const cond =
                      v < g.t[0] ? 1 : v <= g.t[1] ? 2 : v <= g.t[2] ? 3 : 4;
                    return (
                      <tr key={g.key} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-slate-200">{g.label}</td>
                        <td className="py-2 px-3 font-bold text-white">
                          {g.val !== null && g.val !== undefined ? g.val : '-'}{' '}
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
                              cond >= 3
                                ? 'bg-red-500/20 text-red-300'
                                : cond === 2
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            C{cond}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-400">{g.c[0]}</td>
                        <td className="py-2 px-3 text-slate-400">{g.c[1]}</td>
                        <td className="py-2 px-3 text-slate-400">{g.c[2]}</td>
                        <td className="py-2 px-3 text-slate-400">{g.c[3]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paramètres Physico-Chimiques & Contaminants */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-sky-400">
                <Droplets className="w-3.5 h-3.5" />
                <span>Teneur en Eau</span>
              </div>
              <div className="text-base font-bold text-white mt-1">
                {activePhys?.teneur_eau ?? '-'} <span className="text-xs font-normal">ppm</span>
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
                <Gauge className="w-3.5 h-3.5" />
                <span>Acidité (KOH)</span>
              </div>
              <div className="text-base font-bold text-white mt-1">
                {activePhys?.acidite ?? '-'}{' '}
                <span className="text-xs font-normal">mg/g</span>
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-yellow-400">
                <Zap className="w-3.5 h-3.5" />
                <span>Rigidité Diélec.</span>
              </div>
              <div className="text-base font-bold text-white mt-1">
                {activePhys?.rigidite_dielectrique ?? '-'}{' '}
                <span className="text-xs font-normal">kV</span>
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-purple-400">
                <Thermometer className="w-3.5 h-3.5" />
                <span>BPC Total (PCB)</span>
              </div>
              <div className="text-base font-bold text-white mt-1">
                {activePcb?.pcb_total ?? '0.0'}{' '}
                <span className="text-xs font-normal">ppm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Graphique Chronologique Superposant Concentrations de Gaz, Charge % et Température */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Évolution Chronologique Superposée (Concentrations DGA, Charge % & Température)
            </h3>
            <p className="text-xs text-slate-400">
              Visualisation temporelle interactive des {chronological.length} derniers prélèvements.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-200">
              <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> TDCG (ppm)
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> H₂ (ppm)
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> CH₄ (ppm)
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-400">
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> C₂H₂ (ppm)
            </span>
            <span className="inline-flex items-center gap-1.5 text-purple-400">
              <span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" /> Charge (%)
            </span>
          </div>
        </div>

        {chronological.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <svg viewBox="0 0 820 240" className="w-full min-w-[600px] h-auto">
              <rect x="55" y="15" width="730" height="185" fill="#020617" rx="8" stroke="#1e293b" />
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = 200 - ratio * 175;
                const val = Math.round(ratio * maxTdcg);
                return (
                  <g key={idx}>
                    <line x1="55" y1={y} x2="785" y2={y} stroke="#1e293b" strokeDasharray="4 4" />
                    <text x="48" y={y + 3} textAnchor="end" className="fill-slate-500 text-[10px]">
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Courbes TDCG, H2, CH4, C2H2 et Charge */}
              {[
                {
                  color: '#3b82f6',
                  getVal: (item: AnalyseHistoryItem) => (item.gaz_dissous?.tdcg || 0) / maxTdcg,
                },
                {
                  color: '#10b981',
                  getVal: (item: AnalyseHistoryItem) => (item.gaz_dissous?.h2 || 0) / maxTdcg,
                },
                {
                  color: '#f59e0b',
                  getVal: (item: AnalyseHistoryItem) => (item.gaz_dissous?.ch4 || 0) / maxTdcg,
                },
                {
                  color: '#f43f5e',
                  getVal: (item: AnalyseHistoryItem) => (item.gaz_dissous?.c2h2 || 0) / maxTdcg,
                },
                {
                  color: '#a855f7',
                  getVal: (item: AnalyseHistoryItem) =>
                    Math.min(1, (item.charge_pct || 0) / 180),
                },
              ].map((serie, sIdx) => {
                const pts = chronological.map((item, i) => {
                  const x =
                    chronological.length > 1
                      ? 75 + (i / (chronological.length - 1)) * 690
                      : 420;
                  const y = 200 - Math.min(1, Math.max(0, serie.getVal(item))) * 175;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                return (
                  <polyline
                    key={sIdx}
                    fill="none"
                    stroke={serie.color}
                    strokeWidth="2.2"
                    points={pts.join(' ')}
                  />
                );
              })}

              {/* Points interactifs sur la courbe TDCG */}
              {chronological.map((item, i) => {
                const x =
                  chronological.length > 1
                    ? 75 + (i / (chronological.length - 1)) * 690
                    : 420;
                const y =
                  200 -
                  Math.min(1, Math.max(0, (item.gaz_dissous?.tdcg || 0) / maxTdcg)) * 175;
                return (
                  <g
                    key={item.id_analyse}
                    className="cursor-pointer"
                    onClick={() => setSelectedAnalyse(item)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={activeItem?.id_analyse === item.id_analyse ? 6 : 4}
                      fill={activeItem?.id_analyse === item.id_analyse ? '#ef4444' : '#38bdf8'}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                    <text
                      x={x}
                      y={220}
                      textAnchor="middle"
                      className="fill-slate-400 text-[9px]"
                    >
                      {item.date_prelevement.slice(0, 10)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-8 text-center">
            Aucun historique chronologique disponible.
          </div>
        )}
      </div>

      {/* Tableau Historique Complet des Campagnes d'Analyses */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-base font-bold text-white mb-3">
          Journal Historique des Prélèvements ({history.length} campagnes enregistrées)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">Clé Analyse</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Charge %</th>
                <th className="py-2.5 px-3">H₂</th>
                <th className="py-2.5 px-3">CH₄</th>
                <th className="py-2.5 px-3">C₂H₂</th>
                <th className="py-2.5 px-3">C₂H₄</th>
                <th className="py-2.5 px-3">TDCG</th>
                <th className="py-2.5 px-3">Eau (ppm)</th>
                <th className="py-2.5 px-3">Diélec (kV)</th>
                <th className="py-2.5 px-3">Zone Duval</th>
                <th className="py-2.5 px-3">Statut / THI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {history.map((h) => {
                const isSel = activeItem?.id_analyse === h.id_analyse;
                return (
                  <tr
                    key={h.id_analyse}
                    onClick={() => setSelectedAnalyse(h)}
                    className={`cursor-pointer transition ${
                      isSel ? 'bg-blue-950/50' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-300">{h.id_analyse}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {h.date_prelevement.slice(0, 10)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{h.charge_pct ?? '-'}</td>
                    <td className="py-2.5 px-3 text-slate-300">{h.gaz_dissous?.h2 ?? '-'}</td>
                    <td className="py-2.5 px-3 text-slate-300">{h.gaz_dissous?.ch4 ?? '-'}</td>
                    <td className="py-2.5 px-3 text-rose-300 font-semibold">
                      {h.gaz_dissous?.c2h2 ?? '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{h.gaz_dissous?.c2h4 ?? '-'}</td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {h.gaz_dissous?.tdcg ?? '-'}
                    </td>
                    <td className="py-2.5 px-3 text-sky-300">
                      {h.qualite_physicochimique?.teneur_eau ?? '-'}
                    </td>
                    <td className="py-2.5 px-3 text-yellow-300">
                      {h.qualite_physicochimique?.rigidite_dielectrique ?? '-'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-blue-300">
                      {h.diagnostic?.code_duval ?? '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          h.diagnostic?.statut_global === 'CRITIQUE'
                            ? 'bg-red-500/20 text-red-300'
                            : h.diagnostic?.statut_global === 'SURVEILLANCE'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {h.diagnostic?.statut_global} ({h.diagnostic?.health_index}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
