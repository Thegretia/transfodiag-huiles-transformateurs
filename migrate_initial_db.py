"""
Script autonome d'initialisation et de migration de la base historique Access
HuileData2003(1).mdb vers la base SQLite locale transformers_vault.db.
"""
import os
import sys
from datetime import datetime, date, timezone
from typing import Dict, List, Any, Optional
from sqlmodel import Session, select

from backend.database import engine, init_db, DB_PATH
from backend.models import (
    Equipement,
    Analyse,
    GazDissous,
    QualitePhysicochimique,
    PcbMetaux,
    DiagnosticRecommandation,
    NormeReferentiel,
)
from backend.diagnostics import run_full_diagnostic

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MDB_PATH = os.path.join(BASE_DIR, "HuileData2003(1).mdb")


def _safe_float(val: Any, default: Optional[float] = None) -> Optional[float]:
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return round(float(val), 4)
    s = str(val).strip().replace(",", ".")
    if not s or s.lower() in ("none", "null", "nan", "nd", "n/d"):
        return default
    if s.startswith("<"):
        try:
            return round(float(s[1:].strip()) / 2.0, 4)
        except ValueError:
            return 0.0
    try:
        return round(float(s), 4)
    except ValueError:
        return default


def _safe_str(val: Any, default: str = "") -> str:
    if val is None:
        return default
    s = str(val).strip()
    return s if s and s.lower() != "none" else default


def _parse_datetime(val: Any, fallback: Optional[Any] = None) -> datetime:
    for candidate in (val, fallback):
        if candidate is None:
            continue
        if isinstance(candidate, datetime):
            return candidate if candidate.tzinfo else candidate.replace(tzinfo=timezone.utc)
        if isinstance(candidate, date):
            return datetime(candidate.year, candidate.month, candidate.day, tzinfo=timezone.utc)
        s = str(candidate).strip()
        if not s or s.lower() == "none":
            continue
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y %H:%M:%S"):
            try:
                dt = datetime.strptime(s[:19], fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return datetime(2000, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


def load_mdb_tables(mdb_path: str) -> Dict[str, List[Dict[str, Any]]]:
    """Lit les tables depuis HuileData2003(1).mdb via pyodbc (Windows) ou access-parser (fallback multi-plateforme)."""
    tables_to_load = [
        "Équipement",
        "TypeÉquipement",
        "Localisation",
        "Analyse",
        "AnalyseDétail",
        "Motif",
        "Laboratoire",
        "Gaz Dissous",
        "EPL",
        "BPC",
        "Métaux Dans Huiles",
        "Recommandation",
        "NormesC57104",
        "NormesAlcan",
    ]
    data: Dict[str, List[Dict[str, Any]]] = {t: [] for t in tables_to_load}

    # Tentative 1 : pyodbc (Pilote ODBC Microsoft Access)
    try:
        import pyodbc
        drivers = [d for d in pyodbc.drivers() if "Access" in d or "mdb" in d.lower()]
        if drivers:
            conn_str = f"DRIVER={{{drivers[0]}}};DBQ={mdb_path};"
            conn = pyodbc.connect(conn_str)
            cursor = conn.cursor()
            for t in tables_to_load:
                try:
                    cursor.execute(f"SELECT * FROM [{t}]")
                    cols = [col[0] for col in cursor.description]
                    data[t] = [dict(zip(cols, row)) for row in cursor.fetchall()]
                except Exception as ex:
                    print(f"[AVERTISSEMENT] Table {t} non lue via pyodbc: {ex}")
            conn.close()
            print(f"[OK] Lecture ODBC réussie depuis {os.path.basename(mdb_path)}.")
            return data
    except Exception as e:
        print(f"[INFO] pyodbc indisponible ou erreur ({e}), bascule sur access-parser...")

    # Tentative 2 : access-parser (100% Python, sans pilote système)
    from access_parser import AccessParser
    db = AccessParser(mdb_path)
    for t in tables_to_load:
        if t in db.catalog:
            parsed = db.parse_table(t)
            cols = list(parsed.keys())
            n_rows = len(parsed[cols[0]]) if cols else 0
            rows = []
            for i in range(n_rows):
                rows.append({c: parsed[c][i] for c in cols})
            data[t] = rows
    print(f"[OK] Lecture access-parser réussie depuis {os.path.basename(mdb_path)}.")
    return data


def migrate(mdb_path: str = DEFAULT_MDB_PATH, force_rebuild: bool = True) -> Dict[str, int]:
    """Exécute la migration complète de HuileData2003(1).mdb vers transformers_vault.db."""
    if not os.path.exists(mdb_path):
        raise FileNotFoundError(f"Fichier Access introuvable : {mdb_path}")

    if force_rebuild and os.path.exists(DB_PATH):
        try:
            engine.dispose()
            os.remove(DB_PATH)
            print(f"[INFO] Ancienne base {os.path.basename(DB_PATH)} supprimée pour réinitialisation propre.")
        except Exception as e:
            print(f"[INFO] Réutilisation du fichier {os.path.basename(DB_PATH)} ({e}).")

    init_db()
    raw = load_mdb_tables(mdb_path)

    # 1. Dictionnaires de correspondance (Lookups)
    type_eq_map: Dict[str, str] = {
        "T": "Transformateur de puissance",
        "D": "Disjoncteur",
        "1": "Traversée isolée",
        "C": "Condensateur",
        "Y": "Réservoir / Unité mobile",
    }
    for r in raw.get("TypeÉquipement", []):
        k = _safe_str(r.get("TypeÉquipement"))
        v = _safe_str(r.get("DescriptionTypeÉquipement"))
        if k and v:
            type_eq_map[k] = v

    motif_map: Dict[str, str] = {}
    for r in raw.get("Motif", []):
        k = _safe_str(r.get("CodeMotif"))
        v = _safe_str(r.get("Modif"))
        if k:
            motif_map[k] = v or "Routine"

    labo_map: Dict[str, str] = {}
    for r in raw.get("Laboratoire", []):
        k = _safe_str(r.get("CodeLaboratoire"))
        v = _safe_str(r.get("Laboratoire"))
        if k:
            labo_map[k] = v or "Laboratoire Interne"

    loc_map: Dict[str, str] = {}
    for r in raw.get("Localisation", []):
        site_k = _safe_str(r.get("Site"))
        loc_k = _safe_str(r.get("Localisation"))
        desc = _safe_str(r.get("Description Localisation"))
        if site_k and loc_k and desc:
            loc_map[f"{site_k}:{loc_k}"] = desc

    rec_lookup: Dict[str, str] = {}
    for r in raw.get("Recommandation", []):
        ta = _safe_str(r.get("TypeAnalyse")).upper()
        cr = _safe_str(r.get("CodeRecommandation"))
        txt = _safe_str(r.get("Recommandation"))
        if ta and cr and txt:
            rec_lookup[f"{ta}:{cr}"] = txt

    # 2. Construction des Équipements
    equipements_dict: Dict[str, Equipement] = {}
    for r in raw.get("Équipement", []):
        eq_id = _safe_str(r.get("NoÉquipement"))
        if not eq_id:
            continue
        t_code = _safe_str(r.get("TypeÉquipement"), "T")
        site = _safe_str(r.get("Site"), "Alcan BKP")
        loc_code = _safe_str(r.get("Localisation"), site)
        loc_full = loc_map.get(f"{site}:{loc_code}", loc_code)
        nom = _safe_str(r.get("NomÉquipement")) or type_eq_map.get(t_code, "Transformateur")
        manuf = _safe_str(r.get("Manufacturier"))
        if manuf and manuf not in nom:
            nom = f"{nom} ({manuf})"

        annee = _safe_float(r.get("Année"), 0.0)
        date_mes: Optional[date] = None
        if annee and 1920 <= int(annee) <= 2026:
            date_mes = date(int(annee), 1, 1)

        equipements_dict[eq_id] = Equipement(
            id_equipement=eq_id,
            nom_equipement=nom,
            type_equipement=type_eq_map.get(t_code, t_code or "Transformateur"),
            site=site or "Site Principal",
            localisation=loc_full or "Poste Principal",
            litre_huile=_safe_float(r.get("LitreHuile"), 0.0) or 0.0,
            no_serie=_safe_str(r.get("NoSérie"), eq_id),
            tension_nominale=_safe_float(r.get("Tension"), 0.0) or 0.0,
            date_mise_en_service=date_mes,
        )

    # Indexation des tables de résultats par CléAnalyse
    gd_by_key: Dict[str, Dict[str, Any]] = {}
    for r in raw.get("Gaz Dissous", []):
        k = _safe_str(r.get("CléAnalyse"))
        if k:
            gd_by_key[k] = r

    epl_by_key: Dict[str, Dict[str, Any]] = {}
    for r in raw.get("EPL", []):
        k = _safe_str(r.get("CléAnalyse"))
        if k:
            epl_by_key[k] = r

    bpc_by_key: Dict[str, Dict[str, Any]] = {}
    for r in raw.get("BPC", []):
        k = _safe_str(r.get("CléAnalyse"))
        if k:
            bpc_by_key[k] = r

    mdh_by_key: Dict[str, Dict[str, Any]] = {}
    for r in raw.get("Métaux Dans Huiles", []):
        k = _safe_str(r.get("CléAnalyse"))
        if k:
            mdh_by_key[k] = r

    detail_by_key: Dict[str, Dict[str, Any]] = {}
    for r in raw.get("AnalyseDétail", []):
        k = _safe_str(r.get("CléAnalyse"))
        if k:
            detail_by_key[k] = r

    # Indexation secondaire par (NoÉquipement, DatePrélèvement YYYY-MM-DD) pour consolider
    # la physico-chimie (EPL) et les BPC/Métaux avec les prélèvements DGA du même jour
    epl_by_eq_date: Dict[str, Dict[str, Any]] = {}
    bpc_by_eq_date: Dict[str, Dict[str, Any]] = {}
    mdh_by_eq_date: Dict[str, Dict[str, Any]] = {}

    for r in raw.get("Analyse", []):
        cle = _safe_str(r.get("CléAnalyse"))
        eq_id = _safe_str(r.get("NoÉquipement"))
        dt = _parse_datetime(r.get("DatePrélèvement"), r.get("DateAnalyse"))
        day_key = f"{eq_id}:{dt.strftime('%Y-%m-%d')}"
        if cle in epl_by_key:
            epl_by_eq_date[day_key] = epl_by_key[cle]
        if cle in bpc_by_key:
            bpc_by_eq_date[day_key] = bpc_by_key[cle]
        if cle in mdh_by_key:
            mdh_by_eq_date[day_key] = mdh_by_key[cle]

    analyses_list: List[Analyse] = []
    gaz_list: List[GazDissous] = []
    phys_list: List[QualitePhysicochimique] = []
    pcb_list: List[PcbMetaux] = []
    diag_list: List[DiagnosticRecommandation] = []

    seen_analyses = set()

    for r in raw.get("Analyse", []):
        cle = _safe_str(r.get("CléAnalyse"))
        eq_id = _safe_str(r.get("NoÉquipement"))
        if not cle or not eq_id or cle in seen_analyses:
            continue
        seen_analyses.add(cle)

        # S'assurer que l'équipement existe dans equipements_dict (intégrité référentielle)
        if eq_id not in equipements_dict:
            equipements_dict[eq_id] = Equipement(
                id_equipement=eq_id,
                nom_equipement=f"Transformateur {eq_id}",
                type_equipement="Transformateur de puissance",
                site="Site Historique",
                localisation=_safe_str(r.get("NoExploitation"), "Poste HT"),
                litre_huile=0.0,
                no_serie=eq_id,
                tension_nominale=0.0,
            )

        dt_prelev = _parse_datetime(r.get("DatePrélèvement"), r.get("DateAnalyse"))
        day_key = f"{eq_id}:{dt_prelev.strftime('%Y-%m-%d')}"
        type_anal = _safe_str(r.get("TypeAnalyse"), "GD").upper()

        gd_row = gd_by_key.get(cle)
        epl_row = epl_by_key.get(cle) or (epl_by_eq_date.get(day_key) if gd_row else None)
        bpc_row = bpc_by_key.get(cle) or (bpc_by_eq_date.get(day_key) if gd_row else None)
        mdh_row = mdh_by_key.get(cle) or (mdh_by_eq_date.get(day_key) if gd_row else None)
        det_row = detail_by_key.get(cle, {})

        # Température d'huile depuis GD ou EPL
        temp_huile = None
        if gd_row:
            t_gd = _safe_float(gd_row.get("Température"))
            if t_gd and t_gd > 0:
                temp_huile = t_gd
        if temp_huile is None and epl_row:
            t_epl = _safe_float(epl_row.get("Temp_EPL"))
            if t_epl and t_epl > 0:
                temp_huile = t_epl

        motif_code = _safe_str(r.get("CodeMotif"), "1")
        labo_code = _safe_str(r.get("CodeLaboratoire"), "0")
        remarque_parts = [
            _safe_str(r.get("Remarque")),
            _safe_str(det_row.get("Commentaire")),
            _safe_str(det_row.get("RecommandationÉcrite")),
        ]
        remarques = " | ".join([p for p in remarque_parts if p]) or None

        analyses_list.append(
            Analyse(
                id_analyse=cle,
                id_equipement=eq_id,
                date_prelevement=dt_prelev,
                charge_pct=_safe_float(r.get("Charge"), 0.0),
                temperature_huile=temp_huile,
                code_motif=motif_map.get(motif_code, "Préventif"),
                laboratoire=labo_map.get(labo_code, "Laboratoire Central"),
                source_donnees="IMPORT_FILE",
                remarques=remarques,
            )
        )

        # Table 3 : gaz_dissous
        h2 = ch4 = c2h6 = c2h4 = c2h2 = co = co2 = o2 = n2 = tdcg = None
        if gd_row:
            h2 = _safe_float(gd_row.get("H2"), 0.0)
            ch4 = _safe_float(gd_row.get("CH4"), 0.0)
            c2h6 = _safe_float(gd_row.get("C2H6"), 0.0)
            c2h4 = _safe_float(gd_row.get("C2H4"), 0.0)
            c2h2 = _safe_float(gd_row.get("C2H2"), 0.0)
            co = _safe_float(gd_row.get("CO"), 0.0)
            co2 = _safe_float(gd_row.get("CO2"), 0.0)
            o2 = _safe_float(gd_row.get("O2"), 0.0)
            n2 = _safe_float(gd_row.get("N2"), 0.0)
            tdcg = round(sum(x or 0.0 for x in (h2, ch4, c2h6, c2h4, c2h2, co)), 2)

            gaz_list.append(
                GazDissous(
                    id_analyse=cle,
                    h2=h2,
                    ch4=ch4,
                    c2h6=c2h6,
                    c2h4=c2h4,
                    c2h2=c2h2,
                    co=co,
                    co2=co2,
                    o2=o2,
                    n2=n2,
                    tdcg=tdcg,
                )
            )

        # Table 4 : qualite_physicochimique
        eau = acid = dielec = ift = fp = coul = None
        if epl_row:
            eau = _safe_float(epl_row.get("Eau"))
            acid = _safe_float(epl_row.get("Acid"))
            d1816 = _safe_float(epl_row.get("Diélec"))
            d877 = _safe_float(epl_row.get("Diélec-D877"))
            dielec = d1816 if (d1816 and d1816 > 0) else d877
            ift = _safe_float(epl_row.get("IFT"))
            fp = _safe_float(epl_row.get("Facteur de puissance"))
            coul = _safe_float(epl_row.get("Couleur"))

            if cle in epl_by_key or gd_row is not None:
                phys_list.append(
                    QualitePhysicochimique(
                        id_analyse=cle,
                        teneur_eau=eau,
                        acidite=acid,
                        rigidite_dielectrique=dielec,
                        tension_interfaciale=ift,
                        tangente_delta=fp,
                        viscosite=None,
                        couleur_astm=coul,
                    )
                )

        # Table 5 : pcb_metaux
        pcb_tot = cu = al = fe = None
        if bpc_row or mdh_row:
            if bpc_row:
                b1242 = _safe_float(bpc_row.get("Bpc-1242"), 0.0) or 0.0
                b1254 = _safe_float(bpc_row.get("Bpc-1254"), 0.0) or 0.0
                b1260 = _safe_float(bpc_row.get("Bpc-1260"), 0.0) or 0.0
                pcb_tot = round(b1242 + b1254 + b1260, 2)
            if mdh_row:
                cu = _safe_float(mdh_row.get("Cuivre"))
                al = _safe_float(mdh_row.get("Aluminium"))
                fe = _safe_float(mdh_row.get("Fer"))

            if (cle in bpc_by_key or cle in mdh_by_key) or gd_row is not None:
                pcb_list.append(
                    PcbMetaux(
                        id_analyse=cle,
                        pcb_total=pcb_tot,
                        cuivre=cu,
                        aluminium=al,
                        fer=fe,
                    )
                )

        # Table 6 : diagnostics_recommandations
        code_rec = _safe_str(det_row.get("CodeRecommandation"))
        hist_rec = rec_lookup.get(f"{type_anal}:{code_rec}") or _safe_str(det_row.get("RecommandationÉcrite"))
        billet = _safe_str(det_row.get("BilletTravail")) or None
        eq_obj = equipements_dict[eq_id]

        diag_data = run_full_diagnostic(
            id_analyse=cle,
            h2=h2,
            ch4=ch4,
            c2h6=c2h6,
            c2h4=c2h4,
            c2h2=c2h2,
            co=co,
            co2=co2,
            teneur_eau=eau,
            acidite=acid,
            rigidite_dielectrique=dielec,
            tension_interfaciale=ift,
            couleur_astm=coul,
            pcb_total=pcb_tot,
            date_mise_en_service=eq_obj.date_mise_en_service,
            existing_recommendation=hist_rec,
            existing_billet=billet,
        )

        diag_list.append(
            DiagnosticRecommandation(
                id_analyse=cle,
                condition_ieee=diag_data["condition_ieee"],
                code_duval=diag_data["code_duval"],
                diagnostic_duval=diag_data["diagnostic_duval"],
                ratio_co2_co=diag_data["ratio_co2_co"],
                health_index=diag_data["health_index"],
                statut_global=diag_data["statut_global"],
                recommandation_action=diag_data["recommandation_action"],
                billet_travail=diag_data["billet_travail"],
            )
        )

    # 3. Normes de référence
    normes_list: List[NormeReferentiel] = []
    for r in raw.get("NormesC57104", []):
        cond = _safe_str(r.get("Condition"))
        for gas in ("H2", "CH4", "C2H2", "C2H4", "C2H6", "CO", "CO2", "TDCG"):
            val = _safe_float(r.get(gas))
            if val is not None:
                normes_list.append(
                    NormeReferentiel(
                        categorie="IEEE_C57104",
                        code=f"Cond_{cond}",
                        parametre=gas,
                        seuil_min=0.0,
                        seuil_max=val,
                        description=f"Seuil IEEE C57.104 Condition {cond} pour {gas}",
                    )
                )
    for r in raw.get("Recommandation", []):
        normes_list.append(
            NormeReferentiel(
                categorie="RECOMMANDATION_HISTORIQUE",
                code=_safe_str(r.get("CodeRecommandation")),
                parametre=_safe_str(r.get("TypeAnalyse")),
                description=_safe_str(r.get("Recommandation")),
            )
        )

    # 4. Insertion transactionnelle rapide dans SQLite
    with Session(engine) as session:
        session.add_all(list(equipements_dict.values()))
        session.add_all(analyses_list)
        session.add_all(gaz_list)
        session.add_all(phys_list)
        session.add_all(pcb_list)
        session.add_all(diag_list)
        session.add_all(normes_list)
        session.commit()

    stats = {
        "equipements": len(equipements_dict),
        "analyses": len(analyses_list),
        "gaz_dissous": len(gaz_list),
        "qualite_physicochimique": len(phys_list),
        "pcb_metaux": len(pcb_list),
        "diagnostics_recommandations": len(diag_list),
        "normes_referentiel": len(normes_list),
    }
    print("[SUCCÈS] Base SQLite transformers_vault.db initialisée avec succès :", stats)
    return stats


if __name__ == "__main__":
    mdb_arg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MDB_PATH
    migrate(mdb_arg, force_rebuild=True)
