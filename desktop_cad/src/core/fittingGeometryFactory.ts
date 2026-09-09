import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FittingDefinition } from '../types/cad';

/**
 * Curva para Codo a 90° con mangas rectas de inserción (sleeve) y arco horizontal en plano XZ.
 * Inicia en (0, 0, 0) con dirección +Z y termina en (R+S, 0, R+S) con dirección +X.
 */
class Elbow90Curve extends THREE.Curve<THREE.Vector3> {
  constructor(public R: number, public S: number) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const arcAngle = Math.PI / 2;
    const arcLen = arcAngle * this.R;
    const totalLen = this.S + arcLen + this.S;
    const s = t * totalLen;

    if (s <= this.S) {
      // Manga recta inicial (orientada en +Z)
      return target.set(0, 0, s);
    } else if (s <= this.S + arcLen) {
      // Arco de 90° en plano horizontal XZ
      const theta = ((s - this.S) / arcLen) * arcAngle;
      return target.set(
        this.R * (1 - Math.cos(theta)),
        0,
        this.S + this.R * Math.sin(theta)
      );
    } else {
      // Manga recta final (orientada en +X)
      const rem = s - (this.S + arcLen);
      return target.set(this.R + rem, 0, this.S + this.R);
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
export class FittingGeometryFactory {
  public static createGeometry(fitting: FittingDefinition): { geometry: THREE.BufferGeometry; color: number } {
    const d = fitting.nominalDiameter;
    const r = d / 2;

    switch (fitting.category) {
      case 'elbow_90': {
        // Codo de 90° con arco toroidal en plano horizontal XZ y mangas de unión
        const p2 = fitting.ports[1]?.position || { x: 50, y: 0, z: 50 };
        const legLen = Math.max(35, p2.x);
        const S = Math.round(legLen * 0.3);
        const R = legLen - S;

        const curve = new Elbow90Curve(R, S);
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
        // Tee de 3 vías: cuerpo pasante en Z + ramal en X en plano horizontal XZ
        const length = fitting.dimensions.length;
        const branchW = fitting.dimensions.width;

        const mainCyl = new THREE.CylinderGeometry(r * 1.1, r * 1.1, length, 16);
        mainCyl.rotateX(Math.PI / 2); // Alineado en el eje Z

        const branchCyl = new THREE.CylinderGeometry(r * 1.1, r * 1.1, branchW, 16);
        branchCyl.rotateZ(-Math.PI / 2); // Alineado en el eje X
        branchCyl.translate(branchW / 2, 0, 0);

        const merged = mergeGeometries([mainCyl, branchCyl]) || mainCyl;
        return { geometry: merged, color: 0x2b3847 };
      }

      case 'coupling': {
        // Cople de unión cilíndrico con anillo de refuerzo central
        const length = fitting.dimensions.length;
        const mainCyl = new THREE.CylinderGeometry(r * 1.15, r * 1.15, length, 16);
        mainCyl.rotateX(Math.PI / 2); // Alineado en el eje Z

        const ringCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length * 0.3, 16);
        ringCyl.rotateX(Math.PI / 2);

        const merged = mergeGeometries([mainCyl, ringCyl]) || mainCyl;
        return { geometry: merged, color: 0x0080ff }; // Azul Airpipe
      }

      case 'valve': {
        // Cuerpo de válvula cilíndrico en Z + cuello en +Y + palanca de apertura
        const length = fitting.dimensions.length;
        const bodyCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length, 16);
        bodyCyl.rotateX(Math.PI / 2); // Alineado en eje Z

        // Cuello vertical hacia +Y
        const neckH = r * 1.6;
        const neckCyl = new THREE.CylinderGeometry(r * 0.45, r * 0.45, neckH, 12);
        neckCyl.translate(0, r * 1.1 + neckH / 2, 0);

        // Maneta / palanca horizontal
        const handleBox = new THREE.BoxGeometry(r * 0.5, r * 0.25, length * 0.85);
        handleBox.translate(0, r * 1.1 + neckH + r * 0.12, length * 0.25);

        const merged = mergeGeometries([bodyCyl, neckCyl, handleBox]) || bodyCyl;
        return { geometry: merged, color: 0x1f2937 };
      }

      case 'quick_drop': {
        // Collarín sobre tubo principal en Z + bajante hacia abajo (-Y)
        const length = fitting.dimensions.length;
        const saddleCyl = new THREE.CylinderGeometry(r * 1.3, r * 1.3, length, 16);
        saddleCyl.rotateX(Math.PI / 2);

        const dropH = fitting.dimensions.height || 60;
        const dropCyl = new THREE.CylinderGeometry(r * 0.9, r * 0.9, dropH, 14);
        dropCyl.translate(0, -dropH / 2, 0);

        const merged = mergeGeometries([saddleCyl, dropCyl]) || saddleCyl;
        return { geometry: merged, color: 0x007acc };
      }

      case 'flange': {
        // Brida ANSI: cuello en Z + disco exterior
        const diskOD = fitting.dimensions.length / 2;
        const thickness = fitting.dimensions.height;

        const neck = new THREE.CylinderGeometry(r * 1.15, r * 1.15, thickness * 0.7, 16);
        neck.rotateX(Math.PI / 2);
        neck.translate(0, 0, -thickness * 0.35);

        const disk = new THREE.CylinderGeometry(diskOD, diskOD, thickness * 0.3, 24);
        disk.rotateX(Math.PI / 2);
        disk.translate(0, 0, thickness * 0.15);

        const merged = mergeGeometries([neck, disk]) || disk;
        return { geometry: merged, color: 0x475569 };
      }

      case 'cap': {
        // Tapón terminal con cúpula
        const length = fitting.dimensions.length;
        const cyl = new THREE.CylinderGeometry(r * 1.12, r * 1.12, length * 0.7, 16);
        cyl.rotateX(Math.PI / 2);
        cyl.translate(0, 0, -length * 0.35);

        const dome = new THREE.SphereGeometry(r * 1.12, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.rotateX(Math.PI / 2);

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
