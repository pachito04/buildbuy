import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';
import { useCuentaCorriente } from '@/hooks/useCuentaCorriente';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderRow = Database['public']['Tables']['providers']['Row'];
type ProjectListItem = { id: string; name: string };

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

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// ManualMovimientoForm
// ---------------------------------------------------------------------------

interface ManualMovimientoFormProps {
  providerId: string;
  companyId: string;
  onSuccess: () => void;
}

function ManualMovimientoForm({ providerId, companyId, onSuccess }: ManualMovimientoFormProps) {
  const { registrarMovimientoManual, isRegistrando } = useCuentaCorriente(providerId);
  // Manual entries are credits only (pago / nota de crédito). Débitos are generated
  // exclusively by the retiro RPC — never entered manually (REQ-03).
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [medioPago, setMedioPago] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }
    if (!concepto.trim()) {
      setError('Ingresá un concepto.');
      return;
    }

    registrarMovimientoManual(
      {
        provider_id: providerId,
        company_id: companyId,
        tipo: 'credito', // always credit — manual entries are payments or credit notes only
        monto: montoNum,
        concepto: concepto.trim(),
        medio_pago: medioPago || undefined,
        referencia: referencia || undefined,
        fecha,
      },
      {
        onSuccess: () => {
          setMonto('');
          setConcepto('');
          setMedioPago('');
          setReferencia('');
          setFecha(today());
          onSuccess();
        },
        onError: (e: Error) => setError(e.message),
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Tipo</Label>
          <p className="text-sm text-muted-foreground py-2 px-3 rounded-md border bg-muted/40">
            Crédito (pago / nota de crédito)
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fecha-mov">Fecha</Label>
          <Input
            id="fecha-mov"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="monto-mov">Monto</Label>
        <Input
          id="monto-mov"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="concepto-mov">Concepto</Label>
        <Input
          id="concepto-mov"
          placeholder="Descripción del movimiento..."
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="medio-pago">
            Medio de pago <span className="text-muted-foreground text-xs">(opcional)</span>
          </Label>
          <Input
            id="medio-pago"
            placeholder="Transferencia, cheque..."
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="referencia">
            Referencia <span className="text-muted-foreground text-xs">(opcional)</span>
          </Label>
          <Input
            id="referencia"
            placeholder="N° de operación..."
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isRegistrando}>
          {isRegistrando ? 'Registrando...' : 'Registrar movimiento'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CuentaCorriente() {
  const { companyId } = useViewRole();
  const { toast } = useToast();

  // ---- Provider selection ---------------------------------------------------

  const [selectedProviderId, setSelectedProviderId] = useState<string>('');

  const { data: providers } = useQuery({
    queryKey: ['providers-list', companyId],
    queryFn: async (): Promise<ProviderRow[]> => {
      const { data, error } = await supabase.from('providers').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  // ---- Projects list for obra filter (W-1) ----------------------------------
  // TS2589 "excessively deep" inference forces an explicit cast — same pattern as RegistroRetiro.
  // Column verified: projects has `active BOOLEAN` (001_initial_schema.sql:163), not `status`.

  const { data: projects } = useQuery({
    queryKey: ['projects-list-cc', companyId],
    queryFn: async (): Promise<ProjectListItem[]> => {
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

  // ---- Filters state --------------------------------------------------------

  const [filterTipo, setFilterTipo] = useState<'all' | 'debito' | 'credito'>('all');
  const [filterDesde, setFilterDesde] = useState<string>('');
  const [filterHasta, setFilterHasta] = useState<string>('');
  // W-1: obra filter — manual pagos/NC (no retiro_id) have no project and are intentionally
  // excluded when this filter is active. That behavior is correct per REQ-03.
  const [filterProjectId, setFilterProjectId] = useState<string>('');

  // ---- Cuenta corriente data ------------------------------------------------

  const { movimientos, isLoading, computeSaldo, filterMovimientos } = useCuentaCorriente(
    selectedProviderId || null
  );

  // ---- Derived: filtered movements + saldo ---------------------------------

  const filters = {
    tipo: filterTipo !== 'all' ? (filterTipo as 'debito' | 'credito') : undefined,
    desde: filterDesde || undefined,
    hasta: filterHasta || undefined,
    projectId: filterProjectId || undefined,
  };

  const filteredMovimientos = selectedProviderId
    ? filterMovimientos(filters)
    : [];

  const saldo = selectedProviderId ? computeSaldo() : 0;

  const hasActiveFilters = filterTipo !== 'all' || !!filterDesde || !!filterHasta || !!filterProjectId;

  // ---- Dialog state ---------------------------------------------------------

  const [dialogOpen, setDialogOpen] = useState(false);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuenta Corriente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historial de débitos y créditos por proveedor.
          </p>
        </div>

        {selectedProviderId && companyId && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Registrar pago / crédito
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar movimiento manual</DialogTitle>
              </DialogHeader>
              <ManualMovimientoForm
                providerId={selectedProviderId}
                companyId={companyId}
                onSuccess={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Provider selector */}
      <div className="flex items-center gap-3">
        <Label htmlFor="proveedor-cc" className="shrink-0 text-sm">
          Proveedor
        </Label>
        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
          <SelectTrigger id="proveedor-cc" className="w-64">
            <SelectValue placeholder="Seleccioná un proveedor" />
          </SelectTrigger>
          <SelectContent>
            {(providers ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Saldo neto */}
      {selectedProviderId && !isLoading && (
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo neto con el proveedor</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Positivo = el proveedor tiene saldo a cobrar; negativo = en tu favor.
            </p>
          </div>
          <p
            className={`text-2xl font-bold tabular-nums ${
              saldo > 0 ? 'text-red-600' : saldo < 0 ? 'text-green-600' : 'text-foreground'
            }`}
          >
            {formatCurrency(saldo)}
          </p>
        </div>
      )}

      {/* Filters */}
      {selectedProviderId && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="filter-tipo" className="text-sm shrink-0">Tipo</Label>
            <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v as typeof filterTipo)}>
              <SelectTrigger id="filter-tipo" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="debito">Débitos</SelectItem>
                <SelectItem value="credito">Créditos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* W-1: Obra filter — manual pagos/NC are excluded when this filter is active */}
          <div className="flex items-center gap-2">
            <Label htmlFor="filter-obra" className="text-sm shrink-0">Obra</Label>
            <Select value={filterProjectId || 'all'} onValueChange={(v) => setFilterProjectId(v === 'all' ? '' : v)}>
              <SelectTrigger id="filter-obra" className="w-48">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="filter-desde" className="text-sm shrink-0">Desde</Label>
            <Input
              id="filter-desde"
              type="date"
              className="w-36"
              value={filterDesde}
              onChange={(e) => setFilterDesde(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="filter-hasta" className="text-sm shrink-0">Hasta</Label>
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
                setFilterTipo('all');
                setFilterDesde('');
                setFilterHasta('');
                setFilterProjectId('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {/* Movements list */}
      {!selectedProviderId && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Seleccioná un proveedor para ver los movimientos de su cuenta corriente.
        </p>
      )}

      {selectedProviderId && isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {selectedProviderId && !isLoading && filteredMovimientos.length === 0 && (
        <div className="py-12 text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            No hay movimientos{hasActiveFilters ? ' que coincidan con los filtros' : ''}.
          </p>
          {filterProjectId && (
            <p className="text-xs text-muted-foreground">
              Los pagos y notas de crédito manuales no están vinculados a una obra y se excluyen al filtrar por obra.
            </p>
          )}
        </div>
      )}

      {selectedProviderId && !isLoading && filteredMovimientos.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Medio de pago</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovimientos.map((mov) => {
                const projectName = (mov as any).retiro?.project?.name ?? null;
                return (
                  <TableRow key={mov.id}>
                    <TableCell className="text-sm tabular-nums">{mov.fecha}</TableCell>
                    <TableCell>
                      {mov.tipo === 'debito' ? (
                        <Badge variant="destructive" className="text-xs">Débito</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600 text-xs">Crédito</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{mov.concepto ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {projectName ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {mov.medio_pago ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {mov.referencia ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      <span className={mov.tipo === 'debito' ? 'text-red-600' : 'text-green-600'}>
                        {mov.tipo === 'debito' ? '+' : '-'}{formatCurrency(mov.monto)}
                      </span>
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
