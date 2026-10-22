#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================================================"
echo "  TRANSFODIAG PRO - MOTEUR LOCAL DGA, PHYSICO-CHIMIE & PWA OFFLINE-FIRST"
echo "  Normes IEEE C57.104 / CEI 60599 / Triangle de Duval 1 / Base HuileData2003"
echo "============================================================================"

# 1. Vérification de l'environnement virtuel Python (.venv)
if [ ! -f ".venv/bin/python" ]; then
    echo "[1/4] Création de l'environnement virtuel Python .venv..."
    python3 -m venv .venv
    echo "[1/4] Installation des dépendances Python..."
    ./.venv/bin/pip install -r requirements.txt
fi

# 2. Vérification et initialisation de la base SQLite locale (transformers_vault.db)
if [ ! -f "transformers_vault.db" ]; then
    echo "[2/4] Initialisation et migration de HuileData2003(1).mdb vers transformers_vault.db..."
    ./.venv/bin/python migrate_initial_db.py
else
    echo "[2/4] Base locale transformers_vault.db détectée et prête."
fi

# 3. Vérification du build PWA Frontend
if [ ! -f "frontend/dist/index.html" ]; then
    echo "[3/4] Construction du bundle PWA Frontend..."
    (cd frontend && [ ! -d "node_modules" ] && npm install; npm run build)
else
    echo "[3/4] Bundle PWA Frontend détecté dans frontend/dist."
fi

# 4. Ouverture du navigateur et lancement du serveur FastAPI
echo "[4/4] Démarrage du serveur local sur http://127.0.0.1:8085 ..."
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://127.0.0.1:8085") &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://127.0.0.1:8085") &
fi

./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8085
