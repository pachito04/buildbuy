import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';
import {
  aggregateConsumos,
  rankObrasByConsumo,
} from '@/lib/consumos';
import type { RetiroForConsumo, RetiroItemForConsumo } from '@/lib/consumos';
import { buildTimeSeries } from '@/lib/consumos/buildTimeSeries';
import type { RetiroItemWithFecha } from '@/lib/consumos/buildTimeSeries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download, TrendingUp } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

/** Last N calendar months — returns { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' } */
function lastNMonths(n: number): { desde: string; hasta: string } {
  const now = new Date();
  const hasta = now.toISOString().split('T')[0];
  const from = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  const desde = from.toISOString().split('T')[0];
  return { desde, hasta };
}

// Palette for chart lines — cycles when there are many materials
const LINE_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#6366f1',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectListItem = { id: string; name: string };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReporteConsumos() {
  const { companyId } = useViewRole();

  // ---- View toggle (lista | comparativa) ------------------------------------

  const [view, setView] = useState<'lista' | 'comparativa'>('lista');
  const [metric, setMetric] = useState<'cantidad' | 'monto'>('cantidad');

  // ---- Filters ----------------------------------------------------------------

  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [filterDesde, setFilterDesde] = useState<string>('');
  const [filterHasta, setFilterHasta] = useState<string>('');
  const [filterProveedor, setFilterProveedor] = useState<string>('');
  const [filterMaterial, setFilterMaterial] = useState<string>('');
  const [filterArquitecto, setFilterArquitecto] = useState<string>('');

  // ---- Projects list ----------------------------------------------------------

  const { data: projects } = useQuery({
    queryKey: ['projects-list-consumos', companyId],
    queryFn: async (): Promise<ProjectListItem[]> => {
      // TS2589 guard: projects has `active boolean` column (001_initial_schema.sql)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ProjectListItem[];
    },
  });

  // ---- Providers list (distinct from retiros) --------------------------------

  const { data: proveedores } = useQuery({
    queryKey: ['retiros-proveedores-distinct', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from('retiro')
        .select('provider_id, provider:providers!retiro_provider_id_fkey(id, name)')
        .neq('estado', 'anulado');
      if (error) throw error;
      const seen = new Set<string>();
      const result: { id: string; name: string }[] = [];
      for (const row of (data ?? []) as unknown as { provider_id: string; provider: { id: string; name: string } | null }[]) {
        if (row.provider && !seen.has(row.provider.id)) {
          seen.add(row.provider.id);
          result.push({ id: row.provider.id, name: row.provider.name });
        }
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // ---- Materials list (distinct from retiro_items) ---------------------------

  const { data: materials } = useQuery({
    queryKey: ['materials-names'],
    queryFn: async (): Promise<{ id: string; name: string; unit: string }[]> => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, unit')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  // ---- Architect names --------------------------------------------------------

  const { data: architects } = useQuery({
    queryKey: ['architects-names'],
    queryFn: async (): Promise<{ id: string; full_name: string }[]> => {
      const { data, error } = await supabase
        .from('architects')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  // ---- Retiros — server-side filtering ---------------------------------------

  const { data: retiros, isLoading } = useQuery({
    queryKey: ['retiros-consumos', companyId, filterProjectId, filterProveedor, filterArquitecto, filterDesde, filterHasta],
    queryFn: async (): Promise<RetiroForConsumo[]> => {
      let query = supabase
        .from('retiro')
        .select('id, project_id, provider_id, architect_id, fecha_retiro, estado, company_id')
        .order('fecha_retiro', { ascending: false });

      if (filterProjectId) query = query.eq('project_id', filterProjectId);
      if (filterProveedor) query = query.eq('provider_id', filterProveedor);
      if (filterArquitecto) query = query.eq('architect_id', filterArquitecto);
      if (filterDesde) query = query.gte('fecha_retiro', filterDesde);
      if (filterHasta) query = query.lte('fecha_retiro', filterHasta);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RetiroForConsumo[];
    },
  });

  // ---- Retiro items -----------------------------------------------------------

  const retiroIds = (retiros ?? []).map((r) => r.id);

  const { data: items } = useQuery({
    queryKey: ['retiro-items-consumos', retiroIds.join(','), filterMaterial],
    enabled: retiroIds.length > 0,
    queryFn: async (): Promise<RetiroItemForConsumo[]> => {
      let query = supabase
        .from('retiro_item')
        .select('id, retiro_id, material_id, cantidad, precio_unitario_aplicado, subtotal')
        .in('retiro_id', retiroIds);

      if (filterMaterial) query = query.eq('material_id', filterMaterial);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as RetiroItemForConsumo[];
    },
  });

  // ---- Aggregation maps -------------------------------------------------------

  const matMap = new Map((materials ?? []).map((m) => [m.id, m]));
  const archMap = new Map((architects ?? []).map((a) => [a.id, a.full_name]));
  const projMap = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const aggregated = aggregateConsumos(items ?? [], retiros ?? [], {});

  const ranked = rankObrasByConsumo(aggregated);

  // ---- Active-only total ------------------------------------------------------

  const totalActivo = aggregated
    .filter((r) => r.estado === 'activo')
    .reduce((sum, r) => sum + r.subtotal, 0);

  const hasActiveFilters =
    !!filterProjectId ||
    !!filterDesde ||
    !!filterHasta ||
    !!filterProveedor ||
    !!filterMaterial ||
    !!filterArquitecto;

  // ---- Comparativa data -------------------------------------------------------

  // Build time-series items from aggregated (join fecha from retiro)
  const retiroMap = new Map((retiros ?? []).map((r) => [r.id, r]));

  const timeSeriesItems: RetiroItemWithFecha[] = (items ?? []).flatMap((item) => {
    const retiro = retiroMap.get(item.retiro_id);
    if (!retiro) return [];
    const mat = matMap.get(item.material_id);
    return [{
      id: item.id,
      retiro_id: item.retiro_id,
      material_id: item.material_id,
      descripcion: mat?.name ?? item.material_id,
      cantidad: item.cantidad,
      subtotal: item.subtotal,
      fecha_retiro: retiro.fecha_retiro,
      estado: retiro.estado,
    }];
  });

  // Default range: last 12 months when no date filter active
  const defaultRange = lastNMonths(12);
  const chartRange = {
    desde: filterDesde || defaultRange.desde,
    hasta: filterHasta || defaultRange.hasta,
  };

  const timeSeriesPoints = buildTimeSeries(timeSeriesItems, {
    metric,
    period: 'month',
    range: chartRange,
  });

  // Pivot long → wide for Recharts
  const allMaterials = [...new Set(timeSeriesPoints.map((p) => p.material_codigo))];
  const materialDescMap = new Map(timeSeriesPoints.map((p) => [p.material_codigo, p.descripcion]));

  const periodMap = new Map<string, Record<string, number>>();
  for (const point of timeSeriesPoints) {
    const entry = periodMap.get(point.period) ?? {};
    entry[point.material_codigo] = point.total;
    periodMap.set(point.period, entry);
  }

  const chartData = Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => ({ period, ...values }));

  // ---- Excel export -----------------------------------------------------------

  function exportToExcel() {
    const rows = aggregated.map((row) => ({
      Obra: projMap.get(row.project_id) ?? row.project_id,
      Material: matMap.get(row.material_id)?.name ?? row.material_id,
      Unidad: matMap.get(row.material_id)?.unit ?? '',
      Arquitecto: archMap.get(row.architect_id) ?? row.architect_id,
      'Fecha Retiro': row.fecha_retiro,
      Cantidad: row.cantidad,
      'Precio Unitario Aplicado': row.precio_unitario_aplicado,
      Subtotal: row.subtotal,
      Estado: row.estado === 'anulado' ? 'Anulado' : 'Activo',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumos');
    XLSX.writeFile(wb, 'consumos-obra.xlsx');
  }

  // ---- Render -----------------------------------------------------------------

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de Consumos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consumos imputados por obra, material y arquitecto.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'lista' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              onClick={() => setView('lista')}
            >
              Lista
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'comparativa' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
              onClick={() => setView('comparativa')}
            >
              Comparativa
            </button>
          </div>

          {view === 'lista' && aggregated.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Obra */}
        <div className="space-y-1">
          <Label htmlFor="filter-obra" className="text-sm">Obra</Label>
          <Select
            value={filterProjectId || 'all'}
            onValueChange={(v) => setFilterProjectId(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="filter-obra" className="w-44">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las obras</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Proveedor */}
        <div className="space-y-1">
          <Label htmlFor="filter-proveedor" className="text-sm">Proveedor</Label>
          <Select
            value={filterProveedor || 'all'}
            onValueChange={(v) => setFilterProveedor(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="filter-proveedor" className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(proveedores ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Material */}
        <div className="space-y-1">
          <Label htmlFor="filter-material" className="text-sm">Material</Label>
          <Select
            value={filterMaterial || 'all'}
            onValueChange={(v) => setFilterMaterial(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="filter-material" className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(materials ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Arquitecto */}
        <div className="space-y-1">
          <Label htmlFor="filter-arquitecto" className="text-sm">Arquitecto</Label>
          <Select
            value={filterArquitecto || 'all'}
            onValueChange={(v) => setFilterArquitecto(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="filter-arquitecto" className="w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(architects ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desde */}
        <div className="space-y-1">
          <Label htmlFor="filter-desde" className="text-sm">Desde</Label>
          <Input
            id="filter-desde"
            type="date"
            className="w-36"
            value={filterDesde}
            onChange={(e) => setFilterDesde(e.target.value)}
          />
        </div>

        {/* Hasta */}
        <div className="space-y-1">
          <Label htmlFor="filter-hasta" className="text-sm">Hasta</Label>
          <Input
            id="filter-hasta"
            type="date"
            className="w-36"
            value={filterHasta}
            onChange={(e) => setFilterHasta(e.target.value)}
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterProjectId('');
              setFilterDesde('');
              setFilterHasta('');
              setFilterProveedor('');
              setFilterMaterial('');
              setFilterArquitecto('');
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Obras con mayor consumo */}
      {view === 'lista' && ranked.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Obras con mayor consumo</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ranked.slice(0, 5).map((obra, idx) => (
              <div
                key={obra.project_id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
              >
                <span className="text-xs font-bold text-muted-foreground w-4">
                  {idx + 1}
                </span>
                <span className="font-medium">
                  {projMap.get(obra.project_id) ?? obra.project_id}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCurrency(obra.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total summary */}
      {view === 'lista' && aggregated.length > 0 && (
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total acumulado (activos)</p>
            {aggregated.filter((r) => r.estado === 'anulado').length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Los retiros anulados se muestran en la tabla pero no suman al total.
              </p>
            )}
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalActivo)}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {/* ---- LISTA VIEW ---- */}
      {view === 'lista' && (
        <>
          {!isLoading && aggregated.length === 0 && (
            <div className="py-16 text-center space-y-1">
              <p className="text-sm text-muted-foreground">
                No hay consumos registrados{hasActiveFilters ? ' que coincidan con los filtros.' : '.'}
              </p>
            </div>
          )}

          {!isLoading && aggregated.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Obra</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Arquitecto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio unitario</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregated.map((row, idx) => {
                    const mat = matMap.get(row.material_id);
                    const archName = archMap.get(row.architect_id);
                    const projName = projMap.get(row.project_id);
                    const isAnulado = row.estado === 'anulado';
                    return (
                      <TableRow
                        key={`${row.retiro_id}-${row.material_id}-${idx}`}
                        className={isAnulado ? 'opacity-50' : undefined}
                      >
                        <TableCell className="text-sm font-medium">
                          {projName ?? row.project_id}
                        </TableCell>
                        <TableCell className="text-sm">
                          {mat ? `${mat.name} (${mat.unit})` : row.material_id}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {archName ?? row.architect_id}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {row.fecha_retiro}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {row.cantidad}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatCurrency(row.precio_unitario_aplicado)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {isAnulado ? (
                            <span className="line-through text-muted-foreground">
                              {formatCurrency(row.subtotal)}
                            </span>
                          ) : (
                            formatCurrency(row.subtotal)
                          )}
                        </TableCell>
                        <TableCell>
                          {isAnulado ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Anulado
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-600">
                              Activo
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* ---- COMPARATIVA VIEW ---- */}
      {view === 'comparativa' && !isLoading && (
        <div className="space-y-4">
          {/* Metric toggle */}
          <div className="flex items-center gap-3">
            <Label className="text-sm shrink-0">Métrica</Label>
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  metric === 'cantidad' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
                onClick={() => setMetric('cantidad')}
              >
                Cantidad
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  metric === 'monto' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
                onClick={() => setMetric('monto')}
              >
                Monto
              </button>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="py-16 text-center rounded-lg border">
              <p className="text-sm text-muted-foreground">
                No hay datos para mostrar en el período seleccionado.
                Ajustá los filtros de fecha para ampliar el rango.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border p-4">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      metric === 'monto' ? formatCurrency(value) : value,
                      materialDescMap.get(name) ?? name,
                    ]}
                  />
                  <Legend
                    formatter={(value) => materialDescMap.get(value) ?? value}
                  />
                  {allMaterials.map((matId, i) => (
                    <Line
                      key={matId}
                      type="monotone"
                      dataKey={matId}
                      name={matId}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
