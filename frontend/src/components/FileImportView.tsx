import React, { useState } from 'react';
import {
  UploadCloud,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RefreshCw,
  Table as TableIcon,
  FileSpreadsheet,
} from 'lucide-react';
import type { FileInspectionResponse } from '../types';
import {
  inspectUploadedFile,
  previewRemappedColumns,
  commitFileImport,
} from '../services/api';

interface FileImportViewProps {
  onImportComplete: () => void;
}

export const FileImportView: React.FC<FileImportViewProps> = ({ onImportComplete }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<FileInspectionResponse | null>(null);
  const [activeMapping, setActiveMapping] = useState<Record<string, string | null>>({});
  const [sheetName, setSheetName] = useState<string>('');
  const [accessTable, setAccessTable] = useState<string>('');
  const [accessSql, setAccessSql] = useState<string>('');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'overwrite' | 'archive'>('overwrite');
  const [loading, setLoading] = useState<boolean>(false);
  const [commitResult, setCommitResult] = useState<{
    imported_rows: number;
    duplicates_handled: number;
    alerts_count: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (
    file: File,
    opts?: { sheetName?: string; accessTable?: string; accessSql?: string }
  ) => {
    setSelectedFile(file);
    setError(null);
    setCommitResult(null);
    setLoading(true);
    try {
      const res = await inspectUploadedFile(file, opts);
      setInspection(res);
      setActiveMapping(res.active_mapping);
      if (res.metadata.selected_sheet) setSheetName(res.metadata.selected_sheet);
      if (res.metadata.selected_table) setAccessTable(res.metadata.selected_table);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l’analyse du fichier');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = async (sourceCol: string, newTarget: string) => {
    if (!inspection) return;
    const updated = {
      ...activeMapping,
      [sourceCol]: newTarget === '__IGNORE__' ? null : newTarget,
    };
    setActiveMapping(updated);

    try {
      const preview = await previewRemappedColumns({
        fileToken: inspection.file_token,
        filename: inspection.filename,
        mapping: updated,
        sheetName: sheetName || undefined,
        accessTable: accessTable || undefined,
        accessSql: accessSql || undefined,
      });
      setInspection({
        ...inspection,
        preview_rows: preview.preview_rows,
        alerts: preview.alerts,
        total_rows: preview.total_rows,
      });
    } catch {
      // Conserver l'aperçu existant
    }
  };

  const handleCommit = async () => {
    if (!inspection) return;
    setLoading(true);
    setError(null);
    try {
      const res = await commitFileImport({
        fileToken: inspection.file_token,
        filename: inspection.filename,
        mapping: activeMapping,
        duplicateStrategy,
        sheetName: sheetName || undefined,
        accessTable: accessTable || undefined,
        accessSql: accessSql || undefined,
      });
      setCommitResult(res);
      onImportComplete();
    } catch (err: any) {
      setError(err.message || 'Échec de la validation de l’import');
    } finally {
      setLoading(false);
    }
  };

  const confidenceBadge = (level: 'exact' | 'medium' | 'unrecognized', score: number) => {
    if (level === 'exact') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3.5 h-3.5" /> Exact ({score}%)
        </span>
      );
    }
    if (level === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <AlertTriangle className="w-3.5 h-3.5" /> Probable ({score}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
        <XCircle className="w-3.5 h-3.5" /> Non-reconnu
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Zone Drag & Drop Multi-Formats */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-slate-900/90 border-2 border-dashed border-blue-500/50 hover:border-blue-400 rounded-2xl p-8 text-center transition"
      >
        <UploadCloud className="w-12 h-12 text-blue-400 mx-auto mb-3" />
        <h2 className="text-lg font-extrabold text-white">
          Module d&apos;Ingestion Multi-Formats & Auto-Mapping Intelligent (1 à 25 000+ lignes)
        </h2>
        <p className="text-xs text-slate-400 max-w-2xl mx-auto mt-1">
          Glissez-déposez vos fichiers de laboratoire :{' '}
          <strong className="text-slate-200">Excel (.xlsx, .xls)</strong>,{' '}
          <strong className="text-slate-200">Délimités (.csv, .tsv, .txt)</strong> ou{' '}
          <strong className="text-slate-200">Bases Access (.mdb, .accdb)</strong>. Nettoyage
          automatique des seuils (&quot;&lt; 1&quot;, &quot;&lt; 0.5&quot;, &quot;ND&quot;,
          &quot;Trace&quot;) et calcul immédiat des diagnostics IEEE C57.104 &amp; Duval 1.
        </p>

        <div className="mt-5 flex justify-center">
          <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg transition">
            <span>Sélectionner un fichier (.xlsx, .csv, .mdb, .accdb...)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt,.mdb,.accdb"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
      </div>

      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-sm text-blue-300 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Analyse de la structure, détection d&apos;encodage et auto-mapping flou en cours...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-500/60 rounded-2xl p-4 text-xs text-red-200">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {commitResult && (
        <div className="bg-emerald-950/50 border border-emerald-500/60 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-emerald-300">
              Importation et Calcul des Diagnostics Terminés avec Succès !
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              <strong>{commitResult.imported_rows}</strong> lignes importées et diagnostiquées |{' '}
              <strong>{commitResult.duplicates_handled}</strong> doublons traités |{' '}
              <strong>{commitResult.alerts_count}</strong> valeurs atypiques corrigées.
            </p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
      )}

      {inspection && (
        <div className="space-y-6">
          {/* Options Spécifiques Excel (Multi-feuilles) ou Access (Tables / Requête SQL) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Fichier détecté : {inspection.filename} ({inspection.total_rows} lignes)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Format : {inspection.metadata.format}
                    {inspection.metadata.encoding &&
                      ` | Encodage : ${inspection.metadata.encoding} | Délimiteur : '${inspection.metadata.delimiter}'`}
                  </p>
                </div>
              </div>

              {/* Sélection de la stratégie de gestion des doublons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Doublons (Équipement + Date) :</span>
                <select
                  value={duplicateStrategy}
                  onChange={(e) =>
                    setDuplicateStrategy(e.target.value as 'overwrite' | 'archive')
                  }
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="overwrite">Écraser / Mettre à jour l&apos;analyse existante</option>
                  <option value="archive">Archiver comme nouvel échantillon distinct</option>
                </select>
              </div>
            </div>

            {/* Si fichier Excel multi-feuilles */}
            {inspection.metadata.sheets && inspection.metadata.sheets.length > 1 && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300">
                  Feuille Excel détectée :
                </span>
                <select
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value);
                    if (selectedFile) {
                      handleFileSelected(selectedFile, { sheetName: e.target.value });
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  {inspection.metadata.sheets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Si Base Access (.mdb / .accdb) : Sélection de la table ou Requête SQL libre */}
            {inspection.metadata.access_tables && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    <Database className="w-3.5 h-3.5 inline mr-1 text-blue-400" />
                    Table Access Cible (.mdb / .accdb) :
                  </label>
                  <select
                    value={accessTable}
                    onChange={(e) => {
                      setAccessTable(e.target.value);
                      if (selectedFile) {
                        handleFileSelected(selectedFile, { accessTable: e.target.value });
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {inspection.metadata.access_tables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Ou Saisie Libre d&apos;une Requête SQL sur la Base Access :
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={accessSql}
                      onChange={(e) => setAccessSql(e.target.value)}
                      placeholder="SELECT * FROM [Gaz Dissous] WHERE H2 > 100"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                    />
                    <button
                      onClick={() => {
                        if (selectedFile && accessSql.trim()) {
                          handleFileSelected(selectedFile, { accessSql });
                        }
                      }}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white"
                    >
                      Exécuter SQL
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interface Visuelle de Contrôle de l'Auto-Mapping */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Table de Correspondance Interactive (Auto-Mapping par Fuzzy Matching)
                </h3>
                <p className="text-xs text-slate-400">
                  Vérifiez ou rectifiez manuellement le champ canonique cible pour chaque colonne
                  source.
                </p>
              </div>
              <button
                onClick={handleCommit}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white shadow-lg transition"
              >
                <Play className="w-4 h-4" />
                <span>Valider et Importer ({inspection.total_rows} lignes)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3">Colonne Source (Fichier)</th>
                    <th className="py-2.5 px-3">Indicateur de Confiance</th>
                    <th className="py-2.5 px-3">Champ Canonique Cible (Sélecteur Manuel)</th>
                    <th className="py-2.5 px-3">Catégorie Métier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {inspection.auto_mapping.map((item) => {
                    const currentTarget = activeMapping[item.source_column] || '__IGNORE__';
                    return (
                      <tr key={item.source_column} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-white">
                          {item.source_column}
                        </td>
                        <td className="py-2.5 px-3">
                          {confidenceBadge(item.confidence_level, item.confidence_score)}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={currentTarget}
                            onChange={(e) =>
                              handleMappingChange(item.source_column, e.target.value)
                            }
                            className="w-full max-w-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-blue-500"
                          >
                            <option value="__IGNORE__">-- Ignorer cette colonne --</option>
                            {inspection.canonical_fields.map((cf) => (
                              <option key={cf.field} value={cf.field}>
                                {cf.label} ({cf.field})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{item.category}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alertes sur Valeurs Physiques Aberrantes */}
          {inspection.alerts && inspection.alerts.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                Alertes de Nettoyage & Valeurs Physiques Atypiques ({inspection.alerts.length})
              </h4>
              <ul className="text-xs text-amber-200/90 space-y-1 max-h-32 overflow-y-auto">
                {inspection.alerts.map((al, i) => (
                  <li key={i}>• {al}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Prévisualisation Dynamique des 10 Premières Lignes Nettoyées */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-blue-400" />
              <span>
                Prévisualisation Dynamique des 10 Premières Lignes Nettoyées (Avant Validation)
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    {Object.keys(inspection.preview_rows[0] || {}).map((k) => (
                      <th key={k} className="py-2 px-3 font-mono">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {inspection.preview_rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      {Object.keys(inspection.preview_rows[0] || {}).map((k) => (
                        <td key={k} className="py-2 px-3 text-slate-200">
                          {row[k] !== null && row[k] !== undefined ? String(row[k]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
