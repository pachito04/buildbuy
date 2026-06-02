import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useOwnProviderId } from '@/hooks/useOwnProviderId';
import { useCuentaCorriente } from '@/hooks/useCuentaCorriente';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Download, ShieldAlert } from 'lucide-react';
import { useViewRole } from '@/hooks/useViewRole';

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
// Page
// ---------------------------------------------------------------------------

export default function MiCuentaCorriente() {
  const { viewRole } = useViewRole();
  const providerId = useOwnProviderId();

  // ---- Guard: only proveedor role ----------------------------------------

  if (viewRole !== 'proveedor') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-muted-foreground text-sm mt-1">
          Esta sección es exclusiva para el perfil de Proveedor.
        </p>
      </div>
    );
  }

  return <MiCuentaCorrienteContent providerId={providerId} />;
}

// ---------------------------------------------------------------------------
// Content (rendered once role is confirmed)
// ---------------------------------------------------------------------------

interface Props {
  providerId: string | null;
}

function MiCuentaCorrienteContent({ providerId }: Props) {
  const [filterDesde, setFilterDesde] = useState<string>('');
  const [filterHasta, setFilterHasta] = useState<string>('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'debito' | 'credito'>('all');

  // ---- Provider name -------------------------------------------------------

  const { data: providerName } = useQuery({
    queryKey: ['provider-name', providerId],
    enabled: !!providerId,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('providers')
        .select('name')
        .eq('id', providerId!)
        .maybeSingle();
      return data?.name ?? null;
    },
  });

  // ---- Account data --------------------------------------------------------

  const { movimientos, isLoading, computeSaldo, filterMovimientos } =
    useCuentaCorriente(providerId);

  // ---- Derived -------------------------------------------------------------

  const filters = {
    tipo: filterTipo !== 'all' ? (filterTipo as 'debito' | 'credito') : undefined,
    desde: filterDesde || undefined,
    hasta: filterHasta || undefined,
  };

  const filtered = filterMovimientos(filters);
  const saldo = computeSaldo();
  const hasActiveFilters = filterTipo !== 'all' || !!filterDesde || !!filterHasta;

  // ---- PDF download --------------------------------------------------------

  function downloadPDF() {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(16);
    doc.text('Estado de Cuenta', 14, 18);
    doc.setFontSize(11);
    doc.text(`Proveedor: ${providerName ?? providerId ?? ''}`, 14, 27);
    doc.text(`Saldo neto: ${formatCurrency(saldo)}`, 14, 34);
    if (filterDesde || filterHasta) {
      const period = `Período: ${filterDesde || '—'} al ${filterHasta || '—'}`;
      doc.text(period, 14, 41);
    }

    // Table
    const tableRows = filtered.map((mov) => [
      mov.fecha,
      mov.tipo === 'debito' ? 'Débito' : 'Crédito',
      mov.concepto ?? '',
      mov.medio_pago ?? '',
      mov.referencia ?? '',
      mov.tipo === 'debito'
        ? `+${formatCurrency(mov.monto)}`
        : `-${formatCurrency(mov.monto)}`,
    ]);

    autoTable(doc, {
      startY: filterDesde || filterHasta ? 48 : 42,
      head: [['Fecha', 'Tipo', 'Concepto', 'Medio de pago', 'Referencia', 'Monto']],
      body: tableRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 18 },
        5: { halign: 'right', cellWidth: 30 },
      },
    });

    const filename = `cuenta-corriente-${(providerName ?? providerId ?? 'proveedor')
      .replace(/\s+/g, '-')
      .toLowerCase()}.pdf`;
    doc.save(filename);
  }

  // ---- Render --------------------------------------------------------------

  if (!providerId) {
    return (
      <div className="p-6 flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi Cuenta Corriente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {providerName ? `Movimientos de ${providerName}` : 'Historial de movimientos'}
          </p>
        </div>

        {filtered.length > 0 && (
          <Button variant="outline" size="sm" onClick={downloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        )}
      </div>

      {/* Saldo card */}
      {!isLoading && (
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo neto</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Positivo = saldo a cobrar; negativo = en favor de la empresa.
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
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="mi-filter-tipo" className="text-sm shrink-0">Tipo</Label>
          <Select
            value={filterTipo}
            onValueChange={(v) => setFilterTipo(v as typeof filterTipo)}
          >
            <SelectTrigger id="mi-filter-tipo" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="debito">Débitos</SelectItem>
              <SelectItem value="credito">Créditos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="mi-filter-desde" className="text-sm shrink-0">Desde</Label>
          <Input
            id="mi-filter-desde"
            type="date"
            className="w-36"
            value={filterDesde}
            onChange={(e) => setFilterDesde(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="mi-filter-hasta" className="text-sm shrink-0">Hasta</Label>
          <Input
            id="mi-filter-hasta"
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
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No hay movimientos{hasActiveFilters ? ' que coincidan con los filtros.' : ' registrados.'}
          </p>
        </div>
      )}

      {/* Movements table */}
      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Medio de pago</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((mov) => (
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
