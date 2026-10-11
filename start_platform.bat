@echo off
echo =======================================================
echo   Starting ATRED Quantitative Trading Analysis Platform
echo =======================================================
echo.

echo [1/2] Starting Python FastAPI Backend on http://localhost:8000...
start "ATRED Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python run_backend.py"

echo [2/2] Starting React Frontend on http://localhost:5173...
start "ATRED Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo =======================================================
echo   Platform is running!
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8000
echo   API Docs : http://localhost:8000/docs
echo =======================================================
