# TransfoDiag Pro — Application Locale & PWA de Collecte, Diagnostic et Reporting pour Huiles de Transformateurs

Application complète **Offline-First (PWA + Backend Local FastAPI/SQLite)** permettant d'ingérer, nettoyer, analyser et diagnostiquer les données physico-chimiques et de gaz dissous (**DGA**) d'un parc de transformateurs de puissance, puis d'exporter des rapports décisionnels et techniques multi-formats (**PDF 4 pages, Word `.docx`, Excel `.xlsx` 4 onglets, CSV GMAO, SQLite**).

---

## Fonctionnalités Clés

1. **Base de Référence Industrielle Pré-initialisée (`HuileData2003(1).mdb` -> `transformers_vault.db`)** :
   - **901** équipements électriques haute tension.
   - **11 702** analyses historiques et campagnes de prélèvements.
   - **5 090** bilans DGA ($H_2, CH_4, C_2H_6, C_2H_4, C_2H_2, CO, CO_2, O_2, N_2, TDCG$).
   - **5 875** bilans physico-chimiques (Eau, Acidité, Rigidité diélectrique CEI 60156 / ASTM D1816, IFT, Couleur ASTM).
   - **1 594** bilans BPC (Aroclor 1242/1254/1260) et métaux dissous ($Cu, Al, Fe$).

2. **Moteur de Diagnostic Expert** :
   - **Norme IEEE C57.104** : Classification automatique en 4 conditions opérationnelles (Condition 1 à Condition 4).
   - **Triangle de Duval 1 (CEI 60599)** : Calcul des coordonnées ternaires $\%CH_4, \%C_2H_4, \%C_2H_2$ et identification géométrique des zones (`PD`, `T1`, `T2`, `T3`, `D1`, `D2`, `DT`) avec visualisation SVG interactive.
   - **Ratio de Dégradation de la Cellulose ($CO_2 / CO$)** : Détection de la pyrolyse du papier isolant ($< 3$).
   - **Indice de Santé Global (Transformer Health Index - THI)** : Pondération normative DGA (40 %), Physico-chimie (30 %), Rigidité diélectrique (20 %), Âge/Historique (10 %).

3. **Module d'Ingestion Multi-Formats & Auto-Mapping Intelligent (Fuzzy Matching)** :
   - Supporte **Excel (`.xlsx`, `.xls`)**, **fichiers délimités (`.csv`, `.tsv`, `.txt`)** et **bases Access (`.mdb`, `.accdb`)** (sélection de table ou requête SQL libre).
   - Correspondance floue (`RapidFuzz`) avec indicateur de confiance (Vert/Orange/Rouge), nettoyage des seuils de détection (`< 1`, `< 0.5`, `ND`, `Trace`), gestion des doublons et prévisualisation des 10 premières lignes nettoyées.

4. **Formulaire de Collecte Terrain Hors-Ligne (Offline-First PWA)** :
   - Formulaire tactile en 3 étapes adapté au terrain.
   - Stockage local immédiat dans **IndexedDB (`pending_field_inspections`)** et synchronisation automatique en arrière-plan vers SQLite.

5. **Moteur d'Exportation Multi-Formats en 1 Clic** :
   - **Rapport Exécutif & Technique PDF (4 pages)** avec Triangle de Duval vectoriel, courbes chronologiques et Bon de travail GMAO à signer.
   - **Rapport Éditable Word (`.docx`)** avec pagination *"Page X sur Y"*.
   - **Classeur Structuré Excel (`.xlsx`)** en 4 onglets (*Tableau de Bord*, *Données Nettoyées*, *Historique DGA & Ratios*, *Recommandations*).
   - **Export CSV Plat** compatible SAP PM / IBM Maximo / SCADA.

---

## Démarrage Rapide en Un Clic

- **Windows** : Double-cliquez sur `run.bat`
- **Linux / macOS** : Exécutez `./run.sh`

L'application s'ouvre automatiquement sur **`http://127.0.0.1:8085`**.
