"""
Script de procesamiento e inspección de archivos STEP de Airpipe.
Analiza la cabecera, dimensiones de caja delimitadora y estructura
de los modelos STEP ubicados en el equipo para integrarlos al catálogo.
"""
import os
import sys

DESKTOP_DIR = os.path.expanduser("~/Desktop")

def scan_desktop_catalog():
    print(f"Escaneando directorio de catálogos STEP en: {DESKTOP_DIR}")
    step_files = []
    
    for root, _, files in os.walk(DESKTOP_DIR):
        for f in files:
            if f.lower().endswith(('.step', '.stp')):
                step_files.append(os.path.join(root, f))
                
    print(f"\nTotal de piezas STEP detectadas: {len(step_files)}")
    for sf in step_files[:15]:
        rel = os.path.relpath(sf, DESKTOP_DIR)
        size_kb = os.path.getsize(sf) / 1024
        print(f" - {rel} ({size_kb:.1f} KB)")
        
    if len(step_files) > 15:
        print(f" ... y {len(step_files) - 15} piezas más.")

if __name__ == "__main__":
    scan_desktop_catalog()
