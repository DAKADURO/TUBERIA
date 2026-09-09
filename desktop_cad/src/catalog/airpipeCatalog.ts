import { FittingDefinition } from '../types/cad';

export const AIRPIPE_CATALOG: FittingDefinition[] = [
  // --- CODOS 90° ---
  {
    id: 'codo_90_dn25',
    code: 'AP-C90-025',
    name: 'Codo 90° Aluminio 25mm (1")',
    category: 'elbow_90',
    nominalDiameter: 25,
    dimensions: { length: 70, width: 70, height: 40 },
    stepFileName: 'CODO 90/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
      { id: 'p2', position: { x: 50, y: 0, z: 50 }, direction: { x: 1, y: 0, z: 0 }, diameter: 25 },
    ],
  },
  {
    id: 'codo_90_dn40',
    code: 'AP-C90-040',
    name: 'Codo 90° Aluminio 40mm (1-1/2")',
    category: 'elbow_90',
    nominalDiameter: 40,
    dimensions: { length: 95, width: 95, height: 60 },
    stepFileName: 'CODO 90/40.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 40 },
      { id: 'p2', position: { x: 70, y: 0, z: 70 }, direction: { x: 1, y: 0, z: 0 }, diameter: 40 },
    ],
  },
  {
    id: 'codo_90_dn50',
    code: 'AP-C90-050',
    name: 'Codo 90° Aluminio 50mm (2")',
    category: 'elbow_90',
    nominalDiameter: 50,
    dimensions: { length: 115, width: 115, height: 75 },
    stepFileName: 'CODO 90/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 85, y: 0, z: 85 }, direction: { x: 1, y: 0, z: 0 }, diameter: 50 },
    ],
  },
  {
    id: 'codo_90_dn63',
    code: 'AP-C90-063',
    name: 'Codo 90° Aluminio 63mm (2-1/2")',
    category: 'elbow_90',
    nominalDiameter: 63,
    dimensions: { length: 140, width: 140, height: 90 },
    stepFileName: 'CODO 90/63.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 63 },
      { id: 'p2', position: { x: 105, y: 0, z: 105 }, direction: { x: 1, y: 0, z: 0 }, diameter: 63 },
    ],
  },

  // --- CODOS 45° ---
  {
    id: 'codo_45_dn25',
    code: 'AP-C45-025',
    name: 'Codo 45° Aluminio 25mm (1")',
    category: 'elbow_45',
    nominalDiameter: 25,
    dimensions: { length: 60, width: 45, height: 40 },
    stepFileName: 'CODOS 45/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
      { id: 'p2', position: { x: 35, y: 0, z: 35 }, direction: { x: 0.7071, y: 0, z: 0.7071 }, diameter: 25 },
    ],
  },
  {
    id: 'codo_45_dn50',
    code: 'AP-C45-050',
    name: 'Codo 45° Aluminio 50mm (2")',
    category: 'elbow_45',
    nominalDiameter: 50,
    dimensions: { length: 85, width: 65, height: 75 },
    stepFileName: 'CODOS 45/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 55, y: 0, z: 55 }, direction: { x: 0.7071, y: 0, z: 0.7071 }, diameter: 50 },
    ],
  },

  // --- TEES ---
  {
    id: 'tee_dn25',
    code: 'AP-TEE-025',
    name: 'Tee Igual Aluminio 25mm (1")',
    category: 'tee',
    nominalDiameter: 25,
    dimensions: { length: 100, width: 70, height: 40 },
    stepFileName: 'TEE/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -50 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
      { id: 'p2', position: { x: 0, y: 0, z: 50 }, direction: { x: 0, y: 0, z: 1 }, diameter: 25 },
      { id: 'p3', position: { x: 70, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, diameter: 25 },
    ],
  },
  {
    id: 'tee_dn50',
    code: 'AP-TEE-050',
    name: 'Tee Igual Aluminio 50mm (2")',
    category: 'tee',
    nominalDiameter: 50,
    dimensions: { length: 150, width: 105, height: 75 },
    stepFileName: 'TEE/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -75 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 0, y: 0, z: 75 }, direction: { x: 0, y: 0, z: 1 }, diameter: 50 },
      { id: 'p3', position: { x: 105, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, diameter: 50 },
    ],
  },

  // --- COPLES UNIÓN ---
  {
    id: 'cople_dn25',
    code: 'AP-CU-025',
    name: 'Cople Unión Rápida 25mm',
    category: 'coupling',
    nominalDiameter: 25,
    dimensions: { length: 60, width: 40, height: 40 },
    stepFileName: 'COPLE UNION/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -30 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
      { id: 'p2', position: { x: 0, y: 0, z: 30 }, direction: { x: 0, y: 0, z: 1 }, diameter: 25 },
    ],
  },
  {
    id: 'cople_dn50',
    code: 'AP-CU-050',
    name: 'Cople Unión Rápida 50mm',
    category: 'coupling',
    nominalDiameter: 50,
    dimensions: { length: 85, width: 75, height: 75 },
    stepFileName: 'COPLE UNION/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -42.5 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 0, y: 0, z: 42.5 }, direction: { x: 0, y: 0, z: 1 }, diameter: 50 },
    ],
  },

  // --- VÁLVULAS ---
  {
    id: 'valvula_dn25',
    code: 'AP-VAL-025',
    name: 'Válvula de Esfera Palanca 25mm (1")',
    category: 'valve',
    nominalDiameter: 25,
    dimensions: { length: 110, width: 60, height: 95 },
    stepFileName: 'VALVULAS/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -55 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
      { id: 'p2', position: { x: 0, y: 0, z: 55 }, direction: { x: 0, y: 0, z: 1 }, diameter: 25 },
    ],
  },
  {
    id: 'valvula_dn50',
    code: 'AP-VAL-050',
    name: 'Válvula de Esfera Palanca 50mm (2")',
    category: 'valve',
    nominalDiameter: 50,
    dimensions: { length: 160, width: 100, height: 140 },
    stepFileName: 'VALVULAS/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -80 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 0, y: 0, z: 80 }, direction: { x: 0, y: 0, z: 1 }, diameter: 50 },
    ],
  },

  // --- QUICK DROP (Bajadas rápidas para aire) ---
  {
    id: 'quick_drop_50_25',
    code: 'AP-QD-50-25',
    name: 'Quick Drop Bajada 50mm x 25mm (2" a 1")',
    category: 'quick_drop',
    nominalDiameter: 25,
    dimensions: { length: 90, width: 80, height: 110 },
    stepFileName: 'QUICK DROP/50-25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, diameter: 50 },
      { id: 'p2', position: { x: 0, y: -60, z: 0 }, direction: { x: 0, y: -1, z: 0 }, diameter: 25 },
    ],
  },

  // --- BRIDA ANSI ---
  {
    id: 'brida_dn50',
    code: 'AP-BR-050',
    name: 'Brida ANSI 150# Aluminio 50mm (2")',
    category: 'flange',
    nominalDiameter: 50,
    dimensions: { length: 152, width: 152, height: 28 },
    stepFileName: 'BRIDA ANSI ALUMINIO/50.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, diameter: 50 },
      { id: 'p2', position: { x: 0, y: 0, z: 28 }, direction: { x: 0, y: 0, z: 1 }, diameter: 50 },
    ],
  },

  // --- TAPÓN FINAL ---
  {
    id: 'tapon_dn25',
    code: 'AP-TAP-025',
    name: 'Tapón Terminal 25mm (1")',
    category: 'cap',
    nominalDiameter: 25,
    dimensions: { length: 45, width: 40, height: 40 },
    stepFileName: 'TAPONES/25.STEP',
    ports: [
      { id: 'p1', position: { x: 0, y: 0, z: -20 }, direction: { x: 0, y: 0, z: -1 }, diameter: 25 },
    ],
  },
];
