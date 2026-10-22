from datetime import date
from typing import Dict, Any, Optional, Tuple


# ============================================================================
# A. Norme IEEE C57.104 - Seuils Indicatifs par Gaz (en ppm)
# ============================================================================
IEEE_THRESHOLDS: Dict[str, Tuple[float, float, float]] = {
    # (Seuil max Cond 1, Seuil max Cond 2, Seuil max Cond 3) -> > Cond 3 = Cond 4
    "h2": (100.0, 700.0, 1800.0),
    "ch4": (120.0, 400.0, 1000.0),
    "c2h2": (1.0, 9.0, 35.0),
    "c2h4": (50.0, 100.0, 200.0),
    "c2h6": (65.0, 100.0, 150.0),
    "co": (350.0, 570.0, 1400.0),
    "tdcg": (720.0, 1920.0, 4630.0),
}

IEEE_CONDITION_LABELS: Dict[int, str] = {
    1: "Condition 1 (Normal) : Exploitation normale, gaz sous les seuils d'alerte.",
    2: "Condition 2 (Avertissement) : Dépassement du niveau de référence. Augmenter la fréquence des prélèvements.",
    3: "Condition 3 (Action Requise) : Niveaux élevés indiquant un défaut actif en développement. Planifier contrôles rapprochés et investigations.",
    4: "Condition 4 (Danger Imminent) : Niveaux critiques risquant d'entraîner une défaillance. Réduire la charge ou consigner l'appareil immédiatement.",
}

DUVAL_DIAGNOSTIC_LABELS: Dict[str, str] = {
    "NORMAL": "Fonctionnement normal (concentrations DGA très faibles, hors zone de défaut)",
    "PD": "PD (Partial Discharge) : Décharges partielles dans les cavités de l'isolant",
    "T1": "T1 (Thermal Fault < 300 °C) : Échauffement thermique faible (décoloration du papier)",
    "T2": "T2 (Thermal Fault 300 °C - 700 °C) : Échauffement thermique moyen (carbonisation du papier)",
    "T3": "T3 (Thermal Fault > 700 °C) : Échauffement thermique sévère (fusion ou décomposition d'huile)",
    "D1": "D1 (Discharge of Low Energy) : Étincelles ou décharges de faible énergie",
    "D2": "D2 (Discharge of High Energy) : Arcs électriques francs de haute énergie",
    "DT": "DT (Electrical and Thermal) : Défaut combiné électrique et thermique",
}


def compute_tdcg(
    h2: Optional[float] = 0.0,
    ch4: Optional[float] = 0.0,
    c2h6: Optional[float] = 0.0,
    c2h4: Optional[float] = 0.0,
    c2h2: Optional[float] = 0.0,
    co: Optional[float] = 0.0,
) -> float:
    """Calcule le TDCG = H2 + CH4 + C2H6 + C2H4 + C2H2 + CO (en ppm)."""
    vals = [v for v in (h2, ch4, c2h6, c2h4, c2h2, co) if v is not None and v >= 0]
    return round(float(sum(vals)), 2)


def classify_gas_ieee(gas_key: str, value: Optional[float]) -> int:
    """Retourne la condition IEEE C57.104 (1 à 4) pour un gaz donné."""
    if value is None or value < 0:
        return 1
    t1, t2, t3 = IEEE_THRESHOLDS.get(gas_key.lower(), (100.0, 700.0, 1800.0))
    if value < t1:
        return 1
    elif value <= t2:
        return 2
    elif value <= t3:
        return 3
    return 4


def evaluate_ieee_c57104(
    h2: Optional[float] = None,
    ch4: Optional[float] = None,
    c2h6: Optional[float] = None,
    c2h4: Optional[float] = None,
    c2h2: Optional[float] = None,
    co: Optional[float] = None,
    tdcg: Optional[float] = None,
) -> Dict[str, Any]:
    """Évalue la condition globale IEEE C57.104 ainsi que le détail par gaz."""
    if tdcg is None:
        tdcg = compute_tdcg(h2, ch4, c2h6, c2h4, c2h2, co)

    gas_values = {
        "h2": h2,
        "ch4": ch4,
        "c2h6": c2h6,
        "c2h4": c2h4,
        "c2h2": c2h2,
        "co": co,
        "tdcg": tdcg,
    }
    per_gas_condition: Dict[str, int] = {}
    for k, val in gas_values.items():
        per_gas_condition[k] = classify_gas_ieee(k, val)

    overall_condition = max(per_gas_condition.values()) if per_gas_condition else 1
    return {
        "condition_ieee": overall_condition,
        "condition_label": IEEE_CONDITION_LABELS[overall_condition],
        "per_gas_condition": per_gas_condition,
        "tdcg": tdcg,
    }


# ============================================================================
# B. Triangle de Duval 1 (Méthode CEI 60599 / Duval)
# ============================================================================
def compute_duval_triangle_1(
    ch4: Optional[float] = 0.0,
    c2h4: Optional[float] = 0.0,
    c2h2: Optional[float] = 0.0,
) -> Dict[str, Any]:
    """
    Calcule les pourcentages relatifs %CH4, %C2H4, %C2H2 et détermine la zone
    géométrique exacte selon le Triangle de Duval 1 (CEI 60599).
    """
    v_ch4 = max(0.0, float(ch4 or 0.0))
    v_c2h4 = max(0.0, float(c2h4 or 0.0))
    v_c2h2 = max(0.0, float(c2h2 or 0.0))
    total = v_ch4 + v_c2h4 + v_c2h2

    if total <= 0.0001:
        return {
            "pct_ch4": 0.0,
            "pct_c2h4": 0.0,
            "pct_c2h2": 0.0,
            "code_duval": "NORMAL",
            "diagnostic_duval": DUVAL_DIAGNOSTIC_LABELS["NORMAL"],
        }

    p_ch4 = (v_ch4 / total) * 100.0
    p_c2h4 = (v_c2h4 / total) * 100.0
    p_c2h2 = (v_c2h2 / total) * 100.0

    # Règles géométriques exactes du Triangle de Duval 1 (CEI 60599) :
    # - PD : %CH4 >= 98
    # - T1 : %CH4 < 98 et %C2H4 < 20 et %C2H2 < 4
    # - T2 : %C2H4 >= 20 et %C2H4 < 50 et %C2H2 < 4
    # - T3 : %C2H4 >= 50 et %C2H2 < 15
    # - D1 : %C2H4 < 23 et %C2H2 >= 13
    # - D2 : (%C2H4 >= 23 et %C2H4 < 40 et %C2H2 >= 13 et %C2H2 < 29) ou (%C2H4 >= 23 et %C2H2 >= 29)
    # - DT : Toutes les autres zones intermédiaires (4 <= %C2H2 < 13 ou %C2H4 >= 40 et 15 <= %C2H2 < 29)
    if p_ch4 >= 98.0:
        zone = "PD"
    elif p_c2h2 < 4.0 and p_c2h4 < 20.0:
        zone = "T1"
    elif p_c2h2 < 4.0 and 20.0 <= p_c2h4 < 50.0:
        zone = "T2"
    elif p_c2h2 < 15.0 and p_c2h4 >= 50.0:
        zone = "T3"
    elif p_c2h2 >= 13.0 and p_c2h4 < 23.0:
        zone = "D1"
    elif (p_c2h2 >= 29.0 and p_c2h4 >= 23.0) or (13.0 <= p_c2h2 < 29.0 and 23.0 <= p_c2h4 < 40.0):
        zone = "D2"
    else:
        zone = "DT"

    return {
        "pct_ch4": round(p_ch4, 2),
        "pct_c2h4": round(p_c2h4, 2),
        "pct_c2h2": round(p_c2h2, 2),
        "code_duval": zone,
        "diagnostic_duval": DUVAL_DIAGNOSTIC_LABELS[zone],
    }


# ============================================================================
# C. Ratio de Dégradation de la Cellulose (CO2 / CO)
# ============================================================================
def evaluate_cellulose_ratio(co: Optional[float], co2: Optional[float]) -> Dict[str, Any]:
    """
    Évalue la dégradation du papier isolant selon le ratio CO2 / CO :
    - > 10 : Vieillissement normal par oxydation lente
    - 3 <= ratio <= 10 : Dégradation modérée sous charge normale
    - < 3 : Alerte critique — dégradation thermique sévère du papier isolant (pyrolyse)
    """
    if co is None or co2 is None or co <= 0.0 or co2 <= 0.0:
        return {
            "ratio_co2_co": None,
            "etat_cellulose": "Non évaluable (CO ou CO2 non mesuré)",
            "alerte_cellulose": False,
        }

    ratio = round(float(co2) / float(co), 2)
    if ratio > 10.0:
        etat = "Vieillissement normal par oxydation lente (CO2/CO > 10)"
        alerte = False
    elif ratio >= 3.0:
        etat = "Dégradation modérée sous charge normale (3 <= CO2/CO <= 10)"
        alerte = False
    else:
        etat = "Alerte critique — dégradation thermique sévère du papier isolant des enroulements (pyrolyse de la cellulose, CO2/CO < 3)"
        alerte = True

    return {
        "ratio_co2_co": ratio,
        "etat_cellulose": etat,
        "alerte_cellulose": alerte,
    }


# ============================================================================
# D. Indice de Santé Global (Transformer Health Index - THI sur 100 %)
# ============================================================================
def compute_health_index(
    condition_ieee: int,
    teneur_eau: Optional[float] = None,
    acidite: Optional[float] = None,
    couleur_astm: Optional[float] = None,
    tension_interfaciale: Optional[float] = None,
    rigidite_dielectrique: Optional[float] = None,
    date_mise_en_service: Optional[date] = None,
    pcb_total: Optional[float] = None,
    ratio_co2_co: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calcule l'Indice de Santé Global (THI) pondéré de 0 % à 100 % :
    - Sous-indice Gaz DGA (poids : 40 %)
    - Sous-indice Qualité physico-chimique (Acidité, Eau, Couleur, IFT) (poids : 30 %)
    - Sous-indice Rigidité diélectrique (poids : 20 %)
    - Sous-indice Âge / Historique (poids : 10 %)
    """
    # 1. Sous-indice Gaz DGA (sur 100, poids 40%)
    dga_map = {1: 100.0, 2: 72.0, 3: 40.0, 4: 10.0}
    sub_dga = dga_map.get(condition_ieee, 100.0)
    if ratio_co2_co is not None and ratio_co2_co < 3.0:
        sub_dga = max(5.0, sub_dga - 15.0)

    # 2. Sous-indice Qualité physico-chimique (sur 100, poids 30%)
    phys_scores = []
    if teneur_eau is not None and teneur_eau >= 0:
        if teneur_eau <= 15:
            phys_scores.append(100.0)
        elif teneur_eau <= 25:
            phys_scores.append(75.0)
        elif teneur_eau <= 35:
            phys_scores.append(45.0)
        else:
            phys_scores.append(15.0)

    if acidite is not None and acidite >= 0:
        if acidite <= 0.05:
            phys_scores.append(100.0)
        elif acidite <= 0.15:
            phys_scores.append(75.0)
        elif acidite <= 0.25:
            phys_scores.append(45.0)
        else:
            phys_scores.append(15.0)

    if couleur_astm is not None and couleur_astm >= 0:
        if couleur_astm <= 1.5:
            phys_scores.append(100.0)
        elif couleur_astm <= 3.0:
            phys_scores.append(75.0)
        elif couleur_astm <= 4.5:
            phys_scores.append(45.0)
        else:
            phys_scores.append(20.0)

    if tension_interfaciale is not None and tension_interfaciale > 0:
        if tension_interfaciale >= 32.0:
            phys_scores.append(100.0)
        elif tension_interfaciale >= 25.0:
            phys_scores.append(75.0)
        elif tension_interfaciale >= 18.0:
            phys_scores.append(40.0)
        else:
            phys_scores.append(15.0)

    sub_phys = sum(phys_scores) / len(phys_scores) if phys_scores else 90.0

    # 3. Sous-indice Rigidité diélectrique (sur 100, poids 20%)
    if rigidite_dielectrique is not None and rigidite_dielectrique > 0:
        if rigidite_dielectrique >= 50.0:
            sub_dielec = 100.0
        elif rigidite_dielectrique >= 40.0:
            sub_dielec = 82.0
        elif rigidite_dielectrique >= 30.0:
            sub_dielec = 55.0
        else:
            sub_dielec = 15.0
    else:
        sub_dielec = 88.0

    # 4. Sous-indice Âge / Historique (sur 100, poids 10%)
    if date_mise_en_service is not None:
        age = max(0, date.today().year - date_mise_en_service.year)
        if age <= 10:
            sub_age = 100.0
        elif age <= 20:
            sub_age = 80.0
        elif age <= 35:
            sub_age = 60.0
        else:
            sub_age = 40.0
    else:
        sub_age = 80.0

    # Pénalité PCB si contaminé (>= 50 ppm)
    pcb_penalty = 5.0 if (pcb_total is not None and pcb_total >= 50.0) else 0.0

    thi = (0.40 * sub_dga) + (0.30 * sub_phys) + (0.20 * sub_dielec) + (0.10 * sub_age) - pcb_penalty
    thi = round(max(0.0, min(100.0, thi)), 1)

    if thi >= 75.0 and condition_ieee <= 1:
        statut_global = "BON"
    elif thi < 50.0 or condition_ieee >= 3 or (rigidite_dielectrique is not None and 0 < rigidite_dielectrique < 28.0):
        statut_global = "CRITIQUE"
    else:
        statut_global = "SURVEILLANCE"

    return {
        "health_index": thi,
        "sub_dga": round(sub_dga, 1),
        "sub_phys": round(sub_phys, 1),
        "sub_dielec": round(sub_dielec, 1),
        "sub_age": round(sub_age, 1),
        "statut_global": statut_global,
    }


def run_full_diagnostic(
    id_analyse: str,
    h2: Optional[float] = None,
    ch4: Optional[float] = None,
    c2h6: Optional[float] = None,
    c2h4: Optional[float] = None,
    c2h2: Optional[float] = None,
    co: Optional[float] = None,
    co2: Optional[float] = None,
    teneur_eau: Optional[float] = None,
    acidite: Optional[float] = None,
    rigidite_dielectrique: Optional[float] = None,
    tension_interfaciale: Optional[float] = None,
    couleur_astm: Optional[float] = None,
    pcb_total: Optional[float] = None,
    date_mise_en_service: Optional[date] = None,
    existing_recommendation: Optional[str] = None,
    existing_billet: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Exécute l'ensemble des algorithmes experts (IEEE C57.104, Triangle de Duval 1,
    Ratio CO2/CO, Indice THI) et génère la prescription technique consolidée.
    """
    ieee_res = evaluate_ieee_c57104(h2, ch4, c2h6, c2h4, c2h2, co)
    cond_ieee = ieee_res["condition_ieee"]
    tdcg = ieee_res["tdcg"]

    # Si tous les gaz sont très bas (Condition 1 et C2H2 < 1 et CH4 < 50 et C2H4 < 25),
    # on calcule quand même la position Duval mais on note si c'est normal ou actif.
    duval_res = compute_duval_triangle_1(ch4, c2h4, c2h2)
    cell_res = evaluate_cellulose_ratio(co, co2)
    thi_res = compute_health_index(
        condition_ieee=cond_ieee,
        teneur_eau=teneur_eau,
        acidite=acidite,
        couleur_astm=couleur_astm,
        tension_interfaciale=tension_interfaciale,
        rigidite_dielectrique=rigidite_dielectrique,
        date_mise_en_service=date_mise_en_service,
        pcb_total=pcb_total,
        ratio_co2_co=cell_res["ratio_co2_co"],
    )

    actions = []
    if existing_recommendation and existing_recommendation.strip():
        actions.append(existing_recommendation.strip())

    # Prescriptions basées sur IEEE C57.104 & Duval
    if cond_ieee == 4:
        actions.append(
            f"URGENCE CRITIQUE (IEEE Cond. 4 - {duval_res['code_duval']}) : Réduire immédiatement la charge ou consigner le transformateur. Dégazage sous vide et inspection interne impératifs."
        )
    elif cond_ieee == 3:
        actions.append(
            f"ACTION REQUISE (IEEE Cond. 3 - {duval_res['code_duval']}) : Défaut actif ({duval_res['diagnostic_duval']}). Planifier un dégazage sous vide dans les 30 jours et resserrer l'échantillonnage (hebdomadaire)."
        )
    elif cond_ieee == 2:
        actions.append(
            f"SURVEILLANCE RENFORCÉE (IEEE Cond. 2 - {duval_res['code_duval']}) : Augmenter la fréquence des prélèvements DGA (trimestriel/mensuel) et surveiller l'évolution du TDCG ({tdcg} ppm)."
        )

    # Prescriptions Cellulose
    if cell_res["alerte_cellulose"]:
        actions.append(
            f"ALERTE CELLULOSE (CO2/CO = {cell_res['ratio_co2_co']}) : Suspicion de pyrolyse du papier isolant. Commander une analyse des composés furaniques (2-FAL)."
        )

    # Prescriptions Physico-chimie
    if teneur_eau is not None and teneur_eau > 25.0:
        actions.append(
            f"HUMIDITÉ ÉLEVÉE ({teneur_eau:.1f} ppm) : Programmer un traitement de déshydratation / filtration thermovide de l'huile."
        )
    if rigidite_dielectrique is not None and 0 < rigidite_dielectrique < 30.0:
        actions.append(
            f"RIGIDITÉ DIÉLECTRIQUE FAIBLE ({rigidite_dielectrique:.1f} kV) : Risque d'amorçage diélectrique. Filtration et séchage sous vide requis sous 15 jours."
        )
    if acidite is not None and acidite > 0.15:
        actions.append(
            f"ACIDITÉ ÉLEVÉE ({acidite:.3f} mg KOH/g) : Oxydation avancée de l'huile. Planifier une régénération sur terre décolorante (Terre de Fuller) ou un remplacement d'huile."
        )
    if pcb_total is not None and pcb_total >= 50.0:
        actions.append(
            f"CONTAMINATION PCB ({pcb_total:.1f} ppm >= 50 ppm) : Appliquer le protocole réglementaire de déchloration / gestion des huiles contaminées aux BPC."
        )

    if not actions:
        actions.append("Exploitation normale. Maintenir la périodicité réglementaire des prélèvements (annuel).")

    recommandation_finale = " | ".join(actions)
    billet = existing_billet
    if not billet and thi_res["statut_global"] in ("CRITIQUE", "SURVEILLANCE") and cond_ieee >= 2:
        billet = f"OT-{id_analyse[-6:]}-MNT"

    return {
        "condition_ieee": cond_ieee,
        "condition_label": ieee_res["condition_label"],
        "per_gas_condition": ieee_res["per_gas_condition"],
        "tdcg": tdcg,
        "code_duval": duval_res["code_duval"],
        "diagnostic_duval": duval_res["diagnostic_duval"],
        "pct_ch4": duval_res["pct_ch4"],
        "pct_c2h4": duval_res["pct_c2h4"],
        "pct_c2h2": duval_res["pct_c2h2"],
        "ratio_co2_co": cell_res["ratio_co2_co"],
        "etat_cellulose": cell_res["etat_cellulose"],
        "health_index": thi_res["health_index"],
        "sub_dga": thi_res["sub_dga"],
        "sub_phys": thi_res["sub_phys"],
        "sub_dielec": thi_res["sub_dielec"],
        "sub_age": thi_res["sub_age"],
        "statut_global": thi_res["statut_global"],
        "recommandation_action": recommandation_finale,
        "billet_travail": billet,
    }
