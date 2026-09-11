@echo off
title PipeCAD Studio 3D
echo ======================================================
echo  Iniciando PipeCAD Studio 3D (H:\CAD\desktop_cad)
echo ======================================================
cd /d "%~dp0desktop_cad"
start "" http://localhost:5173
npm run dev
pause
