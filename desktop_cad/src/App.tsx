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
  DxfBlueprint 
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

    // Red de aire comprimido demostrativa DN50
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 2500, y: 0, z: 0 };
    engineRef.current.addPipe(p1, p2, 50, 'p_main_1');
    demoPipes.push({ id: 'p_main_1', start: p1, end: p2, diameter: 50, length: 2500 });

    const codoDef = AIRPIPE_CATALOG.find((i) => i.id === 'codo_90_dn50');
    if (codoDef) {
      const { geometry, color } = FittingGeometryFactory.createGeometry(codoDef);
      engineRef.current.addFittingMesh(geometry, p2, { x: 0, y: 0, z: 0 }, color, 'fit_codo_1', codoDef.ports);
      demoFittings.push({
        id: 'fit_codo_1',
        fittingId: codoDef.id,
        position: p2,
        rotation: { x: 0, y: 0, z: 0 },
        ports: codoDef.ports,
      });
    }

    const p3 = { x: 2500, y: 0, z: 0 };
    const p4 = { x: 2500, y: 0, z: 3000 };
    engineRef.current.addPipe(p3, p4, 50, 'p_main_2');
    demoPipes.push({ id: 'p_main_2', start: p3, end: p4, diameter: 50, length: 3000 });

    const teeDef = AIRPIPE_CATALOG.find((i) => i.id === 'tee_dn50');
    if (teeDef) {
      const { geometry, color } = FittingGeometryFactory.createGeometry(teeDef);
      const teePos = { x: 2500, y: 0, z: 1200 };
      engineRef.current.addFittingMesh(geometry, teePos, { x: 0, y: 0, z: 0 }, color, 'fit_tee_1', teeDef.ports);
      demoFittings.push({
        id: 'fit_tee_1',
        fittingId: teeDef.id,
        position: teePos,
        rotation: { x: 0, y: 0, z: 0 },
        ports: teeDef.ports,
      });
    }

    const p5 = { x: 2500, y: 0, z: 1200 };
    const p6 = { x: 1200, y: 0, z: 1200 };
    engineRef.current.addPipe(p5, p6, 50, 'p_branch_1');
    demoPipes.push({ id: 'p_branch_1', start: p5, end: p6, diameter: 50, length: 700 });

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
