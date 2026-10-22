import csv
import io
import math
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

# ReportLab pour le rapport PDF 4 pages vectoriel (Triangle de Duval + Courbes + Tableaux)
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)
from reportlab.graphics.shapes import Drawing, Polygon, Line, Circle, String, Rect, Group

# python-docx pour le rapport Word éditable
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

# openpyxl pour le classeur Excel 4 onglets
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from backend.diagnostics import IEEE_THRESHOLDS, compute_duval_triangle_1


# ============================================================================
# Utilitaires Géométriques : Triangle de Duval 1 (Vectoriel ReportLab & SVG)
# ============================================================================
def _ternary_to_cartesian(
    p_ch4: float, p_c2h4: float, p_c2h2: float,
    x0: float, y0: float, side: float
) -> Tuple[float, float]:
    """
    Convertit les coordonnées ternaires (%CH4, %C2H4, %C2H2) en coordonnées (x, y)
    dans le Triangle de Duval 1 :
    - Sommet Supérieur (Top) : 100% CH4
    - Sommet Inférieur Droit (Right) : 100% C2H4
    - Sommet Inférieur Gauche (Left) : 100% C2H2
    """
    f_ch4 = p_ch4 / 100.0
    f_c2h4 = p_c2h4 / 100.0
    x = x0 + side * (f_c2h4 + 0.5 * f_ch4)
    y = y0 + side * (math.sqrt(3) / 2.0) * f_ch4
    return (x, y)


def build_duval_drawing(
    pct_ch4: float,
    pct_c2h4: float,
    pct_c2h2: float,
    code_duval: str,
    history_points: Optional[List[Tuple[float, float, float]]] = None,
) -> Drawing:
    """
    Construit le dessin vectoriel haute précision du Triangle de Duval 1 (CEI 60599)
    pour l'intégration en Page 2 du rapport PDF.
    """
    d = Drawing(460, 290)
    x0, y0, side = 85.0, 32.0, 260.0

    def pt(ch4: float, c2h4: float, c2h2: float) -> Tuple[float, float]:
        return _ternary_to_cartesian(ch4, c2h4, c2h2, x0, y0, side)

    # Polygones des 7 zones de Duval 1 en coordonnées (%CH4, %C2H4, %C2H2)
    zones = [
        ("PD", [(98, 2, 0), (100, 0, 0), (98, 0, 2)], colors.HexColor("#93c5fd")),
        ("T1", [(98, 2, 0), (80, 20, 0), (76, 20, 4), (96, 0, 4), (98, 0, 2)], colors.HexColor("#fde68a")),
        ("T2", [(80, 20, 0), (50, 50, 0), (46, 50, 4), (76, 20, 4)], colors.HexColor("#fdba74")),
        ("T3", [(50, 50, 0), (0, 100, 0), (0, 85, 15), (35, 50, 15)], colors.HexColor("#f87171")),
        ("D1", [(87, 0, 13), (64, 23, 13), (0, 23, 77), (0, 0, 100)], colors.HexColor("#a5b4fc")),
        (
            "D2",
            [(64, 23, 13), (47, 40, 13), (31, 40, 29), (0, 71, 29), (0, 23, 77)],
            colors.HexColor("#c084fc"),
        ),
        (
            "DT",
            [
                (96, 0, 4), (76, 20, 4), (46, 50, 4), (35, 50, 15),
                (0, 85, 15), (0, 71, 29), (31, 40, 29), (47, 40, 13), (87, 0, 13),
            ],
            colors.HexColor("#fbcfe8"),
        ),
    ]

    for z_name, vertices, fill_col in zones:
        flat_pts = []
        for c1, c2, c3 in vertices:
            px, py = pt(c1, c2, c3)
            flat_pts.extend([px, py])
        d.add(
            Polygon(
                flat_pts,
                fillColor=fill_col,
                strokeColor=colors.HexColor("#334155"),
                strokeWidth=0.8,
            )
        )

    # Étiquettes des zones au barycentre approximatif
    zone_labels = [
        ("PD", 98.5, 0.8, 0.7),
        ("T1", 86, 12, 2),
        ("T2", 62, 36, 2),
        ("T3", 20, 72, 8),
        ("D1", 35, 10, 55),
        ("D2", 22, 38, 40),
        ("DT", 52, 38, 10),
    ]
    for lbl, c1, c2, c3 in zone_labels:
        lx, ly = pt(c1, c2, c3)
        d.add(String(lx - 6, ly - 3, lbl, fontSize=8, fontName="Helvetica-Bold", fillColor=colors.HexColor("#0f172a")))

    # Contour extérieur et axes
    p_top = pt(100, 0, 0)
    p_right = pt(0, 100, 0)
    p_left = pt(0, 0, 100)
    d.add(String(p_top[0] - 28, p_top[1] + 10, "100% CH4 (Méthane)", fontSize=9, fontName="Helvetica-Bold"))
    d.add(String(p_right[0] - 40, p_right[1] - 16, "100% C2H4 (Éthylène)", fontSize=9, fontName="Helvetica-Bold"))
    d.add(String(p_left[0] - 45, p_left[1] - 16, "100% C2H2 (Acétylène)", fontSize=9, fontName="Helvetica-Bold"))

    # Historique des points précédents (en gris/bleu)
    if history_points:
        for h_ch4, h_c2h4, h_c2h2 in history_points[-10:]:
            if (h_ch4 + h_c2h4 + h_c2h2) > 0:
                hx, hy = pt(h_ch4, h_c2h4, h_c2h2)
                d.add(Circle(hx, hy, 3.5, fillColor=colors.HexColor("#475569"), strokeColor=colors.white, strokeWidth=0.8))

    # Point d'analyse actif (cible rouge vif avec halo)
    if (pct_ch4 + pct_c2h4 + pct_c2h2) > 0:
        ax, ay = pt(pct_ch4, pct_c2h4, pct_c2h2)
        d.add(Circle(ax, ay, 8, fillColor=None, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
        d.add(Circle(ax, ay, 4.5, fillColor=colors.HexColor("#dc2626"), strokeColor=colors.white, strokeWidth=1.2))
        d.add(
            String(
                ax + 10,
                ay + 4,
                f"Point Actuel ({code_duval})",
                fontSize=8.5,
                fontName="Helvetica-Bold",
                fillColor=colors.HexColor("#991b1b"),
            )
        )

    # Encadré de légende à droite
    leg_x = 355
    leg_y = 225
    d.add(String(leg_x, leg_y + 15, "Coordonnées Duval :", fontSize=9, fontName="Helvetica-Bold"))
    d.add(String(leg_x, leg_y, f"%CH4 : {pct_ch4:.1f} %", fontSize=8.5, fontName="Helvetica"))
    d.add(String(leg_x, leg_y - 14, f"%C2H4 : {pct_c2h4:.1f} %", fontSize=8.5, fontName="Helvetica"))
    d.add(String(leg_x, leg_y - 28, f"%C2H2 : {pct_c2h2:.1f} %", fontSize=8.5, fontName="Helvetica"))
    d.add(String(leg_x, leg_y - 46, f"Zone : {code_duval}", fontSize=9.5, fontName="Helvetica-Bold", fillColor=colors.HexColor("#1e3a8a")))

    return d


def build_trend_chart_drawing(history: List[Dict[str, Any]]) -> Drawing:
    """
    Construit un graphique vectoriel chronologique de l'évolution des gaz principaux
    (TDCG, H2, CH4, CO, C2H4, C2H2) pour la Page 3 du rapport PDF.
    """
    d = Drawing(480, 185)
    chart_x, chart_y, chart_w, chart_h = 50.0, 30.0, 400.0, 130.0

    d.add(Rect(chart_x, chart_y, chart_w, chart_h, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=1))

    # Filtrer les points ayant des gaz dissous
    dga_pts = [h for h in history if h.get("gaz_dissous") and h["gaz_dissous"].get("tdcg") is not None]
    dga_pts = sorted(dga_pts, key=lambda x: x.get("date_prelevement", ""))[-15:]

    if not dga_pts:
        d.add(String(chart_x + 110, chart_y + 60, "Historique DGA insuffisant pour tracer la tendance", fontSize=9, fillColor=colors.HexColor("#64748b")))
        return d

    max_val = max(
        max(
            float(p["gaz_dissous"].get("tdcg") or 0),
            float(p["gaz_dissous"].get("h2") or 0),
            float(p["gaz_dissous"].get("co") or 0),
            100.0,
        )
        for p in dga_pts
    )

    # Lignes de grille horizontales
    for i in range(5):
        gy = chart_y + (chart_h * i / 4.0)
        gval = int(max_val * i / 4.0)
        d.add(Line(chart_x, gy, chart_x + chart_w, gy, strokeColor=colors.HexColor("#e2e8f0"), strokeWidth=0.6))
        d.add(String(chart_x - 38, gy - 3, f"{gval} ppm", fontSize=7, fillColor=colors.HexColor("#475569")))

    series_cfg = [
        ("tdcg", "TDCG", colors.HexColor("#0f172a")),
        ("co", "CO", colors.HexColor("#2563eb")),
        ("h2", "H2", colors.HexColor("#16a34a")),
        ("ch4", "CH4", colors.HexColor("#d97706")),
        ("c2h2", "C2H2", colors.HexColor("#dc2626")),
    ]

    n = len(dga_pts)
    for s_idx, (field, label, col) in enumerate(series_cfg):
        prev_xy = None
        for i, p in enumerate(dga_pts):
            val = float(p["gaz_dissous"].get(field) or 0.0)
            px = chart_x + (chart_w * i / max(1, n - 1)) if n > 1 else chart_x + chart_w / 2.0
            py = chart_y + min(chart_h, (val / max_val) * chart_h)
            d.add(Circle(px, py, 2.2, fillColor=col, strokeColor=col))
            if prev_xy is not None:
                d.add(Line(prev_xy[0], prev_xy[1], px, py, strokeColor=col, strokeWidth=1.4))
            prev_xy = (px, py)

        # Légende en haut
        lx = chart_x + s_idx * 78
        d.add(Rect(lx, chart_y + chart_h + 8, 10, 6, fillColor=col, strokeColor=col))
        d.add(String(lx + 14, chart_y + chart_h + 8, label, fontSize=8, fontName="Helvetica-Bold", fillColor=col))

    # Dates en abscisse
    step = max(1, n // 6)
    for i in range(0, n, step):
        px = chart_x + (chart_w * i / max(1, n - 1)) if n > 1 else chart_x + chart_w / 2.0
        dt_str = str(dga_pts[i].get("date_prelevement", ""))[:10]
        d.add(String(px - 18, chart_y - 12, dt_str, fontSize=6.8, fillColor=colors.HexColor("#334155")))

    return d


# ============================================================================
# 1. Générateur de Rapport Exécutif & Technique PDF (4 Pages Complètes)
# ============================================================================
def generate_pdf_report(equipment: Dict[str, Any], history: List[Dict[str, Any]]) -> bytes:
    """
    Génère le Rapport Exécutif & Technique PDF en 4 pages :
    - Page 1 : Synthèse Décisionnelle (Identifiant, THI, Verdict Vert/Orange/Rouge, 3 Actions prioritaires)
    - Page 2 : Analyse DGA & Triangle de Duval vectoriel + Tableau comparatif IEEE C57.104
    - Page 3 : Évolution Temporelle & Physico-chimie (Courbes chronologiques, Rigidité, Eau, Acidité, PCB)
    - Page 4 : Fiche d'intervention et Bon de travail prêt pour signature
    """
    buffer = io.BytesIO()

    def _header_footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#0f172a"))
        canvas.rect(15 * mm, 280 * mm, 180 * mm, 10 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(18 * mm, 283.5 * mm, "TRANSFO-DIAGNOSTIC PRO | RAPPORT D'EXPERTISE DGA & PHYSICO-CHIMIE")
        canvas.drawRightString(192 * mm, 283.5 * mm, f"Équipement : {equipment.get('id_equipement', 'N/A')}")

        canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
        canvas.line(15 * mm, 15 * mm, 195 * mm, 15 * mm)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(15 * mm, 10 * mm, f"Généré hors-ligne le {datetime.now().strftime('%d/%m/%Y à %H:%M')} — Normes IEEE C57.104 & CEI 60599")
        canvas.drawRightString(195 * mm, 10 * mm, f"Page {doc.page} sur 4")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyStd",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
    )

    latest = history[0] if history else {}
    latest_dga = latest.get("gaz_dissous") or {}
    # Chercher la dernière analyse disposant de données DGA si la toute dernière est purement EPL
    for h in history:
        if h.get("gaz_dissous") and h["gaz_dissous"].get("tdcg") is not None:
            latest_dga = h["gaz_dissous"]
            break

    latest_phys = latest.get("qualite_physicochimique") or {}
    for h in history:
        if h.get("qualite_physicochimique") and any(
            h["qualite_physicochimique"].get(k) is not None for k in ("rigidite_dielectrique", "teneur_eau", "acidite")
        ):
            latest_phys = h["qualite_physicochimique"]
            break

    latest_pcb = latest.get("pcb_metaux") or {}
    for h in history:
        if h.get("pcb_metaux") and h["pcb_metaux"].get("pcb_total") is not None:
            latest_pcb = h["pcb_metaux"]
            break

    latest_diag = latest.get("diagnostic") or {}
    statut = latest_diag.get("statut_global", "BON")
    thi = float(latest_diag.get("health_index", 100.0))
    cond_ieee = int(latest_diag.get("condition_ieee", 1))

    verdict_colors = {
        "BON": colors.HexColor("#16a34a"),
        "SURVEILLANCE": colors.HexColor("#d97706"),
        "CRITIQUE": colors.HexColor("#dc2626"),
    }
    v_color = verdict_colors.get(statut, colors.HexColor("#16a34a"))

    story = []

    # ========================================================================
    # PAGE 1 : SYNTHÈSE DÉCISIONNELLE
    # ========================================================================
    story.append(Paragraph("PAGE 1 — SYNTHÈSE DÉCISIONNELLE & ÉTAT DE SANTÉ GLOBAL", title_style))
    story.append(Spacer(1, 4))

    id_table_data = [
        ["Identifiant Appareil", equipment.get("id_equipement", "-"), "Site / Usine", equipment.get("site", "-")],
        ["Désignation", equipment.get("nom_equipement", "-"), "Localisation", equipment.get("localisation", "-")],
        ["Type d'Équipement", equipment.get("type_equipement", "-"), "Numéro de Série", equipment.get("no_serie", "-")],
        ["Tension Nominale", f"{equipment.get('tension_nominale') or 0:.1f} kV", "Volume d'Huile", f"{equipment.get('litre_huile') or 0:.0f} Litres"],
        ["Dernier Prélèvement", str(latest.get("date_prelevement", "-"))[:16], "Laboratoire", latest.get("laboratoire", "-")],
    ]
    t_id = Table(id_table_data, colWidths=[38 * mm, 52 * mm, 38 * mm, 52 * mm])
    t_id.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t_id)
    story.append(Spacer(1, 12))

    # Bandeau Verdict Global & Indice THI
    story.append(Paragraph("Verdict Global & Indice de Santé (Transformer Health Index - THI)", h2_style))
    verdict_data = [
        [
            f"VERDICT GLOBAL : {statut}",
            f"INDICE THI : {thi:.1f} / 100 %",
            f"CONDITION IEEE C57.104 : Niveau {cond_ieee} / 4",
        ]
    ]
    t_verdict = Table(verdict_data, colWidths=[60 * mm, 60 * mm, 60 * mm])
    t_verdict.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), v_color),
                ("BACKGROUND", (1, 0), (2, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("PADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.append(t_verdict)
    story.append(Spacer(1, 12))

    # Liste des 3 Actions Prioritaires
    story.append(Paragraph("Les 3 Actions Prioritaires Prescrites", h2_style))
    raw_rec = latest_diag.get("recommandation_action", "Maintenir le suivi périodique réglementaire.")
    rec_items = [r.strip() for r in raw_rec.split("|") if r.strip()]
    while len(rec_items) < 3:
        if len(rec_items) == 1:
            rec_items.append("Vérifier l'étanchéité des joints, le niveau d'huile au conservateur et l'état du gel de silice (déshydrateur).")
        else:
            rec_items.append("Archiver ce rapport dans le système GMAO et planifier la prochaine campagne d'échantillonnage DGA/EPL.")

    actions_rows = [["Priorité", "Prescription Technique & Décisionnelle", "Échéance"]]
    echeances = ["Immédiate / < 15 j" if statut == "CRITIQUE" else "Sous 30 jours", "Prochaine ronde", "Programme annuel"]
    for idx, act in enumerate(rec_items[:3]):
        actions_rows.append([f"Action #{idx + 1}", Paragraph(act, body_style), echeances[idx]])

    t_act = Table(actions_rows, colWidths=[25 * mm, 120 * mm, 35 * mm])
    t_act.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t_act)
    story.append(Spacer(1, 12))

    # Synthèse de décomposition de l'indice de santé
    story.append(Paragraph("Décomposition Pondérée du Transformer Health Index (THI)", h2_style))
    thi_breakdown = [
        ["Composante Évaluée", "Pondération Normative", "État Observé", "Impact sur l'Indice"],
        ["Gaz Dissous (DGA - IEEE C57.104)", "40 %", f"Condition IEEE {cond_ieee} (TDCG = {latest_dga.get('tdcg') or 0:.0f} ppm)", "Majeur"],
        ["Qualité Physico-Chimique (Eau, Acidité, Couleur)", "30 %", f"Eau: {latest_phys.get('teneur_eau') or '-'} ppm | Acidité: {latest_phys.get('acidite') or '-'} mg KOH/g", "Élevé"],
        ["Rigidité Diélectrique (CEI 60156)", "20 %", f"Tension claquage: {latest_phys.get('rigidite_dielectrique') or '-'} kV", "Critique"],
        ["Âge & Historique d'Exploitation", "10 %", f"Mise en service: {equipment.get('date_mise_en_service') or 'Standard'}", "Modéré"],
    ]
    t_thi = Table(thi_breakdown, colWidths=[62 * mm, 35 * mm, 55 * mm, 28 * mm])
    t_thi.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t_thi)

    story.append(PageBreak())

    # ========================================================================
    # PAGE 2 : ANALYSE DGA & TRIANGLE DE DUVAL 1
    # ========================================================================
    story.append(Paragraph("PAGE 2 — ANALYSE DES GAZ DISSOUS (DGA) & TRIANGLE DE DUVAL 1", title_style))

    duval_calc = compute_duval_triangle_1(
        latest_dga.get("ch4"), latest_dga.get("c2h4"), latest_dga.get("c2h2")
    )
    hist_duval_pts = []
    for h in history[1:12]:
        gd = h.get("gaz_dissous")
        if gd:
            dc = compute_duval_triangle_1(gd.get("ch4"), gd.get("c2h4"), gd.get("c2h2"))
            hist_duval_pts.append((dc["pct_ch4"], dc["pct_c2h4"], dc["pct_c2h2"]))

    story.append(Paragraph("Représentation Vectorielle du Triangle de Duval 1 (CEI 60599)", h2_style))
    story.append(
        build_duval_drawing(
            duval_calc["pct_ch4"],
            duval_calc["pct_c2h4"],
            duval_calc["pct_c2h2"],
            latest_diag.get("code_duval", duval_calc["code_duval"]),
            hist_duval_pts,
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            f"<b>Diagnostic Duval :</b> {latest_diag.get('diagnostic_duval', duval_calc['diagnostic_duval'])} "
            f"| <b>Ratio CO2/CO (Cellulose) :</b> {latest_diag.get('ratio_co2_co') or 'N/A'}",
            body_style,
        )
    )
    story.append(Spacer(1, 8))

    story.append(Paragraph("Tableau Comparatif des Concentrations de Gaz aux Seuils IEEE C57.104 (ppm)", h2_style))
    gas_rows = [
        ["Gaz Dissous", "Valeur Mesurée", "Cond. 1 (Normal)", "Cond. 2 (Alerte)", "Cond. 3 (Action)", "Cond. 4 (Danger)"],
        ["Hydrogène (H2)", f"{latest_dga.get('h2') or 0:.1f} ppm", "< 100", "100 - 700", "700 - 1800", "> 1800"],
        ["Méthane (CH4)", f"{latest_dga.get('ch4') or 0:.1f} ppm", "< 120", "120 - 400", "400 - 1000", "> 1000"],
        ["Acétylène (C2H2)", f"{latest_dga.get('c2h2') or 0:.2f} ppm", "< 1", "1 - 9", "9 - 35", "> 35"],
        ["Éthylène (C2H4)", f"{latest_dga.get('c2h4') or 0:.1f} ppm", "< 50", "50 - 100", "100 - 200", "> 200"],
        ["Éthane (C2H6)", f"{latest_dga.get('c2h6') or 0:.1f} ppm", "< 65", "65 - 100", "100 - 150", "> 150"],
        ["Monoxyde de Carbone (CO)", f"{latest_dga.get('co') or 0:.1f} ppm", "< 350", "350 - 570", "570 - 1400", "> 1400"],
        ["Dioxyde de Carbone (CO2)", f"{latest_dga.get('co2') or 0:.1f} ppm", "< 2500", "2500 - 4000", "4000 - 10000", "> 10000"],
        ["TDCG (Gaz Combustibles Totaux)", f"{latest_dga.get('tdcg') or 0:.1f} ppm", "< 720", "720 - 1920", "1920 - 4630", "> 4630"],
    ]
    t_gas = Table(gas_rows, colWidths=[45 * mm, 29 * mm, 26 * mm, 26 * mm, 27 * mm, 27 * mm])
    t_gas.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.2),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                ("PADDING", (0, 0), (-1, -1), 4.5),
            ]
        )
    )
    story.append(t_gas)

    story.append(PageBreak())

    # ========================================================================
    # PAGE 3 : ÉVOLUTION TEMPORELLE & PHYSICO-CHIMIE
    # ========================================================================
    story.append(Paragraph("PAGE 3 — ÉVOLUTION TEMPORELLE & QUALITÉ PHYSICO-CHIMIQUE", title_style))
    story.append(Paragraph("Courbes Chronologiques des Gaz Dissous Principaux (ppm)", h2_style))
    story.append(build_trend_chart_drawing(history))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Bilan Physico-Chimique, Rigidité Diélectrique & Contaminants (BPC / Métaux)", h2_style))
    phys_rows = [
        ["Paramètre Physico-Chimique / Contaminant", "Résultat Mesuré", "Seuil Normatif", "Conformité"],
        [
            "Rigidité Diélectrique (CEI 60156 / ASTM D1816)",
            f"{latest_phys.get('rigidite_dielectrique') if latest_phys.get('rigidite_dielectrique') is not None else '-'} kV",
            ">= 35.0 kV",
            "Conforme" if (latest_phys.get("rigidite_dielectrique") or 40) >= 35 else "Non-Conforme",
        ],
        [
            "Teneur en Eau Dissoute (Humidité)",
            f"{latest_phys.get('teneur_eau') if latest_phys.get('teneur_eau') is not None else '-'} ppm",
            "<= 25.0 ppm",
            "Conforme" if (latest_phys.get("teneur_eau") or 10) <= 25 else "Alerte Humidité",
        ],
        [
            "Indice d'Acidité / Neutralisation",
            f"{latest_phys.get('acidite') if latest_phys.get('acidite') is not None else '-'} mg KOH/g",
            "<= 0.15 mg KOH/g",
            "Conforme" if (latest_phys.get("acidite") or 0.02) <= 0.15 else "Oxydation",
        ],
        [
            "Tension Interfaciale (IFT)",
            f"{latest_phys.get('tension_interfaciale') if latest_phys.get('tension_interfaciale') is not None else '-'} mN/m",
            ">= 25.0 mN/m",
            "Conforme" if (latest_phys.get("tension_interfaciale") or 30) >= 25 else "Dégradé",
        ],
        [
            "Indice de Couleur ASTM D1500",
            f"{latest_phys.get('couleur_astm') if latest_phys.get('couleur_astm') is not None else '-'}",
            "<= 3.0",
            "Conforme" if (latest_phys.get("couleur_astm") or 1.0) <= 3.0 else "Foncé",
        ],
        [
            "Contamination PCB Total (Aroclor 1242/1254/1260)",
            f"{latest_pcb.get('pcb_total') if latest_pcb.get('pcb_total') is not None else '0.0'} ppm",
            "< 50.0 ppm",
            "Non contaminé" if (latest_pcb.get("pcb_total") or 0.0) < 50.0 else "CONTAMINÉ BPC",
        ],
        [
            "Métaux Dissous (Cuivre / Fer / Aluminium)",
            f"Cu: {latest_pcb.get('cuivre') or 0} | Fe: {latest_pcb.get('fer') or 0} | Al: {latest_pcb.get('aluminium') or 0} ppm",
            "< 1.0 ppm",
            "Normal",
        ],
    ]
    t_phys = Table(phys_rows, colWidths=[72 * mm, 40 * mm, 36 * mm, 32 * mm])
    t_phys.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t_phys)

    story.append(PageBreak())

    # ========================================================================
    # PAGE 4 : FICHE D'INTERVENTION ET BON DE TRAVAIL (GMAO)
    # ========================================================================
    story.append(Paragraph("PAGE 4 — FICHE D'INTERVENTION TECHNIQUE & BON DE TRAVAIL", title_style))
    billet_no = latest_diag.get("billet_travail") or f"OT-{equipment.get('id_equipement', 'TR')}-{datetime.now().strftime('%Y%m')}"

    wo_header = [
        ["N° Bon de Travail (GMAO)", billet_no, "Priorité Opérationnelle", statut],
        ["Équipement Cible", f"{equipment.get('id_equipement')} — {equipment.get('nom_equipement')}", "Site / Cellule", f"{equipment.get('site')} / {equipment.get('localisation')}"],
        ["Condition IEEE C57.104", f"Condition {cond_ieee}", "Code Défaut Duval 1", latest_diag.get("code_duval", "NORMAL")],
    ]
    t_wo = Table(wo_header, colWidths=[42 * mm, 48 * mm, 42 * mm, 48 * mm])
    t_wo.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#94a3b8")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t_wo)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Prescriptions Détaillées de Maintenance Prédictive", h2_style))
    story.append(Paragraph(latest_diag.get("recommandation_action", "RAS"), body_style))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Liste de Contrôle d'Intervention Terrain (Opérateur / Technicien HT)", h2_style))
    checklist_rows = [
        ["Étape", "Opération de Contrôle / Maintenance à Exécuter sur Site", "Statut (Oui / Non)", "Visa"],
        ["1", "Consignation électrique ou vérification de la charge et température haut de cuve", "[   ] Oui   [   ] Non", ""],
        ["2", "Inspection visuelle du niveau d'huile au conservateur et détection de fuites", "[   ] Oui   [   ] Non", ""],
        ["3", "Contrôle de la couleur du gel de silice (déshydrateur : Bleu = Actif / Rose = Saturé)", "[   ] Oui   [   ] Non", ""],
        ["4", "Prélèvement d'échantillon d'huile en fond de cuve selon procédure CEI 60475", "[   ] Oui   [   ] Non", ""],
        ["5", "Traitement d'huile (Dégazage sous vide / Séchage / Régénération) si prescrit", "[   ] Oui   [   ] Non", ""],
    ]
    t_chk = Table(checklist_rows, colWidths=[15 * mm, 105 * mm, 35 * mm, 25 * mm])
    t_chk.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t_chk)
    story.append(Spacer(1, 18))

    story.append(Paragraph("Validation & Signatures Réglementaires", h2_style))
    sig_rows = [
        ["Ingénieur Diagnostic & Maintenance Prédictive", "Responsable d'Exploitation / Chef de Poste"],
        [
            "Nom :\n\nDate :\n\nSignature :",
            "Nom :\n\nDate d'exécution :\n\nSignature :",
        ],
    ]
    t_sig = Table(sig_rows, colWidths=[90 * mm, 90 * mm], rowHeights=[8 * mm, 28 * mm])
    t_sig.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#64748b")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t_sig)

    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buffer.getvalue()


# ============================================================================
# 2. Générateur de Rapport Éditable Word (.docx)
# ============================================================================
def _add_page_number_fields(run):
    """Ajoute la pagination dynamique 'Page X sur Y' dans le pied de page Word."""
    fldChar1 = OxmlElement("w:fldChar")
    fldChar1.set(qn("w:fldCharType"), "begin")
    instrText = OxmlElement("w:instrText")
    instrText.set(qn("xml:space"), "preserve")
    instrText.text = "PAGE"
    fldChar2 = OxmlElement("w:fldChar")
    fldChar2.set(qn("w:fldCharType"), "separate")
    fldChar3 = OxmlElement("w:fldChar")
    fldChar3.set(qn("w:fldCharType"), "end")
    r = run._r
    r.append(fldChar1)
    r.append(instrText)
    r.append(fldChar2)
    r.append(fldChar3)


def _add_numpages_field(run):
    fldChar1 = OxmlElement("w:fldChar")
    fldChar1.set(qn("w:fldCharType"), "begin")
    instrText = OxmlElement("w:instrText")
    instrText.set(qn("xml:space"), "preserve")
    instrText.text = "NUMPAGES"
    fldChar2 = OxmlElement("w:fldChar")
    fldChar2.set(qn("w:fldCharType"), "separate")
    fldChar3 = OxmlElement("w:fldChar")
    fldChar3.set(qn("w:fldCharType"), "end")
    r = run._r
    r.append(fldChar1)
    r.append(instrText)
    r.append(fldChar2)
    r.append(fldChar3)


def _shade_cell(cell, hex_color: str):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def generate_word_report(equipment: Dict[str, Any], history: List[Dict[str, Any]]) -> bytes:
    """
    Génère le Rapport Éditable Word (.docx) avec en-têtes/pieds de page paginés ('Page X sur Y'),
    tableaux d'ingénierie contrastés, encadrés d'alerte colorés et espaces de signature.
    """
    doc = Document()

    # Configuration de l'en-tête et du pied de page avec pagination "Page X sur Y"
    section = doc.sections[0]
    header = section.header
    hp = header.paragraphs[0]
    hp.text = f"RAPPORT D'EXPERTISE DGA & HUILES DE TRANSFORMATEURS — {equipment.get('id_equipement', '')} ({equipment.get('site', '')})"
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    fp.add_run("Document Confidentiel d'Ingénierie — Page ")
    _add_page_number_fields(fp.add_run())
    fp.add_run(" sur ")
    _add_numpages_field(fp.add_run())

    latest = history[0] if history else {}
    latest_diag = latest.get("diagnostic") or {}
    latest_dga = latest.get("gaz_dissous") or {}
    for h in history:
        if h.get("gaz_dissous") and h["gaz_dissous"].get("tdcg") is not None:
            latest_dga = h["gaz_dissous"]
            break

    # Titre Principal
    title = doc.add_heading(f"Rapport Technique & Décisionnel : {equipment.get('id_equipement')}", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT

    # Encadré coloré d'alerte / verdict
    statut = latest_diag.get("statut_global", "BON")
    alert_tbl = doc.add_table(rows=1, cols=1)
    alert_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    alert_cell = alert_tbl.cell(0, 0)
    bg_hex = "DCFCE7" if statut == "BON" else ("FEF3C7" if statut == "SURVEILLANCE" else "FEE2E2")
    _shade_cell(alert_cell, bg_hex)
    p_alert = alert_cell.paragraphs[0]
    r_alert = p_alert.add_run(
        f"VERDICT GLOBAL : {statut} | Indice THI : {latest_diag.get('health_index', 100.0)}% | "
        f"Condition IEEE C57.104 : Niveau {latest_diag.get('condition_ieee', 1)} | "
        f"Zone Duval 1 : {latest_diag.get('code_duval', 'NORMAL')}\n"
        f"Prescription : {latest_diag.get('recommandation_action', 'Exploitation normale.')}"
    )
    r_alert.bold = True

    doc.add_paragraph()

    # Section 1 : Caractéristiques de l'Équipement
    doc.add_heading("1. Identification du Transformateur", level=1)
    eq_tbl = doc.add_table(rows=4, cols=4)
    eq_tbl.style = "Table Grid"
    eq_rows = [
        ("ID Équipement", str(equipment.get("id_equipement", "-")), "Nom / Repère", str(equipment.get("nom_equipement", "-"))),
        ("Type", str(equipment.get("type_equipement", "-")), "N° de Série", str(equipment.get("no_serie", "-"))),
        ("Site / Usine", str(equipment.get("site", "-")), "Localisation", str(equipment.get("localisation", "-"))),
        ("Tension Nominale", f"{equipment.get('tension_nominale') or 0} kV", "Volume d'Huile", f"{equipment.get('litre_huile') or 0} L"),
    ]
    for r_idx, row_vals in enumerate(eq_rows):
        for c_idx, val in enumerate(row_vals):
            c = eq_tbl.cell(r_idx, c_idx)
            c.text = val
            if c_idx in (0, 2):
                _shade_cell(c, "E2E8F0")
                c.paragraphs[0].runs[0].bold = True

    # Section 2 : Dernier Bilan des Gaz Dissous (DGA)
    doc.add_heading("2. Analyse des Gaz Dissous (DGA) & Norme IEEE C57.104", level=1)
    dga_tbl = doc.add_table(rows=1, cols=9)
    dga_tbl.style = "Table Grid"
    headers = ["Date", "H2", "CH4", "C2H6", "C2H4", "C2H2", "CO", "CO2", "TDCG"]
    for idx, h_text in enumerate(headers):
        cell = dga_tbl.rows[0].cells[idx]
        cell.text = h_text
        _shade_cell(cell, "1E3A8A")
        run = cell.paragraphs[0].runs[0]
        run.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)

    for h in history[:15]:
        gd = h.get("gaz_dissous")
        if not gd:
            continue
        row_cells = dga_tbl.add_row().cells
        row_cells[0].text = str(h.get("date_prelevement", ""))[:10]
        row_cells[1].text = f"{gd.get('h2') or 0:.1f}"
        row_cells[2].text = f"{gd.get('ch4') or 0:.1f}"
        row_cells[3].text = f"{gd.get('c2h6') or 0:.1f}"
        row_cells[4].text = f"{gd.get('c2h4') or 0:.1f}"
        row_cells[5].text = f"{gd.get('c2h2') or 0:.2f}"
        row_cells[6].text = f"{gd.get('co') or 0:.1f}"
        row_cells[7].text = f"{gd.get('co2') or 0:.1f}"
        row_cells[8].text = f"{gd.get('tdcg') or 0:.1f}"

    # Section 3 : Signatures d'Approbation
    doc.add_heading("3. Approbation Technique & Signatures", level=1)
    sig_tbl = doc.add_table(rows=2, cols=2)
    sig_tbl.style = "Table Grid"
    sig_tbl.cell(0, 0).text = "Ingénieur Spécialiste Haute Tension"
    sig_tbl.cell(0, 1).text = "Responsable Maintenance / Exploitation"
    _shade_cell(sig_tbl.cell(0, 0), "E2E8F0")
    _shade_cell(sig_tbl.cell(0, 1), "E2E8F0")
    sig_tbl.cell(1, 0).text = "\nNom et Visa :\n\nDate :\n"
    sig_tbl.cell(1, 1).text = f"\nBillet de travail : {latest_diag.get('billet_travail') or 'N/A'}\n\nVisa d'exécution :\n"

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


# ============================================================================
# 3. Générateur de Classeur Structuré Excel (.xlsx à 4 Onglets)
# ============================================================================
def generate_excel_workbook(
    fleet_summary: List[Dict[str, Any]],
    analyses_rows: List[Dict[str, Any]],
) -> bytes:
    """
    Génère le classeur Excel (.xlsx) organisé en 4 onglets réglementaires :
    - Onglet 1 : Tableau de Bord
    - Onglet 2 : Données Nettoyées
    - Onglet 3 : Historique DGA & Ratios
    - Onglet 4 : Recommandations
    """
    wb = Workbook()
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    def _style_sheet(ws):
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for col in ws.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 48)

    # Onglet 1 - Tableau de Bord
    ws1 = wb.active
    ws1.title = "Tableau de Bord"
    ws1.append([
        "ID Équipement", "Nom Équipement", "Type", "Site", "Localisation",
        "Tension (kV)", "Volume Huile (L)", "Dernier Prélèvement",
        "Statut Global", "Indice THI (%)", "Condition IEEE", "Zone Duval 1",
    ])
    for eq in fleet_summary:
        ws1.append([
            eq.get("id_equipement"),
            eq.get("nom_equipement"),
            eq.get("type_equipement"),
            eq.get("site"),
            eq.get("localisation"),
            eq.get("tension_nominale"),
            eq.get("litre_huile"),
            str(eq.get("dernier_prelevement") or "")[:10],
            eq.get("statut_global"),
            eq.get("health_index"),
            eq.get("condition_ieee"),
            eq.get("code_duval"),
        ])
    _style_sheet(ws1)

    # Onglet 2 - Données Nettoyées
    ws2 = wb.create_sheet(title="Données Nettoyées")
    ws2.append([
        "ID Analyse", "ID Équipement", "Date Prélèvement", "Source", "Laboratoire",
        "Motif", "Charge (%)", "Temp Huile (°C)",
        "Eau (ppm)", "Acidité (mg KOH/g)", "Rigidité Diélectrique (kV)",
        "IFT (mN/m)", "Couleur ASTM", "PCB Total (ppm)", "Cuivre (ppm)", "Fer (ppm)", "Aluminium (ppm)",
    ])
    for r in analyses_rows:
        pq = r.get("qualite_physicochimique") or {}
        pm = r.get("pcb_metaux") or {}
        ws2.append([
            r.get("id_analyse"),
            r.get("id_equipement"),
            str(r.get("date_prelevement") or "")[:16],
            r.get("source_donnees"),
            r.get("laboratoire"),
            r.get("code_motif"),
            r.get("charge_pct"),
            r.get("temperature_huile"),
            pq.get("teneur_eau"),
            pq.get("acidite"),
            pq.get("rigidite_dielectrique"),
            pq.get("tension_interfaciale"),
            pq.get("couleur_astm"),
            pm.get("pcb_total"),
            pm.get("cuivre"),
            pm.get("fer"),
            pm.get("aluminium"),
        ])
    _style_sheet(ws2)

    # Onglet 3 - Historique DGA & Ratios
    ws3 = wb.create_sheet(title="Historique DGA & Ratios")
    ws3.append([
        "ID Analyse", "ID Équipement", "Date Prélèvement",
        "H2 (ppm)", "CH4 (ppm)", "C2H6 (ppm)", "C2H4 (ppm)", "C2H2 (ppm)",
        "CO (ppm)", "CO2 (ppm)", "O2 (ppm)", "N2 (ppm)", "TDCG (ppm)",
        "%CH4 Duval", "%C2H4 Duval", "%C2H2 Duval", "Zone Duval 1",
        "Ratio CO2/CO", "Condition IEEE C57.104",
    ])
    for r in analyses_rows:
        gd = r.get("gaz_dissous") or {}
        dg = r.get("diagnostic") or {}
        if not gd:
            continue
        duval_c = compute_duval_triangle_1(gd.get("ch4"), gd.get("c2h4"), gd.get("c2h2"))
        ws3.append([
            r.get("id_analyse"),
            r.get("id_equipement"),
            str(r.get("date_prelevement") or "")[:16],
            gd.get("h2"),
            gd.get("ch4"),
            gd.get("c2h6"),
            gd.get("c2h4"),
            gd.get("c2h2"),
            gd.get("co"),
            gd.get("co2"),
            gd.get("o2"),
            gd.get("n2"),
            gd.get("tdcg"),
            duval_c["pct_ch4"],
            duval_c["pct_c2h4"],
            duval_c["pct_c2h2"],
            dg.get("code_duval", duval_c["code_duval"]),
            dg.get("ratio_co2_co"),
            dg.get("condition_ieee", 1),
        ])
    _style_sheet(ws3)

    # Onglet 4 - Recommandations
    ws4 = wb.create_sheet(title="Recommandations")
    ws4.append([
        "ID Analyse", "ID Équipement", "Date Prélèvement",
        "Statut Global", "Indice THI (%)", "Condition IEEE",
        "Zone Duval", "Diagnostic Duval", "Prescription & Action Recommandée", "Billet de Travail GMAO",
    ])
    for r in analyses_rows:
        dg = r.get("diagnostic") or {}
        ws4.append([
            r.get("id_analyse"),
            r.get("id_equipement"),
            str(r.get("date_prelevement") or "")[:16],
            dg.get("statut_global"),
            dg.get("health_index"),
            dg.get("condition_ieee"),
            dg.get("code_duval"),
            dg.get("diagnostic_duval"),
            dg.get("recommandation_action"),
            dg.get("billet_travail") or "",
        ])
    _style_sheet(ws4)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


# ============================================================================
# 4. Fichier d'Échange Plat CSV (Compatible SAP PM / IBM Maximo / SCADA)
# ============================================================================
def generate_csv_export(analyses_rows: List[Dict[str, Any]]) -> bytes:
    """Génère un export CSV UTF-8 (avec BOM) prêt pour SAP PM, IBM Maximo ou SCADA."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "ID_ANALYSE", "ID_EQUIPEMENT", "DATE_PRELEVEMENT", "SOURCE_DONNEES",
        "LABORATOIRE", "CODE_MOTIF", "CHARGE_PCT", "TEMPERATURE_HUILE_C",
        "H2_PPM", "CH4_PPM", "C2H6_PPM", "C2H4_PPM", "C2H2_PPM", "CO_PPM", "CO2_PPM", "TDCG_PPM",
        "TENEUR_EAU_PPM", "ACIDITE_MG_KOH_G", "RIGIDITE_KV", "IFT_MN_M", "COULEUR_ASTM",
        "PCB_TOTAL_PPM", "CONDITION_IEEE", "CODE_DUVAL", "RATIO_CO2_CO",
        "HEALTH_INDEX_PCT", "STATUT_GLOBAL", "BILLET_TRAVAIL_GMAO", "RECOMMANDATION_ACTION",
    ])
    for r in analyses_rows:
        gd = r.get("gaz_dissous") or {}
        pq = r.get("qualite_physicochimique") or {}
        pm = r.get("pcb_metaux") or {}
        dg = r.get("diagnostic") or {}
        writer.writerow([
            r.get("id_analyse", ""),
            r.get("id_equipement", ""),
            str(r.get("date_prelevement", ""))[:19],
            r.get("source_donnees", ""),
            r.get("laboratoire", ""),
            r.get("code_motif", ""),
            r.get("charge_pct", ""),
            r.get("temperature_huile", ""),
            gd.get("h2", ""),
            gd.get("ch4", ""),
            gd.get("c2h6", ""),
            gd.get("c2h4", ""),
            gd.get("c2h2", ""),
            gd.get("co", ""),
            gd.get("co2", ""),
            gd.get("tdcg", ""),
            pq.get("teneur_eau", ""),
            pq.get("acidite", ""),
            pq.get("rigidite_dielectrique", ""),
            pq.get("tension_interfaciale", ""),
            pq.get("couleur_astm", ""),
            pm.get("pcb_total", ""),
            dg.get("condition_ieee", ""),
            dg.get("code_duval", ""),
            dg.get("ratio_co2_co", ""),
            dg.get("health_index", ""),
            dg.get("statut_global", ""),
            dg.get("billet_travail", ""),
            dg.get("recommandation_action", ""),
        ])
    return output.getvalue().encode("utf-8-sig")
