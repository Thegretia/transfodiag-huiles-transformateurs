import React, { useState } from 'react';
import {
  WifiOff,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Gauge,
  Eye,
} from 'lucide-react';
import type { EquipementSummary, PendingFieldInspection } from '../types';
import { saveFieldInspectionOffline } from '../db/offlineDb';
import { syncPendingInspectionsWithBackend } from '../services/api';

interface FieldInspectionViewProps {
  equipements: EquipementSummary[];
  sites: string[];
  pendingCount: number;
  onPendingChange: () => void;
}

export const FieldInspectionView: React.FC<FieldInspectionViewProps> = ({
  equipements,
  sites,
  pendingCount,
  onPendingChange,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [quickAddMode, setQuickAddMode] = useState<boolean>(false);

  // Étape 1 : Identification
  const [idEquipement, setIdEquipement] = useState<string>(
    equipements[0]?.id_equipement || 'T0214'
  );
  const [nomEquipement, setNomEquipement] = useState<string>('');
  const [site, setSite] = useState<string>(sites[0] || 'Alcan BKP');
  const [localisation, setLocalisation] = useState<string>('Poste Nord');
  const [datePrelevement, setDatePrelevement] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [codeMotif, setCodeMotif] = useState<string>('Routine');

  // Étape 2 : Mesures directes (Charge, Températures, Compteur, Manomètre & Kit DGA Portable optionnel)
  const [chargePct, setChargePct] = useState<string>('75');
  const [tempHuile, setTempHuile] = useState<string>('62');
  const [tempAmbiante, setTempAmbiante] = useState<string>('22');
  const [compteurHeures, setCompteurHeures] = useState<string>('48500');
  const [pressionManometre, setPressionManometre] = useState<string>('Normal');
  const [h2, setH2] = useState<string>('');
  const [ch4, setCh4] = useState<string>('');
  const [c2h2, setC2h2] = useState<string>('');
  const [c2h4, setC2h4] = useState<string>('');
  const [c2h6, setC2h6] = useState<string>('');
  const [co, setCo] = useState<string>('');
  const [co2, setCo2] = useState<string>('');
  const [teneurEau, setTeneurEau] = useState<string>('');
  const [rigidite, setRigidite] = useState<string>('');

  // Étape 3 : Inspection visuelle & Remarques
  const [niveauHuile, setNiveauHuile] = useState<'Normal' | 'Bas' | 'Haut'>('Normal');
  const [couleurSilice, setCouleurSilice] = useState<'Bleu' | 'Rose'>('Bleu');
  const [fuiteDetectee, setFuiteDetectee] = useState<boolean>(false);
  const [bruitVibration, setBruitVibration] = useState<boolean>(false);
  const [remarques, setRemarques] = useState<string>('');

  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);

  const parseNum = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  };

  const handleSaveInspection = async () => {
    const record: PendingFieldInspection = {
      id_analyse: `TER-${Date.now().toString(36).toUpperCase()}`,
      id_equipement: idEquipement.trim() || 'TR-TERRAIN-01',
      nom_equipement: nomEquipement.trim() || undefined,
      site,
      localisation,
      date_prelevement: new Date(datePrelevement).toISOString(),
      charge_pct: parseNum(chargePct),
      temperature_huile: parseNum(tempHuile),
      temperature_ambiante: parseNum(tempAmbiante),
      compteur_heures: parseNum(compteurHeures),
      pression_manometre: pressionManometre,
      code_motif: codeMotif,
      laboratoire: 'Kit Portable / Terrain Hors-Ligne',
      niveau_huile: niveauHuile,
      couleur_silice: couleurSilice,
      fuite_detectee: fuiteDetectee,
      bruit_vibration: bruitVibration,
      remarques: remarques.trim(),
      h2: parseNum(h2),
      ch4: parseNum(ch4),
      c2h6: parseNum(c2h6),
      c2h4: parseNum(c2h4),
      c2h2: parseNum(c2h2),
      co: parseNum(co),
      co2: parseNum(co2),
      teneur_eau: parseNum(teneurEau),
      acidite: null,
      rigidite_dielectrique: parseNum(rigidite),
      couleur_astm: null,
      created_at: new Date().toISOString(),
    };

    // 1. Enregistrement immédiat garanti dans IndexedDB sous la clé pending_field_inspections
    await saveFieldInspectionOffline(record);
    onPendingChange();

    // 2. Tentative de synchronisation automatique en arrière-plan si le serveur local est joignable
    const syncedCount = await syncPendingInspectionsWithBackend();
    onPendingChange();

    if (syncedCount > 0) {
      setSavedBanner(
        `Relevé enregistré dans IndexedDB (pending_field_inspections) et synchronisé immédiatement avec la base SQLite (${syncedCount} relevé(s) synchronisé(s)) !`
      );
    } else {
      setSavedBanner(
        `Mode Hors-Ligne : Relevé sauvegardé localement dans IndexedDB (pending_field_inspections). Il sera synchronisé automatiquement dès le retour du serveur.`
      );
    }
    setStep(1);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const count = await syncPendingInspectionsWithBackend();
      onPendingChange();
      if (count > 0) {
        setSavedBanner(`${count} relevé(s) en attente synchronisé(s) vers SQLite !`);
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Bandeau Statut Offline-First & Synchronisation IndexedDB */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">
              Formulaire Tactile de Collecte Terrain Hors-Ligne (Offline-First PWA)
            </h2>
            <p className="text-xs text-slate-400">
              Stockage local immédiat dans <code className="text-blue-300">IndexedDB (pending_field_inspections)</code>{' '}
              &amp; synchronisation automatique SQLite.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
              pendingCount > 0
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {pendingCount} relevé(s) en attente
          </span>
          {pendingCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Synchroniser</span>
            </button>
          )}
        </div>
      </div>

      {savedBanner && (
        <div className="bg-emerald-950/60 border border-emerald-500/60 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* Indicateur d'Étapes Tactiles (1 -> 2 -> 3) */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { num: 1, title: 'Étape 1 : Identification', sub: 'Appareil, Site & Horodatage' },
          { num: 2, title: 'Étape 2 : Mesures Directes', sub: 'Charge, Temp. & Manomètres' },
          { num: 3, title: 'Étape 3 : Inspection Visuelle', sub: 'Niveau, Silice, Fuites & Bruit' },
        ].map((s) => (
          <button
            key={s.num}
            onClick={() => setStep(s.num as 1 | 2 | 3)}
            className={`p-4 rounded-2xl border text-left transition ${
              step === s.num
                ? 'bg-blue-950/60 border-blue-500 text-white shadow-lg'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <div className="text-xs font-extrabold uppercase tracking-wider text-blue-400">
              {s.title}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{s.sub}</div>
          </button>
        ))}
      </div>

      {/* Corps du Formulaire Pas-à-Pas (Gros boutons adaptés à l'usage avec des gants) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Étape 1 — Identification du Transformateur &amp; du Site
              </h3>
              <button
                type="button"
                onClick={() => setQuickAddMode(!quickAddMode)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-blue-300 border border-slate-700"
              >
                {quickAddMode ? 'Sélectionner dans la liste préchargée' : '+ Ajout rapide nouvel appareil'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!quickAddMode ? (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Transformateur (Liste Préchargée Hors-Ligne)
                  </label>
                  <select
                    value={idEquipement}
                    onChange={(e) => {
                      const val = e.target.value;
                      setIdEquipement(val);
                      const found = equipements.find((eq) => eq.id_equipement === val);
                      if (found) {
                        setSite(found.site);
                        setLocalisation(found.localisation);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm font-bold text-white"
                  >
                    {equipements.slice(0, 300).map((eq) => (
                      <option key={eq.id_equipement} value={eq.id_equipement}>
                        {eq.id_equipement} — {eq.nom_equipement} ({eq.site})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Identifiant Nouvel Appareil (ex. TR-POSTE-01)
                  </label>
                  <input
                    type="text"
                    value={idEquipement}
                    onChange={(e) => setIdEquipement(e.target.value)}
                    placeholder="TR-POSTE-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm font-bold text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  Date &amp; Heure du Prélèvement
                </label>
                <input
                  type="datetime-local"
                  value={datePrelevement}
                  onChange={(e) => setDatePrelevement(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  Site / Usine
                </label>
                <input
                  type="text"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  Cellule / Localisation Physique
                </label>
                <input
                  type="text"
                  value={localisation}
                  onChange={(e) => setLocalisation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Motif de l&apos;Intervention (Boutons Tactiles)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {['Routine', 'Alerte', 'Post-incident', 'Suivi renforcé', "Réception d'huile neuve"].map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCodeMotif(m)}
                      className={`py-3 px-3 rounded-xl text-xs font-bold border transition ${
                        codeMotif === m
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-extrabold text-white shadow-lg"
              >
                <span>Suivant : Mesures Directes</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Gauge className="w-5 h-5 text-blue-400" />
              <span>Étape 2 — Mesures Directes sur Site &amp; Kit Portable</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Charge Transformateur (%)
                </label>
                <input
                  type="number"
                  value={chargePct}
                  onChange={(e) => setChargePct(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Température Huile (°C)
                </label>
                <input
                  type="number"
                  value={tempHuile}
                  onChange={(e) => setTempHuile(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Température Ambiante (°C)
                </label>
                <input
                  type="number"
                  value={tempAmbiante}
                  onChange={(e) => setTempAmbiante(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Relevé de Compteur (h)
                </label>
                <input
                  type="number"
                  value={compteurHeures}
                  onChange={(e) => setCompteurHeures(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-base font-bold text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Indicateur Manomètre / Pression Cuve
              </label>
              <div className="grid grid-cols-3 gap-3">
                {['Sous-pression (< 0 bar)', 'Normal (0.1 - 0.3 bar)', 'Surpression (> 0.5 bar)'].map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPressionManometre(p)}
                      className={`py-3.5 px-4 rounded-xl text-xs font-bold border transition ${
                        pressionManometre === p
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Saisie optionnelle Analyseur Portable DGA / Humidité sur site */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Mesures Kit Portable DGA / Humidité sur Site (Optionnel — en ppm)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {[
                  { label: 'H₂ (ppm)', val: h2, set: setH2 },
                  { label: 'CH₄ (ppm)', val: ch4, set: setCh4 },
                  { label: 'C₂H₂ (ppm)', val: c2h2, set: setC2h2 },
                  { label: 'C₂H₄ (ppm)', val: c2h4, set: setC2h4 },
                  { label: 'C₂H₆ (ppm)', val: c2h6, set: setC2h6 },
                  { label: 'Eau (ppm)', val: teneurEau, set: setTeneurEau },
                  { label: 'Diélec (kV)', val: rigidite, set: setRigidite },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[11px] text-slate-400 mb-1">{f.label}</label>
                    <input
                      type="number"
                      placeholder="Optionnel"
                      value={f.val}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Retour Étape 1</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-extrabold text-white shadow-lg"
              >
                <span>Suivant : Inspection Visuelle</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-400" />
              <span>Étape 3 — Inspection Visuelle &amp; Validation Terrain</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Niveau d'huile visible */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-3">
                  Niveau d&apos;Huile Visible au Conservateur
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['Bas', 'Normal', 'Haut'] as const).map((niv) => (
                    <button
                      key={niv}
                      type="button"
                      onClick={() => setNiveauHuile(niv)}
                      className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                        niveauHuile === niv
                          ? niv === 'Normal'
                            ? 'bg-emerald-600 border-emerald-400 text-white'
                            : 'bg-amber-600 border-amber-400 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      {niv}
                    </button>
                  ))}
                </div>
              </div>

              {/* Couleur du gel de silice dans le déshydrateur */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-3">
                  Couleur du Gel de Silice (Déshydrateur)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCouleurSilice('Bleu')}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      couleurSilice === 'Bleu'
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    Bleu (Actif / Sec)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCouleurSilice('Rose')}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      couleurSilice === 'Rose'
                        ? 'bg-pink-600 border-pink-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    Rose / Saturé (À remplacer)
                  </button>
                </div>
              </div>

              {/* Détection de fuites */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-3">
                  Détection Visuelle de Fuites Diélectriques
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFuiteDetectee(false)}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      !fuiteDetectee
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    Non (Aucune fuite)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFuiteDetectee(true)}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      fuiteDetectee
                        ? 'bg-red-600 border-red-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    OUI (Fuite détectée)
                  </button>
                </div>
              </div>

              {/* Bruit ou vibration anormale */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-3">
                  Bruit Magnétique ou Vibration Anormale
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBruitVibration(false)}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      !bruitVibration
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    Non (Bruit normal)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBruitVibration(true)}
                    className={`py-4 rounded-xl text-sm font-extrabold border transition ${
                      bruitVibration
                        ? 'bg-red-600 border-red-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    OUI (Vibration anormale)
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Observations de l&apos;Opérateur / Remarques Terrain
              </label>
              <textarea
                rows={3}
                value={remarques}
                onChange={(e) => setRemarques(e.target.value)}
                placeholder="Ex. : Suintement léger sur vanne de vidange inférieure, ventilateurs groupe 2 en marche..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-sm text-white"
              />
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-slate-200"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Retour Étape 2</span>
              </button>
              <button
                type="button"
                onClick={handleSaveInspection}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-extrabold text-white shadow-xl"
              >
                <Save className="w-5 h-5" />
                <span>Enregistrer le Relevé Terrain (Offline-First)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
