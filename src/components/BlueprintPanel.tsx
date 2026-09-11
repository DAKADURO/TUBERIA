import React from 'react';
import { DxfBlueprint } from '../types/cad';
import { 
  Layers, 
  Maximize2, 
  Target, 
  Ruler, 
  Eye, 
  EyeOff, 
  X, 
  FileCode, 
  RotateCcw,
  Type 
} from 'lucide-react';

interface BlueprintPanelProps {
  blueprint: DxfBlueprint | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateBlueprint: (updated: {
    autoCenter: boolean;
    scale: number;
    hiddenLayers: Set<string>;
  }) => void;
  onZoomFit: () => void;
  hiddenLayers: Set<string>;
  currentScale: number;
  autoCenter: boolean;
  showTexts?: boolean;
  onToggleShowTexts?: () => void;
}

export const BlueprintPanel: React.FC<BlueprintPanelProps> = ({
  blueprint,
  isOpen,
  onClose,
  onUpdateBlueprint,
  onZoomFit,
  hiddenLayers,
  currentScale,
  autoCenter,
  showTexts = true,
  onToggleShowTexts,
}) => {
  if (!isOpen || !blueprint) return null;

  const realWidthMm = blueprint.bbox.width * currentScale;
  const realHeightMm = blueprint.bbox.height * currentScale;
  const widthMeters = (realWidthMm / 1000).toFixed(2);
  const heightMeters = (realHeightMm / 1000).toFixed(2);

  const handleToggleLayer = (layerName: string) => {
    const next = new Set(hiddenLayers);
    if (next.has(layerName)) {
      next.delete(layerName);
    } else {
      next.add(layerName);
    }
    onUpdateBlueprint({
      autoCenter,
      scale: currentScale,
      hiddenLayers: next,
    });
  };

  const handleScaleChange = (newScale: number) => {
    onUpdateBlueprint({
      autoCenter,
      scale: newScale,
      hiddenLayers,
    });
  };

  const handleToggleCenter = () => {
    onUpdateBlueprint({
      autoCenter: !autoCenter,
      scale: currentScale,
      hiddenLayers,
    });
  };

  return (
    <div className="absolute top-16 right-4 z-40 w-96 bg-[#1b2028]/95 backdrop-blur-md border border-[#2a323d] rounded-xl shadow-2xl flex flex-col max-h-[80vh] text-[#e1e4e8] select-none">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a323d]">
        <div className="flex items-center space-x-2">
          <FileCode className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-white truncate max-w-[220px]">
            {blueprint.fileName}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded hover:bg-[#242b36] flex items-center justify-center text-[#8b949e] hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
        {/* Dimensiones Calculadas */}
        <div className="bg-[#14171c] p-3 rounded-lg border border-[#2a323d]">
          <div className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold mb-1 flex items-center">
            <Ruler className="w-3 h-3 mr-1 text-blue-400" />
            Dimensiones del Plano
          </div>
          <div className="font-mono text-sm font-bold text-white">
            {widthMeters} m <span className="text-[#8b949e] font-normal">×</span> {heightMeters} m
          </div>
          <div className="text-[10px] text-[#8b949e] mt-1">
            ({realWidthMm.toLocaleString()} × {realHeightMm.toLocaleString()} mm)
          </div>
        </div>

        {/* 1. AUTO-CENTRADO */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-white flex items-center">
              <Target className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Centrar en el Origen (0,0)
            </span>
            <button
              onClick={handleToggleCenter}
              className={`w-10 h-5 rounded-full transition relative ${
                autoCenter ? 'bg-emerald-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${
                  autoCenter ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-[#8b949e] leading-relaxed">
            {autoCenter
              ? 'El plano está centrado en tu rejilla de trabajo para diseñar cómodamente.'
              : `Coordenadas originales de AutoCAD: (${Math.round(blueprint.bbox.centerX)}, ${Math.round(blueprint.bbox.centerY)}).`}
          </p>
        </div>

        {/* 1.1 MOSTRAR TEXTOS Y COTAS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-white flex items-center">
              <Type className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              Textos y Cotas del Plano
            </span>
            <button
              onClick={onToggleShowTexts}
              className={`w-10 h-5 rounded-full transition relative ${
                showTexts ? 'bg-cyan-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${
                  showTexts ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-[#8b949e] leading-relaxed">
            {showTexts
              ? 'Muestra las cotas, diámetros de tubería y textos originales del DXF con alta nitidez.'
              : 'Textos ocultos para una vista limpia.'}
          </p>
        </div>

        {/* 2. ESCALA Y UNIDADES */}
        <div className="space-y-1.5">
          <label className="font-medium text-white flex items-center">
            <Ruler className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Escala / Unidades de Dibujo
          </label>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <button
              onClick={() => handleScaleChange(1000)}
              className={`py-1.5 px-2 rounded border text-center transition ${
                currentScale === 1000
                  ? 'bg-blue-600 border-blue-400 text-white font-bold'
                  : 'bg-[#14171c] border-[#2a323d] text-[#8b949e] hover:border-[#3b4756]'
              }`}
            >
              Metros (×1000)
            </button>
            <button
              onClick={() => handleScaleChange(1)}
              className={`py-1.5 px-2 rounded border text-center transition ${
                currentScale === 1
                  ? 'bg-blue-600 border-blue-400 text-white font-bold'
                  : 'bg-[#14171c] border-[#2a323d] text-[#8b949e] hover:border-[#3b4756]'
              }`}
            >
              Milímetros (1:1)
            </button>
            <button
              onClick={() => handleScaleChange(100)}
              className={`py-1.5 px-2 rounded border text-center transition ${
                currentScale === 100
                  ? 'bg-blue-600 border-blue-400 text-white font-bold'
                  : 'bg-[#14171c] border-[#2a323d] text-[#8b949e] hover:border-[#3b4756]'
              }`}
            >
              Centímetros (×100)
            </button>
            <button
              onClick={() => handleScaleChange(25.4)}
              className={`py-1.5 px-2 rounded border text-center transition ${
                currentScale === 25.4
                  ? 'bg-blue-600 border-blue-400 text-white font-bold'
                  : 'bg-[#14171c] border-[#2a323d] text-[#8b949e] hover:border-[#3b4756]'
              }`}
            >
              Pulgadas (×25.4)
            </button>
          </div>
        </div>

        {/* 3. BOTÓN ENFOCAR (ZOOM EXTENTS) */}
        <button
          onClick={onZoomFit}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold flex items-center justify-center space-x-2 transition shadow-md shadow-blue-500/20"
        >
          <Maximize2 className="w-4 h-4" />
          <span>Enfocar Plano Completo (Zoom Extents)</span>
        </button>

        {/* 4. CAPAS DEL PLANO (LAYERS) */}
        <div className="space-y-2 pt-2 border-t border-[#2a323d]">
          <div className="flex items-center justify-between text-[11px] text-[#8b949e] font-semibold uppercase tracking-wider">
            <span className="flex items-center">
              <Layers className="w-3 h-3 mr-1" />
              Capas del Plano ({blueprint.layers.length})
            </span>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {blueprint.layers.map((layer) => {
              const isHidden = hiddenLayers.has(layer.name);
              return (
                <div
                  key={layer.name}
                  onClick={() => handleToggleLayer(layer.name)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition ${
                    isHidden
                      ? 'bg-[#14171c]/40 text-[#8b949e]/60'
                      : 'bg-[#14171c] hover:bg-[#242b36] text-[#e1e4e8]'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: layer.color || '#007acc' }}
                    />
                    <span className="font-mono text-[11px] truncate">{layer.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-[#8b949e] font-mono">
                      {layer.entityCount} ent.
                    </span>
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5 text-gray-500" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
