@echo off
chcp 65001 >nul
title TransfoDiag Pro - Application Locale & PWA (Huiles de Transformateurs)
cd /d "%~dp0"

echo ============================================================================
echo   TRANSFODIAG PRO - MOTEUR LOCAL DGA, PHYSICO-CHIMIE ^& PWA OFFLINE-FIRST
echo   Normes IEEE C57.104 / CEI 60599 / Triangle de Duval 1 / Base HuileData2003
echo ============================================================================

REM 1. Verification de l'environnement virtuel Python (.venv)
if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Creation de l'environnement virtuel Python .venv...
    python -m venv .venv
    echo [1/4] Installation des dependances Python...
    .\.venv\Scripts\pip.exe install -r requirements.txt
)

REM 2. Verification et initialisation de la base SQLite locale (transformers_vault.db)
if not exist "transformers_vault.db" (
    echo [2/4] Initialisation et migration de HuileData2003(1).mdb vers transformers_vault.db...
    .\.venv\Scripts\python.exe migrate_initial_db.py
) else (
    echo [2/4] Base locale transformers_vault.db detectee et prete.
)

REM 3. Verification du build PWA Frontend
if not exist "frontend\dist\index.html" (
    echo [3/4] Construction du bundle PWA Frontend (React + Tailwind + IndexedDB)...
    pushd frontend
    if not exist "node_modules" (
        call npm install
    )
    call npm run build
    popd
) else (
    echo [3/4] Bundle PWA Frontend detecte dans frontend\dist.
)

REM 4. Ouverture automatique du navigateur et demarrage du serveur FastAPI local
echo [4/4] Demarrage du serveur local sur http://127.0.0.1:8085 ...
start "" "http://127.0.0.1:8085"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8085
pause
