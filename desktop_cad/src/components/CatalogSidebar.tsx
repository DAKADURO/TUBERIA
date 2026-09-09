import React, { useState } from 'react';
import { AIRPIPE_CATALOG } from '../catalog/airpipeCatalog';
import { FittingDefinition } from '../types/cad';
import { Box, Filter, CheckCircle2, ChevronRight, PlusCircle } from 'lucide-react';

interface CatalogSidebarProps {
  selectedDiameter: number;
  onSelectDiameter: (diameter: number) => void;
  onPlaceFitting: (fitting: FittingDefinition) => void;
  selectedFittingId?: string | null;
}

export const CatalogSidebar: React.FC<CatalogSidebarProps> = ({
  selectedDiameter,
  onSelectDiameter,
  onPlaceFitting,
  selectedFittingId,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [diameterFilter, setDiameterFilter] = useState<number | 'all'>('all');

  const categories = [
    { id: 'all', name: 'Todo el Catálogo' },
    { id: 'elbow_90', name: 'Codos 90°' },
    { id: 'elbow_45', name: 'Codos 45°' },
    { id: 'tee', name: 'Tees Iguales' },
    { id: 'coupling', name: 'Coples Unión' },
    { id: 'valve', name: 'Válvulas de Esfera' },
    { id: 'quick_drop', name: 'Quick Drops (Bajadas)' },
    { id: 'flange', name: 'Bridas ANSI' },
    { id: 'cap', name: 'Tapones Finales' },
  ];

  const filteredFittings = AIRPIPE_CATALOG.filter((item) => {
    const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchDiameter = diameterFilter === 'all' || item.nominalDiameter === diameterFilter;
    return matchCategory && matchDiameter;
  });

  return (
    <aside className="w-80 bg-[#1b2028] border-r border-[#2a323d] flex flex-col h-[calc(100vh-3.5rem)] text-[#e1e4e8] select-none">
      {/* 1. CABECERA Y SELECTOR DE DIÁMETRO ACTIVO DE TUBERÍA */}
      <div className="p-3 border-b border-[#2a323d] bg-[#14171c]/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2 flex items-center">
          <Box className="w-3.5 h-3.5 mr-1.5" />
          Diámetro de Tubería Activo
        </h2>
        <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
          {[20, 25, 40, 50, 63, 80].map((d) => (
            <button
              key={d}
              onClick={() => onSelectDiameter(d)}
              className={`py-1.5 rounded text-center transition border ${
                selectedDiameter === d
                  ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-sm'
                  : 'bg-[#1b2028] border-[#2a323d] text-[#8b949e] hover:border-[#3b4756]'
              }`}
            >
              DN{d}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#8b949e] mt-1.5">
          Tubo seleccionado: <span className="text-white font-mono font-medium">{selectedDiameter} mm</span> (Aluminio Airpipe)
        </p>
      </div>

      {/* 2. FILTROS DEL CATÁLOGO */}
      <div className="p-3 border-b border-[#2a323d] space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#8b949e]">
          <span className="flex items-center">
            <Filter className="w-3 h-3 mr-1" />
            Filtrar Accesorios:
          </span>
          <select
            value={diameterFilter}
            onChange={(e) => setDiameterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-[#14171c] border border-[#2a323d] rounded px-1.5 py-0.5 text-white text-xs outline-none"
          >
            <option value="all">Todos los Ø</option>
            <option value="25">25 mm</option>
            <option value="40">40 mm</option>
            <option value="50">50 mm</option>
            <option value="63">63 mm</option>
          </select>
        </div>

        {/* Categorías en chips */}
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition ${
                selectedCategory === cat.id
                  ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                  : 'bg-[#14171c] border border-[#2a323d] text-[#8b949e] hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3. LISTA DE ACCESORIOS DISPONIBLES (PIEZAS STEP) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        <div className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
          Piezas del Catálogo ({filteredFittings.length})
        </div>

        {filteredFittings.map((fitting) => {
          const isSelected = selectedFittingId === fitting.id;
          return (
            <div
              key={fitting.id}
              className={`p-2.5 rounded-lg transition group cursor-pointer border ${
                isSelected
                  ? 'bg-blue-950/60 border-cyan-400 ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/20'
                  : 'bg-[#14171c] border-[#2a323d] hover:border-blue-500/60'
              }`}
              onClick={() => onPlaceFitting(fitting)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className={`text-xs font-medium transition ${isSelected ? 'text-cyan-300 font-bold' : 'text-white group-hover:text-blue-400'}`}>
                    {fitting.name}
                  </h3>
                  <span className="font-mono text-[10px] text-blue-400">{fitting.code}</span>
                </div>
                <button
                  title={isSelected ? 'Accesorio activo en el cursor' : 'Seleccionar para colocar en la escena'}
                  className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
                    isSelected ? 'bg-cyan-500 text-black' : 'bg-[#242b36] group-hover:bg-blue-600 text-white'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  ) : (
                    <PlusCircle className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {isSelected && (
                <div className="mt-1.5 py-1 px-2 rounded bg-cyan-950/80 border border-cyan-500/40 text-[10px] text-cyan-300 font-bold flex items-center animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 mr-1.5"></span>
                  ACTIVO: Clic en el dibujo para colocar
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-[10px] text-[#8b949e]">
                <span>Puertos: {fitting.ports.length}</span>
                <span>Dim: {fitting.dimensions.length}x{fitting.dimensions.width} mm</span>
              </div>

              {fitting.stepFileName && (
                <div className="mt-1 text-[9px] text-[#8b949e] font-mono truncate">
                  STEP: {fitting.stepFileName}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
