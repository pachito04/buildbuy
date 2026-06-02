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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectListItem = { id: string; name: string };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReporteConsumos() {
  const { companyId } = useViewRole();

  // ---- Filters ----------------------------------------------------------------

  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [filterDesde, setFilterDesde] = useState<string>('');
  const [filterHasta, setFilterHasta] = useState<string>('');

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

  // ---- Retiros ----------------------------------------------------------------

  const { data: retiros, isLoading } = useQuery({
    queryKey: ['retiros-consumos', companyId],
    queryFn: async (): Promise<RetiroForConsumo[]> => {
      const { data, error } = await supabase
        .from('retiro')
        .select(
          'id, project_id, provider_id, architect_id, fecha_retiro, estado, company_id'
        )
        .order('fecha_retiro', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RetiroForConsumo[];
    },
  });

  // ---- Retiro items -----------------------------------------------------------

  const { data: items } = useQuery({
    queryKey: ['retiro-items-consumos', companyId],
    queryFn: async (): Promise<RetiroItemForConsumo[]> => {
      const { data, error } = await supabase
        .from('retiro_item')
        .select('id, retiro_id, material_id, cantidad, precio_unitario_aplicado, subtotal');
      if (error) throw error;
      return (data ?? []) as unknown as RetiroItemForConsumo[];
    },
  });

  // ---- Material names ---------------------------------------------------------

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

  // ---- Aggregation ------------------------------------------------------------

  const matMap = new Map((materials ?? []).map((m) => [m.id, m]));
  const archMap = new Map((architects ?? []).map((a) => [a.id, a.full_name]));
  const projMap = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const aggregated = aggregateConsumos(items ?? [], retiros ?? [], {
    projectId: filterProjectId || undefined,
    desde: filterDesde || undefined,
    hasta: filterHasta || undefined,
  });

  const ranked = rankObrasByConsumo(aggregated);

  // ---- Active-only total for the filtered set ---------------------------------

  const totalActivo = aggregated
    .filter((r) => r.estado === 'activo')
    .reduce((sum, r) => sum + r.subtotal, 0);

  const hasActiveFilters = !!filterProjectId || !!filterDesde || !!filterHasta;

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

        {aggregated.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="filter-obra" className="text-sm">Obra</Label>
          <Select
            value={filterProjectId || 'all'}
            onValueChange={(v) => setFilterProjectId(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="filter-obra" className="w-52">
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
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Obras con mayor consumo */}
      {ranked.length > 0 && (
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
      {aggregated.length > 0 && (
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

      {/* Empty state */}
      {!isLoading && aggregated.length === 0 && (
        <div className="py-16 text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            No hay consumos registrados{hasActiveFilters ? ' que coincidan con los filtros.' : '.'}
          </p>
        </div>
      )}

      {/* Table */}
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
    </div>
  );
}
