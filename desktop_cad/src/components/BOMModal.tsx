import React from 'react';
import { PipeSegment, PlacedFitting } from '../types/cad';
import { AIRPIPE_CATALOG } from '../catalog/airpipeCatalog';
import { X, Download, Copy, Check, FileSpreadsheet, Package } from 'lucide-react';

interface BOMModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipes: PipeSegment[];
  fittings: PlacedFitting[];
}

export const BOMModal: React.FC<BOMModalProps> = ({
  isOpen,
  onClose,
  pipes,
  fittings,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  // 1. Calcular longitud total de tuberías por diámetro
  const pipeTotals: { [diameter: number]: number } = {};
  pipes.forEach((p) => {
    pipeTotals[p.diameter] = (pipeTotals[p.diameter] || 0) + p.length;
  });

  // 2. Contar accesorios por ID de catálogo
  const fittingTotals: { [fittingId: string]: number } = {};
  fittings.forEach((f) => {
    fittingTotals[f.fittingId] = (fittingTotals[f.fittingId] || 0) + 1;
  });

  // Generar CSV
  const handleExportCsv = () => {
    let csv = 'Codigo,Descripcion,Tipo,Cantidad,Unidad\n';

    Object.entries(pipeTotals).forEach(([d, len]) => {
      const meters = (len / 1000).toFixed(2);
      csv += `AP-PIPE-0${d},"Tuberia Rigida Aluminio ${d}mm (Airpipe)",Tuberia,${meters},Metros\n`;
    });

    Object.entries(fittingTotals).forEach(([id, count]) => {
      const def = AIRPIPE_CATALOG.find((item) => item.id === id);
      if (def) {
        csv += `${def.code},"${def.name}",Accesorio,${count},Piezas\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `despiece_tuberia_pipecad_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopy = () => {
    let text = 'LISTA DE MATERIALES - PIPECAD STUDIO\n';
    text += '--------------------------------------------------\n';
    text += 'TUBERÍA RECTA:\n';
    Object.entries(pipeTotals).forEach(([d, len]) => {
      text += ` - Tubería Aluminio ${d}mm: ${(len / 1000).toFixed(2)} metros\n`;
    });
    text += '\nACCESORIOS Y CONEXIONES:\n';
    Object.entries(fittingTotals).forEach(([id, count]) => {
      const def = AIRPIPE_CATALOG.find((item) => item.id === id);
      if (def) {
        text += ` - [${def.code}] ${def.name}: ${count} pzas\n`;
      }
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-[#1b2028] border border-[#2a323d] rounded-xl shadow-2xl flex flex-col max-h-[85vh] text-[#e1e4e8]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a323d]">
          <div className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">
              Lista de Materiales y Despiece (BOM)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[#242b36] flex items-center justify-center text-[#8b949e] hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido de la Tabla */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Tuberías */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">
              1. Tubería Rígida Requerida
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a323d] text-[#8b949e]">
                  <th className="pb-2">Diámetro</th>
                  <th className="pb-2">Descripción</th>
                  <th className="pb-2 text-right">Longitud Total (m)</th>
                  <th className="pb-2 text-right">Tramos Std (4m / 6m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242b36]">
                {Object.keys(pipeTotals).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-[#8b949e]">
                      No hay tramos de tubería trazados aún.
                    </td>
                  </tr>
                ) : (
                  Object.entries(pipeTotals).map(([d, len]) => {
                    const meters = len / 1000;
                    const bars4m = Math.ceil(meters / 4);
                    return (
                      <tr key={d} className="hover:bg-[#14171c]/50">
                        <td className="py-2 font-mono font-bold text-white">{d} mm</td>
                        <td className="py-2 text-[#cbd5e1]">Tubería Aluminio Calibrada Airpipe</td>
                        <td className="py-2 text-right font-mono text-blue-400 font-semibold">
                          {meters.toFixed(2)} m
                        </td>
                        <td className="py-2 text-right font-mono text-[#8b949e]">
                          ~{bars4m} barras (4m)
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Accesorios */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">
              2. Accesorios y Uniones (Fittings)
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a323d] text-[#8b949e]">
                  <th className="pb-2">Código</th>
                  <th className="pb-2">Accesorio</th>
                  <th className="pb-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242b36]">
                {Object.keys(fittingTotals).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-center text-[#8b949e]">
                      No hay accesorios colocados en la red.
                    </td>
                  </tr>
                ) : (
                  Object.entries(fittingTotals).map(([id, count]) => {
                    const def = AIRPIPE_CATALOG.find((item) => item.id === id);
                    if (!def) return null;
                    return (
                      <tr key={id} className="hover:bg-[#14171c]/50">
                        <td className="py-2 font-mono text-blue-400">{def.code}</td>
                        <td className="py-2 text-[#cbd5e1]">{def.name}</td>
                        <td className="py-2 text-right font-mono font-bold text-white">
                          {count} pzas
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pie de modal con acciones */}
        <div className="px-5 py-4 border-t border-[#2a323d] bg-[#14171c]/50 flex items-center justify-between">
          <div className="text-xs text-[#8b949e]">
            Compatible con sistema de inventario **Almacén 3.0**
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#242b36] hover:bg-[#2e3745] text-xs font-medium text-white transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exportar a Excel / CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
