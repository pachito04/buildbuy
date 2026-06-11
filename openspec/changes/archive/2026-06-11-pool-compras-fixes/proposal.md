
# Proposal: Pool de Compras — fixes Módulo 2

## Intent

El **Módulo 2 — Pool de Compras** (compra interempresa: dos o más empresas BuildBuy se vinculan, mapean sus catálogos de materiales, agrupan requerimientos elegibles en una SC compartida, obtienen una comparativa centralizada y cada empresa genera su propia OC por su porción) ya tiene el **core implementado y sólido**: migraciones 017/018/019 (vínculos bidireccionales, mappings de materiales dual-confirmados, `pool_state` de 6 estados, contribuciones por empresa, RLS de comparativa compartida) más toda la UI de configuración y flujo (`PoolEmpresasPanel`, `PoolMateriasPanel`, `usePoolFlow`, `usePoolAward`, `Pools.tsx → PoolCard → PoolFlowPanel`).

Sin embargo, contra el spec del cliente quedan **5 gaps** que rompen reglas de negocio o dejan funcionalidad incompleta: la regla "no se puede armar un pool con una empresa no vinculada" NO está aplicada (cualquier empresa aparece para invitar), la adjudicación solo soporta el modo "líder / único ganador" (falta el modo "cada empresa adjudica su porción"), el despacho a proveedores no arma la "unión de proveedores" ni notifica, no existen las acciones de retiro/cancelación, y el historial del requerimiento no registra su participación en un pool. Este cambio cierra esos gaps del Módulo 2 (proceso interempresa).

[Full proposal content preserved from original file - see openspec/changes/pool-compras-fixes/proposal.md]
