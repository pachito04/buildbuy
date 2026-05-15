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

export const seedCotizaciones = [
  { id: 'c1', rfq: 'RFQ-0184', obra: 'Caballito 2400', items: 8, proveedores: 4, mejor: 'Loma Negra · AR$ 2.84M', vence: 'en 2 días', ahorro: 12 },
  { id: 'c2', rfq: 'RFQ-0185', obra: 'Galpón Tigre', items: 5, proveedores: 6, mejor: 'Acindar · AR$ 1.92M', vence: 'hoy', ahorro: 8 },
  { id: 'c3', rfq: 'RFQ-0186', obra: 'Pilar Lote 87', items: 12, proveedores: 3, mejor: 'IPS · AR$ 4.12M', vence: 'en 5 días', ahorro: 18 },
];

export const seedComoFunciona = [
  { paso: '01', titulo: 'Requerimiento', desc: 'El arquitecto genera el pedido desde la obra. Materiales, cantidades, fecha deseada.', actor: 'Arquitecto' },
  { paso: '02', titulo: 'Cotización', desc: 'Compras lanza la RFQ a proveedores. Cada proveedor cotiza, BB consolida.', actor: 'Compras' },
  { paso: '03', titulo: 'Adjudicación', desc: 'Comparativa lado a lado por ítem. Adjudicación parcial o split entre proveedores.', actor: 'Compras' },
  { paso: '04', titulo: 'Despacho', desc: 'OC emitida, depósito reserva stock o recibe entrega. Remito digital trazado.', actor: 'Depósito' },
];

export const seedRoles = [
  { rol: 'Arquitecto', desc: 'Carga el cómputo de obra, genera requerimientos, sigue avance.', detalle: 'Cómputo · Mis requerimientos · Avance' },
  { rol: 'Compras', desc: 'Recibe requerimientos, lanza cotizaciones, adjudica y emite OC.', detalle: 'Kanban · RFQs · Comparativa · OC' },
  { rol: 'Proveedor', desc: 'Recibe RFQs por mail. Carga cotizaciones desde su panel.', detalle: 'Solicitudes · Mis cotizaciones · Histórico' },
  { rol: 'Depósito', desc: 'Despacho a obra, recepción de OC. Stock real y reservado.', detalle: 'Despacho · Recepción · Inventario' },
  { rol: 'Admin', desc: 'Configura empresa, usuarios, materiales y proveedores.', detalle: 'Usuarios · Catálogos · Reportes' },
];

export const seedCasos = [
  { cliente: 'Estudio Vivanco', sector: 'Vivienda multifamiliar AMBA', obras: 12, metric: '–47% tiempo cotización', quote: 'Antes coordinábamos 6 obras por WhatsApp. Hoy entramos a BB y vemos todo en una pantalla.' },
  { cliente: 'Korman Hnos.', sector: 'Logística e industria', obras: 4, metric: '+18% ahorro promedio', quote: 'La comparativa lado-a-lado nos ahorra discusiones internas. El que pone el precio gana.' },
  { cliente: 'Grupo Lanusse', sector: 'Corporativo', obras: 23, metric: '×3.2 velocidad de cierre OC', quote: 'BB+ nos dio dashboards consolidados de toda la cadena. Decisiones que tardaban una semana, hoy son del día.' },
];

export const seedFaq = [
  { q: '¿Necesitamos cambiar nuestro ERP?', a: 'No. BuildBuy convive con tu ERP, contable y planillas. BB+ ofrece integraciones a medida (Tango, Bejerman, Holistor, custom) para sincronizar OC y proveedores.' },
  { q: '¿Cuánto tarda el onboarding?', a: 'BB: una semana para subir catálogo, usuarios y primeras obras. BB+: incluye implementación dedicada con customer success y migración de datos legacy.' },
  { q: '¿Los proveedores tienen que pagar algo?', a: 'No. Los proveedores reciben RFQs por mail y entran al panel a cotizar sin costo. Vos pagás solo por tu lado.' },
  { q: '¿Mis datos están seguros?', a: 'BB: backups diarios, hosting en Argentina, cifrado en tránsito y en reposo. BB+: SLA dedicado, ambiente single-tenant opcional, auditoría de accesos.' },
];

export const seedPlanFeatures = [
  { categoria: 'Usuarios y obras', items: [
    { feature: 'Usuarios incluidos', bb: 'Hasta 25', bbplus: 'Ilimitados' },
    { feature: 'Obras simultáneas', bb: 'Hasta 50', bbplus: 'Ilimitadas' },
    { feature: 'Permisos por rol', bb: true, bbplus: true },
    { feature: 'Sub-empresas / grupos', bb: false, bbplus: true },
  ]},
  { categoria: 'Circuito de compras', items: [
    { feature: 'Requerimientos · RFQs · OCs ilimitadas', bb: true, bbplus: true },
    { feature: 'Kanban + comparativa', bb: true, bbplus: true },
    { feature: 'Pools de compra entre obras', bb: true, bbplus: true },
    { feature: 'Aprobaciones multi-nivel', bb: false, bbplus: true },
  ]},
  { categoria: 'Inventario y depósito', items: [
    { feature: 'Stock + reserva', bb: true, bbplus: true },
    { feature: 'Múltiples depósitos', bb: 'Hasta 3', bbplus: 'Ilimitados' },
    { feature: 'Trazabilidad por lote', bb: false, bbplus: true },
  ]},
  { categoria: 'Data & analytics', items: [
    { feature: 'Reportes estándar', bb: true, bbplus: true },
    { feature: 'Custom dashboards', bb: false, bbplus: true },
    { feature: 'Data intelligence sobre proveedores', bb: false, bbplus: true },
    { feature: 'Exports avanzados + API', bb: false, bbplus: true },
  ]},
  { categoria: 'Soporte e integración', items: [
    { feature: 'Onboarding asistido', bb: true, bbplus: true },
    { feature: 'Customer success dedicado', bb: false, bbplus: true },
    { feature: 'Integraciones a medida (ERP / contable)', bb: 'addon', bbplus: true },
    { feature: 'SLA con respuesta < 4h', bb: false, bbplus: true },
  ]},
];

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
