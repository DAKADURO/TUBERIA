import DxfParser from 'dxf-parser';
import { DxfBlueprint, DxfLayerInfo } from '../types/cad';

export class DxfService {
  public static parseDxfString(dxfContent: string, fileName: string): DxfBlueprint | null {
    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);

      if (!dxf || !dxf.entities) {
        console.warn('El archivo DXF no contiene entidades válidas.');
        return null;
      }

      // 1. Procesar capas (layers)
      const layerMap = new Map<string, DxfLayerInfo>();
      if (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) {
        Object.entries(dxf.tables.layer.layers).forEach(([name, l]: [string, any]) => {
          layerMap.set(name, {
            name,
            color: l.color ? `#${(l.color & 0x00ffffff).toString(16).padStart(6, '0')}` : '#007acc',
            visible: true,
            entityCount: 0,
          });
        });
      }

      // 2. Calcular Bounding Box exhaustivo para todas las entidades
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      const updateBBox = (x: number, y: number) => {
        if (!isNaN(x) && isFinite(x)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
        if (!isNaN(y) && isFinite(y)) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      };

      dxf.entities.forEach((entity: any) => {
        if (entity.layer) {
          if (!layerMap.has(entity.layer)) {
            layerMap.set(entity.layer, {
              name: entity.layer,
              color: '#007acc',
              visible: true,
              entityCount: 0,
            });
          }
          layerMap.get(entity.layer)!.entityCount++;
        }

        switch (entity.type) {
          case 'LINE':
            if (entity.vertices && entity.vertices.length >= 2) {
              updateBBox(entity.vertices[0].x, entity.vertices[0].y);
              updateBBox(entity.vertices[1].x, entity.vertices[1].y);
            }
            break;

          case 'LWPOLYLINE':
          case 'POLYLINE':
            if (entity.vertices) {
              entity.vertices.forEach((v: any) => updateBBox(v.x, v.y));
            }
            break;

          case 'CIRCLE':
          case 'ARC':
            if (entity.center && entity.radius) {
              updateBBox(entity.center.x - entity.radius, entity.center.y - entity.radius);
              updateBBox(entity.center.x + entity.radius, entity.center.y + entity.radius);
            }
            break;

          case 'ELLIPSE':
            if (entity.center && entity.majorAxisEndPoint) {
              const r = Math.sqrt(entity.majorAxisEndPoint.x ** 2 + entity.majorAxisEndPoint.y ** 2);
              updateBBox(entity.center.x - r, entity.center.y - r);
              updateBBox(entity.center.x + r, entity.center.y + r);
            }
            break;

          case 'INSERT':
            if (entity.position) {
              updateBBox(entity.position.x, entity.position.y);
            }
            break;

          case 'TEXT':
          case 'MTEXT':
          case 'ATTDEF': {
            const pos = entity.startPoint || entity.position || entity.endPoint;
            if (pos) {
              updateBBox(pos.x, pos.y);
            }
            break;
          }
        }
      });

      // Validar si encontramos coordenadas válidas
      if (!isFinite(minX) || !isFinite(maxX)) {
        minX = -1000;
        maxX = 1000;
        minY = -1000;
        maxY = 1000;
      }

      const width = maxX - minX;
      const height = maxY - minY;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // 3. Detección Inteligente de Unidades
      // En planos de arquitectura/naves dibujados en metros, las cotas típicas están entre 5m y 400m
      // Si el ancho es menor a 500, casi con certeza fue dibujado en METROS y debe escalarse x1000 a milímetros
      let detectedUnit: 'm' | 'mm' | 'in' = 'mm';
      let defaultScale = 1;

      if (width > 0 && width <= 500) {
        detectedUnit = 'm';
        defaultScale = 1000; // 1 metro = 1000 mm
      } else if (width > 500) {
        detectedUnit = 'mm';
        defaultScale = 1;
      }

      return {
        fileName,
        layers: Array.from(layerMap.values()),
        bbox: {
          minX,
          minY,
          maxX,
          maxY,
          width,
          height,
          centerX,
          centerY,
        },
        detectedUnit,
        scale: defaultScale,
        autoCenter: true, // Centrar automáticamente en el origen (0,0) por defecto
        rawEntities: dxf.entities,
        blocks: dxf.blocks,
      };
    } catch (err) {
      console.error('Error al analizar archivo DXF:', err);
      return null;
    }
  }
}

/**
 * Limpieza profesional de texto y formatos especiales de AutoCAD (MTEXT y TEXT)
 */
export function cleanDxfText(rawText: string): string {
  if (!rawText) return '';
  let text = String(rawText);

  // 1. Símbolos especiales clásicos de AutoCAD
  text = text.replace(/%%c/gi, 'Ø');  // Diámetro
  text = text.replace(/%%d/gi, '°');  // Grados
  text = text.replace(/%%p/gi, '±');  // Tolerancia más/menos
  text = text.replace(/%%u/gi, '');   // Subrayado
  text = text.replace(/%%o/gi, '');   // Sobrerayado
  text = text.replace(/%%%/g, '%');

  // 2. Saltos de párrafo MTEXT (\P o \p)
  text = text.replace(/\\P/gi, '\n');

  // 3. Limpieza de secuencias de formato MTEXT:
  // Fuentes: {\fArial|b0|i0|c0|p34;Texto} -> Texto
  text = text.replace(/\\f[^;]+;/gi, '');
  // Códigos de formato de alineación, color, altura, inclinación: \A1;, \C1;, \H2.5;, \W1.0;, \Q0;, \T0;
  text = text.replace(/\\[A-Za-z0-9]+;?/g, '');
  // Fracciones apiladas: \S1/2; o \S1#2; o \S1^2; -> 1/2
  text = text.replace(/\\S([^;^#]+)[\^#]([^;]*);/gi, '$1/$2');
  // Quitar llaves de agrupamiento { }
  text = text.replace(/[{}]/g, '');

  return text.trim();
}
