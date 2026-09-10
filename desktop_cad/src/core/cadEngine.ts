import * as THREE from 'three';
import { 
  VisualMode, 
  CameraView, 
  PerformanceProfile, 
  ConnectionPort, 
  Vector3D,
  SnapResult,
  DxfLayerInfo,
  BackgroundTheme
} from '../types/cad';
import { cleanDxfText } from './dxfService';

export interface DxfTextItem {
  text: string;
  x: number;
  z: number;
  worldHeight: number;
  rotationDeg: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  layer: string;
  color: string;
}

function getLegibleColor(hexStr?: string, defaultColor = '#58a6ff', isWhiteBg = false): string {
  if (!hexStr || !hexStr.startsWith('#')) return isWhiteBg ? '#1e293b' : defaultColor;
  const hex = hexStr.replace('#', '');
  if (hex.length < 6) return isWhiteBg ? '#1e293b' : defaultColor;
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (isWhiteBg) {
    // Si el color es blanco o muy claro, usar azul marino oscuro CAD #0f172a
    if (luminance > 180) {
      return '#0f172a';
    }
  } else {
    // Si el color es negro o demasiado oscuro para el fondo #14171c, usar blanco/gris claro CAD
    if (luminance < 60) {
      return '#e6edf3';
    }
  }
  return hexStr;
}

export interface DxfSegment {
  p1: Vector3D;
  p2: Vector3D;
  length: number;
}

export class SpatialHashGrid2D {
  private cellSize: number;
  private grid = new Map<string, DxfSegment[]>();

  constructor(cellSize = 1000) {
    this.cellSize = cellSize;
  }

  private getKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public clear() {
    this.grid.clear();
  }

  public insert(seg: DxfSegment) {
    const minX = Math.min(seg.p1.x, seg.p2.x);
    const maxX = Math.max(seg.p1.x, seg.p2.x);
    const minZ = Math.min(seg.p1.z, seg.p2.z);
    const maxZ = Math.max(seg.p1.z, seg.p2.z);

    const minCx = Math.floor(minX / this.cellSize);
    const maxCx = Math.floor(maxX / this.cellSize);
    const minCz = Math.floor(minZ / this.cellSize);
    const maxCz = Math.floor(maxZ / this.cellSize);

    const spanX = maxCx - minCx;
    const spanZ = maxCz - minCz;
    if (spanX * spanZ > 60) {
      // Para líneas extremadamente largas, indexar en extremos y centro
      const pts = [seg.p1, seg.p2, { x: (seg.p1.x + seg.p2.x) / 2, y: 0, z: (seg.p1.z + seg.p2.z) / 2 }];
      for (const pt of pts) {
        const key = this.getKey(Math.floor(pt.x / this.cellSize), Math.floor(pt.z / this.cellSize));
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(seg);
      }
      return;
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = this.getKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(seg);
      }
    }
  }

  public queryRadius(x: number, z: number, radius: number): DxfSegment[] {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);

    const resultSet = new Set<DxfSegment>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const list = this.grid.get(this.getKey(cx, cz));
        if (list) {
          for (let i = 0; i < list.length; i++) {
            resultSet.add(list[i]);
          }
        }
      }
    }
    return Array.from(resultSet);
  }
}

export interface CADEngineOptions {
  container: HTMLElement;
  bgTheme?: BackgroundTheme;
  onFpsUpdate?: (fps: number) => void;
  onPortHover?: (port: ConnectionPort | null) => void;
  onDblClickZoomFit?: () => void;
  onMouseMoveWorld?: (worldPos: Vector3D, snap: SnapResult | null) => void;
}

export class CADEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthographicCamera: THREE.OrthographicCamera;
  private currentCamera: THREE.Camera;

  // Tema de fondo del lienzo CAD (Blanco / Oscuro)
  private bgTheme: BackgroundTheme = 'white';
  private currentGridSpan = 10000;
  private lastDxfEntities: any[] | null = null;
  private lastDxfOptions: any = null;

  // Render-on-Demand (Dirty Flag) para consumo GPU casi 0% en reposo
  private needsRender = true;
  private renderHoldFrames = 10;
  private dxfTextsDirty = true;
  private materialCache = new Map<string, THREE.Material>();

  // Capa 2D overlay de alta resolución para Textos y Cotas DXF
  private textCanvas: HTMLCanvasElement | null = null;
  private textCtx: CanvasRenderingContext2D | null = null;
  private dxfTextItems: DxfTextItem[] = [];
  private showDxfTexts: boolean = true;
  private hiddenLayers: Set<string> = new Set<string>();

  private gridHelper: THREE.GridHelper;
  private axesHelper: THREE.AxesHelper;
  private lightsGroup: THREE.Group;
  private dxfGroup: THREE.Group;
  private pipesGroup: THREE.Group;
  private fittingsGroup: THREE.Group;
  private portsGroup: THREE.Group;

  public dxfSegments: DxfSegment[] = [];
  public dxfSpatialGrid = new SpatialHashGrid2D(1000);
  private highlightLine: THREE.Line | null = null;
  private snapMarker: THREE.Mesh | null = null;

  // Sistema de Medición Interactiva CAD
  private measurementGroup: THREE.Group;
  private measureLine: THREE.Line;
  private measureMarkerA: THREE.Mesh;
  private measureMarkerB: THREE.Mesh;
  private measureLabelSprite: THREE.Sprite | null = null;
  private measureLabelCanvas: HTMLCanvasElement | null = null;
  private measureLabelCtx: CanvasRenderingContext2D | null = null;
  private measureLabelTexture: THREE.CanvasTexture | null = null;

  // Línea de rastreo y alineación magnética (Object Snap Tracking / Simetría)
  private alignmentLine: THREE.Line;
  private isOsnapEnabled = true;

  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private previewPipeMesh: THREE.Mesh | null = null;
  private previewFittingMesh: THREE.Mesh | null = null;
  private currentPreviewFittingId: string | null = null;

  private currentVisualMode: VisualMode = 'shaded_edges';
  private currentPerformance: PerformanceProfile = 'balanced';
  private currentView: CameraView = 'perspective_3d';

  private isOrbiting = false;
  private lastTime = performance.now();
  private frameCount = 0;
  private onFpsUpdate?: (fps: number) => void;
  private onPortHover?: (port: ConnectionPort | null) => void;
  private onDblClickZoomFit?: () => void;
  private onMouseMoveWorld?: (worldPos: Vector3D, snap: SnapResult | null) => void;

  // Interacción de cámara tipo CAD (Pan con botón central/derecho, Orbitar con botón izquierdo o Shift+Medio)
  private isMouseDown = false;
  private mouseButton = 0;
  private previousMousePosition = { x: 0, y: 0 };
  private cameraTarget = new THREE.Vector3(0, 0, 0);
  private cameraRadius = 1500; // mm
  private cameraTheta = Math.PI / 4;
  private cameraPhi = Math.PI / 6;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(options: CADEngineOptions) {
    this.container = options.container;
    this.bgTheme = options.bgTheme || 'white';
    this.onFpsUpdate = options.onFpsUpdate;
    this.onPortHover = options.onPortHover;
    this.onDblClickZoomFit = options.onDblClickZoomFit;
    this.onMouseMoveWorld = options.onMouseMoveWorld;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // 1. ESCENA
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.bgTheme === 'white' ? 0xffffff : 0x14171c);

    // 2. RENDERER CON FORZADO DE ALTO RENDIMIENTO
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // Desactivado por defecto para maximizar FPS
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 2.1. Canvas 2D overlay para Textos y Cotas DXF (Retina / Vector Sharpness)
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.style.position = 'absolute';
    this.textCanvas.style.top = '0';
    this.textCanvas.style.left = '0';
    this.textCanvas.style.width = '100%';
    this.textCanvas.style.height = '100%';
    this.textCanvas.style.pointerEvents = 'none';
    this.container.style.position = 'relative';
    this.container.appendChild(this.textCanvas);
    this.textCtx = this.textCanvas.getContext('2d');
    this.updateTextCanvasSize();

    // 3. CÁMARAS (3D Perspectiva y 2D Ortográfica de Gran Alcance para Naves Industriales)
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, width / height, 10, 5000000);
    
    const aspect = width / height;
    const frustumSize = 2000;
    this.orthographicCamera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      -5000000,
      5000000
    );

    this.currentCamera = this.perspectiveCamera;
    this.updateCameraTransform();

    // 4. GRUPOS DE LA ESCENA
    this.lightsGroup = new THREE.Group();
    this.dxfGroup = new THREE.Group();
    this.pipesGroup = new THREE.Group();
    this.fittingsGroup = new THREE.Group();
    this.portsGroup = new THREE.Group();

    this.scene.add(this.lightsGroup);
    this.scene.add(this.dxfGroup);
    this.scene.add(this.pipesGroup);
    this.scene.add(this.fittingsGroup);
    this.scene.add(this.portsGroup);

    // 5. ILUMINACIÓN CAD
    this.setupLights();

    // 6. REJILLA CAD INDUSTRIAL Y EJES
    // Rejilla de 10x10 metros dividida cada 100mm / 1000mm
    const isWhite = this.bgTheme === 'white';
    this.gridHelper = new THREE.GridHelper(
      10000, 
      100, 
      isWhite ? 0x94a3b8 : 0x007acc, 
      isWhite ? 0xe2e8f0 : 0x2a323d
    );
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(300);
    this.axesHelper.position.set(0, 0, 0);
    this.scene.add(this.axesHelper);

    // Marcador OSNAP visual (caja verde magnética de precisión CAD)
    const snapGeo = new THREE.BoxGeometry(1, 1, 1);
    const snapMat = new THREE.MeshBasicMaterial({ 
      color: isWhite ? 0x059669 : 0x00ff88, 
      depthTest: false, 
      transparent: true, 
      opacity: 0.9 
    });
    this.snapMarker = new THREE.Mesh(snapGeo, snapMat);
    this.snapMarker.renderOrder = 999;
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);

    // Línea de resaltado para selección de líneas del plano DXF
    const hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const hlMat = new THREE.LineBasicMaterial({ 
      color: isWhite ? 0xd97706 : 0xffd700, 
      depthTest: false, 
      linewidth: 3 
    });
    this.highlightLine = new THREE.Line(hlGeo, hlMat);
    this.highlightLine.renderOrder = 998;
    this.highlightLine.visible = false;
    this.scene.add(this.highlightLine);

    // 6.1. SISTEMA DE MEDICIÓN INTERACTIVA (Cotas y distancias con precisión CAD)
    this.measurementGroup = new THREE.Group();
    this.measurementGroup.visible = false;
    this.scene.add(this.measurementGroup);

    const mLineGeo = new THREE.BufferGeometry();
    mLineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const mLineMat = new THREE.LineBasicMaterial({
      color: 0xffaa00, // Color ámbar técnico de cota CAD
      depthTest: false,
      linewidth: 3,
    });
    this.measureLine = new THREE.Line(mLineGeo, mLineMat);
    this.measureLine.renderOrder = 1000;
    this.measurementGroup.add(this.measureLine);

    const markerGeo = new THREE.SphereGeometry(1, 8, 8);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      depthTest: false,
    });
    this.measureMarkerA = new THREE.Mesh(markerGeo, markerMat);
    this.measureMarkerA.renderOrder = 1000;
    this.measurementGroup.add(this.measureMarkerA);

    this.measureMarkerB = new THREE.Mesh(markerGeo, markerMat);
    this.measureMarkerB.renderOrder = 1000;
    this.measurementGroup.add(this.measureMarkerB);

    this.setupMeasureLabelSprite();

    // 6.2. LÍNEA GUÍA DE RASTREO Y SIMETRÍA (Object Snap Tracking / Alignment)
    const alignGeo = new THREE.BufferGeometry();
    alignGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const alignMat = new THREE.LineDashedMaterial({
      color: isWhite ? 0x0284c7 : 0x00ffff,
      dashSize: 40,
      gapSize: 25,
      depthTest: false,
    });
    this.alignmentLine = new THREE.Line(alignGeo, alignMat);
    this.alignmentLine.computeLineDistances();
    this.alignmentLine.renderOrder = 999;
    this.alignmentLine.visible = false;
    this.scene.add(this.alignmentLine);

    // 7. EVENTOS DE MOUSE Y TECLADO
    this.setupEventListeners();

    // 8. BUCLE DE RENDERIZADO CONTINUO A 60 FPS
    this.animate();
  }

  public requestRender(frames = 3) {
    this.needsRender = true;
    this.renderHoldFrames = Math.max(this.renderHoldFrames, frames);
  }

  public markDxfTextsDirty() {
    this.dxfTextsDirty = true;
    this.requestRender(4);
  }

  public disposeHierarchy(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if ((child as any).geometry) {
        (child as any).geometry.dispose();
      }
      if ((child as any).material) {
        const mat = (child as any).material;
        if (Array.isArray(mat)) {
          mat.forEach((m: any) => m?.dispose?.());
        } else {
          mat?.dispose?.();
        }
      }
    });
  }

  private setupLights() {
    this.lightsGroup.clear();
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.lightsGroup.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(3000, 5000, 2000);
    this.lightsGroup.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90b0d0, 0.4);
    dirLight2.position.set(-3000, -2000, -3000);
    this.lightsGroup.add(dirLight2);
  }

  // --- CONTROL DE CÁMARA CAD (Orbit, Pan, Zoom) ---
  private updateCameraTransform() {
    if (this.currentView === 'perspective_3d') {
      const x = this.cameraTarget.x + this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
      const y = this.cameraTarget.y + this.cameraRadius * Math.cos(this.cameraPhi);
      const z = this.cameraTarget.z + this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
      this.perspectiveCamera.position.set(x, y, z);
      this.perspectiveCamera.lookAt(this.cameraTarget);
      this.currentCamera = this.perspectiveCamera;
    } else if (this.currentView === 'top_2d') {
      this.orthographicCamera.position.set(this.cameraTarget.x, this.cameraTarget.y + this.cameraRadius, this.cameraTarget.z);
      this.orthographicCamera.up.set(0, 0, -1);
      this.orthographicCamera.lookAt(this.cameraTarget);
      this.currentCamera = this.orthographicCamera;
    } else if (this.currentView === 'front_2d') {
      this.orthographicCamera.position.set(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z + this.cameraRadius);
      this.orthographicCamera.up.set(0, 1, 0);
      this.orthographicCamera.lookAt(this.cameraTarget);
      this.currentCamera = this.orthographicCamera;
    } else if (this.currentView === 'side_2d') {
      this.orthographicCamera.position.set(this.cameraTarget.x + this.cameraRadius, this.cameraTarget.y, this.cameraTarget.z);
      this.orthographicCamera.up.set(0, 1, 0);
      this.orthographicCamera.lookAt(this.cameraTarget);
      this.currentCamera = this.orthographicCamera;
    }
    this.requestRender(4);
    this.dxfTextsDirty = true;
  }

  public setView(view: CameraView) {
    this.currentView = view;
    if (view === 'perspective_3d') {
      this.currentCamera = this.perspectiveCamera;
    } else {
      const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
      const frustumSize = this.cameraRadius * 1.5;
      this.orthographicCamera.left = (-frustumSize * aspect) / 2;
      this.orthographicCamera.right = (frustumSize * aspect) / 2;
      this.orthographicCamera.top = frustumSize / 2;
      this.orthographicCamera.bottom = -frustumSize / 2;
      this.orthographicCamera.updateProjectionMatrix();
      this.currentCamera = this.orthographicCamera;
    }
    this.updateCameraTransform();
  }

  // --- SELECTOR DE ESTILOS VISUALES CAD ---
  public setVisualMode(mode: VisualMode) {
    this.currentVisualMode = mode;
    this.applyVisualModeToGroup(this.pipesGroup);
    this.applyVisualModeToGroup(this.fittingsGroup);

    if (mode === 'realistic') {
      this.renderer.shadowMap.enabled = this.currentPerformance === 'ultra';
    } else {
      this.renderer.shadowMap.enabled = false;
    }
    this.requestRender(5);
  }

  public setPerformanceProfile(profile: PerformanceProfile) {
    this.currentPerformance = profile;
    if (profile === 'eco') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.setVisualMode('flat');
    } else if (profile === 'balanced') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.renderer.shadowMap.enabled = false;
      this.setVisualMode('shaded_edges');
    } else if (profile === 'ultra') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.setVisualMode('realistic');
    }
    this.requestRender(5);
  }

  private getCachedMaterial(
    type: 'wireframe' | 'hidden_line' | 'flat' | 'shaded_edges' | 'realistic',
    color: number,
    isPipe: boolean
  ): THREE.Material {
    const key = `${type}_${color}_${isPipe}`;
    let mat = this.materialCache.get(key);
    if (!mat) {
      if (type === 'wireframe') {
        mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
      } else if (type === 'hidden_line') {
        mat = new THREE.MeshBasicMaterial({ color: this.bgTheme === 'white' ? 0xffffff : 0x1b2028 });
      } else if (type === 'flat') {
        mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
      } else if (type === 'shaded_edges') {
        mat = new THREE.MeshLambertMaterial({ color });
      } else if (type === 'realistic') {
        mat = new THREE.MeshStandardMaterial({
          color,
          metalness: isPipe ? 0.85 : 0.6,
          roughness: isPipe ? 0.25 : 0.4,
        });
      } else {
        mat = new THREE.MeshLambertMaterial({ color });
      }
      this.materialCache.set(key, mat);
    }
    return mat;
  }

  private applyVisualModeToGroup(group: THREE.Group) {
    const isWhite = this.bgTheme === 'white';
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const isPipe = child.userData.isPipe;
        const color = isPipe ? 0x0080ff : (child.userData.customColor || 0xd0d8e0);
        child.material = this.getCachedMaterial(this.currentVisualMode as any, color, isPipe);

        if (
          this.currentVisualMode === 'wireframe' ||
          this.currentVisualMode === 'flat' ||
          this.currentVisualMode === 'realistic'
        ) {
          if (child.children.length > 0) child.children[0].visible = false;
        } else if (this.currentVisualMode === 'hidden_line') {
          if (child.children.length > 0) {
            child.children[0].visible = true;
            (child.children[0] as any).material.color?.setHex(isWhite ? 0x000000 : 0xffffff);
          }
        } else if (this.currentVisualMode === 'shaded_edges') {
          if (child.children.length > 0) {
            child.children[0].visible = true;
            (child.children[0] as any).material.color?.setHex(isWhite ? 0x081b33 : 0x11161d);
          }
        }
      }
    });
    this.requestRender(4);
  }

  // --- ADICIÓN DE TUBERÍAS PARAMÉTRICAS ---
  public addPipe(start: Vector3D, end: Vector3D, diameter: number, id: string): THREE.Mesh {
    const vStart = new THREE.Vector3(start.x, start.y, start.z);
    const vEnd = new THREE.Vector3(end.x, end.y, end.z);
    const distance = vStart.distanceTo(vEnd);

    if (distance < 1) return null as any;

    const radius = diameter / 2;
    // Cilindro optimizado con 16 segmentos radiales (ideal para CAD industrial)
    const geometry = new THREE.CylinderGeometry(radius, radius, distance, 16);
    geometry.translate(0, distance / 2, 0);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshLambertMaterial({ color: 0x0080ff }); // Azul Airpipe clásico
    const mesh = new THREE.Mesh(geometry, material);

    // Orientar tubo de start a end
    mesh.position.copy(vStart);
    mesh.lookAt(vEnd);

    mesh.userData = { id, isPipe: true, diameter, length: distance, start, end };

    // Añadir aristas nítidas de CAD
    const edgesGeo = new THREE.EdgesGeometry(geometry, 25);
    const edgesLine = new THREE.LineSegments(
      edgesGeo, 
      new THREE.LineBasicMaterial({ color: this.bgTheme === 'white' ? 0x081b33 : 0x0e2035, linewidth: 1 })
    );
    mesh.add(edgesLine);

    this.pipesGroup.add(mesh);
    this.requestRender(4);
    return mesh;
  }

  // Actualizar tramo de tubería paramétrica existente (posición, recorte o cambio de diámetro)
  public updatePipe(id: string, start?: Vector3D, end?: Vector3D, diameter?: number): boolean {
    const mesh = this.pipesGroup.children.find((child) => child.userData?.id === id) as THREE.Mesh;
    if (!mesh) return false;

    const curStart = start || mesh.userData.start;
    const curEnd = end || mesh.userData.end;
    const curDiameter = diameter !== undefined ? diameter : (mesh.userData.diameter || 50);

    const vStart = new THREE.Vector3(curStart.x, curStart.y, curStart.z);
    const vEnd = new THREE.Vector3(curEnd.x, curEnd.y, curEnd.z);
    const distance = vStart.distanceTo(vEnd);
    if (distance < 1) return false;

    const radius = curDiameter / 2;
    const geometry = new THREE.CylinderGeometry(radius, radius, distance, 16);
    geometry.translate(0, distance / 2, 0);
    geometry.rotateX(Math.PI / 2);

    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.position.copy(vStart);
    mesh.lookAt(vEnd);

    mesh.userData.start = { ...curStart };
    mesh.userData.end = { ...curEnd };
    mesh.userData.length = distance;
    mesh.userData.diameter = curDiameter;

    // Actualizar aristas nítidas de CAD
    while (mesh.children.length > 0) {
      const c = mesh.children[0];
      if ((c as any).geometry) (c as any).geometry.dispose();
      mesh.remove(c);
    }
    const edgesGeo = new THREE.EdgesGeometry(geometry, 25);
    const edgesLine = new THREE.LineSegments(
      edgesGeo, 
      new THREE.LineBasicMaterial({ color: this.bgTheme === 'white' ? 0x081b33 : 0x0e2035, linewidth: 1 })
    );
    mesh.add(edgesLine);

    if (this.selectedPipeHighlight) {
      this.selectedPipeHighlight.update();
    }
    this.requestRender(4);
    return true;
  }

  // Eliminar tramo de tubería
  public removePipe(id: string): boolean {
    const meshIndex = this.pipesGroup.children.findIndex((child) => child.userData?.id === id);
    if (meshIndex === -1) return false;
    const mesh = this.pipesGroup.children[meshIndex] as THREE.Mesh;
    this.disposeHierarchy(mesh);
    this.pipesGroup.remove(mesh);
    if (this.selectedPipeHighlight) {
      this.scene.remove(this.selectedPipeHighlight);
      this.selectedPipeHighlight.dispose();
      this.selectedPipeHighlight = null;
    }
    this.requestRender(4);
    return true;
  }

  // --- SELECCIÓN Y MODIFICACIÓN DE TUBERÍAS ---
  private selectedPipeHighlight: THREE.BoxHelper | null = null;

  public setPipeHighlight(pipeId: string | null) {
    if (this.selectedPipeHighlight) {
      this.scene.remove(this.selectedPipeHighlight);
      this.selectedPipeHighlight.dispose();
      this.selectedPipeHighlight = null;
      this.requestRender(3);
    }
    if (!pipeId) return;

    const mesh = this.pipesGroup.children.find((c) => c.userData?.id === pipeId) as THREE.Mesh;
    if (mesh) {
      this.selectedPipeHighlight = new THREE.BoxHelper(mesh, this.bgTheme === 'white' ? 0x0284c7 : 0x00d4ff);
      this.scene.add(this.selectedPipeHighlight);
      this.requestRender(3);
    }
  }

  public raycastPipe(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.currentCamera);
    const intersects = this.raycaster.intersectObjects(this.pipesGroup.children, true);
    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.pipesGroup) {
        if (obj.userData?.isPipe && obj.userData?.id) {
          return obj.userData.id;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  // --- ADICIÓN DE ACCESORIOS (FITTINGS) CON PUERTOS DE CONEXIÓN ---
  public addFittingMesh(
    geometry: THREE.BufferGeometry,
    position: Vector3D,
    rotation: Vector3D,
    colorHex: number,
    fittingId: string,
    ports: ConnectionPort[],
    edgesGeometry?: THREE.BufferGeometry,
    catalogId?: string
  ): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.userData = { id: fittingId, catalogId, isFitting: true, customColor: colorHex };

    // Líneas de aristas CAD
    const edgesGeo = edgesGeometry || new THREE.EdgesGeometry(geometry, 25);
    const edgesLine = new THREE.LineSegments(
      edgesGeo, 
      new THREE.LineBasicMaterial({ color: this.bgTheme === 'white' ? 0x081b33 : 0x1a222d })
    );
    mesh.add(edgesLine);

    this.fittingsGroup.add(mesh);

    // Añadir visualizadores de puertos magnéticos (esferas verdes de conexión)
    ports.forEach((port) => {
      const portSphereGeo = new THREE.SphereGeometry(port.diameter / 3, 8, 8);
      const portMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
      const portMesh = new THREE.Mesh(portSphereGeo, portMat);
      portMesh.position.set(port.position.x, port.position.y, port.position.z);
      portMesh.userData = { isPort: true, port, parentId: fittingId };
      mesh.add(portMesh);
    });

    this.requestRender(4);
    return mesh;
  }

  // Actualizar geometría de accesorios colocados cuando el modelo STEP real GLB termina de descargarse
  public updateFittingGeometryByCatalogId(
    catalogId: string,
    geometry: THREE.BufferGeometry,
    edgesGeometry?: THREE.BufferGeometry
  ): boolean {
    let updated = false;
    this.fittingsGroup.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.userData?.catalogId === catalogId && mesh.geometry !== geometry) {
        mesh.geometry = geometry;
        const edgesChild = mesh.children.find((c) => (c as THREE.LineSegments).isLineSegments) as THREE.LineSegments | undefined;
        if (edgesChild) {
          edgesChild.geometry = edgesGeometry || new THREE.EdgesGeometry(geometry, 25);
        }
        updated = true;
      }
    });
    if (updated) {
      this.requestRender(3);
    }
    return updated;
  }

  // --- SELECCIÓN Y MODIFICACIÓN DE ACCESORIOS COLOCADOS ---
  private selectedFittingHighlight: THREE.BoxHelper | null = null;

  public setFittingHighlight(fittingId: string | null) {
    if (this.selectedFittingHighlight) {
      this.scene.remove(this.selectedFittingHighlight);
      this.selectedFittingHighlight.dispose();
      this.selectedFittingHighlight = null;
      this.requestRender(3);
    }
    if (!fittingId) return;

    const mesh = this.fittingsGroup.children.find((c) => c.userData?.id === fittingId) as THREE.Mesh;
    if (mesh) {
      this.selectedFittingHighlight = new THREE.BoxHelper(mesh, this.bgTheme === 'white' ? 0x0284c7 : 0x00ffff);
      this.scene.add(this.selectedFittingHighlight);
      this.requestRender(3);
    }
  }

  public updateFittingTransform(
    fittingId: string,
    position: Vector3D,
    rotation: Vector3D
  ): boolean {
    const mesh = this.fittingsGroup.children.find((c) => c.userData?.id === fittingId) as THREE.Mesh;
    if (!mesh) return false;
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.updateMatrixWorld(true);
    if (this.selectedFittingHighlight) {
      this.selectedFittingHighlight.update();
    }
    this.requestRender(4);
    return true;
  }

  public removeFitting(fittingId: string): boolean {
    const idx = this.fittingsGroup.children.findIndex((c) => c.userData?.id === fittingId);
    if (idx === -1) return false;
    const mesh = this.fittingsGroup.children[idx] as THREE.Mesh;
    this.disposeHierarchy(mesh);
    this.fittingsGroup.remove(mesh);
    if (this.selectedFittingHighlight) {
      this.scene.remove(this.selectedFittingHighlight);
      this.selectedFittingHighlight.dispose();
      this.selectedFittingHighlight = null;
    }
    this.requestRender(4);
    return true;
  }

  public raycastFitting(ndcX: number, ndcY: number): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.currentCamera);
    const intersects = this.raycaster.intersectObjects(this.fittingsGroup.children, true);
    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && obj !== this.fittingsGroup) {
        if (obj.userData?.isFitting && obj.userData?.id) {
          return obj.userData.id;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  // --- CARGADOR AVANZADO DE PLANOS DXF (Auto-Centrado, Escala, Entidades CAD, Bloques y Textos) ---
  public renderDxfEntities(
    entities: any[],
    options: {
      autoCenter?: boolean;
      centerX?: number;
      centerY?: number;
      scale?: number;
      blocks?: any;
      hiddenLayers?: Set<string>;
      layers?: DxfLayerInfo[];
    } = {}
  ) {
    this.lastDxfEntities = entities;
    this.lastDxfOptions = options;

    this.disposeHierarchy(this.dxfGroup);
    this.dxfGroup.clear();
    this.dxfTextItems = [];
    this.dxfSegments = [];
    this.dxfSpatialGrid.clear();

    const isWhite = this.bgTheme === 'white';
    const autoCenter = options.autoCenter ?? true;
    const offsetX = autoCenter ? (options.centerX ?? 0) : 0;
    const offsetY = autoCenter ? (options.centerY ?? 0) : 0;
    const scale = options.scale ?? 1;
    const hiddenLayers = options.hiddenLayers || new Set<string>();
    this.hiddenLayers = hiddenLayers;

    // Mapa de colores por capa
    const layerColorMap = new Map<string, string>();
    if (options.layers) {
      options.layers.forEach((l) => {
        layerColorMap.set(l.name, l.color);
      });
    }

    const defaultLineR = isWhite ? 0.15 : 0.55;
    const defaultLineG = isWhite ? 0.20 : 0.70;
    const defaultLineB = isWhite ? 0.28 : 0.85;

    const resolveEntityRgb = (layerName?: string, defR = defaultLineR, defG = defaultLineG, defB = defaultLineB) => {
      if (layerName && layerColorMap.has(layerName)) {
        const hex = layerColorMap.get(layerName)!;
        const c = new THREE.Color(hex);
        if (isWhite) {
          const lum = 0.299 * (c.r * 255) + 0.587 * (c.g * 255) + 0.114 * (c.b * 255);
          if (lum > 180) {
            return { r: 0.14, g: 0.18, b: 0.24 };
          }
        }
        return { r: c.r, g: c.g, b: c.b };
      }
      return { r: defR, g: defG, b: defB };
    };

    const linePositions: number[] = [];
    const colors: number[] = [];

    const toSceneX = (x: number) => (x - offsetX) * scale;
    const toSceneZ = (y: number) => (y - offsetY) * scale;

    const addSegment = (x1: number, y1: number, x2: number, y2: number, r = defaultLineR, g = defaultLineG, b = defaultLineB, isMain = true) => {
      let finalR = r;
      let finalG = g;
      let finalB = b;
      if (isWhite) {
        const lum = 0.299 * (r * 255) + 0.587 * (g * 255) + 0.114 * (b * 255);
        if (lum > 180) {
          finalR = 0.14;
          finalG = 0.18;
          finalB = 0.24;
        }
      }

      const sx1 = toSceneX(x1);
      const sz1 = toSceneZ(y1);
      const sx2 = toSceneX(x2);
      const sz2 = toSceneZ(y2);
      linePositions.push(sx1, 0, sz1);
      linePositions.push(sx2, 0, sz2);
      colors.push(finalR, finalG, finalB);
      colors.push(finalR, finalG, finalB);

      if (isMain) {
        const len = Math.hypot(sx2 - sx1, sz2 - sz1);
        if (len >= 5) {
          const segItem = {
            p1: { x: sx1, y: 0, z: sz1 },
            p2: { x: sx2, y: 0, z: sz2 },
            length: Math.round(len),
          };
          this.dxfSegments.push(segItem);
          this.dxfSpatialGrid.insert(segItem);
        }
      }
    };

    // Procesar textos y cotas del plano DXF
    const processText = (
      ent: any,
      parentTransform?: (p: { x: number; y: number }) => { x: number; y: number },
      extraRotation = 0,
      scaleMultiplier = 1
    ) => {
      const rawText = ent.text || (ent.type === 'ATTDEF' ? (ent.text || ent.tag || ent.prompt) : '');
      const cleaned = cleanDxfText(rawText);
      if (!cleaned) return;

      const rawPos = (ent.horizontalJustification || ent.verticalJustification) && ent.endPoint
        ? ent.endPoint
        : (ent.startPoint || ent.position || ent.endPoint);
      if (!rawPos) return;

      let finalPos = { x: rawPos.x, y: rawPos.y };
      if (parentTransform) {
        finalPos = parentTransform(finalPos);
      }

      const worldX = toSceneX(finalPos.x);
      const worldZ = toSceneZ(finalPos.y);

      const rawHeight = ent.textHeight || ent.height || 0.2;
      const worldHeight = Math.max(8, rawHeight * scale * Math.abs(scaleMultiplier));

      const rotationDeg = (ent.rotation || 0) + extraRotation;

      let textAlign: CanvasTextAlign = 'left';
      let textBaseline: CanvasTextBaseline = 'middle';

      if (ent.type === 'MTEXT' && ent.attachmentPoint) {
        const ap = ent.attachmentPoint;
        if (ap === 1 || ap === 4 || ap === 7) textAlign = 'left';
        else if (ap === 2 || ap === 5 || ap === 8) textAlign = 'center';
        else if (ap === 3 || ap === 6 || ap === 9) textAlign = 'right';

        if (ap <= 3) textBaseline = 'top';
        else if (ap <= 6) textBaseline = 'middle';
        else textBaseline = 'bottom';
      } else {
        if (ent.horizontalJustification === 1) textAlign = 'center';
        else if (ent.horizontalJustification === 2) textAlign = 'right';
        else textAlign = 'left';

        if (ent.verticalJustification === 3) textBaseline = 'top';
        else if (ent.verticalJustification === 2) textBaseline = 'middle';
        else if (ent.verticalJustification === 1) textBaseline = 'bottom';
        else textBaseline = 'alphabetic';
      }

      const layerName = ent.layer || '0';
      const rawColor = layerColorMap.get(layerName) || (isWhite ? '#1e293b' : '#58a6ff');
      const legibleColor = getLegibleColor(rawColor, isWhite ? '#1e293b' : '#58a6ff', isWhite);

      this.dxfTextItems.push({
        text: cleaned,
        x: worldX,
        z: worldZ,
        worldHeight,
        rotationDeg,
        textAlign,
        textBaseline,
        layer: layerName,
        color: legibleColor,
      });
    };

    // Procesar entidades del plano
    entities.forEach((entity) => {
      if (entity.layer && hiddenLayers.has(entity.layer)) return;

      switch (entity.type) {
        case 'LINE': {
          if (entity.vertices && entity.vertices.length >= 2) {
            const { r, g, b } = resolveEntityRgb(entity.layer);
            addSegment(
              entity.vertices[0].x,
              entity.vertices[0].y,
              entity.vertices[1].x,
              entity.vertices[1].y,
              r, g, b
            );
          }
          break;
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const vertices = entity.vertices;
          if (vertices && vertices.length > 1) {
            const { r, g, b } = resolveEntityRgb(entity.layer, isWhite ? 0.12 : 0.6, isWhite ? 0.18 : 0.75, isWhite ? 0.25 : 0.9);
            for (let i = 0; i < vertices.length - 1; i++) {
              addSegment(
                vertices[i].x,
                vertices[i].y,
                vertices[i + 1].x,
                vertices[i + 1].y,
                r, g, b
              );
            }
            if (entity.shape || entity.closed) {
              addSegment(
                vertices[vertices.length - 1].x,
                vertices[vertices.length - 1].y,
                vertices[0].x,
                vertices[0].y,
                r, g, b
              );
            }
          }
          break;
        }

        case 'CIRCLE': {
          if (entity.center && entity.radius) {
            const { r, g, b } = resolveEntityRgb(entity.layer, isWhite ? 0.16 : 0.4, isWhite ? 0.28 : 0.8, isWhite ? 0.22 : 0.6);
            const segments = 32;
            const cx = entity.center.x;
            const cy = entity.center.y;
            const rad = entity.radius;
            for (let i = 0; i < segments; i++) {
              const theta1 = (i / segments) * Math.PI * 2;
              const theta2 = ((i + 1) / segments) * Math.PI * 2;
              addSegment(
                cx + rad * Math.cos(theta1),
                cy + rad * Math.sin(theta1),
                cx + rad * Math.cos(theta2),
                cy + rad * Math.sin(theta2),
                r, g, b
              );
            }
          }
          break;
        }

        case 'ARC': {
          if (entity.center && entity.radius) {
            const { r, g, b } = resolveEntityRgb(entity.layer, isWhite ? 0.16 : 0.4, isWhite ? 0.28 : 0.8, isWhite ? 0.22 : 0.6);
            const segments = 24;
            const cx = entity.center.x;
            const cy = entity.center.y;
            const rad = entity.radius;
            let start = entity.startAngle;
            let end = entity.endAngle;
            if (end < start) end += Math.PI * 2;
            const step = (end - start) / segments;

            for (let i = 0; i < segments; i++) {
              const a1 = start + i * step;
              const a2 = start + (i + 1) * step;
              addSegment(
                cx + rad * Math.cos(a1),
                cy + rad * Math.sin(a1),
                cx + rad * Math.cos(a2),
                cy + rad * Math.sin(a2),
                r, g, b
              );
            }
          }
          break;
        }

        case 'ELLIPSE': {
          if (entity.center && entity.majorAxisEndPoint) {
            const { r, g, b } = resolveEntityRgb(entity.layer, isWhite ? 0.16 : 0.4, isWhite ? 0.28 : 0.8, isWhite ? 0.22 : 0.6);
            const cx = entity.center.x;
            const cy = entity.center.y;
            const mx = entity.majorAxisEndPoint.x;
            const my = entity.majorAxisEndPoint.y;
            const majorR = Math.hypot(mx, my);
            const ratio = entity.axisRatio || 1;
            const minorR = majorR * ratio;
            const rot = Math.atan2(my, mx);
            const segs = 24;
            for (let i = 0; i < segs; i++) {
              const t1 = (i / segs) * Math.PI * 2;
              const t2 = ((i + 1) / segs) * Math.PI * 2;
              const x1 = cx + (majorR * Math.cos(t1) * Math.cos(rot) - minorR * Math.sin(t1) * Math.sin(rot));
              const y1 = cy + (majorR * Math.cos(t1) * Math.sin(rot) + minorR * Math.sin(t1) * Math.cos(rot));
              const x2 = cx + (majorR * Math.cos(t2) * Math.cos(rot) - minorR * Math.sin(t2) * Math.sin(rot));
              const y2 = cy + (majorR * Math.cos(t2) * Math.sin(rot) + minorR * Math.sin(t2) * Math.cos(rot));
              addSegment(x1, y1, x2, y2, r, g, b);
            }
          }
          break;
        }

        case 'TEXT':
        case 'MTEXT':
        case 'ATTDEF': {
          processText(entity);
          break;
        }

        case 'INSERT': {
          // Bloques insertados (equipos, compresores, depósitos, accesorios del plano)
          const blockName = entity.name;
          const block = options.blocks ? options.blocks[blockName] : null;

          if (block && block.entities && block.entities.length > 0) {
            const rad = ((entity.rotation || 0) * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const scaleX = entity.xScale || 1;
            const scaleY = entity.yScale || 1;
            const insX = entity.position ? entity.position.x : 0;
            const insY = entity.position ? entity.position.y : 0;

            const transformPt = (p: { x: number; y: number }) => {
              const sx = p.x * scaleX;
              const sy = p.y * scaleY;
              return {
                x: insX + (sx * cos - sy * sin),
                y: insY + (sx * sin + sy * cos),
              };
            };

            const blockColor = isWhite ? { r: 0.28, g: 0.34, b: 0.42 } : { r: 0.7, g: 0.7, b: 0.7 };

            block.entities.forEach((sub: any) => {
              const subLayer = sub.layer || entity.layer;
              if (subLayer && hiddenLayers.has(subLayer)) return;

              switch (sub.type) {
                case 'LINE': {
                  if (sub.vertices && sub.vertices.length >= 2) {
                    const p1 = transformPt(sub.vertices[0]);
                    const p2 = transformPt(sub.vertices[1]);
                    addSegment(p1.x, p1.y, p2.x, p2.y, blockColor.r, blockColor.g, blockColor.b, false);
                  }
                  break;
                }
                case 'LWPOLYLINE':
                case 'POLYLINE': {
                  if (sub.vertices && sub.vertices.length > 1) {
                    for (let i = 0; i < sub.vertices.length - 1; i++) {
                      const p1 = transformPt(sub.vertices[i]);
                      const p2 = transformPt(sub.vertices[i + 1]);
                      addSegment(p1.x, p1.y, p2.x, p2.y, blockColor.r, blockColor.g, blockColor.b, false);
                    }
                    if (sub.shape || sub.closed) {
                      const p1 = transformPt(sub.vertices[sub.vertices.length - 1]);
                      const p2 = transformPt(sub.vertices[0]);
                      addSegment(p1.x, p1.y, p2.x, p2.y, blockColor.r, blockColor.g, blockColor.b, false);
                    }
                  }
                  break;
                }
                case 'CIRCLE': {
                  if (sub.center && sub.radius) {
                    const cp = transformPt(sub.center);
                    const radAvg = sub.radius * ((Math.abs(scaleX) + Math.abs(scaleY)) / 2);
                    const segs = 20;
                    for (let i = 0; i < segs; i++) {
                      const t1 = (i / segs) * Math.PI * 2;
                      const t2 = ((i + 1) / segs) * Math.PI * 2;
                      addSegment(
                        cp.x + radAvg * Math.cos(t1),
                        cp.y + radAvg * Math.sin(t1),
                        cp.x + radAvg * Math.cos(t2),
                        cp.y + radAvg * Math.sin(t2),
                        0.6, 0.7, 0.8, false
                      );
                    }
                  }
                  break;
                }
                case 'ARC': {
                  if (sub.center && sub.radius) {
                    const cp = transformPt(sub.center);
                    const radAvg = sub.radius * ((Math.abs(scaleX) + Math.abs(scaleY)) / 2);
                    const segs = 16;
                    let start = sub.startAngle + rad;
                    let end = sub.endAngle + rad;
                    if (end < start) end += Math.PI * 2;
                    const step = (end - start) / segs;
                    for (let i = 0; i < segs; i++) {
                      const a1 = start + i * step;
                      const a2 = start + (i + 1) * step;
                      addSegment(
                        cp.x + radAvg * Math.cos(a1),
                        cp.y + radAvg * Math.sin(a1),
                        cp.x + radAvg * Math.cos(a2),
                        cp.y + radAvg * Math.sin(a2),
                        0.6, 0.7, 0.8, false
                      );
                    }
                  }
                  break;
                }
                case 'TEXT':
                case 'MTEXT':
                case 'ATTDEF': {
                  processText(sub, transformPt, entity.rotation || 0, scaleY);
                  break;
                }
              }
            });
          } else if (entity.position) {
            const size = (entity.xScale || 1) * 20;
            addSegment(entity.position.x - size, entity.position.y, entity.position.x + size, entity.position.y, 0.9, 0.6, 0.2, false);
            addSegment(entity.position.x, entity.position.y - size, entity.position.x, entity.position.y + size, 0.9, 0.6, 0.2, false);
          }
          break;
        }
      }
    });

    if (linePositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        linewidth: 1,
      });

      const lineSegments = new THREE.LineSegments(geometry, material);
      lineSegments.position.y = -1; // Justo en el plano de suelo de referencia
      this.dxfGroup.add(lineSegments);
    }
    this.markDxfTextsDirty();
    this.requestRender(5);
  }

  public getPipesCount(): number {
    return this.pipesGroup ? this.pipesGroup.children.length : 0;
  }

  public getFittingsCount(): number {
    return this.fittingsGroup ? this.fittingsGroup.children.length : 0;
  }

  // Enfocar automáticamente todo el contenido activo (Plano DXF + Tuberías + Accesorios)
  public zoomExtents() {
    const box = new THREE.Box3();
    let hasContent = false;

    if (this.dxfGroup && this.dxfGroup.children.length > 0 && this.dxfGroup.visible) {
      box.expandByObject(this.dxfGroup);
      hasContent = true;
    }
    if (this.pipesGroup && this.pipesGroup.children.length > 0) {
      box.expandByObject(this.pipesGroup);
      hasContent = true;
    }
    if (this.fittingsGroup && this.fittingsGroup.children.length > 0) {
      box.expandByObject(this.fittingsGroup);
      hasContent = true;
    }

    // Fallback: si el plano DXF está temporalmente oculto pero cargado
    if (!hasContent || box.isEmpty()) {
      if (this.dxfGroup && this.dxfGroup.children.length > 0) {
        box.expandByObject(this.dxfGroup);
        hasContent = true;
      }
    }

    if (!hasContent || box.isEmpty()) {
      this.cameraTarget.set(0, 0, 0);
      this.cameraRadius = 3000;
    } else {
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      this.cameraTarget.copy(center);
      const maxDim = Math.max(size.x, size.y, size.z, 1000);
      this.cameraRadius = maxDim * 1.4;
    }

    if (this.currentView !== 'perspective_3d') {
      const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
      const frustumSize = this.cameraRadius * 1.5;
      this.orthographicCamera.left = (-frustumSize * aspect) / 2;
      this.orthographicCamera.right = (frustumSize * aspect) / 2;
      this.orthographicCamera.top = frustumSize / 2;
      this.orthographicCamera.bottom = -frustumSize / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }

    this.updateCameraTransform();
  }

  // Enfocar automáticamente el plano completo en la pantalla (Zoom Extents / Fit estilo AutoCAD)
  public zoomToFit(width: number, height: number, center?: { x: number; z: number }) {
    // Si ya hay geometría en la escena, zoomExtents() es más preciso
    if ((this.dxfGroup && this.dxfGroup.children.length > 0) || (this.pipesGroup && this.pipesGroup.children.length > 0)) {
      this.zoomExtents();
      return;
    }

    const maxDim = Math.max(width, height, 800);
    this.cameraRadius = maxDim * 1.4;

    if (center) {
      this.cameraTarget.set(center.x, 0, center.z);
    } else {
      this.cameraTarget.set(0, 0, 0);
    }

    if (this.currentView !== 'perspective_3d') {
      const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
      const frustumSize = this.cameraRadius * 1.5;
      this.orthographicCamera.left = (-frustumSize * aspect) / 2;
      this.orthographicCamera.right = (frustumSize * aspect) / 2;
      this.orthographicCamera.top = frustumSize / 2;
      this.orthographicCamera.bottom = -frustumSize / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }

    this.updateCameraTransform();
  }

  // Ajustar el tamaño de la rejilla CAD para que abarque holgadamente el plano
  public updateGrid(span: number) {
    this.currentGridSpan = span;
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      (this.gridHelper.material as any)?.dispose?.();
    }
    const gridSize = Math.max(10000, Math.ceil((span * 1.4) / 1000) * 1000);
    const divisions = Math.min(200, Math.max(20, Math.round(gridSize / 1000)));
    const isWhite = this.bgTheme === 'white';
    this.gridHelper = new THREE.GridHelper(
      gridSize, 
      divisions, 
      isWhite ? 0x94a3b8 : 0x007acc, 
      isWhite ? 0xe2e8f0 : 0x2a323d
    );
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);
    this.requestRender(3);
  }

  public setDxfVisible(visible: boolean) {
    this.dxfGroup.visible = visible;
    if (!visible && this.textCtx && this.textCanvas) {
      this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    }
    this.markDxfTextsDirty();
    this.requestRender(5);
  }

  public setShowDxfTexts(show: boolean) {
    this.showDxfTexts = show;
    if (!show && this.textCtx && this.textCanvas) {
      this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    }
    this.markDxfTextsDirty();
    this.requestRender(5);
  }

  public getShowDxfTexts(): boolean {
    return this.showDxfTexts;
  }

  public clearScene() {
    this.disposeHierarchy(this.pipesGroup);
    this.pipesGroup.clear();
    this.disposeHierarchy(this.fittingsGroup);
    this.fittingsGroup.clear();
    this.disposeHierarchy(this.dxfGroup);
    this.dxfGroup.clear();
    this.dxfSegments = [];
    this.dxfSpatialGrid.clear();
    this.dxfTextItems = [];
    if (this.textCtx && this.textCanvas) {
      this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    }
    if (this.previewPipeMesh) this.previewPipeMesh.visible = false;
    if (this.previewFittingMesh) this.previewFittingMesh.visible = false;
    this.requestRender(5);
  }

  // Actualizar resolución del canvas de textos al cambiar tamaño de pantalla
  private updateTextCanvasSize() {
    if (!this.textCanvas || !this.textCtx) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.textCanvas.width = width * dpr;
    this.textCanvas.height = height * dpr;
    this.textCanvas.style.width = `${width}px`;
    this.textCanvas.style.height = `${height}px`;
    this.textCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Renderizado dinámico de textos DXF con filtrado LOD (AutoCAD Semantic Zoom)
  private renderDxfTexts() {
    if (!this.textCtx || !this.textCanvas) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.textCtx.clearRect(0, 0, width, height);

    if (!this.showDxfTexts || !this.dxfGroup.visible || this.dxfTextItems.length === 0) {
      return;
    }

    const ctx = this.textCtx;
    const camera = this.currentCamera;
    const is3D = this.currentView === 'perspective_3d';

    const frustumH = this.cameraRadius * 1.5;
    const unitsPerPixel2D = frustumH / height;
    const fovRad = THREE.MathUtils.degToRad(this.perspectiveCamera.fov);

    const tempVec = new THREE.Vector3();
    const items = this.dxfTextItems;
    const len = items.length;

    for (let i = 0; i < len; i++) {
      const item = items[i];
      if (this.hiddenLayers.has(item.layer)) continue;

      tempVec.set(item.x, 0, item.z);
      // En 3D verificar que el texto esté realmente delante de la cámara
      if (is3D) {
        tempVec.applyMatrix4(camera.matrixWorldInverse);
        if (tempVec.z >= -10) continue; // Detrás del lente de la cámara
        tempVec.applyMatrix4(camera.projectionMatrix);
      } else {
        tempVec.project(camera);
        if (tempVec.z > 1) continue;
      }

      const screenX = ((tempVec.x + 1) / 2) * width;
      const screenY = ((-tempVec.y + 1) / 2) * height;

      // Culling de pantalla (margen de 120px)
      if (screenX < -120 || screenX > width + 120 || screenY < -120 || screenY > height + 120) {
        continue;
      }

      // Altura en pantalla en píxeles
      let screenHeight = 0;
      if (is3D) {
        const dist = camera.position.distanceTo(new THREE.Vector3(item.x, 0, item.z));
        const visibleH = 2 * dist * Math.tan(fovRad / 2);
        screenHeight = (item.worldHeight / (visibleH || 1)) * height;
      } else {
        screenHeight = item.worldHeight / unitsPerPixel2D;
      }

      // LOD Culling: textos menores a 4px no se renderizan para mantener 60 FPS estables
      if (screenHeight < 4) continue;
      const fontSize = Math.min(96, Math.max(9, Math.round(screenHeight)));

      ctx.save();
      ctx.translate(screenX, screenY);

      // Rotación
      if (!is3D) {
        const angleRad = -item.rotationDeg * (Math.PI / 180);
        ctx.rotate(angleRad);
      }

      ctx.font = `600 ${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif`;
      ctx.textAlign = item.textAlign;
      ctx.textBaseline = item.textBaseline;

      // Halo nítido para máximo contraste sobre líneas del plano
      ctx.lineWidth = Math.max(2, fontSize * 0.2);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.bgTheme === 'white' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(12, 16, 22, 0.95)';
      ctx.fillStyle = this.bgTheme === 'white'
        ? (item.color === '#e6edf3' || item.color === '#ffffff' ? '#0f172a' : item.color)
        : item.color;

      const lines = item.text.split('\n');
      const lineHeight = fontSize * 1.25;
      for (let l = 0; l < lines.length; l++) {
        const lineY = l * lineHeight;
        ctx.strokeText(lines[l], 0, lineY);
        ctx.fillText(lines[l], 0, lineY);
      }

      ctx.restore();
    }
  }

  // Intersección matemática precisa del cursor del ratón con el plano de trabajo horizontal Y=0
  public getWorldPointFromMouse(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.currentCamera);
    const target = new THREE.Vector3();

    const forward = new THREE.Vector3();
    this.currentCamera.getWorldDirection(forward);
    const camPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward.clone().negate(), this.cameraTarget);

    if (this.currentView === 'top_2d') {
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
      return hit ? target : null;
    }

    let hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    if (hit && target.distanceTo(this.cameraTarget) <= this.cameraRadius * 4) {
      return target;
    }

    hit = this.raycaster.ray.intersectPlane(camPlane, target);
    return hit ? target : null;
  }

  // Tubería elástica 3D/2D en tiempo real (previsualización mientras mueves el ratón)
  public updatePreviewPipe(start: Vector3D | null, end: Vector3D | null, diameter: number) {
    if (!start || !end) {
      if (this.previewPipeMesh && this.previewPipeMesh.visible) {
        this.previewPipeMesh.visible = false;
        this.requestRender(2);
      }
      return;
    }
    const vStart = new THREE.Vector3(start.x, start.y, start.z);
    const vEnd = new THREE.Vector3(end.x, end.y, end.z);
    const dist = vStart.distanceTo(vEnd);
    if (dist < 10) {
      if (this.previewPipeMesh && this.previewPipeMesh.visible) {
        this.previewPipeMesh.visible = false;
        this.requestRender(2);
      }
      return;
    }

    if (!this.previewPipeMesh) {
      const radius = diameter / 2;
      const geo = new THREE.CylinderGeometry(radius, radius, 1, 16);
      geo.translate(0, 0.5, 0);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.65,
      });
      this.previewPipeMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.previewPipeMesh);
    }

    this.previewPipeMesh.visible = true;
    this.previewPipeMesh.scale.set(1, 1, dist);
    this.previewPipeMesh.position.copy(vStart);
    this.previewPipeMesh.lookAt(vEnd);
    this.requestRender(2);
  }

  // Previsualización interactiva 3D de accesorio (fantasma que sigue al cursor antes de colocar)
  public updatePreviewFitting(
    geometry: THREE.BufferGeometry | null,
    position: Vector3D | null,
    rotation: Vector3D | null,
    fittingId?: string,
    edgesGeometry?: THREE.BufferGeometry
  ) {
    if (!geometry || !position) {
      if (this.previewFittingMesh && this.previewFittingMesh.visible) {
        this.previewFittingMesh.visible = false;
        this.requestRender(2);
      }
      return;
    }

    if (!this.previewFittingMesh || this.currentPreviewFittingId !== fittingId || this.previewFittingMesh.geometry !== geometry) {
      if (this.previewFittingMesh) {
        this.scene.remove(this.previewFittingMesh);
      }
      const mat = new THREE.MeshLambertMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.7,
      });
      this.previewFittingMesh = new THREE.Mesh(geometry, mat);

      const edgesGeo = edgesGeometry || new THREE.EdgesGeometry(geometry, 25);
      const edgesLine = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 })
      );
      this.previewFittingMesh.add(edgesLine);

      this.scene.add(this.previewFittingMesh);
      this.currentPreviewFittingId = fittingId || null;
    }

    this.previewFittingMesh.visible = true;
    this.previewFittingMesh.position.set(position.x, position.y, position.z);
    if (rotation) {
      this.previewFittingMesh.rotation.set(rotation.x, rotation.y, rotation.z);
    } else {
      this.previewFittingMesh.rotation.set(0, 0, 0);
    }
    this.requestRender(2);
  }

  // --- MÉTODOS DE MEDICIÓN INTERACTIVA CAD ---
  private setupMeasureLabelSprite() {
    this.measureLabelCanvas = document.createElement('canvas');
    this.measureLabelCanvas.width = 512;
    this.measureLabelCanvas.height = 128;
    this.measureLabelCtx = this.measureLabelCanvas.getContext('2d');
    this.measureLabelTexture = new THREE.CanvasTexture(this.measureLabelCanvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: this.measureLabelTexture,
      depthTest: false,
      transparent: true,
    });
    this.measureLabelSprite = new THREE.Sprite(spriteMat);
    this.measureLabelSprite.renderOrder = 1002;
    this.measurementGroup.add(this.measureLabelSprite);
  }

  public updateMeasurePreview(start: Vector3D | null, end: Vector3D | null) {
    if (!start || !end) {
      if (this.measurementGroup.visible) {
        this.measurementGroup.visible = false;
        this.requestRender(2);
      }
      return;
    }

    const pos = this.measureLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, start.x, start.y + 4, start.z);
    pos.setXYZ(1, end.x, end.y + 4, end.z);
    pos.needsUpdate = true;

    // Calcular tamaño de marcadores según nivel de zoom de la cámara
    const frustumH = this.cameraRadius * 1.5;
    const unitsPerPixel = frustumH / (this.container.clientHeight || 800);
    const markerRadius = Math.max(25, unitsPerPixel * 6);

    this.measureMarkerA.position.set(start.x, start.y + 4, start.z);
    this.measureMarkerA.scale.set(markerRadius, markerRadius, markerRadius);

    this.measureMarkerB.position.set(end.x, end.y + 4, end.z);
    this.measureMarkerB.scale.set(markerRadius, markerRadius, markerRadius);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2 + 4;
    const midZ = (start.z + end.z) / 2;
    const dist = Math.hypot(end.x - start.x, end.z - start.z);

    this.renderMeasureLabel(dist, { x: midX, y: midY, z: midZ }, unitsPerPixel);
    this.measurementGroup.visible = true;
    this.requestRender(2);
  }

  public setMeasurement(start: Vector3D, end: Vector3D) {
    this.updateMeasurePreview(start, end);
  }

  public clearMeasurement() {
    if (this.measurementGroup.visible) {
      this.measurementGroup.visible = false;
      this.requestRender(2);
    }
  }

  private renderMeasureLabel(dist: number, mid: Vector3D, unitsPerPixel: number) {
    if (!this.measureLabelCtx || !this.measureLabelTexture || !this.measureLabelSprite || !this.measureLabelCanvas) return;
    const ctx = this.measureLabelCtx;
    const canvas = this.measureLabelCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Texto con metros y milímetros de precisión industrial
    const text = `${(dist / 1000).toFixed(2)} m (${Math.round(dist)} mm)`;

    // Caja de fondo estilo cota técnica de alta visibilidad
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 6;
    const padX = 16;
    const padY = 16;
    const w = canvas.width - padX * 2;
    const h = canvas.height - padY * 2;
    const radius = 18;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(padX, padY, w, h, radius);
    } else {
      ctx.rect(padX, padY, w, h);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.restore();

    this.measureLabelTexture.needsUpdate = true;

    // Colocar sprite ligeramente elevado sobre la línea
    const labelHeightOffset = Math.max(40, unitsPerPixel * 20);
    this.measureLabelSprite.position.set(mid.x, mid.y + labelHeightOffset, mid.z);

    const spriteScaleW = Math.max(220, unitsPerPixel * 160);
    const spriteScaleH = spriteScaleW * 0.25;
    this.measureLabelSprite.scale.set(spriteScaleW, spriteScaleH, 1);
  }

  // Actualizar línea guía visual de alineación / simetría entre tramos
  public updateAlignmentGuide(p1: Vector3D | null, p2: Vector3D | null) {
    if (!p1 || !p2) {
      if (this.alignmentLine && this.alignmentLine.visible) {
        this.alignmentLine.visible = false;
        this.requestRender(2);
      }
      return;
    }
    const pos = this.alignmentLine.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, p1.x, p1.y + 3, p1.z);
    pos.setXYZ(1, p2.x, p2.y + 3, p2.z);
    pos.needsUpdate = true;
    this.alignmentLine.computeLineDistances();
    this.alignmentLine.visible = true;
    this.requestRender(2);
  }

  // --- MANEJO DE EVENTOS DE MOUSE ---
  private setupEventListeners() {
    const el = this.renderer.domElement;

    // Desactivar menú contextual para que el clic derecho o arrastre sea fluido
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // Prevenir el scroll automático de Windows al presionar botón central (rueda)
    el.addEventListener('auxclick', (e) => e.preventDefault());

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
      this.isMouseDown = true;
      this.mouseButton = e.button;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };

      // Cambiar cursor a mano de arrastre al hacer Pan u Órbita
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.currentView !== 'perspective_3d')) {
        el.style.cursor = 'grabbing';
      }
      this.requestRender(3);
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.isOrbiting = false;
      el.style.cursor = 'crosshair';
      this.requestRender(3);
    });

    el.addEventListener('mousemove', (e) => {
      this.requestRender(2);

      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Si el usuario está arrastrando cámara (pan/órbita), omitir OSNAP para máxima fluidez
      if (this.isMouseDown) {
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        if (this.mouseButton === 0) {
          if (this.currentView === 'perspective_3d') {
            this.isOrbiting = true;
            this.cameraTheta -= deltaX * 0.008;
            this.cameraPhi -= deltaY * 0.008;
            this.cameraPhi = Math.max(0.04, Math.min(Math.PI / 2 - 0.03, this.cameraPhi));
            this.updateCameraTransform();
          } else {
            el.style.cursor = 'grabbing';
            this.panCamera(deltaX, deltaY);
          }
        } else if (this.mouseButton === 1 || this.mouseButton === 2) {
          el.style.cursor = 'grabbing';
          this.panCamera(deltaX, deltaY);
        }

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
        return;
      }

      // Calcular posición real en milímetros sobre el plano horizontal
      const worldPoint = this.getWorldPointFromMouse(e.clientX, e.clientY);
      if (worldPoint && this.onMouseMoveWorld) {
        const bypassSnap = e.shiftKey || e.altKey || !this.isOsnapEnabled;
        const snap = bypassSnap ? null : this.getSnapPoint(worldPoint, 25);
        if (bypassSnap) {
          if (this.snapMarker) this.snapMarker.visible = false;
          if (this.highlightLine) this.highlightLine.visible = false;
        }
        this.onMouseMoveWorld(
          snap ? { x: snap.point.x, y: snap.point.y, z: snap.point.z } : { x: worldPoint.x, y: 0, z: worldPoint.z },
          snap
        );
      }

      this.checkPortHover();
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // 1. Rayo desde la cámara a través de la posición exacta del cursor
      this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.currentCamera);

      const zoomIn = e.deltaY < 0;
      const zoomFactor = zoomIn ? 0.85 : 1.18;
      const oldRadius = this.cameraRadius;
      // Límite mínimo de 120 mm: garantiza que el radio nunca colapse contra el objetivo ni se vuelva lento
      const newRadius = Math.max(120, Math.min(5000000, oldRadius * zoomFactor));
      const actualFactor = newRadius / oldRadius;
      this.cameraRadius = newRadius;

      if (this.currentView === 'perspective_3d') {
        // En 3D Perspectiva: proyectar contra el plano horizontal de trabajo (Y=0)
        const groundHit = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, groundHit);

        if (hit && groundHit.distanceTo(this.cameraTarget) <= this.cameraRadius * 4) {
          // Desplazar cameraTarget suavemente en el plano horizontal hacia el punto apuntado
          const shiftX = (groundHit.x - this.cameraTarget.x) * (1 - actualFactor);
          const shiftZ = (groundHit.z - this.cameraTarget.z) * (1 - actualFactor);
          this.cameraTarget.x += shiftX;
          this.cameraTarget.z += shiftZ;
          this.cameraTarget.y = 0;

          // Si ya estamos muy cerca (radio <= 250 mm) y el usuario sigue haciendo zoom IN:
          // Avanzar suavemente en la dirección del cursor para no frenarse nunca (dolly walking CAD)
          if (oldRadius <= 250 && zoomIn) {
            const dirX = groundHit.x - this.cameraTarget.x;
            const dirZ = groundHit.z - this.cameraTarget.z;
            const dist = Math.hypot(dirX, dirZ);
            if (dist > 10) {
              this.cameraTarget.x += (dirX / dist) * 80;
              this.cameraTarget.z += (dirZ / dist) * 80;
              this.cameraTarget.y = 0;
            }
          }
        }
      } else if (this.currentView === 'top_2d') {
        // En Planta 2D: anclaje exacto del punto bajo el cursor sin deslizamiento
        const cursorWorld = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, cursorWorld);
        if (hit) {
          this.cameraTarget.x += (cursorWorld.x - this.cameraTarget.x) * (1 - actualFactor);
          this.cameraTarget.z += (cursorWorld.z - this.cameraTarget.z) * (1 - actualFactor);
          this.cameraTarget.y = 0;
        }

        const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
        const frustumSize = this.cameraRadius * 1.5;
        this.orthographicCamera.left = (-frustumSize * aspect) / 2;
        this.orthographicCamera.right = (frustumSize * aspect) / 2;
        this.orthographicCamera.top = frustumSize / 2;
        this.orthographicCamera.bottom = -frustumSize / 2;
        this.orthographicCamera.updateProjectionMatrix();
      } else {
        const aspect = this.container.clientWidth / (this.container.clientHeight || 1);
        const frustumSize = this.cameraRadius * 1.5;
        this.orthographicCamera.left = (-frustumSize * aspect) / 2;
        this.orthographicCamera.right = (frustumSize * aspect) / 2;
        this.orthographicCamera.top = frustumSize / 2;
        this.orthographicCamera.bottom = -frustumSize / 2;
        this.orthographicCamera.updateProjectionMatrix();
      }

      this.updateCameraTransform();
    }, { passive: false });

    // Doble clic para Zoom Extents (estilo AutoCAD clásico)
    el.addEventListener('dblclick', () => {
      if (this.onDblClickZoomFit) {
        this.onDblClickZoomFit();
      } else {
        this.zoomExtents();
      }
    });

    window.addEventListener('resize', () => this.handleResize());
  }

  private panCamera(deltaX: number, deltaY: number) {
    if (deltaX === 0 && deltaY === 0) return;

    const containerH = this.container.clientHeight || 1;

    if (this.currentView === 'perspective_3d') {
      // Paneo sobre el plano horizontal de la planta (Y=0)
      const fovRad = THREE.MathUtils.degToRad(this.perspectiveCamera.fov);
      const visibleHeight = 2 * this.cameraRadius * Math.tan(fovRad / 2);
      const unitsPerPixel = visibleHeight / containerH;

      const forward = new THREE.Vector3();
      this.currentCamera.getWorldDirection(forward);

      // Vector horizontal lateral (estrictamente en el plano XZ)
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
      // Vector horizontal hacia adelante/atrás en el suelo
      const forwardGround = new THREE.Vector3(forward.x, 0, forward.z).normalize();

      // Compensación de perspectiva según el ángulo cenital phi
      const sinPhi = Math.max(0.25, Math.sin(this.cameraPhi));
      const groundYUnitsPerPixel = unitsPerPixel / sinPhi;

      this.cameraTarget.addScaledVector(right, -deltaX * unitsPerPixel);
      this.cameraTarget.addScaledVector(forwardGround, deltaY * groundYUnitsPerPixel);
      this.cameraTarget.y = 0;
      this.updateCameraTransform();
    } else if (this.currentView === 'top_2d') {
      const frustumSize = this.cameraRadius * 1.5;
      const unitsPerPixel = frustumSize / containerH;

      this.cameraTarget.x -= deltaX * unitsPerPixel;
      this.cameraTarget.z -= deltaY * unitsPerPixel;
      this.cameraTarget.y = 0;
      this.updateCameraTransform();
    } else if (this.currentView === 'front_2d') {
      const frustumSize = this.cameraRadius * 1.5;
      const unitsPerPixel = frustumSize / containerH;

      this.cameraTarget.x -= deltaX * unitsPerPixel;
      this.cameraTarget.y += deltaY * unitsPerPixel;
      this.updateCameraTransform();
    } else if (this.currentView === 'side_2d') {
      const frustumSize = this.cameraRadius * 1.5;
      const unitsPerPixel = frustumSize / containerH;

      this.cameraTarget.z += deltaX * unitsPerPixel;
      this.cameraTarget.y += deltaY * unitsPerPixel;
      this.updateCameraTransform();
    }
  }

  private checkPortHover() {
    this.raycaster.setFromCamera(this.mouse, this.currentCamera);
    const intersects = this.raycaster.intersectObjects(this.fittingsGroup.children, true);

    const portHit = intersects.find((hit) => hit.object.userData?.isPort);
    if (portHit) {
      if (this.onPortHover) this.onPortHover(portHit.object.userData.port);
      (portHit.object as THREE.Mesh).scale.set(1.4, 1.4, 1.4);
    } else {
      if (this.onPortHover) this.onPortHover(null);
      this.fittingsGroup.traverse((child) => {
        if (child.userData?.isPort) {
          (child as THREE.Mesh).scale.set(1, 1, 1);
        }
      });
    }
  }

  // OSNAP INDUSTRIAL (Smart Snapping a puertos, extremos de tubos y líneas del plano DXF)
  public getSnapPoint(worldRaycast: THREE.Vector3, screenPixelThreshold = 25): SnapResult | null {
    const frustumH = this.cameraRadius * 1.5;
    const unitsPerPixel = frustumH / (this.container.clientHeight || 800);
    const snapThreshold = Math.max(100, unitsPerPixel * screenPixelThreshold);

    let closestDist = snapThreshold;
    let result: SnapResult | null = null;

    // 1. Snapping a puertos de accesorios (Fittings)
    this.fittingsGroup.traverse((child) => {
      if (child.userData?.isPort) {
        const portPos = new THREE.Vector3();
        child.getWorldPosition(portPos);
        const d = portPos.distanceTo(worldRaycast);
        if (d < closestDist) {
          closestDist = d;
          const pDir = child.userData.port.direction || { x: 0, y: 0, z: 1 };
          result = {
            point: { x: portPos.x, y: portPos.y, z: portPos.z },
            type: 'fitting_port',
            port: child.userData.port,
            pipeDirection: pDir,
            pipeAngle: Math.atan2(pDir.x, pDir.z),
          };
        }
      }
    });

    // 2. DETECCIÓN UNIVERSAL DE ESQUINAS Y UNIONES (PIPE-PIPE, PIPE-DXF, DXF-DXF)
    interface LinearCandidate {
      isPipe: boolean;
      pipeId?: string;
      start: Vector3D;
      end: Vector3D;
      diameter?: number;
    }

    const nearCandidates: LinearCandidate[] = [];

    // Tuberías 3D cercanas al cursor
    this.pipesGroup.children.forEach((mesh) => {
      if (mesh.userData?.isPipe && mesh.userData.start && mesh.userData.end) {
        const s = mesh.userData.start as Vector3D;
        const e = mesh.userData.end as Vector3D;
        const dS = Math.hypot(s.x - worldRaycast.x, s.z - worldRaycast.z);
        const dE = Math.hypot(e.x - worldRaycast.x, e.z - worldRaycast.z);
        if (dS < snapThreshold * 3.5 || dE < snapThreshold * 3.5) {
          nearCandidates.push({
            isPipe: true,
            pipeId: mesh.userData.id,
            start: s,
            end: e,
            diameter: mesh.userData.diameter || 50,
          });
        }
      }
    });

    // Líneas del plano DXF cercanas al cursor usando Spatial Hash Grid O(1)
    const localDxfSegments = this.dxfSegments.length > 0
      ? this.dxfSpatialGrid.queryRadius(worldRaycast.x, worldRaycast.z, snapThreshold * 3.5)
      : [];

    for (let sIdx = 0; sIdx < localDxfSegments.length; sIdx++) {
      const seg = localDxfSegments[sIdx];
      const d1 = Math.hypot(seg.p1.x - worldRaycast.x, seg.p1.z - worldRaycast.z);
      const d2 = Math.hypot(seg.p2.x - worldRaycast.x, seg.p2.z - worldRaycast.z);
      if (d1 < snapThreshold * 3.5 || d2 < snapThreshold * 3.5) {
        nearCandidates.push({
          isPipe: false,
          start: seg.p1,
          end: seg.p2,
          diameter: 50,
        });
      }
    }

    // Buscar si dos tramos se tocan en una esquina
    let bestCornerDist = snapThreshold;
    let cornerResult: SnapResult | null = null;

    for (let i = 0; i < nearCandidates.length; i++) {
      const cA = nearCandidates[i];
      for (let j = i + 1; j < nearCandidates.length; j++) {
        const cB = nearCandidates[j];

        if (cA.isPipe && cB.isPipe && cA.pipeId === cB.pipeId) continue;

        const pairs = [
          { ptA: cA.end, isStartA: false, ptB: cB.start, isStartB: true },
          { ptA: cA.end, isStartA: false, ptB: cB.end, isStartB: false },
          { ptA: cA.start, isStartA: true, ptB: cB.start, isStartB: true },
          { ptA: cA.start, isStartA: true, ptB: cB.end, isStartB: false },
        ];

        for (const p of pairs) {
          const dMeeting = Math.hypot(p.ptA.x - p.ptB.x, p.ptA.z - p.ptB.z);
          if (dMeeting <= Math.max(90, unitsPerPixel * 15)) {
            const Vx = (p.ptA.x + p.ptB.x) / 2;
            const Vz = (p.ptA.z + p.ptB.z) / 2;
            const dist = Math.hypot(worldRaycast.x - Vx, worldRaycast.z - Vz);

            if (dist < bestCornerDist) {
              const farA = p.isStartA ? cA.end : cA.start;
              const vAx = Vx - farA.x;
              const vAz = Vz - farA.z;
              const lenA = Math.hypot(vAx, vAz) || 1;
              const u1 = { x: vAx / lenA, y: 0, z: vAz / lenA };

              const farB = p.isStartB ? cB.end : cB.start;
              const vBx = farB.x - Vx;
              const vBz = farB.z - Vz;
              const lenB = Math.hypot(vBx, vBz) || 1;
              const u2 = { x: vBx / lenB, y: 0, z: vBz / lenB };

              const s = u1.z * u2.x - u1.x * u2.z;
              const dot = u1.x * u2.x + u1.z * u2.z;

              if (Math.abs(dot) < 0.96 && Math.abs(s) > 0.05) {
                bestCornerDist = dist;

                let pipe1Id = cA.isPipe ? cA.pipeId : (cB.isPipe ? cB.pipeId : undefined);
                let pipe2Id = (cA.isPipe && cB.isPipe) ? cB.pipeId : undefined;
                let pipe1End = cA.isPipe ? (p.isStartA ? 'start' : 'end') : (cB.isPipe ? (p.isStartB ? 'start' : 'end') : undefined);
                let pipe2End = (cA.isPipe && cB.isPipe) ? (p.isStartB ? 'start' : 'end') : undefined;

                // Si alguna de las líneas es DXF pero existe una tubería 3D dibujada sobre este nudo:
                if (!pipe1Id || !pipe2Id) {
                  this.pipesGroup.children.forEach((child) => {
                    if (child.userData?.isPipe && child.userData.start && child.userData.end) {
                      const sPt = child.userData.start as Vector3D;
                      const ePt = child.userData.end as Vector3D;
                      const dS = Math.hypot(sPt.x - Vx, sPt.z - Vz);
                      const dE = Math.hypot(ePt.x - Vx, ePt.z - Vz);
                      const pid = child.userData.id;
                      if (dS <= 140) {
                        if (!pipe1Id) { pipe1Id = pid; pipe1End = 'start'; }
                        else if (!pipe2Id && pipe1Id !== pid) { pipe2Id = pid; pipe2End = 'start'; }
                      } else if (dE <= 140) {
                        if (!pipe1Id) { pipe1Id = pid; pipe1End = 'end'; }
                        else if (!pipe2Id && pipe1Id !== pid) { pipe2Id = pid; pipe2End = 'end'; }
                      }
                    }
                  });
                }

                const hasPipe = Boolean(pipe1Id || pipe2Id);

                cornerResult = {
                  point: { x: Vx, y: 0, z: Vz },
                  type: hasPipe ? 'pipe_corner' : 'dxf_corner',
                  pipeDirection: u1,
                  pipeAngle: Math.atan2(u1.x, u1.z),
                  cornerInfo: {
                    pipe1Id,
                    pipe2Id,
                    pipe1End: pipe1End as any,
                    pipe2End: pipe2End as any,
                    V: { x: Vx, y: 0, z: Vz },
                    u1,
                    u2,
                    s,
                    diameter: cA.diameter || cB.diameter || 50,
                  },
                };
              }
            }
          }
        }
      }
    }

    // SI SE DETECTÓ ESQUINA, TIENE MÁXIMA PRIORIDAD
    if (cornerResult) {
      result = cornerResult;
    } else {
      // 3. Snapping a tuberías 3D (extremos y cuerpo de tubería para intercalar accesorios como Tees)
      this.pipesGroup.children.forEach((mesh) => {
        if (mesh.userData?.isPipe && mesh.userData.start && mesh.userData.end) {
          const s = mesh.userData.start as Vector3D;
          const e = mesh.userData.end as Vector3D;
          const vx = e.x - s.x;
          const vz = e.z - s.z;
          const lenSq = vx * vx + vz * vz;
          if (lenSq < 1) return;

          const len = Math.sqrt(lenSq);
          const dir = { x: vx / len, y: 0, z: vz / len };
          const angle = Math.atan2(vx, vz);

          // Proyección ortogonal 't' del cursor sobre el eje del tubo (0 = inicio, 1 = final)
          const t = Math.max(0, Math.min(1, ((worldRaycast.x - s.x) * vx + (worldRaycast.z - s.z) * vz) / lenSq));
          const qx = s.x + t * vx;
          const qz = s.z + t * vz;
          const dist = Math.hypot(worldRaycast.x - qx, worldRaycast.z - qz);

          const pipeRadius = (mesh.userData.diameter || 50) / 2;
          const effectiveThreshold = Math.max(snapThreshold, pipeRadius * 2.2);

          if (dist < effectiveThreshold && dist < closestDist) {
            closestDist = dist;

            const distFromStart = t * len;
            const distFromEnd = (1 - t) * len;
            const endSnapRadius = Math.min(25, Math.max(10, unitsPerPixel * 4));

            if (distFromStart <= endSnapRadius) {
              result = {
                point: { x: s.x, y: s.y, z: s.z },
                type: 'pipe_end',
                pipeDirection: dir,
                pipeAngle: angle,
                pipeInfo: {
                  pipeId: mesh.userData.id,
                  start: s,
                  end: e,
                  diameter: mesh.userData.diameter || 50,
                  length: len,
                  projectionT: 0,
                },
              };
            } else if (distFromEnd <= endSnapRadius) {
              result = {
                point: { x: e.x, y: e.y, z: e.z },
                type: 'pipe_end',
                pipeDirection: dir,
                pipeAngle: angle,
                pipeInfo: {
                  pipeId: mesh.userData.id,
                  start: s,
                  end: e,
                  diameter: mesh.userData.diameter || 50,
                  length: len,
                  projectionT: 1,
                },
              };
            } else {
              // Enganche magnético continuo en cualquier punto intermedio del tubo
              result = {
                point: { x: qx, y: (s.y + e.y) / 2, z: qz },
                type: 'pipe_body',
                pipeDirection: dir,
                pipeAngle: angle,
                pipeInfo: {
                  pipeId: mesh.userData.id,
                  start: s,
                  end: e,
                  diameter: mesh.userData.diameter || 50,
                  length: len,
                  projectionT: t,
                },
              };
            }
          }
        }
      });

      // 4. Snapping a líneas del plano DXF (solo candidatos de proximidad)
      for (let sIdx = 0; sIdx < localDxfSegments.length; sIdx++) {
        const seg = localDxfSegments[sIdx];
        const ax = seg.p1.x, az = seg.p1.z;
        const bx = seg.p2.x, bz = seg.p2.z;
        const vx = bx - ax, vz = bz - az;
        const lenSq = vx * vx + vz * vz;
        if (lenSq < 1) continue;

        const segLen = Math.sqrt(lenSq);
        const segDir = { x: vx / segLen, y: 0, z: vz / segLen };
        const segAngle = Math.atan2(vx, vz);

        const t = Math.max(0, Math.min(1, ((worldRaycast.x - ax) * vx + (worldRaycast.z - az) * vz) / lenSq));
        const qx = ax + t * vx;
        const qz = az + t * vz;
        const dist = Math.hypot(worldRaycast.x - qx, worldRaycast.z - qz);

        if (dist < closestDist) {
          closestDist = dist;

          const distFromA = t * segLen;
          const distFromB = (1 - t) * segLen;
          const endSnapRadius = Math.min(25, Math.max(10, unitsPerPixel * 4));

          if (distFromA <= endSnapRadius) {
            result = {
              point: { x: ax, y: 0, z: az },
              type: 'dxf_endpoint',
              dxfLine: seg,
              pipeDirection: segDir,
              pipeAngle: segAngle,
            };
          } else if (distFromB <= endSnapRadius) {
            result = {
              point: { x: bx, y: 0, z: bz },
              type: 'dxf_endpoint',
              dxfLine: seg,
              pipeDirection: segDir,
              pipeAngle: segAngle,
            };
          } else if (Math.abs(distFromA - segLen / 2) <= endSnapRadius) {
            result = {
              point: { x: (ax + bx) / 2, y: 0, z: (az + bz) / 2 },
              type: 'dxf_midpoint',
              dxfLine: seg,
              pipeDirection: segDir,
              pipeAngle: segAngle,
            };
          } else {
            result = {
              point: { x: qx, y: 0, z: qz },
              type: 'dxf_line',
              dxfLine: seg,
              pipeDirection: segDir,
              pipeAngle: segAngle,
            };
          }
        }
      }
    }

    // Actualizar visualizador verde/dorado OSNAP y línea amarilla resaltada
    if (result && this.snapMarker) {
      this.snapMarker.visible = true;
      this.snapMarker.position.set(result.point.x, 2, result.point.z);
      const markerSize = Math.max(80, unitsPerPixel * 14);
      this.snapMarker.scale.set(markerSize, 5, markerSize);

      if (result.type === 'pipe_corner' || result.type === 'dxf_corner') {
        (this.snapMarker.material as THREE.MeshBasicMaterial).color.setHex(0xffbb00); // Dorado para esquina
      } else if (result.type === 'pipe_body') {
        (this.snapMarker.material as THREE.MeshBasicMaterial).color.setHex(0x00d4ff); // Cian eléctrico para cuerpo de tubería
      } else {
        (this.snapMarker.material as THREE.MeshBasicMaterial).color.setHex(0x00ff88); // Verde para el resto
      }

      if (result.dxfLine && this.highlightLine) {
        this.highlightLine.visible = true;
        const pos = this.highlightLine.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, result.dxfLine.p1.x, 1.5, result.dxfLine.p1.z);
        pos.setXYZ(1, result.dxfLine.p2.x, 1.5, result.dxfLine.p2.z);
        pos.needsUpdate = true;
      } else if (this.highlightLine) {
        this.highlightLine.visible = false;
      }
    } else {
      if (this.snapMarker) this.snapMarker.visible = false;
      if (this.highlightLine) this.highlightLine.visible = false;
    }

    return result;
  }

  public setOsnapEnabled(enabled: boolean) {
    this.isOsnapEnabled = enabled;
    if (!enabled) {
      if (this.snapMarker) this.snapMarker.visible = false;
      if (this.highlightLine) this.highlightLine.visible = false;
    }
    this.requestRender(2);
  }

  public getOsnapEnabled(): boolean {
    return this.isOsnapEnabled;
  }

  public setBackgroundTheme(theme: BackgroundTheme) {
    if (this.bgTheme === theme) return;
    this.bgTheme = theme;
    const isWhite = theme === 'white';
    this.scene.background = new THREE.Color(isWhite ? 0xffffff : 0x14171c);

    // Actualizar Rejilla
    this.updateGrid(this.currentGridSpan || 10000);

    // Actualizar marcadores y guías
    if (this.snapMarker) {
      (this.snapMarker.material as THREE.MeshBasicMaterial).color.setHex(isWhite ? 0x059669 : 0x00ff88);
    }
    if (this.highlightLine) {
      (this.highlightLine.material as THREE.LineBasicMaterial).color.setHex(isWhite ? 0xd97706 : 0xffd700);
    }
    if (this.alignmentLine) {
      (this.alignmentLine.material as THREE.LineDashedMaterial).color.setHex(isWhite ? 0x0284c7 : 0x00ffff);
    }

    // Actualizar aristas de tuberías y accesorios
    const edgeColor = isWhite ? 0x081b33 : 0x0e2035;
    this.pipesGroup.traverse((c) => {
      if (c instanceof THREE.LineSegments && c.material instanceof THREE.LineBasicMaterial) {
        c.material.color.setHex(edgeColor);
      }
    });
    this.fittingsGroup.traverse((c) => {
      if (c instanceof THREE.LineSegments && c.material instanceof THREE.LineBasicMaterial) {
        c.material.color.setHex(edgeColor);
      }
    });

    // Limpiar caché de materiales para regenerar según tema
    this.materialCache.clear();
    this.applyVisualModeToGroup(this.pipesGroup);
    this.applyVisualModeToGroup(this.fittingsGroup);

    // Re-renderizar plano DXF si existe
    if (this.lastDxfEntities) {
      this.renderDxfEntities(this.lastDxfEntities, this.lastDxfOptions);
    }

    this.markDxfTextsDirty();
    this.requestRender(5);
  }

  public getBackgroundTheme(): BackgroundTheme {
    return this.bgTheme;
  }

  public handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();

    const aspect = width / height;
    const frustumSize = this.cameraRadius * 1.5;
    this.orthographicCamera.left = (-frustumSize * aspect) / 2;
    this.orthographicCamera.right = (frustumSize * aspect) / 2;
    this.orthographicCamera.top = frustumSize / 2;
    this.orthographicCamera.bottom = -frustumSize / 2;
    this.orthographicCamera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.updateTextCanvasSize();
  }

  // --- BUCLE DE RENDERIZADO EFICIENTE CON RENDER-ON-DEMAND Y MEDICIÓN DE FPS ---
  private animate = () => {
    requestAnimationFrame(this.animate);

    if (this.needsRender || this.renderHoldFrames > 0) {
      this.renderer.render(this.scene, this.currentCamera);
      if (this.dxfTextsDirty) {
        this.renderDxfTexts();
        this.dxfTextsDirty = false;
      }
      if (this.renderHoldFrames > 0) {
        this.renderHoldFrames--;
      } else {
        this.needsRender = false;
      }
    }

    // Cálculo de FPS en tiempo real
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
      if (this.onFpsUpdate) this.onFpsUpdate(this.needsRender || this.renderHoldFrames > 0 ? fps : 60);
      this.frameCount = 0;
      this.lastTime = now;
    }
  };

  public destroy() {
    this.disposeHierarchy(this.scene);
    this.renderer.dispose();
    if (this.textCanvas && this.container.contains(this.textCanvas)) {
      this.container.removeChild(this.textCanvas);
    }
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
