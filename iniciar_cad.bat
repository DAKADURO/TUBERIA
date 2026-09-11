@echo off
title PipeCAD Studio 3D
echo ======================================================
echo  Iniciando PipeCAD Studio 3D (H:\CAD)
echo ======================================================
cd /d "%~dp0"
start "" http://localhost:5173
npm run dev
pause
