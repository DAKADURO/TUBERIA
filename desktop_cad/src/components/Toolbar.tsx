import React from 'react';
import { 
  ToolMode, 
  VisualMode, 
  CameraView, 
  PerformanceProfile,
  BackgroundTheme
} from '../types/cad';
import { 
  MousePointer, 
  Network, 
  Ruler, 
  Trash2, 
  Eye, 
  Box, 
  FileCode, 
  Cpu, 
  FileText, 
  Layers, 
  Compass, 
  Save, 
  FolderOpen,
  Maximize2,
  Sun,
  Moon
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  visualMode: VisualMode;
  onSelectVisualMode: (mode: VisualMode) => void;
  cameraView: CameraView;
  onSelectCameraView: (view: CameraView) => void;
  performance: PerformanceProfile;
  onSelectPerformance: (perf: PerformanceProfile) => void;
  bgTheme?: BackgroundTheme;
  onToggleBgTheme?: () => void;
  fps: number;
  dxfLoaded: boolean;
  dxfVisible: boolean;
  onToggleDxfVisible: () => void;
  onOpenBlueprintSettings?: () => void;
  onZoomFit?: () => void;
  onOpenDxf: () => void;
  onOpenBOM: () => void;
  onClearScene: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  visualMode,
  onSelectVisualMode,
  cameraView,
  onSelectCameraView,
  performance,
  onSelectPerformance,
  bgTheme = 'white',
  onToggleBgTheme,
  fps,
  dxfLoaded,
  dxfVisible,
  onToggleDxfVisible,
  onOpenBlueprintSettings,
  onZoomFit,
  onOpenDxf,
  onOpenBOM,
  onClearScene,
}) => {
  return (
    <header className="h-14 bg-[#1b2028] border-b border-[#2a323d] flex items-center justify-between px-3 text-xs text-[#e1e4e8] select-none z-10">
      {/* 1. LOGO Y NOMBRE */}
      <div className="flex items-center space-x-3 pr-4 border-r border-[#2a323d]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
          <Network className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-white leading-none">PipeCAD Studio</h1>
          <span className="text-[10px] text-blue-400 font-mono">CAD Tuberías 2D/3D</span>
        </div>
      </div>

      {/* 2. HERRAMIENTAS DE DIBUJO Y ACCIONES */}
      <div className="flex items-center space-x-1 px-3 border-r border-[#2a323d]">
        <button
          onClick={() => onSelectTool('select')}
          title="Seleccionar / Inspeccionar (V)"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition ${
            currentTool === 'select'
              ? 'bg-blue-600 text-white font-medium shadow-sm'
              : 'hover:bg-[#242b36] text-[#8b949e]'
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span>Seleccionar</span>
        </button>

        <button
          onClick={() => onSelectTool('route_pipe')}
          title="Trazar Tubería Continua (T)"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition ${
            currentTool === 'route_pipe'
              ? 'bg-blue-600 text-white font-medium shadow-sm'
              : 'hover:bg-[#242b36] text-[#8b949e]'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Trazar Tubería</span>
        </button>

        <button
          onClick={() => onSelectTool('measure')}
          title="Medir Distancias (M)"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition ${
            currentTool === 'measure'
              ? 'bg-blue-600 text-white font-medium shadow-sm'
              : 'hover:bg-[#242b36] text-[#8b949e]'
          }`}
        >
          <Ruler className="w-4 h-4" />
          <span>Medir</span>
        </button>

        <button
          onClick={onClearScene}
          title="Limpiar Red de Tuberías"
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md hover:bg-red-500/20 text-red-400 transition ml-2"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 3. VISTAS DE CÁMARA (2D / 3D) */}
      <div className="flex items-center space-x-1 px-3 border-r border-[#2a323d]">
        <span className="text-[11px] text-[#8b949e] mr-1 flex items-center">
          <Compass className="w-3.5 h-3.5 mr-1" />
          Vista:
        </span>
        <select
          value={cameraView}
          onChange={(e) => onSelectCameraView(e.target.value as CameraView)}
          className="bg-[#14171c] border border-[#2a323d] rounded-md px-2 py-1 text-[#e1e4e8] outline-none focus:border-blue-500 font-mono"
        >
          <option value="perspective_3d">3D Perspectiva</option>
          <option value="top_2d">Planta 2D (Superior)</option>
          <option value="front_2d">Alzado 2D (Frontal)</option>
          <option value="side_2d">Lateral 2D (Perfil)</option>
        </select>
      </div>

      {/* 4. SELECTOR DE ESTILOS VISUALES (CAD PERFORMANCE MODES) */}
      <div className="flex items-center space-x-1 px-3 border-r border-[#2a323d]">
        <span className="text-[11px] text-[#8b949e] mr-1 flex items-center">
          <Eye className="w-3.5 h-3.5 mr-1" />
          Estilo:
        </span>
        <select
          value={visualMode}
          onChange={(e) => onSelectVisualMode(e.target.value as VisualMode)}
          className="bg-[#14171c] border border-[#2a323d] rounded-md px-2 py-1 text-[#e1e4e8] outline-none focus:border-blue-500"
        >
          <option value="wireframe">Alámbrico (Wireframe)</option>
          <option value="hidden_line">Líneas Ocultas (Técnico)</option>
          <option value="flat">Sombreado Plano (Flat)</option>
          <option value="shaded_edges">Sombreado con Aristas (CAD)</option>
          <option value="realistic">Realista Metálico (PBR)</option>
        </select>
      </div>

      {/* 5. PLANO 2D DXF & BOM */}
      <div className="flex items-center space-x-2 px-3 border-r border-[#2a323d]">
        <button
          onClick={onOpenDxf}
          title="Cargar Plano Técnico AutoCAD (DXF)"
          className="flex items-center space-x-1.5 bg-[#242b36] hover:bg-[#2e3745] px-2.5 py-1.5 rounded-md text-[#e1e4e8] transition"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>Plano DXF</span>
        </button>

        {dxfLoaded && (
          <>
            <button
              onClick={onToggleDxfVisible}
              title="Activar/Ocultar capa de plano de fondo"
              className={`px-2 py-1.5 rounded-md text-[11px] transition ${
                dxfVisible ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-gray-700/50 text-gray-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5 inline mr-1" />
              {dxfVisible ? 'Visible' : 'Oculto'}
            </button>

            <button
              onClick={onOpenBlueprintSettings}
              title="Ajustes de Plano (Centrar, Escala, Capas)"
              className="flex items-center space-x-1 px-2 py-1.5 rounded-md bg-[#242b36] hover:bg-[#2e3745] text-amber-300 transition text-[11px]"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Ajustes Plano</span>
            </button>

            <button
              onClick={onZoomFit}
              title="Enfocar Plano Completo en Pantalla (Zoom Extents)"
              className="flex items-center space-x-1 px-2 py-1.5 rounded-md bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 transition text-[11px]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Enfocar</span>
            </button>
          </>
        )}

        <button
          onClick={onOpenBOM}
          title="Ver Lista de Materiales y Despiece (BOM)"
          className="flex items-center space-x-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-2.5 py-1.5 rounded-md transition"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Despiece (BOM)</span>
        </button>

        {onToggleBgTheme && (
          <button
            onClick={onToggleBgTheme}
            title="Alternar fondo del lienzo CAD (Blanco / Oscuro)"
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition text-xs border cursor-pointer ${
              bgTheme === 'white'
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30'
                : 'bg-[#242b36] hover:bg-[#2e3745] text-[#8b949e] border-[#2a323d] hover:text-white'
            }`}
          >
            {bgTheme === 'white' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white">Fondo: Blanco</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-400" />
                <span>Fondo: Oscuro</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* 6. MONITOR DE RENDIMIENTO / FPS / GPU */}
      <div className="flex items-center space-x-3 pl-2">
        <div className="flex items-center space-x-1.5 bg-[#14171c] px-2 py-1 rounded border border-[#2a323d]">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-emerald-400 font-bold">{fps}</span>
          <span className="text-[10px] text-[#8b949e]">FPS</span>
        </div>

        <select
          value={performance}
          onChange={(e) => onSelectPerformance(e.target.value as PerformanceProfile)}
          className="bg-[#14171c] border border-[#2a323d] rounded-md px-2 py-1 text-[11px] text-[#8b949e] outline-none"
        >
          <option value="eco">Perfil: Ahorro GPU</option>
          <option value="balanced">Perfil: Equilibrado</option>
          <option value="ultra">Perfil: Ultra Calidad</option>
        </select>
      </div>
    </header>
  );
};
