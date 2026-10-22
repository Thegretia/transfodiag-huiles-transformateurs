import json
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from backend.database import get_session, init_db, DB_PATH
from backend.models import (
    Equipement,
    Analyse,
    GazDissous,
    QualitePhysicochimique,
    PcbMetaux,
    DiagnosticRecommandation,
    NormeReferentiel,
    FieldInspectionCreate,
    BatchFieldSyncRequest,
)
from backend.diagnostics import (
    run_full_diagnostic,
    compute_duval_triangle_1,
    evaluate_ieee_c57104,
)
from backend.ingestion import (
    CANONICAL_FIELDS,
    auto_map_columns,
    clean_and_preview_dataframe,
    read_uploaded_file_to_df,
    commit_dataframe_import,
)
from backend.exporters import (
    generate_pdf_report,
    generate_word_report,
    generate_excel_workbook,
    generate_csv_export,
)

app = FastAPI(
    title="TransfoDiag PWA & Local Engine — Huiles de Transformateurs (DGA & Physico-Chimie)",
    version="2.0.0",
    description="Backend local autonome pour l'ingestion, le diagnostic IEEE C57.104 / CEI 60599 / Triangle de Duval 1 et le reporting multi-formats.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache en mémoire du dernier fichier inspecté pour l'importation en 2 étapes (Preview -> Commit)
_UPLOAD_CACHE: Dict[str, bytes] = {}


@app.on_event("startup")
def on_startup():
    if not os.path.exists(DB_PATH):
        from migrate_initial_db import migrate, DEFAULT_MDB_PATH
        if os.path.exists(DEFAULT_MDB_PATH):
            migrate(DEFAULT_MDB_PATH, force_rebuild=True)
        else:
            init_db()
    else:
        init_db()


@app.get("/api/health")
def health_check(session: Session = Depends(get_session)) -> Dict[str, Any]:
    eq_count = len(session.exec(select(Equipement.id_equipement)).all())
    an_count = len(session.exec(select(Analyse.id_analyse)).all())
    return {
        "status": "online",
        "database": os.path.basename(DB_PATH),
        "equipements_count": eq_count,
        "analyses_count": an_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _build_fleet_overview(session: Session) -> Dict[str, Any]:
    equipements = session.exec(select(Equipement)).all()
    analyses = session.exec(select(Analyse).order_by(Analyse.date_prelevement.desc())).all()
    diags = {d.id_analyse: d for d in session.exec(select(DiagnosticRecommandation)).all()}
    dgas = {g.id_analyse: g for g in session.exec(select(GazDissous)).all()}
    phys = {p.id_analyse: p for p in session.exec(select(QualitePhysicochimique)).all()}
    pcbs = {b.id_analyse: b for b in session.exec(select(PcbMetaux)).all()}

    # Regrouper la dernière analyse globale + la dernière analyse DGA + la dernière analyse Physico par équipement
    latest_by_eq: Dict[str, Analyse] = {}
    latest_dga_by_eq: Dict[str, GazDissous] = {}
    latest_phys_by_eq: Dict[str, QualitePhysicochimique] = {}
    latest_pcb_by_eq: Dict[str, PcbMetaux] = {}
    latest_dga_diag_by_eq: Dict[str, DiagnosticRecommandation] = {}
    count_by_eq: Dict[str, int] = {}

    for a in analyses:
        eq_id = a.id_equipement
        count_by_eq[eq_id] = count_by_eq.get(eq_id, 0) + 1
        if eq_id not in latest_by_eq:
            latest_by_eq[eq_id] = a
        if eq_id not in latest_dga_by_eq and a.id_analyse in dgas:
            latest_dga_by_eq[eq_id] = dgas[a.id_analyse]
            if a.id_analyse in diags:
                latest_dga_diag_by_eq[eq_id] = diags[a.id_analyse]
        if eq_id not in latest_phys_by_eq and a.id_analyse in phys:
            latest_phys_by_eq[eq_id] = phys[a.id_analyse]
        if eq_id not in latest_pcb_by_eq and a.id_analyse in pcbs:
            latest_pcb_by_eq[eq_id] = pcbs[a.id_analyse]

    cards: List[Dict[str, Any]] = []
    status_counts = {"BON": 0, "SURVEILLANCE": 0, "CRITIQUE": 0}
    ieee_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    duval_counts: Dict[str, int] = {}
    sites_set = set()

    for eq in equipements:
        sites_set.add(eq.site or "Non spécifié")
        last_a = latest_by_eq.get(eq.id_equipement)
        last_dg = latest_dga_diag_by_eq.get(eq.id_equipement) or (diags.get(last_a.id_analyse) if last_a else None)
        last_gd = latest_dga_by_eq.get(eq.id_equipement)
        last_pq = latest_phys_by_eq.get(eq.id_equipement)
        last_pm = latest_pcb_by_eq.get(eq.id_equipement)

        statut = last_dg.statut_global if last_dg else "BON"
        thi = last_dg.health_index if last_dg else 100.0
        cond_ieee = last_dg.condition_ieee if last_dg else 1
        code_duval = last_dg.code_duval if last_dg else "NORMAL"

        status_counts[statut] = status_counts.get(statut, 0) + 1
        ieee_counts[cond_ieee] = ieee_counts.get(cond_ieee, 0) + 1
        duval_counts[code_duval] = duval_counts.get(code_duval, 0) + 1

        cards.append(
            {
                "id_equipement": eq.id_equipement,
                "nom_equipement": eq.nom_equipement,
                "type_equipement": eq.type_equipement,
                "site": eq.site,
                "localisation": eq.localisation,
                "tension_nominale": eq.tension_nominale,
                "litre_huile": eq.litre_huile,
                "no_serie": eq.no_serie,
                "date_mise_en_service": str(eq.date_mise_en_service) if eq.date_mise_en_service else None,
                "nb_analyses": count_by_eq.get(eq.id_equipement, 0),
                "dernier_prelevement": last_a.date_prelevement.isoformat() if last_a else None,
                "statut_global": statut,
                "health_index": thi,
                "condition_ieee": cond_ieee,
                "code_duval": code_duval,
                "diagnostic_duval": last_dg.diagnostic_duval if last_dg else "Fonctionnement normal",
                "ratio_co2_co": last_dg.ratio_co2_co if last_dg else None,
                "recommandation_action": last_dg.recommandation_action if last_dg else "Exploitation normale.",
                "billet_travail": last_dg.billet_travail if last_dg else None,
                "tdcg": last_gd.tdcg if last_gd else None,
                "c2h2": last_gd.c2h2 if last_gd else None,
                "h2": last_gd.h2 if last_gd else None,
                "teneur_eau": last_pq.teneur_eau if last_pq else None,
                "rigidite_dielectrique": last_pq.rigidite_dielectrique if last_pq else None,
                "acidite": last_pq.acidite if last_pq else None,
                "pcb_total": last_pm.pcb_total if last_pm else None,
            }
        )

    # Trier par criticité d'abord (CRITIQUE -> SURVEILLANCE -> BON), puis par nombre d'analyses décroissant
    priority_order = {"CRITIQUE": 0, "SURVEILLANCE": 1, "BON": 2}
    cards.sort(key=lambda c: (priority_order.get(c["statut_global"], 3), -c["nb_analyses"], c["id_equipement"]))

    return {
        "kpis": {
            "total_equipements": len(equipements),
            "total_analyses": len(analyses),
            "status_counts": status_counts,
            "ieee_counts": ieee_counts,
            "duval_counts": duval_counts,
            "sites": sorted(list(sites_set)),
        },
        "equipements": cards,
    }


@app.get("/api/dashboard")
def get_dashboard(session: Session = Depends(get_session)) -> Dict[str, Any]:
    return _build_fleet_overview(session)


@app.get("/api/recent-reports")
def get_recent_reports(
    limit: int = Query(100, ge=1, le=200),
    session: Session = Depends(get_session),
) -> List[Dict[str, Any]]:
    """Retourne les 100 derniers rapports d'analyse complets pour la mise en cache locale IndexedDB (Dexie.js)."""
    analyses = session.exec(select(Analyse).order_by(Analyse.date_prelevement.desc()).limit(limit)).all()
    results = []
    for a in analyses:
        gd = session.get(GazDissous, a.id_analyse)
        pq = session.get(QualitePhysicochimique, a.id_analyse)
        pm = session.get(PcbMetaux, a.id_analyse)
        dg = session.get(DiagnosticRecommandation, a.id_analyse)
        results.append(
            {
                "id_analyse": a.id_analyse,
                "id_equipement": a.id_equipement,
                "date_prelevement": a.date_prelevement.isoformat(),
                "charge_pct": a.charge_pct,
                "temperature_huile": a.temperature_huile,
                "code_motif": a.code_motif,
                "laboratoire": a.laboratoire,
                "source_donnees": a.source_donnees,
                "remarques": a.remarques,
                "gaz_dissous": gd.model_dump() if gd else None,
                "qualite_physicochimique": pq.model_dump() if pq else None,
                "pcb_metaux": pm.model_dump() if pm else None,
                "diagnostic": dg.model_dump() if dg else None,
            }
        )
    return results


@app.get("/api/equipements/{id_equipement}")
def get_equipement_detail(
    id_equipement: str,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    eq = session.get(Equipement, id_equipement)
    if not eq:
        raise HTTPException(status_code=404, detail=f"Équipement '{id_equipement}' introuvable.")

    analyses = session.exec(
        select(Analyse)
        .where(Analyse.id_equipement == id_equipement)
        .order_by(Analyse.date_prelevement.desc())
    ).all()

    history: List[Dict[str, Any]] = []
    for a in analyses:
        gd = session.get(GazDissous, a.id_analyse)
        pq = session.get(QualitePhysicochimique, a.id_analyse)
        pm = session.get(PcbMetaux, a.id_analyse)
        dg = session.get(DiagnosticRecommandation, a.id_analyse)

        duval_coords = None
        ieee_details = None
        if gd:
            duval_coords = compute_duval_triangle_1(gd.ch4, gd.c2h4, gd.c2h2)
            ieee_details = evaluate_ieee_c57104(gd.h2, gd.ch4, gd.c2h6, gd.c2h4, gd.c2h2, gd.co, gd.tdcg)

        history.append(
            {
                "id_analyse": a.id_analyse,
                "id_equipement": a.id_equipement,
                "date_prelevement": a.date_prelevement.isoformat(),
                "charge_pct": a.charge_pct,
                "temperature_huile": a.temperature_huile,
                "code_motif": a.code_motif,
                "laboratoire": a.laboratoire,
                "source_donnees": a.source_donnees,
                "remarques": a.remarques,
                "gaz_dissous": gd.model_dump() if gd else None,
                "qualite_physicochimique": pq.model_dump() if pq else None,
                "pcb_metaux": pm.model_dump() if pm else None,
                "diagnostic": dg.model_dump() if dg else None,
                "duval_coordinates": duval_coords,
                "ieee_details": ieee_details,
            }
        )

    return {
        "equipement": eq.model_dump(),
        "history": history,
    }


def _save_single_field_inspection(session: Session, payload: FieldInspectionCreate) -> Dict[str, Any]:
    eq = session.get(Equipement, payload.id_equipement)
    if not eq:
        eq = Equipement(
            id_equipement=payload.id_equipement,
            nom_equipement=payload.nom_equipement or f"Transformateur {payload.id_equipement}",
            type_equipement=payload.type_equipement or "Transformateur de puissance",
            site=payload.site or "Site Principal",
            localisation=payload.localisation or "Poste HT",
            tension_nominale=payload.tension_nominale or 110.0,
            litre_huile=payload.litre_huile or 15000.0,
            no_serie=payload.id_equipement,
        )
        session.add(eq)

    id_analyse = payload.id_analyse or f"TER-{uuid.uuid4().hex[:10].upper()}"
    dt_prelev = payload.date_prelevement or datetime.now(timezone.utc)
    if dt_prelev.tzinfo is None:
        dt_prelev = dt_prelev.replace(tzinfo=timezone.utc)

    # Compiler les observations visuelles structurées de l'étape 3
    obs_parts = [
        f"Niveau d'huile: {payload.niveau_huile or 'Normal'}",
        f"Gel de silice: {payload.couleur_silice or 'Bleu'}",
        f"Fuite détectée: {'OUI' if payload.fuite_detectee else 'Non'}",
        f"Bruit/Vibration anormale: {'OUI' if payload.bruit_vibration else 'Non'}",
        f"Manomètre: {payload.pression_manometre or 'Normal'}",
    ]
    if payload.temperature_ambiante is not None:
        obs_parts.append(f"Temp. ambiante: {payload.temperature_ambiante}°C")
    if payload.compteur_heures is not None:
        obs_parts.append(f"Compteur: {payload.compteur_heures} h")
    if payload.remarques:
        obs_parts.append(f"Notes: {payload.remarques}")
    compiled_remarques = " | ".join(obs_parts)

    analyse = Analyse(
        id_analyse=id_analyse,
        id_equipement=payload.id_equipement,
        date_prelevement=dt_prelev,
        charge_pct=payload.charge_pct,
        temperature_huile=payload.temperature_huile,
        code_motif=payload.code_motif or "Inspection Terrain",
        laboratoire=payload.laboratoire or "Kit Portable / Saisie Terrain",
        source_donnees="TERRAIN_OFFLINE",
        remarques=compiled_remarques,
    )
    session.merge(analyse)

    # DGA si saisi avec analyseur portable
    if any(v is not None for v in (payload.h2, payload.ch4, payload.c2h6, payload.c2h4, payload.c2h2, payload.co, payload.co2)):
        tdcg = round(
            sum(v or 0.0 for v in (payload.h2, payload.ch4, payload.c2h6, payload.c2h4, payload.c2h2, payload.co)),
            2,
        )
        session.merge(
            GazDissous(
                id_analyse=id_analyse,
                h2=payload.h2 or 0.0,
                ch4=payload.ch4 or 0.0,
                c2h6=payload.c2h6 or 0.0,
                c2h4=payload.c2h4 or 0.0,
                c2h2=payload.c2h2 or 0.0,
                co=payload.co or 0.0,
                co2=payload.co2 or 0.0,
                o2=payload.o2 or 0.0,
                n2=payload.n2 or 0.0,
                tdcg=tdcg,
            )
        )

    # Qualité physico-chimique si saisie
    if any(v is not None for v in (payload.teneur_eau, payload.acidite, payload.rigidite_dielectrique, payload.couleur_astm)):
        session.merge(
            QualitePhysicochimique(
                id_analyse=id_analyse,
                teneur_eau=payload.teneur_eau,
                acidite=payload.acidite,
                rigidite_dielectrique=payload.rigidite_dielectrique,
                couleur_astm=payload.couleur_astm,
            )
        )

    # Alertes visuelles terrain intégrées à la recommandation
    visual_alerts = []
    if payload.fuite_detectee:
        visual_alerts.append("FUITE D'HUILE DÉTECTÉE SUR SITE : Intervention d'étanchéité urgente requise")
    if payload.bruit_vibration:
        visual_alerts.append("BRUIT / VIBRATION ANORMALE : Contrôler le serrage du circuit magnétique et des auxiliaires")
    if payload.couleur_silice and payload.couleur_silice.lower() == "rose":
        visual_alerts.append("GEL DE SILICE ROSE (SATURÉ) : Remplacer la charge déshydratante du respirateur")
    if payload.niveau_huile and payload.niveau_huile.lower() in ("bas", "haut"):
        visual_alerts.append(f"NIVEAU D'HUILE {payload.niveau_huile.upper()} : Ajuster le niveau au conservateur")

    diag_res = run_full_diagnostic(
        id_analyse=id_analyse,
        h2=payload.h2,
        ch4=payload.ch4,
        c2h6=payload.c2h6,
        c2h4=payload.c2h4,
        c2h2=payload.c2h2,
        co=payload.co,
        co2=payload.co2,
        teneur_eau=payload.teneur_eau,
        acidite=payload.acidite,
        rigidite_dielectrique=payload.rigidite_dielectrique,
        couleur_astm=payload.couleur_astm,
        date_mise_en_service=eq.date_mise_en_service,
        existing_recommendation=" | ".join(visual_alerts) if visual_alerts else None,
    )

    # Si des anomalies visuelles critiques sont signalées sur site, ajuster le statut
    statut_final = diag_res["statut_global"]
    thi_final = diag_res["health_index"]
    if payload.fuite_detectee or payload.bruit_vibration:
        if statut_final == "BON":
            statut_final = "SURVEILLANCE"
        thi_final = max(35.0, thi_final - 18.0)

    diag_obj = DiagnosticRecommandation(
        id_analyse=id_analyse,
        condition_ieee=diag_res["condition_ieee"],
        code_duval=diag_res["code_duval"],
        diagnostic_duval=diag_res["diagnostic_duval"],
        ratio_co2_co=diag_res["ratio_co2_co"],
        health_index=round(thi_final, 1),
        statut_global=statut_final,
        recommandation_action=diag_res["recommandation_action"],
        billet_travail=diag_res["billet_travail"],
    )
    session.merge(diag_obj)

    return {
        "id_analyse": id_analyse,
        "id_equipement": payload.id_equipement,
        "statut_global": statut_final,
        "health_index": round(thi_final, 1),
        "condition_ieee": diag_res["condition_ieee"],
        "code_duval": diag_res["code_duval"],
        "recommandation_action": diag_res["recommandation_action"],
    }


@app.post("/api/field-inspections")
def create_field_inspection(
    payload: FieldInspectionCreate,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    res = _save_single_field_inspection(session, payload)
    session.commit()
    return {"status": "saved", "inspection": res}


@app.post("/api/field-inspections/sync")
def sync_pending_field_inspections(
    batch: BatchFieldSyncRequest,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Synchronise en lot les relevés hors-ligne stockés dans IndexedDB (pending_field_inspections)."""
    synced = []
    for item in batch.inspections:
        res = _save_single_field_inspection(session, item)
        synced.append(res)
    session.commit()
    return {
        "status": "synced",
        "synced_count": len(synced),
        "results": synced,
    }


# ============================================================================
# Endpoints d'Ingestion & Auto-Mapping Intelligent
# ============================================================================
@app.get("/api/import/canonical-fields")
def get_canonical_fields() -> List[Dict[str, str]]:
    return [
        {"field": k, "label": v["label"], "category": v["category"]}
        for k, v in CANONICAL_FIELDS.items()
    ]


@app.post("/api/import/inspect")
async def inspect_import_file(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    access_table: Optional[str] = Form(None),
    access_sql: Optional[str] = Form(None),
    custom_mapping_json: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Analyse un fichier déposé (.xlsx, .xls, .csv, .tsv, .txt, .mdb, .accdb),
    propose l'auto-mapping par correspondance floue et génère la prévisualisation
    des 10 premières lignes nettoyées.
    """
    file_bytes = await file.read()
    file_token = uuid.uuid4().hex
    _UPLOAD_CACHE[file_token] = file_bytes
    # Limiter la taille du cache en mémoire
    if len(_UPLOAD_CACHE) > 10:
        oldest_key = next(iter(_UPLOAD_CACHE))
        _UPLOAD_CACHE.pop(oldest_key, None)

    try:
        df, meta = read_uploaded_file_to_df(
            file_bytes=file_bytes,
            filename=file.filename or "upload.csv",
            sheet_name=sheet_name,
            access_table=access_table,
            access_sql=access_sql,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur de lecture du fichier : {e}")

    source_cols = [str(c) for c in df.columns]
    auto_mapping_list = auto_map_columns(source_cols)

    if custom_mapping_json:
        try:
            mapping_dict = json.loads(custom_mapping_json)
        except Exception:
            mapping_dict = {m["source_column"]: m["target_field"] for m in auto_mapping_list if m["target_field"]}
    else:
        mapping_dict = {m["source_column"]: m["target_field"] for m in auto_mapping_list if m["target_field"]}

    preview_data = clean_and_preview_dataframe(df, mapping_dict, preview_limit=10)

    return {
        "file_token": file_token,
        "filename": file.filename,
        "metadata": meta,
        "total_rows": preview_data["total_rows"],
        "auto_mapping": auto_mapping_list,
        "active_mapping": mapping_dict,
        "preview_rows": preview_data["preview_rows"],
        "alerts": preview_data["alerts"],
        "canonical_fields": [
            {"field": k, "label": v["label"], "category": v["category"]}
            for k, v in CANONICAL_FIELDS.items()
        ],
    }


@app.post("/api/import/preview-remap")
def preview_remapped_file(
    file_token: str = Form(...),
    filename: str = Form(...),
    mapping_json: str = Form(...),
    sheet_name: Optional[str] = Form(None),
    access_table: Optional[str] = Form(None),
    access_sql: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Recalcule en temps réel la prévisualisation des 10 premières lignes après modification manuelle du mapping."""
    if file_token not in _UPLOAD_CACHE:
        raise HTTPException(status_code=404, detail="Session de fichier expirée, veuillez re-sélectionner le fichier.")

    df, meta = read_uploaded_file_to_df(
        file_bytes=_UPLOAD_CACHE[file_token],
        filename=filename,
        sheet_name=sheet_name,
        access_table=access_table,
        access_sql=access_sql,
    )
    mapping_dict = json.loads(mapping_json)
    preview_data = clean_and_preview_dataframe(df, mapping_dict, preview_limit=10)
    return {
        "total_rows": preview_data["total_rows"],
        "preview_rows": preview_data["preview_rows"],
        "alerts": preview_data["alerts"],
        "metadata": meta,
    }


@app.post("/api/import/commit")
def commit_import(
    file_token: str = Form(...),
    filename: str = Form(...),
    mapping_json: str = Form(...),
    duplicate_strategy: str = Form("overwrite"),
    sheet_name: Optional[str] = Form(None),
    access_table: Optional[str] = Form(None),
    access_sql: Optional[str] = Form(None),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    if file_token not in _UPLOAD_CACHE:
        raise HTTPException(status_code=404, detail="Session de fichier expirée, veuillez re-téléverser le fichier.")

    df, _ = read_uploaded_file_to_df(
        file_bytes=_UPLOAD_CACHE[file_token],
        filename=filename,
        sheet_name=sheet_name,
        access_table=access_table,
        access_sql=access_sql,
    )
    mapping_dict = json.loads(mapping_json)
    result = commit_dataframe_import(
        session=session,
        df=df,
        mapping=mapping_dict,
        duplicate_strategy=duplicate_strategy,
    )
    return result


# ============================================================================
# Endpoints du Centre d'Exportation Multi-Formats (PDF, Word, Excel, CSV, SQLite)
# ============================================================================
def _get_filtered_analyses_enriched(
    session: Session,
    id_equipement: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    limit: int = 2500,
) -> List[Dict[str, Any]]:
    stmt = select(Analyse).order_by(Analyse.date_prelevement.desc())
    if id_equipement and id_equipement != "ALL":
        stmt = stmt.where(Analyse.id_equipement == id_equipement)
    if date_debut:
        try:
            dt_start = datetime.fromisoformat(date_debut).replace(tzinfo=timezone.utc)
            stmt = stmt.where(Analyse.date_prelevement >= dt_start)
        except ValueError:
            pass
    if date_fin:
        try:
            dt_end = datetime.fromisoformat(date_fin).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            stmt = stmt.where(Analyse.date_prelevement <= dt_end)
        except ValueError:
            pass

    analyses = session.exec(stmt.limit(limit)).all()
    dgas = {g.id_analyse: g for g in session.exec(select(GazDissous)).all()}
    phys = {p.id_analyse: p for p in session.exec(select(QualitePhysicochimique)).all()}
    pcbs = {b.id_analyse: b for b in session.exec(select(PcbMetaux)).all()}
    diags = {d.id_analyse: d for d in session.exec(select(DiagnosticRecommandation)).all()}

    enriched = []
    for a in analyses:
        gd = dgas.get(a.id_analyse)
        pq = phys.get(a.id_analyse)
        pm = pcbs.get(a.id_analyse)
        dg = diags.get(a.id_analyse)
        enriched.append(
            {
                "id_analyse": a.id_analyse,
                "id_equipement": a.id_equipement,
                "date_prelevement": a.date_prelevement.isoformat(),
                "charge_pct": a.charge_pct,
                "temperature_huile": a.temperature_huile,
                "code_motif": a.code_motif,
                "laboratoire": a.laboratoire,
                "source_donnees": a.source_donnees,
                "remarques": a.remarques,
                "gaz_dissous": gd.model_dump() if gd else None,
                "qualite_physicochimique": pq.model_dump() if pq else None,
                "pcb_metaux": pm.model_dump() if pm else None,
                "diagnostic": dg.model_dump() if dg else None,
            }
        )
    return enriched


@app.get("/api/export/pdf/{id_equipement}")
def export_pdf_equipment_report(
    id_equipement: str,
    date_debut: Optional[str] = Query(None),
    date_fin: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    eq = session.get(Equipement, id_equipement)
    if not eq:
        raise HTTPException(status_code=404, detail=f"Équipement '{id_equipement}' introuvable.")

    history = _get_filtered_analyses_enriched(session, id_equipement=id_equipement, date_debut=date_debut, date_fin=date_fin, limit=200)
    pdf_bytes = generate_pdf_report(eq.model_dump(), history)
    filename = f"Rapport_Expertise_DGA_{id_equipement}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/docx/{id_equipement}")
def export_docx_equipment_report(
    id_equipement: str,
    date_debut: Optional[str] = Query(None),
    date_fin: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    eq = session.get(Equipement, id_equipement)
    if not eq:
        raise HTTPException(status_code=404, detail=f"Équipement '{id_equipement}' introuvable.")

    history = _get_filtered_analyses_enriched(session, id_equipement=id_equipement, date_debut=date_debut, date_fin=date_fin, limit=200)
    docx_bytes = generate_word_report(eq.model_dump(), history)
    filename = f"Rapport_Ingenierie_{id_equipement}_{datetime.now().strftime('%Y%m%d')}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/xlsx")
def export_xlsx_workbook(
    id_equipement: Optional[str] = Query("ALL"),
    date_debut: Optional[str] = Query(None),
    date_fin: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    overview = _build_fleet_overview(session)
    fleet_cards = overview["equipements"]
    if id_equipement and id_equipement != "ALL":
        fleet_cards = [c for c in fleet_cards if c["id_equipement"] == id_equipement]

    rows = _get_filtered_analyses_enriched(
        session, id_equipement=id_equipement, date_debut=date_debut, date_fin=date_fin, limit=3000
    )
    xlsx_bytes = generate_excel_workbook(fleet_cards, rows)
    suffix = id_equipement if (id_equipement and id_equipement != "ALL") else "Parc_Complet"
    filename = f"Classeur_DGA_Huiles_{suffix}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/csv")
def export_csv_gmao(
    id_equipement: Optional[str] = Query("ALL"),
    date_debut: Optional[str] = Query(None),
    date_fin: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    rows = _get_filtered_analyses_enriched(
        session, id_equipement=id_equipement, date_debut=date_debut, date_fin=date_fin, limit=5000
    )
    csv_bytes = generate_csv_export(rows)
    suffix = id_equipement if (id_equipement and id_equipement != "ALL") else "Parc_Complet"
    filename = f"Export_GMAO_SCADA_{suffix}_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/sqlite")
def export_sqlite_db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Base SQLite introuvable.")
    return FileResponse(
        path=DB_PATH,
        media_type="application/x-sqlite3",
        filename="transformers_vault.db",
    )


# Servir le build PWA Frontend en production si disponible
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
