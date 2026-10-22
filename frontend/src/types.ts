export type StatutGlobal = 'BON' | 'SURVEILLANCE' | 'CRITIQUE';

export interface EquipementSummary {
  id_equipement: string;
  nom_equipement: string;
  type_equipement: string;
  site: string;
  localisation: string;
  tension_nominale: number | null;
  litre_huile: number | null;
  no_serie: string | null;
  date_mise_en_service: string | null;
  nb_analyses: number;
  dernier_prelevement: string | null;
  statut_global: StatutGlobal;
  health_index: number;
  condition_ieee: number;
  code_duval: string;
  diagnostic_duval: string;
  ratio_co2_co: number | null;
  recommandation_action: string;
  billet_travail: string | null;
  tdcg: number | null;
  c2h2: number | null;
  h2: number | null;
  teneur_eau: number | null;
  rigidite_dielectrique: number | null;
  acidite: number | null;
  pcb_total: number | null;
}

export interface DashboardKPIs {
  total_equipements: number;
  total_analyses: number;
  status_counts: Record<StatutGlobal, number>;
  ieee_counts: Record<number, number>;
  duval_counts: Record<string, number>;
  sites: string[];
}

export interface DashboardResponse {
  kpis: DashboardKPIs;
  equipements: EquipementSummary[];
}

export interface GazDissousRecord {
  id_analyse: string;
  h2: number | null;
  ch4: number | null;
  c2h6: number | null;
  c2h4: number | null;
  c2h2: number | null;
  co: number | null;
  co2: number | null;
  o2: number | null;
  n2: number | null;
  tdcg: number | null;
}

export interface QualitePhysicoRecord {
  id_analyse: string;
  teneur_eau: number | null;
  acidite: number | null;
  rigidite_dielectrique: number | null;
  tension_interfaciale: number | null;
  tangente_delta: number | null;
  viscosite: number | null;
  couleur_astm: number | null;
}

export interface PcbMetauxRecord {
  id_analyse: string;
  pcb_total: number | null;
  cuivre: number | null;
  aluminium: number | null;
  fer: number | null;
}

export interface DiagnosticRecord {
  id_analyse: string;
  condition_ieee: number;
  code_duval: string;
  diagnostic_duval: string;
  ratio_co2_co: number | null;
  health_index: number;
  statut_global: StatutGlobal;
  recommandation_action: string;
  billet_travail: string | null;
}

export interface DuvalCoordinates {
  pct_ch4: number;
  pct_c2h4: number;
  pct_c2h2: number;
  code_duval: string;
  diagnostic_duval: string;
}

export interface AnalyseHistoryItem {
  id_analyse: string;
  id_equipement: string;
  date_prelevement: string;
  charge_pct: number | null;
  temperature_huile: number | null;
  code_motif: string | null;
  laboratoire: string | null;
  source_donnees: string;
  remarques: string | null;
  gaz_dissous: GazDissousRecord | null;
  qualite_physicochimique: QualitePhysicoRecord | null;
  pcb_metaux: PcbMetauxRecord | null;
  diagnostic: DiagnosticRecord | null;
  duval_coordinates?: DuvalCoordinates | null;
}

export interface EquipementDetailResponse {
  equipement: {
    id_equipement: string;
    nom_equipement: string;
    type_equipement: string;
    site: string;
    localisation: string;
    litre_huile: number | null;
    no_serie: string | null;
    tension_nominale: number | null;
    date_mise_en_service: string | null;
  };
  history: AnalyseHistoryItem[];
}

export interface PendingFieldInspection {
  local_id?: number;
  id_analyse: string;
  id_equipement: string;
  nom_equipement?: string;
  type_equipement?: string;
  site: string;
  localisation: string;
  date_prelevement: string;
  charge_pct: number | null;
  temperature_huile: number | null;
  temperature_ambiante: number | null;
  compteur_heures: number | null;
  pression_manometre: string;
  code_motif: string;
  laboratoire: string;
  niveau_huile: 'Normal' | 'Bas' | 'Haut';
  couleur_silice: 'Bleu' | 'Rose';
  fuite_detectee: boolean;
  bruit_vibration: boolean;
  remarques: string;
  h2: number | null;
  ch4: number | null;
  c2h6: number | null;
  c2h4: number | null;
  c2h2: number | null;
  co: number | null;
  co2: number | null;
  teneur_eau: number | null;
  acidite: number | null;
  rigidite_dielectrique: number | null;
  couleur_astm: number | null;
  created_at: string;
}

export interface AutoMappingEntry {
  source_column: string;
  target_field: string | null;
  target_label: string;
  category: string;
  confidence_score: number;
  confidence_level: 'exact' | 'medium' | 'unrecognized';
}

export interface CanonicalFieldOption {
  field: string;
  label: string;
  category: string;
}

export interface FileInspectionResponse {
  file_token: string;
  filename: string;
  metadata: {
    filename: string;
    format: string;
    sheets?: string[];
    selected_sheet?: string;
    access_tables?: string[];
    selected_table?: string;
    encoding?: string;
    delimiter?: string;
  };
  total_rows: number;
  auto_mapping: AutoMappingEntry[];
  active_mapping: Record<string, string | null>;
  preview_rows: Record<string, any>[];
  alerts: string[];
  canonical_fields: CanonicalFieldOption[];
}
