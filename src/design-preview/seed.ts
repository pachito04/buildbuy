// Seed data for /design-preview. No DB calls.

export const seedKpis = [
  { id: 'k1', label: 'Obras activas', value: '14', delta: '+2 este mes', deltaPositive: true },
  { id: 'k2', label: 'Requerimientos abiertos', value: '37', delta: '6 con atraso', deltaPositive: false },
  { id: 'k3', label: 'Comparativas pendientes', value: '9', delta: '3 vencen hoy', deltaPositive: false },
  { id: 'k4', label: 'Ahorro acumulado', value: 'AR$ 8.42M', delta: '+12.3% vs Q1', deltaPositive: true },
];

export const seedAvanceObras = [
  { id: 'o1', nombre: 'Edificio Caballito 2400', cliente: 'Estudio Vivanco', avance: 72, presupuesto: 'AR$ 142M', deadline: '12 sep' },
  { id: 'o2', nombre: 'Residencia Pilar Lote 87', cliente: 'Casals Arquitectos', avance: 41, presupuesto: 'AR$ 58.6M', deadline: '03 oct' },
  { id: 'o3', nombre: 'Galpón Logístico Tigre', cliente: 'Korman Hnos.', avance: 88, presupuesto: 'AR$ 91M', deadline: '24 jun' },
  { id: 'o4', nombre: 'Torre Costanera Norte', cliente: 'Grupo Lanusse', avance: 18, presupuesto: 'AR$ 312M', deadline: '14 dic' },
];

export const seedInventario = [
  { id: 'i1', material: 'Cemento Portland CP40 x50kg', stock: 184, reservado: 60, minimo: 120, estado: 'ok', proveedor: 'Loma Negra', ultimaEntrada: 'hace 4 días' },
  { id: 'i2', material: 'Hierro nervurado Ø8mm x12m', stock: 42, reservado: 30, minimo: 60, estado: 'critico', proveedor: 'Acindar', ultimaEntrada: 'hace 11 días' },
  { id: 'i3', material: 'Cal hidráulica x25kg', stock: 76, reservado: 14, minimo: 80, estado: 'bajo', proveedor: 'Cacique', ultimaEntrada: 'hace 6 días' },
  { id: 'i4', material: 'Ladrillo común 5×12×24', stock: 4280, reservado: 1200, minimo: 2000, estado: 'ok', proveedor: 'Cerámica Quilmes', ultimaEntrada: 'hace 2 días' },
  { id: 'i5', material: 'Membrana asfáltica 4mm rollo 10m²', stock: 18, reservado: 12, minimo: 24, estado: 'critico', proveedor: 'Ormiflex', ultimaEntrada: 'hace 9 días' },
  { id: 'i6', material: 'Caño PVC sanitario Ø110mm x4m', stock: 92, reservado: 26, minimo: 50, estado: 'ok', proveedor: 'IPS', ultimaEntrada: 'hace 3 días' },
];

export const seedKanban = {
  pendiente: [
    { id: 'r1', codigo: 'REQ-2847', obra: 'Caballito 2400', items: 6, autor: 'M. Vivanco', dias: 1 },
    { id: 'r2', codigo: 'REQ-2848', obra: 'Pilar Lote 87', items: 12, autor: 'L. Casals', dias: 2 },
    { id: 'r3', codigo: 'REQ-2849', obra: 'Torre Costanera', items: 4, autor: 'F. Lanusse', dias: 3 },
  ],
  enCurso: [
    { id: 'r4', codigo: 'REQ-2842', obra: 'Galpón Tigre', items: 9, autor: 'D. Korman', dias: 5, progreso: 60 },
    { id: 'r5', codigo: 'REQ-2843', obra: 'Caballito 2400', items: 3, autor: 'M. Vivanco', dias: 4, progreso: 33 },
  ],
  recibido: [
    { id: 'r6', codigo: 'REQ-2831', obra: 'Pilar Lote 87', items: 5, autor: 'L. Casals', dias: 8 },
    { id: 'r7', codigo: 'REQ-2829', obra: 'Galpón Tigre', items: 14, autor: 'D. Korman', dias: 11 },
  ],
  rechazado: [
    { id: 'r8', codigo: 'REQ-2820', obra: 'Pilar Lote 87', items: 2, autor: 'L. Casals', dias: 9, motivo: 'fuera de presupuesto' },
  ],
};

export const seedLanding = {
  heroEyebrow: 'Plataforma de compras para constructoras',
  heroTitle: 'Comprar materiales\ndeja de ser\nun cuello de botella.',
  heroSub: 'BuildBuy centraliza requerimientos, cotizaciones, órdenes de compra y depósito en una sola plataforma. Lo que tu equipo coordina por WhatsApp y planillas, acá pasa solo.',
  metric1: { value: '–47%', label: 'tiempo de cotización' },
  metric2: { value: '×3.2', label: 'velocidad de cierre de OC' },
  metric3: { value: '+18%', label: 'ahorro por compra' },
  planBb: {
    name: 'BuildBuy',
    tag: 'Fundamental',
    desc: 'Para constructoras y estudios que quieren ordenar el circuito de compras de punta a punta.',
    bullets: ['Hasta 25 usuarios', 'Hasta 50 obras simultáneas', 'Catálogo de materiales propio', 'Comparativas y OCs ilimitadas', 'Onboarding asistido'],
    cta: 'Probar la demo',
  },
  planBbPlus: {
    name: 'BuildBuy +',
    tag: 'Enterprise',
    desc: 'Para corporativas con múltiples obras, data intelligence y necesidades a medida.',
    bullets: ['Usuarios y obras ilimitadas', 'Data intelligence sobre tu cadena de proveedores', 'Custom dashboards y exports', 'Integraciones a medida (ERP / contable)', 'SLA dedicado y customer success'],
    cta: 'Hablar con ventas',
  },
};
