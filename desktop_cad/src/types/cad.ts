export type VisualMode = 
  | 'wireframe'     // Solo aristas (mínimo consumo)
  | 'hidden_line'   // Líneas ocultas / técnico b&n
  | 'flat'          // Sombreado plano sin reflejos
  | 'shaded_edges'  // Sombreado estándar CAD con aristas
  | 'realistic';    // PBR con reflejos y sombras

export type PerformanceProfile = 'eco' | 'balanced' | 'ultra';

export type CameraView = 'perspective_3d' | 'top_2d' | 'front_2d' | 'side_2d';

export type BackgroundTheme = 'white' | 'dark';

export type ToolMode = 
  | 'select' 
  | 'route_pipe' 
  | 'place_fitting' 
  | 'measure' 
  | 'erase';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface CornerInfo {
  pipe1Id?: string;
  pipe2Id?: string;
  pipe1End?: 'start' | 'end';
  pipe2End?: 'start' | 'end';
  V: Vector3D;
  u1: Vector3D;
  u2: Vector3D;
  s: number;
  diameter?: number;
}

export interface PipeSnapInfo {
  pipeId: string;
  start: Vector3D;
  end: Vector3D;
  diameter: number;
  length: number;
  projectionT: number;
}

export interface SnapResult {
  point: Vector3D;
  type: 'fitting_port' | 'pipe_end' | 'pipe_body' | 'pipe_corner' | 'dxf_corner' | 'dxf_endpoint' | 'dxf_midpoint' | 'dxf_line';
  port?: ConnectionPort;
  dxfLine?: { p1: Vector3D; p2: Vector3D; length: number };
  pipeDirection?: Vector3D;
  pipeAngle?: number;
  cornerInfo?: CornerInfo;
  pipeInfo?: PipeSnapInfo;
}

export interface ConnectionPort {
  id: string;
  position: Vector3D;
  direction: Vector3D; // Vector normal unitario
  diameter: number;    // En mm (ej. 20, 25, 40, 50, 63, 80)
  connectedTo?: {
    elementId: string;
    portId?: string;
  };
}

export interface FittingDefinition {
  id: string;
  code: string;
  name: string;
  category: 
    | 'elbow_90' 
    | 'elbow_45' 
    | 'tee' 
    | 'coupling' 
    | 'reducer' 
    | 'valve' 
    | 'quick_drop' 
    | 'flange' 
    | 'cap'
    | 'clamp'
    | 'adapter';
  nominalDiameter: number; // mm
  ports: ConnectionPort[];
  stepFileName?: string;
  modelUrl?: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
}

export interface PlacedFitting {
  id: string;
  fittingId: string;
  position: Vector3D;
  rotation: Vector3D; // En radianes o grados
  ports: ConnectionPort[];
}

export interface PipeSegment {
  id: string;
  start: Vector3D;
  end: Vector3D;
  diameter: number; // mm
  length: number;   // mm
  color?: string;
}

export interface DxfLayerInfo {
  name: string;
  color: string;
  visible: boolean;
  entityCount: number;
}

export interface DxfBlueprint {
  fileName: string;
  layers: DxfLayerInfo[];
  bbox: { 
    minX: number; 
    minY: number; 
    maxX: number; 
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  detectedUnit: 'm' | 'mm' | 'in';
  scale: number;
  autoCenter: boolean;
  rawEntities: any[];
  blocks?: any;
}

export interface BOMSummaryItem {
  code: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  diameter: string;
}
