import csv
import io
import os
import re
import tempfile
import uuid
from datetime import datetime, date, timezone
from typing import Dict, List, Any, Optional, Tuple

import pandas as pd
from rapidfuzz import fuzz, process
from sqlmodel import Session, select

from backend.models import (
    Equipement,
    Analyse,
    GazDissous,
    QualitePhysicochimique,
    PcbMetaux,
    DiagnosticRecommandation,
)
from backend.diagnostics import run_full_diagnostic


# ============================================================================
# Dictionnaire de Synonymes pour l'Auto-Mapping Intelligent (Fuzzy Matching)
# ============================================================================
CANONICAL_FIELDS: Dict[str, Dict[str, Any]] = {
    "id_equipement": {
        "label": "Identifiant Équipement (Clé)",
        "category": "Identification",
        "synonyms": [
            "id_equipement", "noequipement", "noéquipement", "no_equipement",
            "equipement", "équipement", "transformer_id", "tr_id", "repere",
            "repère", "tag", "asset_id", "appareil",
        ],
    },
    "nom_equipement": {
        "label": "Nom / Désignation Équipement",
        "category": "Identification",
        "synonyms": ["nom_equipement", "noméquipement", "designation", "désignation", "nom", "equipment_name"],
    },
    "site": {
        "label": "Site / Usine",
        "category": "Identification",
        "synonyms": ["site", "usine", "poste", "plant", "substation", "zone"],
    },
    "localisation": {
        "label": "Localisation / Cellule",
        "category": "Identification",
        "synonyms": ["localisation", "emplacement", "cellule", "location", "noexploitation"],
    },
    "date_prelevement": {
        "label": "Date de Prélèvement",
        "category": "Analyse",
        "synonyms": [
            "date_prelevement", "dateprelevement", "dateprélèvement", "date_echantillon",
            "dateanalyse", "date_analyse", "sample_date", "date", "timestamp",
        ],
    },
    "charge_pct": {
        "label": "Charge (%)",
        "category": "Analyse",
        "synonyms": ["charge_pct", "charge", "load", "load_pct", "charge (%)"],
    },
    "temperature_huile": {
        "label": "Température Huile (°C)",
        "category": "Analyse",
        "synonyms": [
            "temperature_huile", "temperature", "température", "temp_huile",
            "temp_epl", "oil_temp", "temp (°c)", "temp",
        ],
    },
    "laboratoire": {
        "label": "Laboratoire",
        "category": "Analyse",
        "synonyms": ["laboratoire", "labo", "lab", "laboratory", "codelaboratoire"],
    },
    "code_motif": {
        "label": "Motif de Prélèvement",
        "category": "Analyse",
        "synonyms": ["code_motif", "codemotif", "motif", "reason", "type_suivi"],
    },
    "remarques": {
        "label": "Remarques / Observations",
        "category": "Analyse",
        "synonyms": ["remarques", "remarque", "commentaire", "observations", "notes", "remarks"],
    },
    "h2": {
        "label": "Hydrogène H2 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["h2", "hydrogene", "hydrogène", "hydrogen", "h2 (ppm)", "h2_ppm", "gaz h2"],
    },
    "ch4": {
        "label": "Méthane CH4 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["ch4", "methane", "méthane", "methane (ppm)", "ch4 (ppm)", "ch4_ppm", "gaz ch4"],
    },
    "c2h6": {
        "label": "Éthane C2H6 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["c2h6", "ethane", "éthane", "ethane (ppm)", "c2h6 (ppm)", "c2h6_ppm", "gaz c2h6"],
    },
    "c2h4": {
        "label": "Éthylène C2H4 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["c2h4", "ethylene", "éthylène", "ethylene (ppm)", "c2h4 (ppm)", "c2h4_ppm", "gaz c2h4"],
    },
    "c2h2": {
        "label": "Acétylène C2H2 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["c2h2", "acetylene", "acétylène", "acetylene (ppm)", "c2h2 (ppm)", "c2h2_ppm", "gaz c2h2"],
    },
    "co": {
        "label": "Monoxyde de carbone CO (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["co", "monoxyde de carbone", "carbon monoxide", "co (ppm)", "co_ppm", "gaz co"],
    },
    "co2": {
        "label": "Dioxyde de carbone CO2 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["co2", "dioxyde de carbone", "carbon dioxide", "co2 (ppm)", "co2_ppm", "gaz co2"],
    },
    "o2": {
        "label": "Oxygène O2 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["o2", "oxygene", "oxygène", "oxygen", "o2 (ppm)", "o2_ppm"],
    },
    "n2": {
        "label": "Azote N2 (ppm)",
        "category": "Gaz Dissous (DGA)",
        "synonyms": ["n2", "azote", "nitrogen", "n2 (ppm)", "n2_ppm"],
    },
    "teneur_eau": {
        "label": "Teneur en Eau (ppm)",
        "category": "Physico-Chimie",
        "synonyms": [
            "teneur_eau", "eau", "water", "teneur en eau", "humidite",
            "humidité", "h2o_ppm", "h2o", "moisture", "eau (ppm)",
        ],
    },
    "acidite": {
        "label": "Acidité (mg KOH/g)",
        "category": "Physico-Chimie",
        "synonyms": [
            "acidite", "acidité", "acid", "acide", "neutralization number",
            "nn", "indice d'acide", "acidité (koh/g)",
        ],
    },
    "rigidite_dielectrique": {
        "label": "Rigidité Diélectrique (kV)",
        "category": "Physico-Chimie",
        "synonyms": [
            "rigidite_dielectrique", "rigidite", "rigidité", "dielectric",
            "diélec", "dielec", "diélec-d877", "breakdown voltage", "claquage",
            "bdv", "tension de claquage",
        ],
    },
    "tension_interfaciale": {
        "label": "Tension Interfaciale IFT (mN/m)",
        "category": "Physico-Chimie",
        "synonyms": ["tension_interfaciale", "ift", "interfacial tension", "ift (dynes/cm)"],
    },
    "tangente_delta": {
        "label": "Tangente Delta / Facteur de Puissance",
        "category": "Physico-Chimie",
        "synonyms": ["tangente_delta", "facteur de puissance", "tan delta", "ddf", "power factor"],
    },
    "viscosite": {
        "label": "Viscosité à 40 °C (cSt)",
        "category": "Physico-Chimie",
        "synonyms": ["viscosite", "viscosité", "viscosity"],
    },
    "couleur_astm": {
        "label": "Couleur ASTM D1500",
        "category": "Physico-Chimie",
        "synonyms": ["couleur_astm", "couleur", "color", "astm color", "indice couleur"],
    },
    "pcb_total": {
        "label": "PCB Total (ppm)",
        "category": "Contaminants & Métaux",
        "synonyms": ["pcb_total", "pcb", "bpc", "total-bpc", "bpc-1260", "bpc-1254", "bpc-1242", "aroclor"],
    },
    "cuivre": {
        "label": "Cuivre Cu (ppm)",
        "category": "Contaminants & Métaux",
        "synonyms": ["cuivre", "copper", "cu", "cu (ppm)"],
    },
    "aluminium": {
        "label": "Aluminium Al (ppm)",
        "category": "Contaminants & Métaux",
        "synonyms": ["aluminium", "aluminum", "al", "al (ppm)"],
    },
    "fer": {
        "label": "Fer Fe (ppm)",
        "category": "Contaminants & Métaux",
        "synonyms": ["fer", "iron", "fe", "fe (ppm)"],
    },
}


def normalize_col_name(col: str) -> str:
    s = str(col).strip().lower()
    s = re.sub(r"[_\\-]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def auto_map_columns(source_columns: List[str]) -> List[Dict[str, Any]]:
    """
    Algorithme d'Auto-Mapping par Correspondance Floue (Fuzzy Matching).
    Retourne pour chaque colonne source :
    - source_column
    - target_field (ou None si non reconnu)
    - target_label
    - confidence_score (0 à 100)
    - confidence_level : 'exact' (vert >= 88), 'medium' (orange 65-87), 'unrecognized' (rouge < 65)
    """
    synonym_to_target: Dict[str, str] = {}
    all_synonyms: List[str] = []
    for canonical_key, info in CANONICAL_FIELDS.items():
        for syn in info["synonyms"]:
            norm_syn = normalize_col_name(syn)
            synonym_to_target[norm_syn] = canonical_key
            all_synonyms.append(norm_syn)

    results: List[Dict[str, Any]] = []
    used_targets = set()

    for src_col in source_columns:
        norm_src = normalize_col_name(src_col)
        matched_target: Optional[str] = None
        score = 0.0

        # 1. Correspondance directe exacte sur synonyme normalisé
        if norm_src in synonym_to_target:
            matched_target = synonym_to_target[norm_src]
            score = 100.0
        else:
            # 2. Recherche floue (Fuzzy Matching via RapidFuzz)
            match = process.extractOne(norm_src, all_synonyms, scorer=fuzz.WRatio)
            if match:
                best_syn, best_score, _ = match
                score = round(float(best_score), 1)
                if score >= 65.0:
                    matched_target = synonym_to_target[best_syn]

        if matched_target and matched_target in used_targets and score < 95.0:
            # Éviter d'écraser un champ déjà mappé avec une correspondance faible
            confidence_level = "medium"
        elif score >= 88.0 and matched_target:
            confidence_level = "exact"
            used_targets.add(matched_target)
        elif score >= 65.0 and matched_target:
            confidence_level = "medium"
            used_targets.add(matched_target)
        else:
            matched_target = None
            confidence_level = "unrecognized"

        results.append(
            {
                "source_column": src_col,
                "target_field": matched_target,
                "target_label": CANONICAL_FIELDS[matched_target]["label"] if matched_target else "Ignorer / Non mappé",
                "category": CANONICAL_FIELDS[matched_target]["category"] if matched_target else "Non reconnu",
                "confidence_score": score,
                "confidence_level": confidence_level,
            }
        )

    return results


# ============================================================================
# Pipeline de Nettoyage des Valeurs & Détection d'Anomalies Physiques
# ============================================================================
NUMERIC_FIELDS = {
    "charge_pct", "temperature_huile",
    "h2", "ch4", "c2h6", "c2h4", "c2h2", "co", "co2", "o2", "n2",
    "teneur_eau", "acidite", "rigidite_dielectrique", "tension_interfaciale",
    "tangente_delta", "viscosite", "couleur_astm",
    "pcb_total", "cuivre", "aluminium", "fer",
}


def clean_detection_value(val: Any, use_half_limit: bool = True) -> Optional[float]:
    """
    Convertit les mentions textuelles de laboratoire ("< 1", "< 0.5", "ND", "N/D", "Trace")
    en zéros ou demi-seuils de détection numériques.
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (int, float)):
        return round(float(val), 4)

    s = str(val).strip()
    if not s:
        return None
    s_lower = s.lower()
    if s_lower in ("nd", "n/d", "n.d.", "non détecté", "non detecte", "nil", "none", "null", "nan", "-"):
        return 0.0
    if s_lower in ("trace", "traces", "tr"):
        return 0.1

    # Détection type "< 1", "<0,5", "<= 2.0"
    m = re.match(r"^<\s*=?\s*([0-9]+(?:[.,][0-9]+)?)", s)
    if m:
        limit_val = float(m.group(1).replace(",", "."))
        return round(limit_val / 2.0, 4) if use_half_limit else 0.0

    # Nettoyage standard (virgule décimale, unités éventuelles ex: "12.5 ppm")
    s_clean = s.replace(",", ".")
    m_num = re.search(r"[-+]?[0-9]*\.?[0-9]+", s_clean)
    if m_num:
        try:
            return round(float(m_num.group(0)), 4)
        except ValueError:
            return None
    return None


def parse_clean_date(val: Any) -> datetime:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return datetime.now(timezone.utc)
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day, tzinfo=timezone.utc)
    s = str(val).strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
    ):
        try:
            dt = datetime.strptime(s[:19], fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        dt = pd.to_datetime(s).to_pydatetime()
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def validate_physical_bounds(cleaned_row: Dict[str, Any], row_index: int) -> List[str]:
    """Détecte les valeurs physiques aberrantes (ex. acidité négative, claquage > 150 kV)."""
    alerts: List[str] = []
    for k in NUMERIC_FIELDS:
        v = cleaned_row.get(k)
        if v is not None and v < 0:
            alerts.append(f"Ligne {row_index + 1} : Valeur négative aberrante sur '{k}' ({v}) corrigée à 0.")
            cleaned_row[k] = 0.0

    dielec = cleaned_row.get("rigidite_dielectrique")
    if dielec is not None and dielec > 150.0:
        alerts.append(f"Ligne {row_index + 1} : Tension de claquage aberrante ({dielec} kV > 150 kV).")

    acid = cleaned_row.get("acidite")
    if acid is not None and acid > 5.0:
        alerts.append(f"Ligne {row_index + 1} : Indice d'acide anormalement élevé ({acid} mg KOH/g > 5.0).")

    eau = cleaned_row.get("teneur_eau")
    if eau is not None and eau > 500.0:
        alerts.append(f"Ligne {row_index + 1} : Teneur en eau extrême ({eau} ppm > 500 ppm).")

    temp = cleaned_row.get("temperature_huile")
    if temp is not None and temp > 160.0:
        alerts.append(f"Ligne {row_index + 1} : Température d'huile aberrante ({temp} °C > 160 °C).")

    return alerts


def clean_and_preview_dataframe(
    df: pd.DataFrame,
    mapping: Dict[str, str],
    preview_limit: int = 10,
) -> Dict[str, Any]:
    """
    Applique le mapping (source_col -> target_field), nettoie les lignes,
    identifie les alertes physiques et renvoie les 10 premières lignes nettoyées.
    """
    active_map = {src: tgt for src, tgt in mapping.items() if tgt and tgt in CANONICAL_FIELDS}
    cleaned_rows: List[Dict[str, Any]] = []
    all_alerts: List[str] = []

    records = df.to_dict(orient="records")
    for idx, raw_row in enumerate(records):
        c_row: Dict[str, Any] = {}
        for src_col, tgt_field in active_map.items():
            raw_val = raw_row.get(src_col)
            if tgt_field in NUMERIC_FIELDS:
                c_row[tgt_field] = clean_detection_value(raw_val)
            elif tgt_field == "date_prelevement":
                dt = parse_clean_date(raw_val)
                c_row[tgt_field] = dt.strftime("%Y-%m-%d %H:%M")
            else:
                if raw_val is not None and not (isinstance(raw_val, float) and pd.isna(raw_val)):
                    s_val = str(raw_val).strip()
                    c_row[tgt_field] = s_val if s_val.lower() != "none" else ""
                else:
                    c_row[tgt_field] = ""

        if not c_row.get("id_equipement"):
            c_row["id_equipement"] = f"TR-IMP-{idx + 1:04d}"
        if not c_row.get("date_prelevement"):
            c_row["date_prelevement"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

        row_alerts = validate_physical_bounds(c_row, idx)
        if row_alerts and len(all_alerts) < 100:
            all_alerts.extend(row_alerts)

        cleaned_rows.append(c_row)

    return {
        "total_rows": len(cleaned_rows),
        "preview_rows": cleaned_rows[:preview_limit],
        "alerts": all_alerts[:50],
        "mapped_fields": list(active_map.values()),
    }


# ============================================================================
# Lecture Multi-Formats (Excel, CSV/TSV/TXT, Access .mdb/.accdb)
# ============================================================================
def read_uploaded_file_to_df(
    file_bytes: bytes,
    filename: str,
    sheet_name: Optional[str] = None,
    access_table: Optional[str] = None,
    access_sql: Optional[str] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Lit un fichier Excel (.xlsx, .xls), Délimité (.csv, .tsv, .txt) ou Access (.mdb, .accdb)
    et retourne un DataFrame pandas ainsi que les métadonnées (feuilles, tables, délimiteur, encodage).
    """
    ext = os.path.splitext(filename)[1].lower()
    meta: Dict[str, Any] = {"filename": filename, "format": ext}

    if ext in (".xlsx", ".xls"):
        excel_file = pd.ExcelFile(io.BytesIO(file_bytes))
        sheets = excel_file.sheet_names
        meta["sheets"] = sheets
        chosen_sheet = sheet_name if (sheet_name and sheet_name in sheets) else sheets[0]
        # Sélectionner automatiquement la première feuille non vide si non spécifiée
        if not sheet_name:
            for s in sheets:
                df_try = excel_file.parse(s, nrows=5)
                if len(df_try.columns) >= 2 and len(df_try) > 0:
                    chosen_sheet = s
                    break
        meta["selected_sheet"] = chosen_sheet
        df = excel_file.parse(chosen_sheet)
        return df, meta

    elif ext in (".csv", ".tsv", ".txt"):
        detected_encoding = "utf-8"
        text_content = None
        for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                text_content = file_bytes.decode(enc)
                detected_encoding = enc
                break
            except UnicodeDecodeError:
                continue
        if text_content is None:
            text_content = file_bytes.decode("latin-1", errors="replace")
            detected_encoding = "latin-1"

        sample_lines = "\n".join(text_content.splitlines()[:15])
        detected_delim = ","
        try:
            dialect = csv.Sniffer().sniff(sample_lines, delimiters=[",", ";", "\t", "|"])
            detected_delim = dialect.delimiter
        except Exception:
            counts = {d: sample_lines.count(d) for d in (",", ";", "\t", "|")}
            detected_delim = max(counts, key=counts.get) if any(counts.values()) else ","

        meta["encoding"] = detected_encoding
        meta["delimiter"] = "TAB" if detected_delim == "\t" else detected_delim
        df = pd.read_csv(io.StringIO(text_content), sep=detected_delim)
        return df, meta

    elif ext in (".mdb", ".accdb"):
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            tables: List[str] = []
            df = pd.DataFrame()
            # Tentative via pyodbc
            try:
                import pyodbc
                drivers = [d for d in pyodbc.drivers() if "Access" in d or "mdb" in d.lower()]
                if drivers:
                    conn_str = f"DRIVER={{{drivers[0]}}};DBQ={tmp_path};"
                    conn = pyodbc.connect(conn_str)
                    cursor = conn.cursor()
                    tables = [row.table_name for row in cursor.tables(tableType="TABLE")]
                    meta["access_tables"] = tables
                    if access_sql and access_sql.strip().lower().startswith("select"):
                        cursor.execute(access_sql)
                        cols = [c[0] for c in cursor.description]
                        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                        df = pd.DataFrame(rows)
                        meta["executed_sql"] = access_sql
                    else:
                        chosen_tbl = access_table if (access_table and access_table in tables) else (
                            "Gaz Dissous" if "Gaz Dissous" in tables else (tables[0] if tables else None)
                        )
                        meta["selected_table"] = chosen_tbl
                        if chosen_tbl:
                            cursor.execute(f"SELECT * FROM [{chosen_tbl}]")
                            cols = [c[0] for c in cursor.description]
                            rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
                            df = pd.DataFrame(rows)
                    conn.close()
                    return df, meta
            except Exception:
                pass

            # Fallback via access-parser
            from access_parser import AccessParser
            db = AccessParser(tmp_path)
            tables = list(db.catalog.keys())
            meta["access_tables"] = tables
            chosen_tbl = access_table if (access_table and access_table in tables) else (
                "Gaz Dissous" if "Gaz Dissous" in tables else (tables[0] if tables else None)
            )
            meta["selected_table"] = chosen_tbl
            if chosen_tbl:
                parsed = db.parse_table(chosen_tbl)
                df = pd.DataFrame(parsed)
            return df, meta
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    raise ValueError(f"Format de fichier non supporté : {ext}")


# ============================================================================
# Exécution de l'Importation dans SQLite avec Gestion des Doublons
# ============================================================================
def commit_dataframe_import(
    session: Session,
    df: pd.DataFrame,
    mapping: Dict[str, str],
    duplicate_strategy: str = "overwrite",  # 'overwrite' ou 'archive'
) -> Dict[str, Any]:
    """
    Valide et insère les lignes nettoyées (jusqu'à 25 000+ lignes) dans SQLite,
    exécute automatiquement les diagnostics IEEE C57.104 / Duval / THI et gère les doublons.
    """
    active_map = {src: tgt for src, tgt in mapping.items() if tgt and tgt in CANONICAL_FIELDS}
    records = df.to_dict(orient="records")

    existing_eq_ids = set(session.exec(select(Equipement.id_equipement)).all())

    imported_count = 0
    duplicates_count = 0
    alerts: List[str] = []

    for idx, raw_row in enumerate(records):
        c_row: Dict[str, Any] = {}
        for src_col, tgt_field in active_map.items():
            raw_val = raw_row.get(src_col)
            if tgt_field in NUMERIC_FIELDS:
                c_row[tgt_field] = clean_detection_value(raw_val)
            elif tgt_field == "date_prelevement":
                c_row[tgt_field] = parse_clean_date(raw_val)
            else:
                if raw_val is not None and not (isinstance(raw_val, float) and pd.isna(raw_val)):
                    c_row[tgt_field] = str(raw_val).strip()

        row_alerts = validate_physical_bounds(c_row, idx)
        if row_alerts and len(alerts) < 100:
            alerts.extend(row_alerts)

        eq_id = c_row.get("id_equipement") or f"TR-IMP-{idx + 1:04d}"
        dt_prelev: datetime = c_row.get("date_prelevement") or datetime.now(timezone.utc)

        if eq_id not in existing_eq_ids:
            new_eq = Equipement(
                id_equipement=eq_id,
                nom_equipement=c_row.get("nom_equipement") or f"Transformateur {eq_id}",
                type_equipement=c_row.get("type_equipement") or "Transformateur de puissance",
                site=c_row.get("site") or "Site Importé",
                localisation=c_row.get("localisation") or "Poste Principal",
                litre_huile=0.0,
                no_serie=eq_id,
                tension_nominale=0.0,
            )
            session.add(new_eq)
            existing_eq_ids.add(eq_id)

        # Détection de doublon sur le couple (id_equipement, date_prelevement)
        existing_analyse = session.exec(
            select(Analyse).where(
                Analyse.id_equipement == eq_id,
                Analyse.date_prelevement == dt_prelev,
            )
        ).first()

        if existing_analyse:
            duplicates_count += 1
            if duplicate_strategy == "overwrite":
                id_analyse = existing_analyse.id_analyse
                existing_analyse.charge_pct = c_row.get("charge_pct", existing_analyse.charge_pct)
                existing_analyse.temperature_huile = c_row.get("temperature_huile", existing_analyse.temperature_huile)
                existing_analyse.remarques = c_row.get("remarques") or existing_analyse.remarques
                session.add(existing_analyse)
            else:
                # 'archive' : créer un nouvel enregistrement horodaté tout en conservant l'ancien
                id_analyse = f"IMP-{uuid.uuid4().hex[:10].upper()}"
                session.add(
                    Analyse(
                        id_analyse=id_analyse,
                        id_equipement=eq_id,
                        date_prelevement=dt_prelev,
                        charge_pct=c_row.get("charge_pct"),
                        temperature_huile=c_row.get("temperature_huile"),
                        code_motif=c_row.get("code_motif") or "Import Archive",
                        laboratoire=c_row.get("laboratoire") or "Laboratoire Externe",
                        source_donnees="IMPORT_FILE",
                        remarques=c_row.get("remarques"),
                    )
                )
        else:
            id_analyse = f"IMP-{uuid.uuid4().hex[:10].upper()}"
            session.add(
                Analyse(
                    id_analyse=id_analyse,
                    id_equipement=eq_id,
                    date_prelevement=dt_prelev,
                    charge_pct=c_row.get("charge_pct"),
                    temperature_huile=c_row.get("temperature_huile"),
                    code_motif=c_row.get("code_motif") or "Routine",
                    laboratoire=c_row.get("laboratoire") or "Laboratoire Externe",
                    source_donnees="IMPORT_FILE",
                    remarques=c_row.get("remarques"),
                )
            )

        # Gaz Dissous
        h2 = c_row.get("h2")
        ch4 = c_row.get("ch4")
        c2h6 = c_row.get("c2h6")
        c2h4 = c_row.get("c2h4")
        c2h2 = c_row.get("c2h2")
        co = c_row.get("co")
        co2 = c_row.get("co2")
        o2 = c_row.get("o2")
        n2 = c_row.get("n2")

        if any(v is not None for v in (h2, ch4, c2h6, c2h4, c2h2, co, co2, o2, n2)):
            tdcg = round(sum(v or 0.0 for v in (h2, ch4, c2h6, c2h4, c2h2, co)), 2)
            existing_gd = session.get(GazDissous, id_analyse)
            if existing_gd:
                existing_gd.h2 = h2
                existing_gd.ch4 = ch4
                existing_gd.c2h6 = c2h6
                existing_gd.c2h4 = c2h4
                existing_gd.c2h2 = c2h2
                existing_gd.co = co
                existing_gd.co2 = co2
                existing_gd.o2 = o2
                existing_gd.n2 = n2
                existing_gd.tdcg = tdcg
                session.add(existing_gd)
            else:
                session.add(
                    GazDissous(
                        id_analyse=id_analyse,
                        h2=h2, ch4=ch4, c2h6=c2h6, c2h4=c2h4, c2h2=c2h2,
                        co=co, co2=co2, o2=o2, n2=n2, tdcg=tdcg,
                    )
                )

        # Qualité Physico-Chimique
        eau = c_row.get("teneur_eau")
        acid = c_row.get("acidite")
        dielec = c_row.get("rigidite_dielectrique")
        ift = c_row.get("tension_interfaciale")
        tdelta = c_row.get("tangente_delta")
        visc = c_row.get("viscosite")
        coul = c_row.get("couleur_astm")

        if any(v is not None for v in (eau, acid, dielec, ift, tdelta, visc, coul)):
            existing_pq = session.get(QualitePhysicochimique, id_analyse)
            if existing_pq:
                existing_pq.teneur_eau = eau
                existing_pq.acidite = acid
                existing_pq.rigidite_dielectrique = dielec
                existing_pq.tension_interfaciale = ift
                existing_pq.tangente_delta = tdelta
                existing_pq.viscosite = visc
                existing_pq.couleur_astm = coul
                session.add(existing_pq)
            else:
                session.add(
                    QualitePhysicochimique(
                        id_analyse=id_analyse,
                        teneur_eau=eau,
                        acidite=acid,
                        rigidite_dielectrique=dielec,
                        tension_interfaciale=ift,
                        tangente_delta=tdelta,
                        viscosite=visc,
                        couleur_astm=coul,
                    )
                )

        # PCB & Métaux
        pcb = c_row.get("pcb_total")
        cu = c_row.get("cuivre")
        al = c_row.get("aluminium")
        fe = c_row.get("fer")
        if any(v is not None for v in (pcb, cu, al, fe)):
            existing_pcb = session.get(PcbMetaux, id_analyse)
            if existing_pcb:
                existing_pcb.pcb_total = pcb
                existing_pcb.cuivre = cu
                existing_pcb.aluminium = al
                existing_pcb.fer = fe
                session.add(existing_pcb)
            else:
                session.add(
                    PcbMetaux(
                        id_analyse=id_analyse,
                        pcb_total=pcb, cuivre=cu, aluminium=al, fer=fe,
                    )
                )

        # Calcul du Diagnostic Expert
        diag_res = run_full_diagnostic(
            id_analyse=id_analyse,
            h2=h2, ch4=ch4, c2h6=c2h6, c2h4=c2h4, c2h2=c2h2, co=co, co2=co2,
            teneur_eau=eau, acidite=acid, rigidite_dielectrique=dielec,
            tension_interfaciale=ift, couleur_astm=coul, pcb_total=pcb,
        )
        existing_diag = session.get(DiagnosticRecommandation, id_analyse)
        if existing_diag:
            existing_diag.condition_ieee = diag_res["condition_ieee"]
            existing_diag.code_duval = diag_res["code_duval"]
            existing_diag.diagnostic_duval = diag_res["diagnostic_duval"]
            existing_diag.ratio_co2_co = diag_res["ratio_co2_co"]
            existing_diag.health_index = diag_res["health_index"]
            existing_diag.statut_global = diag_res["statut_global"]
            existing_diag.recommandation_action = diag_res["recommandation_action"]
            existing_diag.billet_travail = diag_res["billet_travail"]
            session.add(existing_diag)
        else:
            session.add(
                DiagnosticRecommandation(
                    id_analyse=id_analyse,
                    condition_ieee=diag_res["condition_ieee"],
                    code_duval=diag_res["code_duval"],
                    diagnostic_duval=diag_res["diagnostic_duval"],
                    ratio_co2_co=diag_res["ratio_co2_co"],
                    health_index=diag_res["health_index"],
                    statut_global=diag_res["statut_global"],
                    recommandation_action=diag_res["recommandation_action"],
                    billet_travail=diag_res["billet_travail"],
                )
            )

        imported_count += 1

    session.commit()
    return {
        "imported_rows": imported_count,
        "duplicates_handled": duplicates_count,
        "duplicate_strategy": duplicate_strategy,
        "alerts_count": len(alerts),
        "alerts": alerts[:30],
    }
