@echo off
title PipeCAD Studio - Industrial Piping CAD
echo Iniciando PipeCAD Studio con aceleracion de GPU...
cd /d "%~dp0"
npm run electron
pause
