import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { CatalogSidebar } from './components/CatalogSidebar';
import { Viewport } from './components/Viewport';
import { BOMModal } from './components/BOMModal';
import { BlueprintPanel } from './components/BlueprintPanel';
import { 
  ToolMode, 
  VisualMode, 
  CameraView, 
  PerformanceProfile, 
  FittingDefinition,
  PipeSegment, 
  PlacedFitting,
  DxfBlueprint,
  BackgroundTheme
} from './types/cad';
import { CADEngine } from './core/cadEngine';
import { FittingGeometryFactory } from './core/fittingGeometryFactory';
import { DxfService } from './core/dxfService';
import { AIRPIPE_CATALOG } from './catalog/airpipeCatalog';

export function App() {
  const [currentTool, setCurrentTool] = useState<ToolMode>('select');
  const [visualMode, setVisualMode] = useState<VisualMode>('shaded_edges');
  const [cameraView, setCameraView] = useState<CameraView>('perspective_3d');
  const [performance, setPerformance] = useState<PerformanceProfile>('balanced');
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>(() => {
    return (localStorage.getItem('pipecad_bg_theme') as BackgroundTheme) || 'white';
  });
  const [selectedDiameter, setSelectedDiameter] = useState<number>(50); // 50mm (2") por defecto
  const [fps, setFps] = useState<number>(60);

  const [pipes, setPipes] = useState<PipeSegment[]>([]);
  const [fittings, setFittings] = useState<PlacedFitting[]>([]);
  const [selectedFitting, setSelectedFitting] = useState<FittingDefinition | null>(null);

  // Estado de planos DXF
  const [currentBlueprint, setCurrentBlueprint] = useState<DxfBlueprint | null>(null);
  const [dxfLoaded, setDxfLoaded] = useState<boolean>(false);
  const [dxfVisible, setDxfVisible] = useState<boolean>(true);
  const [isBlueprintPanelOpen, setIsBlueprintPanelOpen] = useState<boolean>(false);
  const [dxfScale, setDxfScale] = useState<number>(1);
  const [dxfAutoCenter, setDxfAutoCenter] = useState<boolean>(true);
  const [dxfHiddenLayers, setDxfHiddenLayers] = useState<Set<string>>(new Set());
  const [showDxfTexts, setShowDxfTexts] = useState<boolean>(true);

  const [isBomOpen, setIsBomOpen] = useState<boolean>(false);

  const engineRef = useRef<CADEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar una red de tubería demo inicial para que el usuario vea inmediatamente el potencial
  useEffect(() => {
    const timer = setTimeout(() => {
      loadDemoNetwork();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const loadDemoNetwork = () => {
    if (!engineRef.current) return;

    const demoPipes: PipeSegment[] = [];
    const demoFittings: PlacedFitting[] = [];

    // Codo 90° DN50 en esquina (2500, 0, 0) con brazo Larm = 85mm
    const codoDef = AIRPIPE_CATALOG.find((i) => i.id === 'codo_90_dn50');
    const Larm = 85;

    // 1. Tubo principal 1 recortado antes del codo: desde (0, 0, 0) hasta (2415, 0, 0)
    const p1 = { x: 0, y: 0, z: 0 };
    const p1End = { x: 2500 - Larm, y: 0, z: 0 };
    engineRef.current.addPipe(p1, p1End, 50, 'p_main_1');
    demoPipes.push({ id: 'p_main_1', start: p1, end: p1End, diameter: 50, length: 2500 - Larm });

    // Codo 90° colocado exactamente en la esquina conectando boca 1 y boca 2
    if (codoDef) {
      const { geometry, color } = FittingGeometryFactory.createGeometry(codoDef);
      const codoPos = { x: 2500, y: 0, z: Larm };
      const codoRot = { x: 0, y: Math.PI, z: 0 };
      engineRef.current.addFittingMesh(geometry, codoPos, codoRot, color, 'fit_codo_1', codoDef.ports);
      demoFittings.push({
        id: 'fit_codo_1',
        fittingId: codoDef.id,
        position: codoPos,
        rotation: codoRot,
        ports: codoDef.ports,
      });
    }

    // 2. Tee DN50 en (2500, 0, 1200) con bocas de paso en Z (-50 mm y +50 mm) y derivación en X (+70 mm)
    const teeDef = AIRPIPE_CATALOG.find((i) => i.id === 'tee_dn50');
    const teeZ = 1200;
    const teeHalf = 50;

    // Tramo 2A: desde salida del codo (2500, 0, 85) hasta boca de la Tee (2500, 0, 1150)
    const p2aStart = { x: 2500, y: 0, z: Larm };
    const p2aEnd = { x: 2500, y: 0, z: teeZ - teeHalf };
    engineRef.current.addPipe(p2aStart, p2aEnd, 50, 'p_main_2a');
    demoPipes.push({ id: 'p_main_2a', start: p2aStart, end: p2aEnd, diameter: 50, length: (teeZ - teeHalf) - Larm });

    if (teeDef) {
      const { geometry, color } = FittingGeometryFactory.createGeometry(teeDef);
      const teePos = { x: 2500, y: 0, z: teeZ };
      const teeRot = { x: 0, y: Math.PI, z: 0 };
      engineRef.current.addFittingMesh(geometry, teePos, teeRot, color, 'fit_tee_1', teeDef.ports);
      demoFittings.push({
        id: 'fit_tee_1',
        fittingId: teeDef.id,
        position: teePos,
        rotation: teeRot,
        ports: teeDef.ports,
      });
    }

    // Tramo 2B: desde salida de la Tee (2500, 0, 1250) hasta el final (2500, 0, 3000)
    const p2bStart = { x: 2500, y: 0, z: teeZ + teeHalf };
    const p2bEnd = { x: 2500, y: 0, z: 3000 };
    engineRef.current.addPipe(p2bStart, p2bEnd, 50, 'p_main_2b');
    demoPipes.push({ id: 'p_main_2b', start: p2bStart, end: p2bEnd, diameter: 50, length: 3000 - (teeZ + teeHalf) });

    // 3. Ramal derivado: desde boca lateral de la Tee (2430, 0, 1200) hacia (1200, 0, 1200)
    const pBranchStart = { x: 2500 - 70, y: 0, z: teeZ };
    const pBranchEnd = { x: 1200, y: 0, z: teeZ };
    engineRef.current.addPipe(pBranchStart, pBranchEnd, 50, 'p_branch_1');
    demoPipes.push({ id: 'p_branch_1', start: pBranchStart, end: pBranchEnd, diameter: 50, length: 2430 - 1200 });

    setPipes(demoPipes);
    setFittings(demoFittings);
  };

  // Activar colocación interactiva del accesorio seleccionado
  const handleSelectFittingForPlacement = (fitting: FittingDefinition) => {
    setSelectedFitting(fitting);
    setCurrentTool('place_fitting');
  };

  // Carga y procesamiento de plano DXF
  const applyDxfBlueprint = (blueprint: DxfBlueprint) => {
    if (!engineRef.current) return;

    setCurrentBlueprint(blueprint);
    setDxfScale(blueprint.scale);
    setDxfAutoCenter(blueprint.autoCenter);
    setDxfHiddenLayers(new Set());
    setDxfLoaded(true);
    setDxfVisible(true);
    setIsBlueprintPanelOpen(true);

    // 0. Cambiar automáticamente a vista Planta 2D (Top View) como en AutoCAD
    setCameraView('top_2d');
    engineRef.current.setView('top_2d');

    // 1. Renderizar en el motor Three.js con auto-centrado, escala adecuada, bloques y capas
    engineRef.current.renderDxfEntities(blueprint.rawEntities, {
      autoCenter: blueprint.autoCenter,
      centerX: blueprint.bbox.centerX,
      centerY: blueprint.bbox.centerY,
      scale: blueprint.scale,
      blocks: blueprint.blocks,
      layers: blueprint.layers,
    });

    // 2. Expandir rejilla para abarcar el plano
    const span = Math.max(blueprint.bbox.width, blueprint.bbox.height) * blueprint.scale;
    engineRef.current.updateGrid(span);

    // 3. Enfocar cámara automáticamente (Zoom Extents) para que el plano se vea perfectamente centrado
    engineRef.current.zoomToFit(
      blueprint.bbox.width * blueprint.scale,
      blueprint.bbox.height * blueprint.scale,
      blueprint.autoCenter ? undefined : { x: blueprint.bbox.centerX * blueprint.scale, z: blueprint.bbox.centerY * blueprint.scale }
    );
  };

  const handleOpenDxf = async () => {
    if ((window as any).electronAPI?.openDxf) {
      const result = await (window as any).electronAPI.openDxf();
      if (result) {
        const blueprint = DxfService.parseDxfString(result.content, result.name);
        if (blueprint) applyDxfBlueprint(blueprint);
      }
    } else {
      if (fileInputRef.current) fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const blueprint = DxfService.parseDxfString(content, file.name);
      if (blueprint) applyDxfBlueprint(blueprint);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUpdateBlueprintSettings = (updated: {
    autoCenter: boolean;
    scale: number;
    hiddenLayers: Set<string>;
  }) => {
    if (!currentBlueprint || !engineRef.current) return;

    setDxfAutoCenter(updated.autoCenter);
    setDxfScale(updated.scale);
    setDxfHiddenLayers(updated.hiddenLayers);

    engineRef.current.renderDxfEntities(currentBlueprint.rawEntities, {
      autoCenter: updated.autoCenter,
      centerX: currentBlueprint.bbox.centerX,
      centerY: currentBlueprint.bbox.centerY,
      scale: updated.scale,
      blocks: currentBlueprint.blocks,
      hiddenLayers: updated.hiddenLayers,
      layers: currentBlueprint.layers,
    });

    const span = Math.max(currentBlueprint.bbox.width, currentBlueprint.bbox.height) * updated.scale;
    engineRef.current.updateGrid(span);
  };

  const handlePipeAdded = useCallback((newPipe: PipeSegment) => {
    setPipes((prev) => [...prev, newPipe]);
  }, []);

  const handlePipeUpdated = useCallback((updatedPipe: PipeSegment) => {
    setPipes((prev) => prev.map((p) => (p.id === updatedPipe.id ? updatedPipe : p)));
  }, []);

  const handlePipeDeleted = useCallback((pipeId: string) => {
    setPipes((prev) => prev.filter((p) => p.id !== pipeId));
  }, []);

  const handleFittingPlaced = useCallback((newFitting: PlacedFitting) => {
    setFittings((prev) => [...prev, newFitting]);
  }, []);

  const handleFittingUpdated = useCallback((updatedFitting: PlacedFitting) => {
    setFittings((prev) => prev.map((f) => (f.id === updatedFitting.id ? updatedFitting : f)));
  }, []);

  const handleFittingDeleted = useCallback((fittingId: string) => {
    setFittings((prev) => prev.filter((f) => f.id !== fittingId));
  }, []);

  const handleCancelFittingPlacement = useCallback(() => {
    setSelectedFitting(null);
    setCurrentTool('select');
  }, []);

  const handleZoomFit = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.zoomExtents();
  }, []);

  const handleToggleDxfVisible = () => {
    if (!engineRef.current) return;
    const next = !dxfVisible;
    setDxfVisible(next);
    engineRef.current.setDxfVisible(next);
  };

  const handleToggleDxfTexts = () => {
    if (!engineRef.current) return;
    const next = !showDxfTexts;
    setShowDxfTexts(next);
    engineRef.current.setShowDxfTexts(next);
  };

  const handleClearScene = () => {
    if (confirm('¿Desea limpiar toda la red de tuberías y accesorios?')) {
      engineRef.current?.clearScene();
      setPipes([]);
      setFittings([]);
      setSelectedFitting(null);
    }
  };

  const handleToggleBgTheme = useCallback(() => {
    setBgTheme((prev) => {
      const next = prev === 'white' ? 'dark' : 'white';
      localStorage.setItem('pipecad_bg_theme', next);
      engineRef.current?.setBackgroundTheme(next);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#14171c] select-none">
      {/* Barra de herramientas superior */}
      <Toolbar
        currentTool={currentTool}
        onSelectTool={(t) => {
          setCurrentTool(t);
          if (t !== 'place_fitting') {
            setSelectedFitting(null);
          }
        }}
        visualMode={visualMode}
        onSelectVisualMode={setVisualMode}
        cameraView={cameraView}
        onSelectCameraView={setCameraView}
        performance={performance}
        onSelectPerformance={setPerformance}
        bgTheme={bgTheme}
        onToggleBgTheme={handleToggleBgTheme}
        fps={fps}
        dxfLoaded={dxfLoaded}
        dxfVisible={dxfVisible}
        onToggleDxfVisible={handleToggleDxfVisible}
        onOpenBlueprintSettings={() => setIsBlueprintPanelOpen((prev) => !prev)}
        onZoomFit={handleZoomFit}
        onOpenDxf={handleOpenDxf}
        onOpenBOM={() => setIsBomOpen(true)}
        onClearScene={handleClearScene}
      />

      {/* Cuerpo principal: Catálogo lateral + Viewport 3D/2D */}
      <div className="flex flex-1 overflow-hidden relative">
        <CatalogSidebar
          selectedDiameter={selectedDiameter}
          onSelectDiameter={setSelectedDiameter}
          onPlaceFitting={handleSelectFittingForPlacement}
          selectedFittingId={selectedFitting?.id}
        />

        <Viewport
          tool={currentTool}
          visualMode={visualMode}
          cameraView={cameraView}
          performance={performance}
          selectedDiameter={selectedDiameter}
          selectedFitting={selectedFitting}
          bgTheme={bgTheme}
          onToggleBgTheme={handleToggleBgTheme}
          onCancelFittingPlacement={handleCancelFittingPlacement}
          onFpsUpdate={setFps}
          onPipeAdded={handlePipeAdded}
          onPipeUpdated={handlePipeUpdated}
          onPipeDeleted={handlePipeDeleted}
          onFittingPlaced={handleFittingPlaced}
          onFittingUpdated={handleFittingUpdated}
          onFittingDeleted={handleFittingDeleted}
          pipes={pipes}
          fittings={fittings}
          engineRef={engineRef}
          onDblClickZoomFit={handleZoomFit}
        />

        {/* Panel Flotante de Ajustes del Plano DXF */}
        <BlueprintPanel
          blueprint={currentBlueprint}
          isOpen={isBlueprintPanelOpen}
          onClose={() => setIsBlueprintPanelOpen(false)}
          onUpdateBlueprint={handleUpdateBlueprintSettings}
          onZoomFit={handleZoomFit}
          hiddenLayers={dxfHiddenLayers}
          currentScale={dxfScale}
          autoCenter={dxfAutoCenter}
          showTexts={showDxfTexts}
          onToggleShowTexts={handleToggleDxfTexts}
        />
      </div>

      {/* Modal de Lista de Materiales / Despiece (BOM) */}
      <BOMModal
        isOpen={isBomOpen}
        onClose={() => setIsBomOpen(false)}
        pipes={pipes}
        fittings={fittings}
      />

      {/* Input oculto para carga de DXF en modo navegador */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".dxf"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
}
export default App;
