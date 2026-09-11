// scripts/index_ultra_catalog.js
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import occtimportjs from 'occt-import-js';

// Polyfill FileReader for Node.js GLTFExporter binary mode
class FileReaderPolyfill {
  constructor() {
    this.onload = null;
    this.onloadend = null;
    this.onerror = null;
    this.result = null;
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onload) this.onload({ target: this });
      if (this.onloadend) this.onloadend({ target: this });
    }).catch(err => {
      if (this.onerror) this.onerror(err);
      if (this.onloadend) this.onloadend({ target: this });
    });
  }
}
globalThis.FileReader = FileReaderPolyfill;

const ULTRA_DIR = 'C:/Users/Proair/Desktop/Ultra';
const PUBLIC_MODELS_DIR = path.resolve('public/models/ultra');
const CATALOG_OUTPUT_PATH = path.resolve('src/catalog/airpipeCatalog.ts');

const DIAMETER_MAP = {
  '0': 15,
  '1': 20,
  '2': 25,
  '3': 32,
  '4': 40,
  '5': 50,
  '6': 63,
  '7': 80,
  '8': 100,
  '9': 125,
  'A': 160,
  'a': 160
};

const INCH_MAP = {
  15: '1/2"',
  20: '3/4"',
  25: '1"',
  32: '1-1/4"',
  40: '1-1/2"',
  50: '2"',
  63: '2-1/2"',
  80: '3"',
  100: '4"',
  125: '5"',
  160: '6"'
};

// Folder category mapping
const FOLDER_CONFIG = {
  'codo 90': { category: 'elbow_90', prefix: 'Codo 90° Aluminio' },
  'Codos 45': { category: 'elbow_45', prefix: 'Codo 45° Aluminio' },
  'cople union': { category: 'coupling', prefix: 'Cople Unión Rápida' },
  'tee': { category: 'tee', prefix: 'Tee Igual Aluminio' },
  'te reduccion': { category: 'tee', prefix: 'Tee Reducción Aluminio' },
  'tapones': { category: 'cap', prefix: 'Tapón Terminal Aluminio' },
  'reduccion tubo a tubo': { category: 'reducer', prefix: 'Reducción Tubo a Tubo' },
  'quick drop': { category: 'quick_drop', prefix: 'Quick Drop Bajada Directa' },
  'quick drop rosca hembra': { category: 'quick_drop', prefix: 'Quick Drop Rosca Hembra' },
  'codo hembra': { category: 'elbow_90', prefix: 'Codo 90° Rosca Hembra' },
  'codo con rosca': { category: 'elbow_90', prefix: 'Codo 90° Rosca Macho' },
  'adaptador macho con rosca': { category: 'adapter', prefix: 'Adaptador Tubo a Rosca Macho' },
  'adaptadopr rosca hembra': { category: 'adapter', prefix: 'Adaptador Tubo a Rosca Hembra' },
  'Abrazaderas': { category: 'clamp', prefix: 'Abrazadera de Fijación' },
  'brida reduccion ansi aluminio': { category: 'flange', prefix: 'Brida Reducción ANSI 150#' }
};

function parseCode(filename) {
  let base = path.basename(filename, path.extname(filename)).trim();
  base = base.replace(/dwg$/i, '');
  return base;
}

function resolveDiameters(code, folderName) {
  const c0 = code.charAt(0).toUpperCase();
  const c1 = code.charAt(1).toUpperCase();
  
  let d1 = DIAMETER_MAP[c0] || 25;
  let d2 = DIAMETER_MAP[c1] || d1;

  if (folderName === 'brida reduccion ansi aluminio') {
    if (code === '0771') { d1 = 80; d2 = 80; }
    else if (code === '0871') { d1 = 100; d2 = 100; }
    else if (code === '0971') { d1 = 125; d2 = 125; }
    else {
      d1 = DIAMETER_MAP[c0] || 63;
      d2 = DIAMETER_MAP[c1] || 80;
    }
  }

  return { d1, d2 };
}

function computePorts(category, d1, d2, bbox) {
  const ports = [];
  const minX = bbox.min.x;
  const maxX = bbox.max.x;
  const minZ = bbox.min.z;
  const maxZ = bbox.max.z;

  switch (category) {
    case 'elbow_90': {
      ports.push({
        id: 'p1',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p2',
        position: { x: 0, y: 0, z: Number(maxZ.toFixed(1)) },
        direction: { x: 0, y: 0, z: 1 },
        diameter: d2 || d1
      });
      break;
    }

    case 'elbow_45': {
      ports.push({
        id: 'p1',
        position: { x: 0, y: 0, z: Number(maxZ.toFixed(1)) },
        direction: { x: 0, y: 0, z: 1 },
        diameter: d1
      });
      const rad45 = Math.PI / 4;
      ports.push({
        id: 'p2',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: Number(minZ.toFixed(1)) },
        direction: { x: Number(Math.cos(rad45).toFixed(4)), y: 0, z: Number(-Math.sin(rad45).toFixed(4)) },
        diameter: d1
      });
      break;
    }

    case 'coupling':
    case 'reducer': {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p2',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        diameter: d2 || d1
      });
      break;
    }

    case 'tee': {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p2',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p3',
        position: { x: 0, y: 0, z: Number(maxZ.toFixed(1)) },
        direction: { x: 0, y: 0, z: 1 },
        diameter: d2 || d1
      });
      break;
    }

    case 'cap': {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
      break;
    }

    case 'quick_drop': {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p2',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p_drop',
        position: { x: 0, y: Number(bbox.min.y.toFixed(1)), z: 0 },
        direction: { x: 0, y: -1, z: 0 },
        diameter: d2 || 25
      });
      break;
    }

    case 'adapter':
    case 'flange': {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
      ports.push({
        id: 'p2',
        position: { x: Number(maxX.toFixed(1)), y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        diameter: d2 || d1
      });
      break;
    }

    case 'clamp': {
      ports.push({
        id: 'p_support',
        position: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
        diameter: d1
      });
      break;
    }

    default: {
      ports.push({
        id: 'p1',
        position: { x: Number(minX.toFixed(1)), y: 0, z: 0 },
        direction: { x: -1, y: 0, z: 0 },
        diameter: d1
      });
    }
  }

  return ports;
}

async function main() {
  console.log('=== PipeCAD Studio: 157 Ultra STEP Models Indexer ===\n');

  if (!fs.existsSync(PUBLIC_MODELS_DIR)) {
    fs.mkdirSync(PUBLIC_MODELS_DIR, { recursive: true });
  }

  console.log('Initializing OpenCASCADE WASM engine...');
  const occt = await occtimportjs();
  console.log('OpenCASCADE engine ready!\n');

  const folders = fs.readdirSync(ULTRA_DIR).filter(f => {
    return fs.statSync(path.join(ULTRA_DIR, f)).isDirectory();
  });

  const catalogItems = [];
  let totalProcessed = 0;
  const startTime = Date.now();

  for (const folder of folders) {
    const config = FOLDER_CONFIG[folder] || { category: 'coupling', prefix: folder };
    const folderPath = path.join(ULTRA_DIR, folder);
    const stepFiles = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.step'));

    console.log(`\n--- Processing [${folder}] (${stepFiles.length} items) ---`);

    for (const stepFile of stepFiles) {
      const code = parseCode(stepFile);
      const fullPath = path.join(folderPath, stepFile);
      const { d1, d2 } = resolveDiameters(code, folder);
      const glbFileName = `${code}.glb`;
      const glbFilePath = path.join(PUBLIC_MODELS_DIR, glbFileName);

      let sz = new THREE.Vector3(50, 50, 50);
      let bbox = new THREE.Box3();

      if (!fs.existsSync(glbFilePath)) {
        const fileBuffer = fs.readFileSync(fullPath);
        const result = occt.ReadStepFile(fileBuffer, null);
        if (!result.success || !result.meshes || result.meshes.length === 0) {
          console.error(`  [FAILED] ${stepFile}: could not parse STEP geometry`);
          continue;
        }

        const group = new THREE.Group();
        const rotMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

        for (const m of result.meshes) {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
          if (m.attributes.normal) {
            geom.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
          } else {
            geom.computeVertexNormals();
          }
          geom.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index.array), 1));
          
          geom.applyMatrix4(rotMatrix);
          geom.computeBoundingBox();
          bbox.union(geom.boundingBox);

          const col = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0x2563eb);
          const mat = new THREE.MeshStandardMaterial({
            color: col,
            metalness: 0.35,
            roughness: 0.45
          });
          group.add(new THREE.Mesh(geom, mat));
        }

        const exporter = new GLTFExporter();
        const glb = await new Promise((resolve, reject) => {
          exporter.parse(group, resolve, reject, { binary: true });
        });
        fs.writeFileSync(glbFilePath, Buffer.from(glb));
        bbox.getSize(sz);
      } else {
        // Approximate dimensions from diameters if already exported
        sz = new THREE.Vector3(d1 * 2.5, d1 * 1.5, d1 * 2.5);
        bbox.min.set(-d1, -d1 / 2, -d1);
        bbox.max.set(d1, d1 / 2, d1);
      }

      const ports = computePorts(config.category, d1, d2, bbox);

      let itemName = '';
      if (['codo 90', 'Codos 45', 'cople union', 'tee', 'tapones'].includes(folder)) {
        itemName = `${config.prefix} DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) - Cod. ${code}`;
      } else if (folder === 'Abrazaderas') {
        const isSpacer = code.charAt(1) === '1';
        itemName = `Abrazadera DN${d1} (${INCH_MAP[d1] || d1 + 'mm'})${isSpacer ? ' c/Espaciador' : ''} - Cod. ${code}`;
      } else if (folder === 'te reduccion') {
        itemName = `Tee Reducción DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) x DN${d2} (${INCH_MAP[d2] || d2 + 'mm'}) - Cod. ${code}`;
      } else if (folder === 'reduccion tubo a tubo') {
        itemName = `Reducción Tubo DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) a DN${d2} (${INCH_MAP[d2] || d2 + 'mm'}) - Cod. ${code}`;
      } else if (folder === 'quick drop') {
        itemName = `Quick Drop Bajada DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) a DN${d2} (${INCH_MAP[d2] || d2 + 'mm'}) - Cod. ${code}`;
      } else if (folder === 'brida reduccion ansi aluminio') {
        if (['0771', '0871', '0971'].includes(code)) {
          itemName = `Brida ANSI 150# DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) - Cod. ${code}`;
        } else {
          itemName = `Brida Reducción ANSI DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) a DN${d2} (${INCH_MAP[d2] || d2 + 'mm'}) - Cod. ${code}`;
        }
      } else {
        itemName = `${config.prefix} DN${d1} (${INCH_MAP[d1] || d1 + 'mm'}) - Cod. ${code}`;
      }

      const catalogEntry = {
        id: `ultra_${code.toLowerCase()}`,
        code: `AP-${code}`,
        name: itemName,
        category: config.category,
        nominalDiameter: d1,
        ports,
        modelUrl: `/models/ultra/${glbFileName}`,
        stepFileName: `${folder}/${stepFile}`,
        dimensions: {
          length: Number(sz.x.toFixed(1)),
          width: Number(sz.z.toFixed(1)),
          height: Number(sz.y.toFixed(1))
        }
      };

      catalogItems.push(catalogEntry);
      totalProcessed++;
    }
  }

  // Backward-compatible aliases for demo and original items
  const aliases = [
    { ...(catalogItems.find(i => i.code === 'AP-2003') || catalogItems[0]), id: 'codo_90_dn25' },
    { ...(catalogItems.find(i => i.code === 'AP-4003') || catalogItems[0]), id: 'codo_90_dn40' },
    { ...(catalogItems.find(i => i.code === 'AP-5003') || catalogItems[0]), id: 'codo_90_dn50' },
    { ...(catalogItems.find(i => i.code === 'AP-6003') || catalogItems[0]), id: 'codo_90_dn63' },
    { ...(catalogItems.find(i => i.code === 'AP-2004') || catalogItems[0]), id: 'codo_45_dn25' },
    { ...(catalogItems.find(i => i.code === 'AP-5004') || catalogItems[0]), id: 'codo_45_dn50' },
    { ...(catalogItems.find(i => i.code === 'AP-2005') || catalogItems[0]), id: 'tee_dn25' },
    { ...(catalogItems.find(i => i.code === 'AP-5005') || catalogItems[0]), id: 'tee_dn50' },
    { ...(catalogItems.find(i => i.code === 'AP-2002') || catalogItems[0]), id: 'cople_dn25' },
    { ...(catalogItems.find(i => i.code === 'AP-5002') || catalogItems[0]), id: 'cople_dn50' },
    { ...(catalogItems.find(i => i.code === 'AP-2006') || catalogItems[0]), id: 'tapon_dn25' },
    { ...(catalogItems.find(i => i.code === 'AP-5210') || catalogItems[0]), id: 'quick_drop_50_25' },
    { ...(catalogItems.find(i => i.code === 'AP-0771') || catalogItems[0]), id: 'brida_dn50' },
    {
      id: 'valvula_dn25',
      code: 'AP-VAL-025',
      name: 'Válvula de Esfera Palanca 25mm (1")',
      category: 'valve',
      nominalDiameter: 25,
      dimensions: { length: 110, width: 60, height: 95 },
      ports: [
        { id: 'p1', position: { x: -55, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 }, diameter: 25 },
        { id: 'p2', position: { x: 55, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, diameter: 25 }
      ]
    },
    {
      id: 'valvula_dn50',
      code: 'AP-VAL-050',
      name: 'Válvula de Esfera Palanca 50mm (2")',
      category: 'valve',
      nominalDiameter: 50,
      dimensions: { length: 160, width: 100, height: 140 },
      ports: [
        { id: 'p1', position: { x: -80, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 }, diameter: 50 },
        { id: 'p2', position: { x: 80, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, diameter: 50 }
      ]
    }
  ];

  const fullList = [...catalogItems, ...aliases];
  console.log(`\nGenerating catalog TypeScript definitions in ${CATALOG_OUTPUT_PATH} (${fullList.length} items)...`);

  const tsContent = `// Generated automatically from 157 Ultra Industrial STEP Models
// OpenCASCADE B-Rep Tessellation Engine
import { FittingDefinition } from '../types/cad';

export const AIRPIPE_CATALOG: FittingDefinition[] = ${JSON.stringify(fullList, null, 2)};
`;

  fs.writeFileSync(CATALOG_OUTPUT_PATH, tsContent, 'utf8');
  console.log(`Successfully generated ${CATALOG_OUTPUT_PATH}!`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
}

main().catch(console.error);