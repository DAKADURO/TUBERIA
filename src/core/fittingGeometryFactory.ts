import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FittingDefinition } from '../types/cad';

/**
 * Curva para Codo a 90° con mangas rectas de inserción (sleeve) y arco horizontal en plano XZ.
 * Inicia en (0, 0, 0) con dirección +Z y termina en (R+S, 0, R+S) con dirección +X.
 */
class Elbow90Curve extends THREE.Curve<THREE.Vector3> {
  constructor(public Larm: number, public S: number) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const R = this.Larm - this.S;
    const arcLen = (Math.PI / 2) * R;
    const totalLen = this.S + arcLen + this.S;
    const s = t * totalLen;

    if (s <= this.S) {
      // Manga recta 1: desde (Larm, 0, 0) hacia (R, 0, 0)
      return target.set(this.Larm - s, 0, 0);
    } else if (s <= this.S + arcLen) {
      // Arco circular de 90° centrado en (R, 0, R)
      const theta = ((s - this.S) / arcLen) * (Math.PI / 2);
      return target.set(
        R - R * Math.sin(theta),
        0,
        R - R * Math.cos(theta)
      );
    } else {
      // Manga recta 2: desde (0, 0, R) hacia (0, 0, Larm)
      const rem = s - (this.S + arcLen);
      return target.set(0, 0, R + rem);
    }
  }
}

/**
 * Curva para Codo a 45° con mangas rectas y arco horizontal en plano XZ.
 */
class Elbow45Curve extends THREE.Curve<THREE.Vector3> {
  constructor(public R: number, public S: number) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const arcAngle = Math.PI / 4;
    const arcLen = arcAngle * this.R;
    const totalLen = this.S + arcLen + this.S;
    const s = t * totalLen;

    if (s <= this.S) {
      return target.set(0, 0, s);
    } else if (s <= this.S + arcLen) {
      const theta = ((s - this.S) / arcLen) * arcAngle;
      return target.set(
        this.R * (1 - Math.cos(theta)),
        0,
        this.S + this.R * Math.sin(theta)
      );
    } else {
      const rem = s - (this.S + arcLen);
      const endX = this.R * (1 - Math.cos(arcAngle));
      const endZ = this.S + this.R * Math.sin(arcAngle);
      const dx = Math.sin(arcAngle);
      const dz = Math.cos(arcAngle);
      return target.set(endX + rem * dx, 0, endZ + rem * dz);
    }
  }
}

/**
 * Generador geométrico paramétrico de accesorios Airpipe.
 * Modela con precisión milimétrica las proporciones de los modelos STEP:
 * Codos de 90° y 45°, Tees, Coples, Válvulas con maneta, Quick Drops y Bridas.
 * Todas las geometrías yacen coherentemente en el plano horizontal XZ (Y = 0).
 */
export interface CachedFittingGeometry {
  geometry: THREE.BufferGeometry;
  edgesGeometry: THREE.BufferGeometry;
  color: number;
}

export class FittingGeometryFactory {
  private static realModelCache = new Map<string, CachedFittingGeometry>();
  private static proceduralCache = new Map<string, CachedFittingGeometry>();
  private static gltfLoader = new GLTFLoader();
  private static loadingPromises = new Map<string, Promise<THREE.BufferGeometry | null>>();
  private static listeners = new Set<(fittingId: string) => void>();

  public static onModelLoaded(listener: (fittingId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public static hasRealModel(fittingId: string): boolean {
    return this.realModelCache.has(fittingId);
  }

  public static getCachedGeometry(fittingId: string): CachedFittingGeometry | undefined {
    return this.realModelCache.get(fittingId) || this.proceduralCache.get(fittingId);
  }

  public static preloadModel(fitting: FittingDefinition): void {
    if (!fitting.modelUrl || this.realModelCache.has(fitting.id) || this.loadingPromises.has(fitting.id)) {
      return;
    }
    this.loadGlbGeometry(fitting);
  }

  private static async loadGlbGeometry(fitting: FittingDefinition): Promise<THREE.BufferGeometry | null> {
    if (!fitting.modelUrl) return null;
    const promise = (async () => {
      try {
        const gltf = await this.gltfLoader.loadAsync(fitting.modelUrl!);
        const geoms: THREE.BufferGeometry[] = [];
        
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            const geom = m.geometry.clone();
            geom.applyMatrix4(m.matrixWorld);
            geoms.push(geom);
          }
        });

        if (geoms.length > 0) {
          const merged = geoms.length === 1 ? geoms[0] : (mergeGeometries(geoms, false) || geoms[0]);
          const edgesGeometry = new THREE.EdgesGeometry(merged, 25);
          const result: CachedFittingGeometry = {
            geometry: merged,
            edgesGeometry,
            color: 0x2b3847, // Acabado industrial metálico Airpipe
          };
          this.realModelCache.set(fitting.id, result);
          this.listeners.forEach((cb) => cb(fitting.id));
          return merged;
        }
      } catch (err) {
        console.warn(`[FittingGeometryFactory] Could not load GLB for ${fitting.id} (${fitting.modelUrl}):`, err);
      }
      return null;
    })();

    this.loadingPromises.set(fitting.id, promise);
    return promise;
  }

  public static createGeometry(fitting: FittingDefinition): CachedFittingGeometry {
    const realCached = this.realModelCache.get(fitting.id);
    if (realCached) {
      return realCached;
    }

    // Disparar carga asíncrona del modelo STEP real si aún no se ha iniciado
    if (fitting.modelUrl && !this.loadingPromises.has(fitting.id)) {
      this.loadGlbGeometry(fitting);
    }

    const procCached = this.proceduralCache.get(fitting.id);
    if (procCached) {
      return procCached;
    }

    const generated = this.generateGeometry(fitting);
    const edgesGeometry = new THREE.EdgesGeometry(generated.geometry, 25);
    const result: CachedFittingGeometry = {
      geometry: generated.geometry,
      edgesGeometry,
      color: generated.color,
    };
    this.proceduralCache.set(fitting.id, result);
    return result;
  }

  private static generateGeometry(fitting: FittingDefinition): {
    geometry: THREE.BufferGeometry;
    color: number;
  } {
    const d = fitting.nominalDiameter;
    const r = d / 2;

    switch (fitting.category) {
      case 'elbow_90': {
        const Larm = Math.max(fitting.ports[0]?.position.x || 0, fitting.ports[1]?.position.z || 0) || 50;
        const S = Math.round(Larm * 0.28);
        const curve = new Elbow90Curve(Larm, S);
        const geometry = new THREE.TubeGeometry(curve, 24, r * 1.08, 16, false);
        return { geometry, color: 0x2b3847 }; // Aluminio oscuro anodizado Airpipe
      }

      case 'elbow_45': {
        // Codo de 45° en plano horizontal XZ
        const p2 = fitting.ports[1]?.position || { x: 35, y: 0, z: 35 };
        const legLen = Math.max(30, Math.hypot(p2.x, p2.z) * 0.7);
        const S = Math.round(legLen * 0.25);
        const R = legLen - S;

        const curve = new Elbow45Curve(R, S);
        const geometry = new THREE.TubeGeometry(curve, 20, r * 1.08, 16, false);
        return { geometry, color: 0x2b3847 };
      }

      case 'tee': {
        // Tee de 3 vías: cuerpo pasante en X + ramal en +Z en plano horizontal XZ
        const length = fitting.dimensions.length;
        const branchW = fitting.dimensions.width;

        const mainCyl = new THREE.CylinderGeometry(r * 1.1, r * 1.1, length, 16);
        mainCyl.rotateZ(-Math.PI / 2); // Alineado en el eje X (de -length/2 a +length/2)

        const branchCyl = new THREE.CylinderGeometry(r * 1.1, r * 1.1, branchW, 16);
        branchCyl.rotateX(Math.PI / 2); // Alineado en el eje Z (de 0 a +branchW)
        branchCyl.translate(0, 0, branchW / 2);

        const merged = mergeGeometries([mainCyl, branchCyl]) || mainCyl;
        return { geometry: merged, color: 0x2b3847 };
      }

      case 'coupling': {
        // Cople de unión cilíndrico en eje X con anillo de refuerzo central
        const length = fitting.dimensions.length;
        const mainCyl = new THREE.CylinderGeometry(r * 1.15, r * 1.15, length, 16);
        mainCyl.rotateZ(-Math.PI / 2); // Alineado en el eje X

        const ringCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length * 0.3, 16);
        ringCyl.rotateZ(-Math.PI / 2);

        const merged = mergeGeometries([mainCyl, ringCyl]) || mainCyl;
        return { geometry: merged, color: 0x0080ff }; // Azul Airpipe
      }

      case 'valve': {
        // Cuerpo de válvula cilíndrico en X + cuello en +Y + palanca de apertura
        const length = fitting.dimensions.length;
        const bodyCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length, 16);
        bodyCyl.rotateZ(-Math.PI / 2); // Alineado en el eje X (conecta con puertos p1 y p2)

        // Cuello vertical hacia +Y
        const neckH = r * 1.6;
        const neckCyl = new THREE.CylinderGeometry(r * 0.45, r * 0.45, neckH, 12);
        neckCyl.translate(0, r * 1.1 + neckH / 2, 0);

        // Maneta / palanca horizontal a lo largo del tubo
        const handleBox = new THREE.BoxGeometry(length * 0.75, r * 0.25, r * 0.5);
        handleBox.translate(length * 0.2, r * 1.1 + neckH + r * 0.12, 0);

        const merged = mergeGeometries([bodyCyl, neckCyl, handleBox]) || bodyCyl;
        return { geometry: merged, color: 0x1f2937 };
      }

      case 'quick_drop': {
        // Collarín sobre tubo principal en X + bajante hacia abajo (-Y)
        const length = fitting.dimensions.length;
        const saddleCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length, 16);
        saddleCyl.rotateZ(-Math.PI / 2); // Alineado en el eje X

        const dropH = fitting.dimensions.height || 60;
        const dropCyl = new THREE.CylinderGeometry(r * 0.9, r * 0.9, dropH, 14);
        dropCyl.translate(0, -dropH / 2, 0);

        const merged = mergeGeometries([saddleCyl, dropCyl]) || saddleCyl;
        return { geometry: merged, color: 0x007acc };
      }

      case 'flange': {
        // Brida ANSI: cuello en X + disco exterior
        const diskOD = fitting.dimensions.length / 2;
        const thickness = fitting.dimensions.height;

        const neck = new THREE.CylinderGeometry(r * 1.15, r * 1.15, thickness * 0.7, 16);
        neck.rotateZ(-Math.PI / 2);
        neck.translate(-thickness * 0.35, 0, 0);

        const disk = new THREE.CylinderGeometry(diskOD, diskOD, thickness * 0.3, 24);
        disk.rotateZ(-Math.PI / 2);
        disk.translate(thickness * 0.15, 0, 0);

        const merged = mergeGeometries([neck, disk]) || disk;
        return { geometry: merged, color: 0x475569 };
      }

      case 'cap': {
        // Tapón terminal con cúpula en eje X
        const length = fitting.dimensions.length;
        const cyl = new THREE.CylinderGeometry(r * 1.12, r * 1.12, length * 0.7, 16);
        cyl.rotateZ(-Math.PI / 2);
        cyl.translate(-length * 0.35, 0, 0);

        const dome = new THREE.SphereGeometry(r * 1.12, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.rotateZ(-Math.PI / 2);

        const merged = mergeGeometries([cyl, dome]) || cyl;
        return { geometry: merged, color: 0x0080ff };
      }

      default: {
        const box = new THREE.BoxGeometry(d, d, d);
        return { geometry: box, color: 0x94a3b8 };
      }
    }
  }
}
