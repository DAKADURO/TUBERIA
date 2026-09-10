import React, { useEffect, useRef, useState } from 'react';
import { CADEngine } from '../core/cadEngine';
import { 
  VisualMode, 
  CameraView, 
  PerformanceProfile, 
  ToolMode, 
  PipeSegment, 
  PlacedFitting, 
  ConnectionPort,
  Vector3D,
  SnapResult,
  FittingDefinition
} from '../types/cad';
import * as THREE from 'three';
import { FittingGeometryFactory } from '../core/fittingGeometryFactory';
import { AIRPIPE_CATALOG } from '../catalog/airpipeCatalog';
import { Crosshair, Move, RotateCw, RotateCcw, ZoomIn, Ruler, Compass, Zap, Box, Trash2 } from 'lucide-react';

interface ViewportProps {
  tool: ToolMode;
  visualMode: VisualMode;
  cameraView: CameraView;
  performance: PerformanceProfile;
  selectedDiameter: number;
  selectedFitting: FittingDefinition | null;
  onFpsUpdate: (fps: number) => void;
  onPipeAdded: (pipe: PipeSegment) => void;
  onPipeUpdated?: (pipe: PipeSegment) => void;
  onPipeDeleted?: (pipeId: string) => void;
  onFittingPlaced: (fitting: PlacedFitting) => void;
  onFittingUpdated?: (fitting: PlacedFitting) => void;
  onFittingDeleted?: (fittingId: string) => void;
  onCancelFittingPlacement?: () => void;
  pipes: PipeSegment[];
  fittings: PlacedFitting[];
  engineRef: React.MutableRefObject<CADEngine | null>;
  onDblClickZoomFit?: () => void;
}

export const Viewport: React.FC<ViewportProps> = React.memo(({
  tool,
  visualMode,
  cameraView,
  performance,
  selectedDiameter,
  selectedFitting,
  onFpsUpdate,
  onPipeAdded,
  onPipeUpdated,
  onPipeDeleted,
  onFittingPlaced,
  onFittingUpdated,
  onFittingDeleted,
  onCancelFittingPlacement,
  pipes,
  fittings,
  engineRef,
  onDblClickZoomFit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState<SnapResult | null>(null);
  const coordXRef = useRef<HTMLSpanElement>(null);
  const coordZRef = useRef<HTMLSpanElement>(null);
  const routingDistanceRef = useRef<HTMLSpanElement>(null);
  const liveMeasureDistanceRef = useRef<HTMLSpanElement>(null);
  const [routingStart, setRoutingStart] = useState<Vector3D | null>(null);
  const [isOrtho, setIsOrtho] = useState<boolean>(true); // Modo Ortogonal
  const [isAutoTraceLine, setIsAutoTraceLine] = useState<boolean>(true); // Auto-trazar líneas del plano en 1 clic
  const [currentDistance, setCurrentDistance] = useState<number>(0);

  // Estados de orientación de accesorios (rotación continua 3D con roll y plano)
  const [fittingRoll, setFittingRoll] = useState<number>(0); // 0: derecha, PI: izquierda, PI/2: arriba, -PI/2: abajo
  const [fittingPlane, setFittingPlane] = useState<'horizontal' | 'vertical'>('horizontal');
  const [isRollManual, setIsRollManual] = useState<boolean>(false);
  const [freeAngle, setFreeAngle] = useState<number>(0);
  const [selectedPlacedFittingId, setSelectedPlacedFittingId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);

  // Estados de Medición CAD interactiva
  const [measureStart, setMeasureStart] = useState<Vector3D | null>(null);
  const [measureResult, setMeasureResult] = useState<{
    p1: Vector3D;
    p2: Vector3D;
    distance: number;
    dx: number;
    dz: number;
  } | null>(null);
  const [liveMeasureDistance, setLiveMeasureDistance] = useState<number>(0);

  const measureStartRef = useRef<Vector3D | null>(null);
  useEffect(() => {
    measureStartRef.current = measureStart;
  }, [measureStart]);

  const fittingRollRef = useRef<number>(0);
  const fittingPlaneRef = useRef<'horizontal' | 'vertical'>('horizontal');
  const isRollManualRef = useRef<boolean>(false);
  const freeAngleRef = useRef<number>(0);
  const selectedPlacedFittingRef = useRef<string | null>(null);
  const selectedPipeRef = useRef<string | null>(null);

  const pipesRef = useRef<PipeSegment[]>(pipes);
  useEffect(() => {
    pipesRef.current = pipes;
  }, [pipes]);

  // Estados de Alineación Inteligente y Simetría en tiempo real
  const [alignmentTrackingInfo, setAlignmentTrackingInfo] = useState<{
    text: string;
    length: number;
    refPoint: Vector3D;
  } | null>(null);
  const alignmentTrackingRef = useRef<{
    text: string;
    length: number;
    refPoint: Vector3D;
  } | null>(null);

  const fittingRotationRef = useRef<Vector3D>({ x: 0, y: 0, z: 0 });

  const toolRef = useRef<ToolMode>(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const selectedFittingRef = useRef<FittingDefinition | null>(selectedFitting);
  useEffect(() => {
    selectedFittingRef.current = selectedFitting;
    if (!selectedFitting && engineRef.current) {
      engineRef.current.updatePreviewFitting(null, null, null);
    }
  }, [selectedFitting]);

  const worldCoordRef = useRef<Vector3D>({ x: 0, y: 0, z: 0 });
  const currentSnapRef = useRef<SnapResult | null>(null);
  const routingStartRef = useRef<Vector3D | null>(null);
  const isOrthoRef = useRef<boolean>(true);
  const isAutoTraceLineRef = useRef<boolean>(true);
  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    routingStartRef.current = routingStart;
  }, [routingStart]);

  useEffect(() => {
    isOrthoRef.current = isOrtho;
  }, [isOrtho]);

  useEffect(() => {
    isAutoTraceLineRef.current = isAutoTraceLine;
  }, [isAutoTraceLine]);

  const selectedDiameterRef = useRef<number>(selectedDiameter);
  useEffect(() => {
    selectedDiameterRef.current = selectedDiameter;
  }, [selectedDiameter]);

  const computeFittingPlacementRotation = (
    snap: SnapResult | null,
    cursorPos: Vector3D
  ): { rotation: Vector3D; quaternion: THREE.Quaternion; cornerPlacePos?: Vector3D } => {
    // Si se hace snap a una esquina de tuberías o del plano DXF:
    if ((snap?.type === 'pipe_corner' || snap?.type === 'dxf_corner') && snap.cornerInfo) {
      const { V, u1, u2, s } = snap.cornerInfo;
      const fitting = selectedFittingRef.current;
      const Larm = fitting?.ports[1]?.position.x || 50;

      const vU1 = new THREE.Vector3(u1.x, 0, u1.z).normalize();
      const vU2 = new THREE.Vector3(u2.x, 0, u2.z).normalize();

      let basisX: THREE.Vector3;
      let basisZ: THREE.Vector3;
      let cornerPlacePos: Vector3D;

      if (s > 0) {
        // Giro hacia la derecha
        cornerPlacePos = {
          x: V.x - Larm * vU1.x,
          y: V.y,
          z: V.z - Larm * vU1.z,
        };
        basisX = vU2.clone();
        basisZ = vU1.clone();
      } else {
        // Giro hacia la izquierda
        cornerPlacePos = {
          x: V.x + Larm * vU2.x,
          y: V.y,
          z: V.z + Larm * vU2.z,
        };
        basisX = vU1.clone().negate();
        basisZ = vU2.clone().negate();
      }

      const basisY = new THREE.Vector3(0, 1, 0);
      const matrix = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
      const q = new THREE.Quaternion().setFromRotationMatrix(matrix);

      if (isRollManualRef.current && fittingRollRef.current !== 0) {
        const qRoll = new THREE.Quaternion().setFromAxisAngle(basisZ, fittingRollRef.current);
        q.premultiply(qRoll);
      }

      const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      return {
        rotation: { x: euler.x, y: euler.y, z: euler.z },
        quaternion: q,
        cornerPlacePos,
      };
    }

    let baseAngle = 0;
    if (snap?.pipeAngle !== undefined) {
      baseAngle = snap.pipeAngle;
    } else {
      baseAngle = freeAngleRef.current;
    }

    let roll = fittingRollRef.current;

    // Si está sobre el cuerpo o extremo de una tubería o línea del plano DXF y el usuario no fijó manualmente el lado:
    if (
      (snap?.type === 'pipe_end' ||
        snap?.type === 'pipe_body' ||
        snap?.type === 'dxf_endpoint' ||
        snap?.type === 'dxf_line' ||
        snap?.type === 'dxf_midpoint') &&
      snap.pipeDirection &&
      !isRollManualRef.current
    ) {
      const dx = cursorPos.x - snap.point.x;
      const dz = cursorPos.z - snap.point.z;
      if (Math.hypot(dx, dz) > 5) {
        const u = snap.pipeDirection;
        const cross = u.z * dx - u.x * dz;
        if (fittingPlaneRef.current === 'horizontal') {
          roll = cross >= 0 ? 0 : Math.PI;
        } else {
          roll = Math.PI / 2;
        }
        fittingRollRef.current = roll;
      }
    }

    let cornerPlacePos: Vector3D | undefined;
    const isElbow = selectedFittingRef.current?.category === 'elbow_90' || selectedFittingRef.current?.category === 'elbow_45';
    if ((snap?.type === 'pipe_end' || snap?.type === 'dxf_endpoint') && isElbow && snap.pipeDirection) {
      const Larm = selectedFittingRef.current?.ports[1]?.position.x || 50;
      const isPipeStart = snap.pipeInfo?.projectionT === 0;
      const u = snap.pipeDirection;
      if (isPipeStart) {
        cornerPlacePos = {
          x: snap.point.x + Larm * u.x,
          y: snap.point.y,
          z: snap.point.z + Larm * u.z,
        };
        baseAngle += Math.PI;
      } else {
        cornerPlacePos = {
          x: snap.point.x - Larm * u.x,
          y: snap.point.y,
          z: snap.point.z - Larm * u.z,
        };
      }
    }

    const qBase = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseAngle);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
    const q = qBase.clone().multiply(qRoll);
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return {
      rotation: { x: euler.x, y: euler.y, z: euler.z },
      quaternion: q,
      cornerPlacePos,
    };
  };

  const updateGhostPreview = () => {
    if (toolRef.current === 'place_fitting' && selectedFittingRef.current && engineRef.current) {
      const snap = currentSnapRef.current;
      const { rotation, cornerPlacePos } = computeFittingPlacementRotation(snap, worldCoordRef.current);
      const placePos = ((snap?.type === 'pipe_corner' || snap?.type === 'dxf_corner') && cornerPlacePos)
        ? cornerPlacePos
        : (snap ? snap.point : worldCoordRef.current);
      const { geometry } = FittingGeometryFactory.createGeometry(selectedFittingRef.current);
      fittingRotationRef.current = rotation;
      engineRef.current.updatePreviewFitting(
        geometry,
        placePos,
        rotation,
        selectedFittingRef.current.id
      );
    }
  };

  const rotatePlacementRoll = (delta: number) => {
    setIsRollManual(true);
    isRollManualRef.current = true;
    if (currentSnapRef.current?.pipeAngle !== undefined) {
      setFittingRoll((prev) => {
        const next = (prev + delta) % (Math.PI * 2);
        fittingRollRef.current = next;
        updateGhostPreview();
        return next;
      });
    } else {
      setFreeAngle((prev) => {
        const next = (prev + delta) % (Math.PI * 2);
        freeAngleRef.current = next;
        updateGhostPreview();
        return next;
      });
    }
  };

  const invertPlacementSide = () => {
    setIsRollManual(true);
    isRollManualRef.current = true;
    setFittingRoll((prev) => {
      let next = prev;
      if (fittingPlaneRef.current === 'horizontal') {
        next = Math.abs(prev) < 0.1 ? Math.PI : 0;
      } else {
        next = prev > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      fittingRollRef.current = next;
      updateGhostPreview();
      return next;
    });
  };

  const togglePlacementPlane = () => {
    setIsRollManual(true);
    isRollManualRef.current = true;
    setFittingPlane((prev) => {
      const nextPlane = prev === 'horizontal' ? 'vertical' : 'horizontal';
      fittingPlaneRef.current = nextPlane;
      const nextRoll = nextPlane === 'vertical' ? Math.PI / 2 : 0;
      fittingRollRef.current = nextRoll;
      setFittingRoll(nextRoll);
      updateGhostPreview();
      return nextPlane;
    });
  };

  useEffect(() => {
    selectedPlacedFittingRef.current = selectedPlacedFittingId;
    engineRef.current?.setFittingHighlight(selectedPlacedFittingId);
  }, [selectedPlacedFittingId]);

  const rotateSelectedFitting = (deltaY: number) => {
    if (!selectedPlacedFittingId) return;
    const item = fittings.find((f) => f.id === selectedPlacedFittingId);
    if (!item) return;

    const newRotY = (item.rotation.y + deltaY) % (Math.PI * 2);
    const newRotation = { ...item.rotation, y: newRotY };

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(newRotation.x, newRotation.y, newRotation.z, 'YXZ')
    );
    const catalogDef = AIRPIPE_CATALOG.find((c) => c.id === item.fittingId);
    const basePorts = catalogDef ? catalogDef.ports : item.ports;

    const newPorts = basePorts.map((p) => {
      const vPos = new THREE.Vector3(p.position.x, p.position.y, p.position.z).applyQuaternion(q);
      const vDir = new THREE.Vector3(p.direction.x, p.direction.y, p.direction.z).applyQuaternion(q);
      return {
        ...p,
        position: { x: vPos.x, y: vPos.y, z: vPos.z },
        direction: { x: vDir.x, y: vDir.y, z: vDir.z },
      };
    });

    engineRef.current?.updateFittingTransform(item.id, item.position, newRotation);
    if (onFittingUpdated) {
      onFittingUpdated({ ...item, rotation: newRotation, ports: newPorts });
    }
  };

  const flipSelectedFittingVertical = () => {
    if (!selectedPlacedFittingId) return;
    const item = fittings.find((f) => f.id === selectedPlacedFittingId);
    if (!item) return;

    const newRotX = (item.rotation.x + Math.PI / 2) % (Math.PI * 2);
    const newRotation = { ...item.rotation, x: newRotX };

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(newRotation.x, newRotation.y, newRotation.z, 'YXZ')
    );
    const catalogDef = AIRPIPE_CATALOG.find((c) => c.id === item.fittingId);
    const basePorts = catalogDef ? catalogDef.ports : item.ports;

    const newPorts = basePorts.map((p) => {
      const vPos = new THREE.Vector3(p.position.x, p.position.y, p.position.z).applyQuaternion(q);
      const vDir = new THREE.Vector3(p.direction.x, p.direction.y, p.direction.z).applyQuaternion(q);
      return {
        ...p,
        position: { x: vPos.x, y: vPos.y, z: vPos.z },
        direction: { x: vDir.x, y: vDir.y, z: vDir.z },
      };
    });

    engineRef.current?.updateFittingTransform(item.id, item.position, newRotation);
    if (onFittingUpdated) {
      onFittingUpdated({ ...item, rotation: newRotation, ports: newPorts });
    }
  };

  const deleteSelectedFitting = () => {
    if (!selectedPlacedFittingId) return;
    engineRef.current?.removeFitting(selectedPlacedFittingId);
    if (onFittingDeleted) {
      onFittingDeleted(selectedPlacedFittingId);
    }
    setSelectedPlacedFittingId(null);
  };

  useEffect(() => {
    selectedPipeRef.current = selectedPipeId;
    engineRef.current?.setPipeHighlight(selectedPipeId);
  }, [selectedPipeId]);

  const handlePipeDiameterChange = (pipeId: string, newDiameter: number) => {
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe) return;
    engineRef.current?.updatePipe(pipeId, undefined, undefined, newDiameter);
    if (onPipeUpdated) {
      onPipeUpdated({ ...pipe, diameter: newDiameter });
    }
  };

  const handleApplyDiameterToAllPipes = (newDiameter: number) => {
    pipes.forEach((p) => {
      engineRef.current?.updatePipe(p.id, undefined, undefined, newDiameter);
      if (onPipeUpdated) {
        onPipeUpdated({ ...p, diameter: newDiameter });
      }
    });
  };

  const deleteSelectedPipe = () => {
    if (!selectedPipeId) return;
    engineRef.current?.removePipe(selectedPipeId);
    if (onPipeDeleted) {
      onPipeDeleted(selectedPipeId);
    }
    setSelectedPipeId(null);
  };

  const handleMirrorPipe = (pipeId: string) => {
    const pipe = pipes.find((p) => p.id === pipeId);
    if (!pipe) return;

    // Detectar inteligentemente si el punto de unión con la red es start o end
    const otherPipes = pipes.filter((p) => p.id !== pipe.id);
    const countAtStart = otherPipes.filter(
      (p) =>
        Math.hypot(p.start.x - pipe.start.x, p.start.z - pipe.start.z) < 30 ||
        Math.hypot(p.end.x - pipe.start.x, p.end.z - pipe.start.z) < 30
    ).length;

    const countAtEnd = otherPipes.filter(
      (p) =>
        Math.hypot(p.start.x - pipe.end.x, p.start.z - pipe.end.z) < 30 ||
        Math.hypot(p.end.x - pipe.end.x, p.end.z - pipe.end.z) < 30
    ).length;

    let origin: Vector3D;
    let tip: Vector3D;

    if (countAtEnd > 0 && countAtStart === 0) {
      // El extremo conectado a la red es 'end'
      origin = { ...pipe.end };
      tip = { ...pipe.start };
    } else {
      // Por defecto el origen del ramal es 'start'
      origin = { ...pipe.start };
      tip = { ...pipe.end };
    }

    const vx = tip.x - origin.x;
    const vz = tip.z - origin.z;

    const mirrorStart = { ...origin };
    const mirrorEnd = { x: origin.x - vx, y: origin.y, z: origin.z - vz };
    const newId = `pipe_${Date.now()}_mirror`;

    engineRef.current?.addPipe(mirrorStart, mirrorEnd, pipe.diameter, newId);
    onPipeAdded({
      id: newId,
      start: mirrorStart,
      end: mirrorEnd,
      diameter: pipe.diameter,
      length: pipe.length,
    });
    setSelectedPipeId(newId);
  };

  const handleApplySameLengthAsLast = () => {
    if (!routingStartRef.current || pipes.length === 0) return;
    const lastPipe = pipes[pipes.length - 1];
    const targetLength = lastPipe.length;
    const start = routingStartRef.current;

    // Vector dirección hacia donde apunta el cursor
    let vx = worldCoordRef.current.x - start.x;
    let vz = worldCoordRef.current.z - start.z;
    let dist = Math.hypot(vx, vz);

    let ux = 1;
    let uz = 0;
    if (dist > 10) {
      ux = vx / dist;
      uz = vz / dist;
    } else {
      ux = 0;
      uz = 1;
    }

    if (isOrthoRef.current) {
      if (Math.abs(ux) >= Math.abs(uz)) {
        ux = ux >= 0 ? 1 : -1;
        uz = 0;
      } else {
        ux = 0;
        uz = uz >= 0 ? 1 : -1;
      }
    }

    const clickPoint = {
      x: start.x + ux * targetLength,
      y: start.y,
      z: start.z + uz * targetLength,
    };

    const pipeId = `pipe_${Date.now()}`;
    engineRef.current?.addPipe(start, clickPoint, selectedDiameterRef.current, pipeId);
    onPipeAdded({
      id: pipeId,
      start: { ...start },
      end: { ...clickPoint },
      diameter: selectedDiameterRef.current,
      length: Math.round(targetLength),
    });

    finishRouting();
  };

  const isInitialDiameterMount = useRef(true);
  useEffect(() => {
    if (isInitialDiameterMount.current) {
      isInitialDiameterMount.current = false;
      return;
    }
    if (selectedPipeRef.current) {
      handlePipeDiameterChange(selectedPipeRef.current, selectedDiameter);
    }
  }, [selectedDiameter]);

  // Inicializar CADEngine (solo 1 vez al montar, nunca destruir al cambiar diámetro o herramientas)
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new CADEngine({
      container: containerRef.current,
      onFpsUpdate,
      onPortHover: () => {},
      onDblClickZoomFit,
      onMouseMoveWorld: (worldPos, snap) => {
        const prevSnap = currentSnapRef.current;
        currentSnapRef.current = snap;

        const snapChanged = (!prevSnap && snap) || (prevSnap && !snap) || (
          prevSnap && snap && (
            prevSnap.type !== snap.type ||
            prevSnap.pipeInfo?.pipeId !== snap.pipeInfo?.pipeId ||
            prevSnap.port?.id !== snap.port?.id ||
            prevSnap.dxfLine?.p1.x !== snap.dxfLine?.p1.x ||
            prevSnap.dxfLine?.p1.z !== snap.dxfLine?.p1.z
          )
        );

        if (snapChanged) {
          setCurrentSnap(snap);
        }

        let finalPos = { ...worldPos };

        // Modo Ortogonal (bloquea a 90° o 0° cuando trazamos tubería y no hay snap magnético)
        if (routingStartRef.current && isOrthoRef.current && !snap) {
          const dx = Math.abs(worldPos.x - routingStartRef.current.x);
          const dz = Math.abs(worldPos.z - routingStartRef.current.z);
          if (dx >= dz) {
            finalPos.z = routingStartRef.current.z; // Horizontal
          } else {
            finalPos.x = routingStartRef.current.x; // Vertical
          }
        }

        // RASTREO INTELIGENTE DE ALINEACIÓN Y SIMETRÍA (Mismo tamaño y alineación con otras ramas)
        let foundAlignment: { text: string; length: number; refPoint: Vector3D } | null = null;
        if (routingStartRef.current && !snap) {
          const start = routingStartRef.current;
          const rawVx = finalPos.x - start.x;
          const rawVz = finalPos.z - start.z;
          const rawDist = Math.hypot(rawVx, rawVz);

          if (rawDist > 25) {
            const u = { x: rawVx / rawDist, y: 0, z: rawVz / rawDist };
            const allPipes = pipesRef.current;
            let bestDiff = 95; // umbral de imán en mm

            for (const p of allPipes) {
              // A) Snap a Misma Longitud (Simetría de tamaño con otras ramas)
              const lenDiff = Math.abs(rawDist - p.length);
              if (lenDiff < bestDiff) {
                bestDiff = lenDiff;
                const snappedDist = p.length;
                finalPos.x = start.x + u.x * snappedDist;
                finalPos.z = start.z + u.z * snappedDist;
                foundAlignment = {
                  text: `Mismo tamaño que tramo adyacente (${(p.length / 1000).toFixed(2)} m)`,
                  length: p.length,
                  refPoint: p.end,
                };
              }

              // B) Snap a Proyección Coplanar de Extremos (end y start)
              for (const pRef of [p.end, p.start]) {
                const vToRefX = pRef.x - start.x;
                const vToRefZ = pRef.z - start.z;
                const projDist = vToRefX * u.x + vToRefZ * u.z;
                if (projDist > 50) {
                  const projDiff = Math.abs(rawDist - projDist);
                  if (projDiff < bestDiff) {
                    bestDiff = projDiff;
                    finalPos.x = start.x + u.x * projDist;
                    finalPos.z = start.z + u.z * projDist;
                    foundAlignment = {
                      text: `Alineado con extremo de tubería (${(projDist / 1000).toFixed(2)} m)`,
                      length: Math.round(projDist),
                      refPoint: pRef,
                    };
                  }
                }
              }
            }
          }
        }

        if (foundAlignment) {
          const prevAlign = alignmentTrackingRef.current;
          alignmentTrackingRef.current = foundAlignment;
          if (!prevAlign || prevAlign.text !== foundAlignment.text) {
            setAlignmentTrackingInfo(foundAlignment);
          }
          engine.updateAlignmentGuide(finalPos, foundAlignment.refPoint);
        } else if (routingStartRef.current) {
          if (alignmentTrackingRef.current) {
            alignmentTrackingRef.current = null;
            setAlignmentTrackingInfo(null);
            engine.updateAlignmentGuide(null, null);
          }
        }

        worldCoordRef.current = finalPos;
        if (coordXRef.current) coordXRef.current.textContent = `X: ${Math.round(finalPos.x)} mm`;
        if (coordZRef.current) coordZRef.current.textContent = `Z: ${Math.round(finalPos.z)} mm`;

        // Actualizar previsualización elástica de tubería
        if (routingStartRef.current) {
          const dist = Math.hypot(
            finalPos.x - routingStartRef.current.x,
            finalPos.z - routingStartRef.current.z
          );
          if (routingDistanceRef.current) {
            routingDistanceRef.current.textContent = `Longitud Tramo: ${(dist / 1000).toFixed(2)} m (${Math.round(dist)} mm)`;
          }
          engine.updatePreviewPipe(routingStartRef.current, finalPos, selectedDiameterRef.current);
        }

        // Actualizar medición dinámica si el usuario está midiendo
        if (toolRef.current === 'measure' && measureStartRef.current) {
          const mDist = Math.hypot(
            finalPos.x - measureStartRef.current.x,
            finalPos.z - measureStartRef.current.z
          );
          if (liveMeasureDistanceRef.current) {
            liveMeasureDistanceRef.current.textContent = `${(mDist / 1000).toFixed(3)} m (${Math.round(mDist)} mm)`;
          }
          engine.updateMeasurePreview(measureStartRef.current, finalPos);
        }

        // Actualizar previsualización interactiva de accesorio fantasma
        if (toolRef.current === 'place_fitting' && selectedFittingRef.current) {
          const { rotation, cornerPlacePos } = computeFittingPlacementRotation(snap, finalPos);
          const placePos = ((snap?.type === 'pipe_corner' || snap?.type === 'dxf_corner') && cornerPlacePos)
            ? cornerPlacePos
            : (snap ? snap.point : finalPos);
          const { geometry, edgesGeometry } = FittingGeometryFactory.createGeometry(selectedFittingRef.current);
          fittingRotationRef.current = rotation;
          engine.updatePreviewFitting(
            geometry,
            placePos,
            rotation,
            selectedFittingRef.current.id,
            edgesGeometry
          );
        }
      },
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sincronizar tuberías existentes en la escena
  useEffect(() => {
    if (!engineRef.current) return;
    if (pipes.length > 0 && engineRef.current.getPipesCount() === 0) {
      pipes.forEach((p) => {
        engineRef.current?.addPipe(p.start, p.end, p.diameter, p.id);
      });
    }
  }, [pipes]);

  // Sincronizar accesorios existentes en la escena
  useEffect(() => {
    if (!engineRef.current) return;
    if (fittings.length > 0 && engineRef.current.getFittingsCount() === 0) {
      fittings.forEach((f) => {
        const catalogDef = AIRPIPE_CATALOG.find((item) => item.id === f.fittingId);
        if (catalogDef) {
          const { geometry, color } = FittingGeometryFactory.createGeometry(catalogDef);
          engineRef.current?.addFittingMesh(geometry, f.position, f.rotation, color, f.id, f.ports);
        }
      });
    }
  }, [fittings]);

  // Actualizar modo visual
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setVisualMode(visualMode);
    }
  }, [visualMode]);

  // Actualizar vista de cámara
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setView(cameraView);
    }
  }, [cameraView]);

  // Actualizar perfil de rendimiento
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPerformanceProfile(performance);
    }
  }, [performance]);

  // Limpiar tubería, accesorio o medición previa si cambiamos de herramienta
  useEffect(() => {
    if (tool !== 'route_pipe') {
      finishRouting();
    }
    if (tool !== 'place_fitting') {
      engineRef.current?.updatePreviewFitting(null, null, null);
    }
    if (tool !== 'measure') {
      setMeasureStart(null);
      setMeasureResult(null);
      setLiveMeasureDistance(0);
      engineRef.current?.clearMeasurement();
    }
  }, [tool]);

  const cancelFittingPlacement = () => {
    engineRef.current?.updatePreviewFitting(null, null, null);
    if (onCancelFittingPlacement) {
      onCancelFittingPlacement();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const dragDistance = Math.hypot(
      e.clientX - mouseDownPosRef.current.x,
      e.clientY - mouseDownPosRef.current.y
    );

    // Si hubo arrastre, es paneo o rotación de cámara
    if (dragDistance > 6) return;

    // Clic derecho: Terminar ruteo actual, deseleccionar, limpiar medición o cancelar colocación de accesorio
    if (e.button === 2) {
      if (measureStartRef.current || measureResult) {
        setMeasureStart(null);
        setMeasureResult(null);
        setLiveMeasureDistance(0);
        engineRef.current?.clearMeasurement();
        return;
      }
      if (selectedPipeRef.current) {
        setSelectedPipeId(null);
        return;
      }
      if (selectedPlacedFittingRef.current) {
        setSelectedPlacedFittingId(null);
        return;
      }
      if (tool === 'place_fitting') {
        cancelFittingPlacement();
        return;
      }
      finishRouting();
      return;
    }

    // 0. Modo Medir: Medir distancia entre 2 puntos con OSNAP
    if (e.button === 0 && tool === 'measure') {
      const snap = currentSnapRef.current;
      const clickPoint = snap ? snap.point : { ...worldCoordRef.current };

      if (!measureStartRef.current) {
        setMeasureStart(clickPoint);
        setMeasureResult(null);
        setLiveMeasureDistance(0);
        engineRef.current?.clearMeasurement();
      } else {
        const p1 = measureStartRef.current;
        const p2 = clickPoint;
        const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const dx = Math.abs(p2.x - p1.x);
        const dz = Math.abs(p2.z - p1.z);

        setMeasureResult({
          p1,
          p2,
          distance: dist,
          dx,
          dz,
        });
        setLiveMeasureDistance(dist);
        engineRef.current?.setMeasurement(p1, p2);
        setMeasureStart(null);
      }
      return;
    }

    // 1. Detección de clic sobre accesorio ya colocado o tubería
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && e.button === 0) {
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hitFittingId = engineRef.current?.raycastFitting(ndcX, ndcY);

      if (hitFittingId) {
        if (tool === 'erase') {
          engineRef.current?.removeFitting(hitFittingId);
          if (onFittingDeleted) onFittingDeleted(hitFittingId);
          setSelectedPlacedFittingId(null);
          return;
        }
        setSelectedPlacedFittingId(hitFittingId);
        setSelectedPipeId(null);
        return;
      }

      // Raycast sobre tuberías existentes cuando no estamos trazando o colocando accesorios
      if (tool !== 'place_fitting' && !routingStartRef.current) {
        const hitPipeId = engineRef.current?.raycastPipe(ndcX, ndcY);
        if (hitPipeId) {
          if (tool === 'erase') {
            engineRef.current?.removePipe(hitPipeId);
            if (onPipeDeleted) onPipeDeleted(hitPipeId);
            setSelectedPipeId(null);
            return;
          }
          setSelectedPipeId(hitPipeId);
          setSelectedPlacedFittingId(null);
          return;
        }
      }
    }

    // Si se hace clic en vacío y había pieza o tubería seleccionada, deseleccionar
    if (selectedPlacedFittingRef.current && e.button === 0 && tool !== 'place_fitting') {
      setSelectedPlacedFittingId(null);
    }
    if (selectedPipeRef.current && e.button === 0 && tool !== 'place_fitting') {
      setSelectedPipeId(null);
    }

    // Clic izquierdo en modo Colocar Accesorio
    if (e.button === 0 && tool === 'place_fitting' && selectedFittingRef.current) {
      const snap = currentSnapRef.current;
      const { rotation, quaternion, cornerPlacePos } = computeFittingPlacementRotation(snap, worldCoordRef.current);
      const placePos = cornerPlacePos
        ? cornerPlacePos
        : (snap ? snap.point : { ...worldCoordRef.current });
      const fitting = selectedFittingRef.current;
      const { geometry, color } = FittingGeometryFactory.createGeometry(fitting);
      const id = `fit_${Date.now()}`;

      // --- RECORTES AUTOMÁTICOS DE TUBERÍAS ---
      const isElbow = fitting.category === 'elbow_90' || fitting.category === 'elbow_45';
      const Larm = fitting.ports[1]?.position.x || 50;

      // Determinar punto focal o vértice del accesorio
      const V: Vector3D = snap?.cornerInfo?.V || (snap ? snap.point : { ...worldCoordRef.current });

      // CASO 1: Si es un Codo o se colocó en esquina o extremo de tubería
      if (isElbow || snap?.type === 'pipe_corner' || snap?.type === 'dxf_corner' || snap?.type === 'pipe_end' || snap?.type === 'dxf_endpoint') {
        // Buscar TODAS las tuberías 3D en pipesRef.current que toquen el vértice V (dentro de 140 mm)
        const connectedPipes: { pipe: PipeSegment; endType: 'start' | 'end'; dirAwayFromV: Vector3D }[] = [];

        for (const p of pipesRef.current) {
          const dStart = Math.hypot(p.start.x - V.x, p.start.z - V.z);
          const dEnd = Math.hypot(p.end.x - V.x, p.end.z - V.z);
          const pLen = p.length || Math.hypot(p.end.x - p.start.x, p.end.z - p.start.z) || 1;

          if (dStart <= 140) {
            connectedPipes.push({
              pipe: p,
              endType: 'start',
              dirAwayFromV: { x: (p.end.x - p.start.x) / pLen, y: 0, z: (p.end.z - p.start.z) / pLen },
            });
          } else if (dEnd <= 140) {
            connectedPipes.push({
              pipe: p,
              endType: 'end',
              dirAwayFromV: { x: (p.start.x - p.end.x) / pLen, y: 0, z: (p.start.z - p.end.z) / pLen },
            });
          }
        }

        // Recortar cada tubería conectada alejándola del vértice V por la longitud del brazo Larm
        connectedPipes.forEach(({ pipe: targetPipe, endType, dirAwayFromV }) => {
          const trimmedPoint: Vector3D = {
            x: V.x + Larm * dirAwayFromV.x,
            y: V.y,
            z: V.z + Larm * dirAwayFromV.z,
          };

          const newStart = endType === 'start' ? trimmedPoint : targetPipe.start;
          const newEnd = endType === 'end' ? trimmedPoint : targetPipe.end;
          const newLen = Math.round(Math.hypot(newEnd.x - newStart.x, newEnd.z - newStart.z));

          if (newLen >= 5) {
            engineRef.current?.updatePipe(targetPipe.id, newStart, newEnd);
            if (onPipeUpdated) {
              onPipeUpdated({ ...targetPipe, start: newStart, end: newEnd, length: newLen });
            }
          }
        });
      }

      // CASO 2: Si se colocó sobre el cuerpo de una tubería 3D (snap.type === 'pipe_body'):
      // Intercalar limpiamente el accesorio dividiendo la tubería en 2 tramos conectados a sus bocas
      if (snap?.type === 'pipe_body' && snap.pipeInfo) {
        const targetPipe = pipesRef.current.find((p) => p.id === snap.pipeInfo?.pipeId);
        if (targetPipe && fitting.ports.length >= 2) {
          if (fitting.category === 'tee' || fitting.category === 'valve' || fitting.category === 'coupling') {
            const p0Local = fitting.ports[0].position;
            const p1Local = fitting.ports[1].position;
            const v0 = new THREE.Vector3(p0Local.x, p0Local.y, p0Local.z).applyQuaternion(quaternion);
            const v1 = new THREE.Vector3(p1Local.x, p1Local.y, p1Local.z).applyQuaternion(quaternion);

            const worldP0 = { x: placePos.x + v0.x, y: placePos.y + v0.y, z: placePos.z + v0.z };
            const worldP1 = { x: placePos.x + v1.x, y: placePos.y + v1.y, z: placePos.z + v1.z };

            const d0Start = Math.hypot(worldP0.x - targetPipe.start.x, worldP0.z - targetPipe.start.z);
            const d1Start = Math.hypot(worldP1.x - targetPipe.start.x, worldP1.z - targetPipe.start.z);

            const portNearStart = d0Start <= d1Start ? worldP0 : worldP1;
            const portNearEnd = d0Start <= d1Start ? worldP1 : worldP0;

            const len1 = Math.hypot(portNearStart.x - targetPipe.start.x, portNearStart.z - targetPipe.start.z);
            const len2 = Math.hypot(targetPipe.end.x - portNearEnd.x, targetPipe.end.z - portNearEnd.z);

            if (len1 >= 10 && len2 >= 10) {
              const updatedLen = Math.round(len1);
              engineRef.current?.updatePipe(targetPipe.id, targetPipe.start, portNearStart);
              if (onPipeUpdated) {
                onPipeUpdated({ ...targetPipe, end: portNearStart, length: updatedLen });
              }

              const splitId = `pipe_${Date.now()}_split`;
              const splitLen = Math.round(len2);
              engineRef.current?.addPipe(portNearEnd, targetPipe.end, targetPipe.diameter, splitId);
              onPipeAdded({
                id: splitId,
                start: portNearEnd,
                end: targetPipe.end,
                diameter: targetPipe.diameter,
                length: splitLen,
              });
            }
          }
        }
      }

      const transformedPorts = fitting.ports.map((p) => {
        const vPos = new THREE.Vector3(p.position.x, p.position.y, p.position.z).applyQuaternion(quaternion);
        const vDir = new THREE.Vector3(p.direction.x, p.direction.y, p.direction.z).applyQuaternion(quaternion);
        return {
          ...p,
          position: { x: placePos.x + vPos.x, y: placePos.y + vPos.y, z: placePos.z + vPos.z },
          direction: { x: vDir.x, y: vDir.y, z: vDir.z },
        };
      });

      engineRef.current?.addFittingMesh(geometry, placePos, rotation, color, id, fitting.ports);

      onFittingPlaced({
        id,
        fittingId: fitting.id,
        position: placePos,
        rotation,
        ports: transformedPorts,
      });

      return;
    }

    // Clic izquierdo en modo Trazar Tubería
    if (e.button === 0 && tool === 'route_pipe') {
      const snap = currentSnapRef.current;

      // --- MODO 1: AUTO-TRAZAR LÍNEA DEL PLANO EN 1 CLIC ---
      if ((isAutoTraceLineRef.current || e.altKey) && snap?.dxfLine && !routingStartRef.current) {
        const line = snap.dxfLine;
        const pipeId = `pipe_${Date.now()}`;
        engineRef.current?.addPipe(line.p1, line.p2, selectedDiameter, pipeId);

        onPipeAdded({
          id: pipeId,
          start: { ...line.p1 },
          end: { ...line.p2 },
          diameter: selectedDiameter,
          length: line.length,
        });

        finishRouting();
        return;
      }

      // --- MODO 2: TRAZADO CONTINUO CON OSNAP MAGNÉTICO ---
      const clickPoint = snap ? snap.point : { ...worldCoordRef.current };

      if (!routingStartRef.current) {
        // Fijar punto de inicio
        setRoutingStart(clickPoint);
      } else {
        // Fijar punto final y colocar tramo
        const start = routingStartRef.current;
        const length = Math.hypot(clickPoint.x - start.x, clickPoint.z - start.z);

        if (length >= 10 && engineRef.current) {
          const pipeId = `pipe_${Date.now()}`;
          engineRef.current.addPipe(start, clickPoint, selectedDiameter, pipeId);

          onPipeAdded({
            id: pipeId,
            start: { ...start },
            end: { ...clickPoint },
            diameter: selectedDiameter,
            length: Math.round(length),
          });

          // Continuar encadenando tramos
          setRoutingStart(clickPoint);
        }
      }
    }
  };

  const finishRouting = () => {
    setRoutingStart(null);
    setCurrentDistance(0);
    engineRef.current?.updatePreviewPipe(null, null, 0);
    engineRef.current?.updateAlignmentGuide(null, null);
    alignmentTrackingRef.current = null;
    setAlignmentTrackingInfo(null);
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (measureStartRef.current || measureResult) {
          setMeasureStart(null);
          setMeasureResult(null);
          setLiveMeasureDistance(0);
          engineRef.current?.clearMeasurement();
        } else if (selectedPipeRef.current) {
          setSelectedPipeId(null);
        } else if (selectedPlacedFittingRef.current) {
          setSelectedPlacedFittingId(null);
        } else if (toolRef.current === 'place_fitting') {
          cancelFittingPlacement();
        } else {
          finishRouting();
        }
      } else if (e.key === 'Enter') {
        finishRouting();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPipeRef.current) {
          e.preventDefault();
          deleteSelectedPipe();
        } else if (selectedPlacedFittingRef.current) {
          e.preventDefault();
          deleteSelectedFitting();
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (selectedPlacedFittingRef.current) {
          rotateSelectedFitting(Math.PI);
        } else if (toolRef.current === 'place_fitting') {
          invertPlacementSide();
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setIsOrtho((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        e.preventDefault();
        if (selectedPlacedFittingRef.current) {
          rotateSelectedFitting(Math.PI / 2);
        } else if (toolRef.current === 'place_fitting') {
          rotatePlacementRoll(Math.PI / 2);
        }
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        if (selectedPlacedFittingRef.current) {
          rotateSelectedFitting(-Math.PI / 2);
        } else if (toolRef.current === 'place_fitting') {
          rotatePlacementRoll(-Math.PI / 2);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (selectedPlacedFittingRef.current) {
          flipSelectedFittingVertical();
        } else if (toolRef.current === 'place_fitting') {
          togglePlacementPlane();
        }
      } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
        if (selectedPipeRef.current) {
          e.preventDefault();
          handleMirrorPipe(selectedPipeRef.current);
        }
      } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        if (routingStartRef.current) {
          e.preventDefault();
          handleApplySameLengthAsLast();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="relative flex-1 h-[calc(100vh-3.5rem)] bg-[#14171c] overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Canvas Three.js */}
      <div 
        ref={containerRef} 
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />

      {/* HUD SUPERIOR: MODO ACTUAL Y GUÍA */}
      <div className="absolute top-3 left-4 flex flex-col space-y-1.5 z-10 pointer-events-none">
        <div className="bg-[#1b2028]/90 backdrop-blur-md border border-[#2a323d] px-3.5 py-2 rounded-lg text-xs flex items-center space-x-3 text-white shadow-xl pointer-events-auto">
          <Crosshair className="w-4 h-4 text-blue-400 animate-pulse" />
          <span className="font-semibold text-[12px]">
            {tool === 'route_pipe' && (
              routingStart 
                ? 'Haga clic para colocar el siguiente tramo (Clic der. o Esc para terminar)' 
                : isAutoTraceLine 
                  ? 'Modo Auto-Trazar: Haga clic sobre cualquier línea del plano para convertirla a tubo 3D' 
                  : 'Haga clic sobre un extremo o línea del plano para INICIAR el trazado'
            )}
            {tool === 'place_fitting' && selectedFitting && (
              currentSnap?.type === 'pipe_body'
                ? `Imán a Tubería: Clic para intercalar ${selectedFitting.name} | R / Tab: Cambiar dirección | F: Voltear`
                : (currentSnap?.type === 'pipe_corner' || currentSnap?.type === 'dxf_corner')
                  ? `Imán a Esquina: Clic para fijar y recortar automáticamente`
                  : `Colocar Accesorio: ${selectedFitting.name} | Clic: Fijar | R: Girar 90° | Tab: Invertir Lado | F: Voltear`
            )}
            {tool === 'select' && (
              selectedPipeId
                ? 'Tubería seleccionada: Seleccione un nuevo diámetro en el panel o en el catálogo | [Supr] para eliminar'
                : selectedPlacedFittingId
                  ? 'Accesorio seleccionado: Use los botones del panel o [R], [Tab], [F] para rotarlo'
                  : 'Modo Selección: Clic sobre una tubería o accesorio para editarlo o cambiar su diámetro | Clic y arrastre para mover la vista'
            )}
            {tool === 'measure' && (
              measureStart
                ? 'Modo Medir: Mueva el cursor y haga clic en el SEGUNDO punto (Clic der. o Esc para cancelar)'
                : measureResult
                  ? 'Medición completada: Haga clic en cualquier punto para iniciar una nueva medición'
                  : 'Modo Medir: Haga clic en el PRIMER punto (o extremo de tubería/plano)'
            )}
          </span>
        </div>

        {/* Banner de Medición Activa */}
        {tool === 'measure' && (measureStart || measureResult) && (
          <div className="bg-gradient-to-r from-[#1c1917] via-[#292524] to-[#0c0a09] border border-amber-400/90 px-4 py-2.5 rounded-xl text-xs text-white flex items-center space-x-3 shadow-2xl pointer-events-auto">
            <Ruler className="w-4 h-4 text-amber-400 animate-pulse" />
            <div>
              {measureStart ? (
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-amber-300">
                    Midiendo en Tiempo Real:
                  </span>
                  <span ref={liveMeasureDistanceRef} className="font-mono bg-amber-950 text-amber-200 px-2.5 py-0.5 rounded text-[12px] font-bold border border-amber-500/40">
                    {(liveMeasureDistance / 1000).toFixed(3)} m ({Math.round(liveMeasureDistance)} mm)
                  </span>
                  <span className="text-[11px] text-gray-300">
                    | Haga clic para fijar el segundo punto
                  </span>
                </div>
              ) : measureResult ? (
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-amber-300">
                    Distancia Medida:
                  </span>
                  <span className="font-mono bg-amber-900/90 text-white px-2.5 py-0.5 rounded text-[12px] font-bold border border-amber-400">
                    {(measureResult.distance / 1000).toFixed(3)} m ({Math.round(measureResult.distance)} mm)
                  </span>
                  <span className="text-[11px] text-amber-200/80 font-mono">
                    (ΔX: {(measureResult.dx / 1000).toFixed(3)} m | ΔZ: {(measureResult.dz / 1000).toFixed(3)} m)
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center space-x-1.5 pl-2 border-l border-amber-500/40">
              <button
                onClick={() => {
                  setMeasureStart(null);
                  setMeasureResult(null);
                  setLiveMeasureDistance(0);
                  engineRef.current?.clearMeasurement();
                }}
                className="px-2.5 py-1 bg-amber-700/80 hover:bg-amber-600 rounded font-semibold transition text-[11px] text-white shadow"
                title="Limpiar medición actual"
              >
                Limpiar
              </button>
            </div>
          </div>
        )}

        {/* Banner de tubería seleccionada (Cambio de diámetro paramétrico en tiempo real y eliminación) */}
        {selectedPipeId && (() => {
          const pipe = pipes.find((p) => p.id === selectedPipeId);
          if (!pipe) return null;
          return (
            <div className="bg-gradient-to-r from-[#0c2d48] via-[#143d59] to-[#0f172a] border border-blue-400/80 px-4 py-2 rounded-xl text-xs text-white flex items-center space-x-3 shadow-2xl pointer-events-auto">
              <Box className="w-4 h-4 text-blue-300 animate-pulse" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-blue-200">
                    Tubería Seleccionada:
                  </span>
                  <span className="font-mono bg-blue-900/80 text-cyan-300 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-500/40">
                    DN{pipe.diameter} (Ø{pipe.diameter} mm)
                  </span>
                  <span className="text-[11px] text-gray-300">
                    | Longitud: {(pipe.length / 1000).toFixed(2)} m ({Math.round(pipe.length)} mm)
                  </span>
                </div>
              </div>

              {/* Selector directo de diámetros */}
              <div className="flex items-center space-x-1 pl-2 border-l border-blue-500/40">
                <span className="text-[10px] text-gray-400 font-semibold mr-1">Cambiar a:</span>
                {[20, 25, 40, 50, 63, 80].map((d) => (
                  <button
                    key={d}
                    onClick={() => handlePipeDiameterChange(pipe.id, d)}
                    className={`px-2 py-1 rounded font-mono text-[11px] font-bold transition ${
                      pipe.diameter === d
                        ? 'bg-cyan-500 text-black shadow-md'
                        : 'bg-blue-950/80 hover:bg-blue-800 text-blue-100 border border-blue-700/50'
                    }`}
                    title={`Cambiar este tramo a DN${d}`}
                  >
                    DN{d}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-1.5 pl-2 border-l border-blue-500/40">
                <button
                  onClick={() => handleMirrorPipe(pipe.id)}
                  className="px-2.5 py-1 bg-teal-700/90 hover:bg-teal-600 rounded font-semibold transition text-[11px] shadow-lg text-teal-100 flex items-center space-x-1 border border-teal-500/50"
                  title="Crear tramo simétrico al lado opuesto del nudo (Simetría / Espejo 180° - Atajo: S)"
                >
                  <span className="text-teal-300 font-bold">⧉</span>
                  <span>Simetría (Espejo)</span>
                </button>
                <button
                  onClick={() => handleApplyDiameterToAllPipes(pipe.diameter)}
                  className="px-2.5 py-1 bg-indigo-700/80 hover:bg-indigo-600 rounded font-semibold transition text-[11px] shadow text-indigo-100"
                  title={`Aplicar diámetro DN${pipe.diameter} a todas las tuberías del proyecto`}
                >
                  Aplicar a Toda la Red
                </button>
                <button
                  onClick={deleteSelectedPipe}
                  className="px-2.5 py-1 bg-rose-700/80 hover:bg-rose-600 rounded font-semibold transition flex items-center space-x-1 shadow text-rose-100 text-[11px]"
                  title="Eliminar este tramo de tubería (Supr / Delete)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
                <button
                  onClick={() => setSelectedPipeId(null)}
                  className="px-2 py-1 bg-gray-700/60 hover:bg-gray-600 rounded font-semibold transition text-[11px]"
                  title="Deseleccionar (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })()}

        {/* Banner de accesorio colocado SELECCIONADO (Rotación, volteo y eliminación interactiva) */}
        {selectedPlacedFittingId && (() => {
          const item = fittings.find((f) => f.id === selectedPlacedFittingId);
          const def = item ? AIRPIPE_CATALOG.find((c) => c.id === item.fittingId) : null;
          if (!item) return null;
          return (
            <div className="bg-gradient-to-r from-[#172554] via-[#1e293b] to-[#0f172a] border border-cyan-400/80 px-4 py-2 rounded-xl text-xs text-white flex items-center space-x-3 shadow-2xl pointer-events-auto">
              <Box className="w-4 h-4 text-cyan-300 animate-pulse" />
              <div>
                <span className="font-bold text-cyan-200">
                  Pieza Seleccionada: {def?.name || 'Accesorio 3D'}
                </span>
                <span className="text-[10px] text-gray-400 ml-2">
                  (Giro: {Math.round(((item.rotation.y * 180) / Math.PI + 360) % 360)}°)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => rotateSelectedFitting(-Math.PI / 2)}
                  className="px-2.5 py-1 bg-cyan-700/60 hover:bg-cyan-600 rounded font-semibold transition flex items-center space-x-1 shadow text-[11px]"
                  title="Girar 90° en sentido antihorario (Q)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>⟲ -90°</span>
                </button>
                <button
                  onClick={() => rotateSelectedFitting(Math.PI / 2)}
                  className="px-2.5 py-1 bg-cyan-700/60 hover:bg-cyan-600 rounded font-semibold transition flex items-center space-x-1 shadow text-[11px]"
                  title="Girar 90° en sentido horario (R o Espacio)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>⟳ +90°</span>
                </button>
                <button
                  onClick={() => rotateSelectedFitting(Math.PI)}
                  className="px-2.5 py-1 bg-indigo-700/60 hover:bg-indigo-600 rounded font-semibold transition shadow text-[11px]"
                  title="Invertir lado opuesto (Tab)"
                >
                  <span>⇄ Invertir Lado</span>
                </button>
                <button
                  onClick={() => flipSelectedFittingVertical()}
                  className="px-2.5 py-1 bg-purple-700/60 hover:bg-purple-600 rounded font-semibold transition shadow text-[11px]"
                  title="Voltear vertical arriba/abajo (F)"
                >
                  <span>↕ Voltear</span>
                </button>
                <button
                  onClick={() => deleteSelectedFitting()}
                  className="px-2.5 py-1 bg-rose-700/80 hover:bg-rose-600 rounded font-semibold transition flex items-center space-x-1 shadow text-rose-100 text-[11px]"
                  title="Eliminar este accesorio (Supr / Delete)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
                <button
                  onClick={() => setSelectedPlacedFittingId(null)}
                  className="px-2 py-1 bg-gray-700/60 hover:bg-gray-600 rounded font-semibold transition text-[11px]"
                  title="Cerrar / Deseleccionar (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })()}

        {/* Banner especial al colocar accesorio con botones interactivos de rotación */}
        {tool === 'place_fitting' && selectedFitting && (
          <div className="bg-gradient-to-r from-purple-800 via-indigo-700 to-blue-700 px-4 py-2 rounded-xl text-xs text-white flex items-center space-x-3 shadow-2xl border border-purple-400/50 pointer-events-auto">
            <Box className="w-4 h-4 text-cyan-300" />
            <span className="font-bold">Colocando: {selectedFitting.name}</span>
            <span className="bg-purple-950/90 px-2 py-0.5 rounded text-[11px] text-cyan-300 border border-purple-400/30">
              Lado: {
                fittingPlane === 'vertical'
                  ? fittingRoll > 0 ? 'Arriba ↑' : 'Abajo ↓'
                  : Math.abs(fittingRoll) < 0.1 ? 'Derecho →' : 'Izquierdo ←'
              }
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => rotatePlacementRoll(Math.PI / 2)}
                className="px-2.5 py-1 bg-purple-600/70 hover:bg-purple-500 rounded font-semibold transition shadow flex items-center space-x-1 text-[11px]"
                title="Rotar 90° (R / Espacio)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Girar 90°</span>
              </button>
              <button
                onClick={() => invertPlacementSide()}
                className="px-2.5 py-1 bg-indigo-600/70 hover:bg-indigo-500 rounded font-semibold transition shadow text-[11px]"
                title="Invertir lado izquierdo / derecho (Tab)"
              >
                <span>⇄ Invertir Lado</span>
              </button>
              <button
                onClick={() => togglePlacementPlane()}
                className="px-2.5 py-1 bg-blue-600/70 hover:bg-blue-500 rounded font-semibold transition shadow text-[11px]"
                title="Cambiar plano Horizontal / Vertical (F)"
              >
                <span>↕ {fittingPlane === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
              </button>
              <button
                onClick={cancelFittingPlacement}
                className="px-2.5 py-1 bg-red-800/70 hover:bg-red-700 rounded font-semibold transition text-[11px]"
                title="Cancelar colocación (Esc)"
              >
                ✕ Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Longitud en tiempo real al estirar tubería y Asistente de Simetría / Tamaño */}
        {routingStart && (
          <div className="flex flex-col space-y-1.5 pointer-events-auto">
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-600 px-3.5 py-1.5 rounded-lg text-xs text-white font-mono flex items-center space-x-3 shadow-2xl font-bold border border-cyan-400/40">
              <Ruler className="w-4 h-4 text-cyan-300" />
              <span ref={routingDistanceRef}>
                Longitud Tramo: {(currentDistance / 1000).toFixed(2)} m ({Math.round(currentDistance)} mm)
              </span>
              <span className="text-blue-200 font-normal">| Ø{selectedDiameter} mm</span>

              {pipes.length > 0 && (
                <button
                  onClick={handleApplySameLengthAsLast}
                  className="ml-2 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-bold text-[11px] shadow-md transition flex items-center space-x-1 cursor-pointer border border-amber-300/80"
                  title="Fijar tramo del mismo tamaño exacto que el tramo anterior (Atajo: M)"
                >
                  <span className="text-amber-900 font-extrabold">★</span>
                  <span>Mismo Tamaño ({((pipes[pipes.length - 1].length) / 1000).toFixed(2)} m) [M]</span>
                </button>
              )}

              <button
                onClick={finishRouting}
                className="px-2 py-0.5 bg-red-800/80 hover:bg-red-700 text-white rounded text-[11px] transition cursor-pointer"
                title="Cancelar trazado actual (Esc)"
              >
                ✕ Cancelar
              </button>
            </div>

            {alignmentTrackingInfo && (
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3.5 py-1.5 rounded-lg text-xs text-white font-mono flex items-center space-x-2 shadow-2xl border border-teal-300/80 self-start animate-pulse">
                <span className="text-yellow-300 text-sm font-bold">★ OSNAP GUÍA:</span>
                <span className="font-bold text-white">{alignmentTrackingInfo.text}</span>
                <span className="bg-emerald-950/90 text-[10px] px-2 py-0.5 rounded text-teal-200 font-semibold border border-teal-400/40">
                  Imán de Simetría Fijado
                </span>
              </div>
            )}
          </div>
        )}

        {/* OSNAP INTELIGENTE (BADGES DINÁMICOS) */}
        {currentSnap && (
          <div className="flex items-center space-x-2">
            {currentSnap.type === 'dxf_line' && (
              <div className="bg-amber-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg border border-amber-400/30">
                <Zap className="w-4 h-4 text-yellow-300 animate-bounce" />
                <span className="font-bold">Línea del Plano Detectada:</span>
                <span>{((currentSnap.dxfLine?.length || 0) / 1000).toFixed(2)} m</span>
                <span className="bg-amber-800/80 px-1.5 py-0.5 rounded text-[10px] text-amber-200">
                  {isAutoTraceLine ? '¡Haga clic para autotrazar!' : 'Alt+Clic para autotrazar'}
                </span>
              </div>
            )}

            {currentSnap.type === 'dxf_endpoint' && (
              <div className="bg-emerald-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-sm bg-white border border-black animate-ping"></span>
                <span className="font-bold">OSNAP: Extremo de Línea del Plano</span>
              </div>
            )}

            {currentSnap.type === 'dxf_midpoint' && (
              <div className="bg-cyan-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg">
                <span className="w-2.5 h-2.5 rotate-45 bg-white"></span>
                <span className="font-bold">OSNAP: Punto Medio del Plano</span>
              </div>
            )}

            {currentSnap.type === 'fitting_port' && (
              <div className="bg-blue-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                <span className="font-bold">OSNAP: Puerto de Accesorio Ø{currentSnap.port?.diameter}mm</span>
              </div>
            )}

            {currentSnap.type === 'pipe_end' && (
              <div className="bg-indigo-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-300"></span>
                <span className="font-bold">OSNAP: Extremo de Tubería 3D</span>
              </div>
            )}

            {currentSnap.type === 'pipe_corner' && (
              <div className="bg-amber-600/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg border border-yellow-400/50">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-300 border border-black animate-pulse"></span>
                <span className="font-bold">OSNAP: Unión en Esquina 3D (Auto-Ajuste Interior)</span>
              </div>
            )}

            {currentSnap.type === 'dxf_corner' && (
              <div className="bg-amber-700/95 backdrop-blur-md px-3 py-1.5 rounded-md text-xs text-white font-mono flex items-center space-x-2 shadow-lg border border-amber-400/40">
                <span className="w-2.5 h-2.5 rounded-sm bg-yellow-200 border border-black animate-pulse"></span>
                <span className="font-bold">OSNAP: Esquina de Líneas del Plano DXF</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTONES DE ASISTENCIA CAD (AUTO-TRAZAR Y ORTO F8) */}
      <div className="absolute top-3 right-4 z-10 flex items-center space-x-2">
        <button
          onClick={() => setIsAutoTraceLine((prev) => !prev)}
          title="Modo Auto-Trazar: Al hacer clic en cualquier línea del plano, se convierte directamente a tubo 3D"
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition shadow-lg border ${
            isAutoTraceLine
              ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-amber-500/20'
              : 'bg-[#1b2028]/80 text-[#8b949e] border-[#2a323d] hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Auto-Trazar Línea: {isAutoTraceLine ? 'ON' : 'OFF'}</span>
        </button>

        <button
          onClick={() => setIsOrtho((prev) => !prev)}
          title="Modo Ortogonal (F8): Bloquea las tuberías a 90° y 0° exactos"
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition shadow-lg border ${
            isOrtho
              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 shadow-emerald-500/10'
              : 'bg-[#1b2028]/80 text-[#8b949e] border-[#2a323d] hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Orto (F8): {isOrtho ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* HUD INFERIOR: COORDENADAS CAD EXACTAS Y ATAJOS */}
      <div className="absolute bottom-3 left-4 right-4 pointer-events-none flex items-center justify-between text-[11px] text-[#8b949e]">
        <div className="bg-[#1b2028]/85 backdrop-blur-md border border-[#2a323d] px-3 py-1 rounded-md flex items-center space-x-4">
          {selectedPipeId ? (
            <>
              <span className="flex items-center text-cyan-300 font-bold">
                <Ruler className="w-3.5 h-3.5 mr-1" />
                Tubería Seleccionada
              </span>
              <span className="flex items-center text-teal-300 font-medium">
                S: ⧉ Simetría (Espejo 180°)
              </span>
              <span className="flex items-center text-rose-300 font-medium">
                <Trash2 className="w-3 h-3 mr-1" />
                Supr: Eliminar
              </span>
              <span className="flex items-center text-amber-300 font-medium">
                Esc: Deseleccionar
              </span>
            </>
          ) : routingStart ? (
            <>
              <span className="flex items-center text-cyan-300 font-bold">
                <Ruler className="w-3.5 h-3.5 mr-1" />
                Trazando Tubería
              </span>
              <span className="flex items-center text-amber-300 font-medium">
                M: Mismo Tamaño que Anterior
              </span>
              <span className="flex items-center text-emerald-300 font-medium">
                F8: Orto ON/OFF
              </span>
              <span className="flex items-center text-red-300 font-medium">
                Esc: Cancelar
              </span>
            </>
          ) : selectedPlacedFittingId ? (
            <>
              <span className="flex items-center text-cyan-300 font-bold">
                <Box className="w-3.5 h-3.5 mr-1" />
                Pieza Seleccionada
              </span>
              <span className="flex items-center text-purple-300 font-medium">
                <RotateCw className="w-3 h-3 mr-1" />
                R / Espacio: Girar 90°
              </span>
              <span className="flex items-center text-indigo-300 font-medium">
                Tab: Invertir Lado
              </span>
              <span className="flex items-center text-blue-300 font-medium">
                F: Voltear Vertical
              </span>
              <span className="flex items-center text-rose-300 font-medium">
                <Trash2 className="w-3 h-3 mr-1" />
                Supr: Eliminar
              </span>
              <span className="flex items-center text-amber-300 font-medium">
                Esc: Deseleccionar
              </span>
            </>
          ) : tool === 'place_fitting' ? (
            <>
              <span className="flex items-center text-cyan-400 font-bold">
                <Box className="w-3.5 h-3.5 mr-1" />
                Clic Izq: Colocar
              </span>
              <span className="flex items-center text-purple-300 font-medium">
                <RotateCw className="w-3 h-3 mr-1" />
                R / Espacio: Girar 90°
              </span>
              <span className="flex items-center text-indigo-300 font-medium">
                Tab: Invertir Lado
              </span>
              <span className="flex items-center text-blue-300 font-medium">
                F: Voltear
              </span>
              <span className="flex items-center text-amber-300 font-medium">
                Clic Der / Esc: Cancelar
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center">
                <RotateCw className="w-3 h-3 mr-1 text-blue-400" />
                Clic: Trazar / Convertir Línea
              </span>
              <span className="flex items-center">
                <Move className="w-3 h-3 mr-1 text-emerald-400" />
                Arrastre: Pan
              </span>
              <span className="flex items-center">
                <ZoomIn className="w-3 h-3 mr-1 text-amber-400" />
                Rueda: Zoom | Doble Clic: Ver Todo
              </span>
            </>
          )}
        </div>

        {/* LECTURA EN VIVO DE COORDENADAS (X, Y, Z) */}
        <div className="bg-[#1b2028]/90 backdrop-blur-md border border-[#2a323d] px-3 py-1 rounded-md font-mono text-xs text-white flex items-center space-x-3">
          <span className="text-[#8b949e]">Coord:</span>
          <span ref={coordXRef} className="text-cyan-400">X: 0 mm</span>
          <span ref={coordZRef} className="text-emerald-400">Z: 0 mm</span>
          <span className="text-[#8b949e]">| Tubos: <b className="text-white">{pipes.length}</b></span>
          <span className="text-[#8b949e]">| Piezas: <b className="text-cyan-400">{fittings.length}</b></span>
        </div>
      </div>
    </div>
  );
});
