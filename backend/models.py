from datetime import date, datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field


# ============================================================================
# Table 1 : equipements (Parc de Transformateurs)
# ============================================================================
class Equipement(SQLModel, table=True):
    __tablename__ = "equipements"

    id_equipement: str = Field(primary_key=True, index=True, description="Identifiant unique de l'appareil (ex. TR-POSTE-01)")
    nom_equipement: str = Field(default="Transformateur", description="Désignation usuelle ou repère schéma")
    type_equipement: str = Field(default="Transformateur", description="Type (Élévateur, Réducteur, Distribution, Autotransformateur, etc.)")
    site: str = Field(default="Non spécifié", index=True, description="Usine ou zone géographique")
    localisation: str = Field(default="Non spécifiée", description="Cellule ou emplacement physique")
    litre_huile: Optional[float] = Field(default=0.0, description="Volume total d'huile diélectrique en litres")
    no_serie: Optional[str] = Field(default="", description="Numéro de série constructeur")
    tension_nominale: Optional[float] = Field(default=0.0, description="Tension nominale primaire/secondaire en kV")
    date_mise_en_service: Optional[date] = Field(default=None, description="Année ou date d'installation pour calcul de l'âge")


# ============================================================================
# Table 2 : analyses (Prélèvements et Campagnes)
# ============================================================================
class Analyse(SQLModel, table=True):
    __tablename__ = "analyses"

    id_analyse: str = Field(primary_key=True, index=True, description="Clé unique de l'échantillonnage")
    id_equipement: str = Field(foreign_key="equipements.id_equipement", index=True)
    date_prelevement: datetime = Field(index=True, description="Date et heure de prise de l'échantillon")
    charge_pct: Optional[float] = Field(default=None, description="Charge du transformateur au moment du prélèvement (%)")
    temperature_huile: Optional[float] = Field(default=None, description="Température de l'huile en fond/haut de cuve (°C)")
    code_motif: Optional[str] = Field(default="Routine", description="Routine, Alerte, Post-incident, Suivi renforcé, Réception d'huile neuve")
    laboratoire: Optional[str] = Field(default="Laboratoire Central", description="Nom du laboratoire ou kit de test portable")
    source_donnees: str = Field(default="IMPORT_FILE", description="IMPORT_FILE ou TERRAIN_OFFLINE")
    remarques: Optional[str] = Field(default=None, description="Observations visuelles de l'opérateur")


# ============================================================================
# Table 3 : gaz_dissous (DGA - Dissolved Gas Analysis en ppm)
# ============================================================================
class GazDissous(SQLModel, table=True):
    __tablename__ = "gaz_dissous"

    id_analyse: str = Field(primary_key=True, foreign_key="analyses.id_analyse", index=True)
    h2: Optional[float] = Field(default=None, description="Hydrogène (H2) en ppm")
    ch4: Optional[float] = Field(default=None, description="Méthane (CH4) en ppm")
    c2h6: Optional[float] = Field(default=None, description="Éthane (C2H6) en ppm")
    c2h4: Optional[float] = Field(default=None, description="Éthylène (C2H4) en ppm")
    c2h2: Optional[float] = Field(default=None, description="Acétylène (C2H2) en ppm")
    co: Optional[float] = Field(default=None, description="Monoxyde de carbone (CO) en ppm")
    co2: Optional[float] = Field(default=None, description="Dioxyde de carbone (CO2) en ppm")
    o2: Optional[float] = Field(default=None, description="Oxygène (O2) en ppm")
    n2: Optional[float] = Field(default=None, description="Azote (N2) en ppm")
    tdcg: Optional[float] = Field(default=None, description="Gaz combustibles totaux (H2 + CH4 + C2H6 + C2H4 + C2H2 + CO)")


# ============================================================================
# Table 4 : qualite_physicochimique (Vieillissement de l'Huile)
# ============================================================================
class QualitePhysicochimique(SQLModel, table=True):
    __tablename__ = "qualite_physicochimique"

    id_analyse: str = Field(primary_key=True, foreign_key="analyses.id_analyse", index=True)
    teneur_eau: Optional[float] = Field(default=None, description="Humidité dissoute dans l'huile (ppm ou mg/kg)")
    acidite: Optional[float] = Field(default=None, description="Indice d'acide / neutralisation (mg KOH/g)")
    rigidite_dielectrique: Optional[float] = Field(default=None, description="Tension de claquage (kV / 2.5 mm selon CEI 60156)")
    tension_interfaciale: Optional[float] = Field(default=None, description="Tension interfaciale en mN/m ou dynes/cm")
    tangente_delta: Optional[float] = Field(default=None, description="Facteur de dissipation diélectrique à 90 °C")
    viscosite: Optional[float] = Field(default=None, description="Viscosité cinématique à 40 °C (cSt)")
    couleur_astm: Optional[float] = Field(default=None, description="Indice de couleur (échelle 0.5 à 8.0 selon ASTM D1500)")


# ============================================================================
# Table 5 : pcb_metaux (Contaminants et Usure)
# ============================================================================
class PcbMetaux(SQLModel, table=True):
    __tablename__ = "pcb_metaux"

    id_analyse: str = Field(primary_key=True, foreign_key="analyses.id_analyse", index=True)
    pcb_total: Optional[float] = Field(default=None, description="Somme des congénères Aroclor 1242, 1254, 1260 (ppm)")
    cuivre: Optional[float] = Field(default=None, description="Cuivre en suspension (ppm)")
    aluminium: Optional[float] = Field(default=None, description="Aluminium en suspension (ppm)")
    fer: Optional[float] = Field(default=None, description="Fer en suspension (ppm)")


# ============================================================================
# Table 6 : diagnostics_recommandations (Résultats Experts)
# ============================================================================
class DiagnosticRecommandation(SQLModel, table=True):
    __tablename__ = "diagnostics_recommandations"

    id_analyse: str = Field(primary_key=True, foreign_key="analyses.id_analyse", index=True)
    condition_ieee: int = Field(default=1, description="Condition globale 1, 2, 3 ou 4 selon IEEE C57.104")
    code_duval: str = Field(default="NORMAL", description="Zone Duval (PD, T1, T2, T3, D1, D2, DT, NORMAL)")
    diagnostic_duval: str = Field(default="Fonctionnement normal (aucun défaut détecté)", description="Libellé du défaut")
    ratio_co2_co: Optional[float] = Field(default=None, description="Ratio CO2/CO d'évaluation de la cellulose")
    health_index: float = Field(default=100.0, description="Score global de santé sur 100 %")
    statut_global: str = Field(default="BON", index=True, description="BON, SURVEILLANCE, CRITIQUE")
    recommandation_action: str = Field(default="Maintenir le programme de suivi périodique habituel.", description="Action prescrite")
    billet_travail: Optional[str] = Field(default=None, description="Référence de l'ordre de travail GMAO")


# ============================================================================
# Table Référentielle : Normes & Recommandations Industrielles (extraite de MDB)
# ============================================================================
class NormeReferentiel(SQLModel, table=True):
    __tablename__ = "normes_referentiel"

    id: Optional[int] = Field(default=None, primary_key=True)
    categorie: str = Field(index=True, description="IEEE_C57104, ALCAN, RECOMMANDATION")
    code: str = Field(description="Identifiant ou condition")
    parametre: str = Field(description="Paramètre ou type d'analyse")
    seuil_min: Optional[float] = Field(default=None)
    seuil_max: Optional[float] = Field(default=None)
    description: str = Field(default="")


# ============================================================================
# Pydantic Payloads pour l'API (Saisie Terrain, Import, Réponses Complètes)
# ============================================================================
class FieldInspectionCreate(SQLModel):
    id_analyse: Optional[str] = None
    id_equipement: str
    nom_equipement: Optional[str] = None
    type_equipement: Optional[str] = "Transformateur"
    site: Optional[str] = "Site Principal"
    localisation: Optional[str] = "Poste HT"
    tension_nominale: Optional[float] = None
    litre_huile: Optional[float] = None
    date_prelevement: Optional[datetime] = None
    charge_pct: Optional[float] = None
    temperature_huile: Optional[float] = None
    temperature_ambiante: Optional[float] = None
    compteur_heures: Optional[float] = None
    pression_manometre: Optional[str] = "Normal"
    code_motif: Optional[str] = "Routine"
    laboratoire: Optional[str] = "Kit Portable / Terrain"
    niveau_huile: Optional[str] = "Normal"
    couleur_silice: Optional[str] = "Bleu"
    fuite_detectee: Optional[bool] = False
    bruit_vibration: Optional[bool] = False
    remarques: Optional[str] = ""
    # Mesures optionnelles kit portable DGA / Physico-chimie sur site
    h2: Optional[float] = None
    ch4: Optional[float] = None
    c2h6: Optional[float] = None
    c2h4: Optional[float] = None
    c2h2: Optional[float] = None
    co: Optional[float] = None
    co2: Optional[float] = None
    o2: Optional[float] = None
    n2: Optional[float] = None
    teneur_eau: Optional[float] = None
    acidite: Optional[float] = None
    rigidite_dielectrique: Optional[float] = None
    couleur_astm: Optional[float] = None


class BatchFieldSyncRequest(SQLModel):
    inspections: List[FieldInspectionCreate]
