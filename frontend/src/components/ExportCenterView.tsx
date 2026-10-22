import React, { useState, useEffect } from 'react';
import {
  FileDown,
  FileText,
  FileSpreadsheet,
  Database,
  Calendar,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import type { EquipementSummary, AnalyseHistoryItem } from '../types';
import { fetchCachedOrOnlineReports } from '../services/api';

interface ExportCenterViewProps {
  equipements: EquipementSummary[];
}

export const ExportCenterView: React.FC<ExportCenterViewProps> = ({ equipements }) => {
  const [selectedEq, setSelectedEq] = useState<string>(
    equipements[0]?.id_equipement || 'T0214'
  );
  const [scopeAllForTabular, setScopeAllForTabular] = useState<boolean>(false);
  const [dateDebut, setDateDebut] = useState<string>('1995-01-01');
  const [dateFin, setDateFin] = useState<string>(new Date().toISOString().slice(0, 10));
  const [cachedReports, setCachedReports] = useState<AnalyseHistoryItem[]>([]);

  useEffect(() => {
    fetchCachedOrOnlineReports()
      .then((r) => setCachedReports(r))
      .catch(() => {});
  }, []);

  const queryParams = new URLSearchParams();
  if (dateDebut) queryParams.set('date_debut', dateDebut);
  if (dateFin) queryParams.set('date_fin', dateFin);

  const tabularParams = new URLSearchParams(queryParams);
  tabularParams.set('id_equipement', scopeAllForTabular ? 'ALL' : selectedEq);

  return (
    <div className="space-y-6">
      {/* Sélection de l'Équipement & Période d'Analyse */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-extrabold text-white">
            Centre d&apos;Exportation Décisionnelle &amp; Technique Multi-Formats
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Générez en un clic vos livrables d&apos;ingénierie prêts pour signature, archivage ou
            réinjection dans votre GMAO (SAP PM, IBM Maximo, SCADA).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Transformateur Cible (Rapports PDF / Word / Filtrage)
            </label>
            <select
              value={selectedEq}
              onChange={(e) => setSelectedEq(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white"
            >
              {equipements.slice(0, 400).map((eq) => (
                <option key={eq.id_equipement} value={eq.id_equipement}>
                  {eq.id_equipement} — {eq.nom_equipement} ({eq.statut_global} • THI{' '}
                  {eq.health_index}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
              Date de Début de Période
            </label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
              Date de Fin de Période
            </label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="scopeAll"
            type="checkbox"
            checked={scopeAllForTabular}
            onChange={(e) => setScopeAllForTabular(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-blue-600"
          />
          <label htmlFor="scopeAll" className="text-xs text-slate-300 cursor-pointer">
            Exporter l&apos;intégralité du parc de transformateurs pour les classeurs Excel (.xlsx)
            et fichiers plats CSV
          </label>
        </div>
      </div>

      {/* Cartes d'Exportation en Un Clic */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* 1. Rapport PDF 4 Pages */}
        <div className="bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-2xl p-6 flex flex-col justify-between transition">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
              <FileDown className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              1. Rapport Exécutif &amp; Technique PDF (4 Pages)
            </h3>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li>• Page 1 : Synthèse Décisionnelle, THI &amp; 3 Actions prioritaires</li>
              <li>• Page 2 : Triangle de Duval 1 vectoriel &amp; seuils IEEE C57.104</li>
              <li>• Page 3 : Courbes chronologiques DGA, rigidité, humidité &amp; BPC</li>
              <li>• Page 4 : Fiche d&apos;intervention &amp; Bon de travail GMAO à signer</li>
            </ul>
          </div>
          <a
            href={`/api/export/pdf/${encodeURIComponent(selectedEq)}?${queryParams.toString()}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-center text-xs font-extrabold text-white shadow-lg transition block"
          >
            Télécharger le Rapport PDF ({selectedEq})
          </a>
        </div>

        {/* 2. Rapport Éditable Word (.docx) */}
        <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-6 flex flex-col justify-between transition">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              2. Rapport d&apos;Ingénierie Éditable Word (.docx)
            </h3>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li>• Mise en page professionnelle avec en-têtes d&apos;ingénierie</li>
              <li>• Pagination dynamique native (&quot;Page X sur Y&quot;)</li>
              <li>• Encadrés colorés pour les alertes critiques et tableaux contrastés</li>
              <li>• Cartouche de signature pour l&apos;ingénieur responsable</li>
            </ul>
          </div>
          <a
            href={`/api/export/docx/${encodeURIComponent(selectedEq)}?${queryParams.toString()}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-center text-xs font-extrabold text-white shadow-lg transition block"
          >
            Télécharger le Rapport Word .docx ({selectedEq})
          </a>
        </div>

        {/* 3. Classeur Structuré Excel (.xlsx 4 onglets) */}
        <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 flex flex-col justify-between transition">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              3. Classeur Structuré Excel (.xlsx — 4 Onglets)
            </h3>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li>• Onglet 1 : Tableau de Bord &amp; indicateurs du parc</li>
              <li>• Onglet 2 : Données Nettoyées (physico-chimie, BPC, métaux)</li>
              <li>• Onglet 3 : Historique DGA &amp; Ratios (%Duval, CO₂/CO, TDCG, IEEE)</li>
              <li>• Onglet 4 : Recommandations &amp; Billets de travail GMAO</li>
            </ul>
          </div>
          <a
            href={`/api/export/xlsx?${tabularParams.toString()}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-center text-xs font-extrabold text-white shadow-lg transition block"
          >
            Télécharger le Classeur Excel (4 Onglets)
          </a>
        </div>

        {/* 4. Fichier d'Échange Plat CSV (GMAO / SCADA) */}
        <div className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-6 flex flex-col justify-between transition">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              4. Fichier d&apos;Échange Plat CSV (SAP PM / Maximo / SCADA)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Export UTF-8 normalisé des données filtrées et nettoyées, prêt pour réinjection
              directe dans un progiciel de GMAO (SAP PM, IBM Maximo) ou un historien SCADA.
            </p>
          </div>
          <a
            href={`/api/export/csv?${tabularParams.toString()}`}
            target="_blank"
            rel="noreferrer"
            className="mt-6 w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-center text-xs font-extrabold text-white shadow-lg transition block"
          >
            Exporter le Fichier CSV Normalisé
          </a>
        </div>

        {/* 5. Base de Données Locale SQLite / Archive Access */}
        <div className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 flex flex-col justify-between transition">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <HardDrive className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              5. Archive Complète Base Locale (transformers_vault.db)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Téléchargez l&apos;intégralité de la base relationnelle locale contenant les 6 tables
              canoniques migrées depuis <code className="text-purple-300">HuileData2003(1).mdb</code>{' '}
              ainsi que les nouvelles saisies.
            </p>
          </div>
          <a
            href="/api/export/sqlite"
            target="_blank"
            rel="noreferrer"
            className="mt-6 w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-center text-xs font-extrabold text-white shadow-lg transition block"
          >
            Télécharger transformers_vault.db
          </a>
        </div>

        {/* 6. État du Cache Local IndexedDB (100 Derniers Rapports) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-white">
              Cache Local IndexedDB (Dexie.js)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Les <strong className="text-white">{cachedReports.length}</strong> derniers rapports
              d&apos;analyses et diagnostics complets sont mis en cache dans le navigateur pour une
              consultation instantanée 100 % hors-ligne.
            </p>
          </div>
          <div className="mt-6 py-3 px-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-sky-300 font-semibold text-center">
            Cache Dexie.js actif : {cachedReports.length} / 100 rapports synchronisés
          </div>
        </div>
      </div>
    </div>
  );
};
