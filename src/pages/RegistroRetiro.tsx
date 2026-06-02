import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';
import { useRetiros } from '@/hooks/useRetiros';
import { usePreciosProveedor } from '@/hooks/usePreciosProveedor';
import { previewRetiroTotal, buildRetiroItems, validateRetiro } from '@/lib/retiro';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import type { RetiroFormRow } from '@/lib/retiro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderRow = Database['public']['Tables']['providers']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ArchitectRow = Database['public']['Tables']['architects']['Row'];
type MaterialRow = Database['public']['Tables']['materials']['Row'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function formatCurrency(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// AnulacionDialog
// ---------------------------------------------------------------------------

interface AnulacionDialogProps {
  retiroId: string | null;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function AnulacionDialog({ retiroId, onConfirm, onCancel, isLoading }: AnulacionDialogProps) {
  const [motivo, setMotivo] = useState('');

  return (
    <Dialog open={!!retiroId} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular retiro</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Esta acción anula el retiro y genera un crédito compensatorio en la cuenta corriente del proveedor. No se puede deshacer.
        </p>
        <div className="space-y-1 mt-2">
          <Label htmlFor="motivo-anulacion">Motivo de anulación</Label>
          <Input
            id="motivo-anulacion"
            placeholder="Descripción del motivo..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(motivo)}
            disabled={!motivo.trim() || isLoading}
          >
            {isLoading ? 'Anulando...' : 'Confirmar anulación'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegistroRetiro() {
  const { companyId } = useViewRole();
  const { toast } = useToast();

  // ---- Catalog queries -------------------------------------------------------

  const { data: providers } = useQuery({
    queryKey: ['providers-list', companyId],
    queryFn: async (): Promise<ProviderRow[]> => {
      const { data, error } = await supabase.from('providers').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['projects-list', companyId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      // TS2589 "excessively deep" inference on the projects table forces an explicit cast.
      // Column names are verified against 001_initial_schema.sql: projects has `active BOOLEAN`,
      // NOT a `status` column. Using `active: true` is the correct filter.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: architects } = useQuery({
    queryKey: ['architects-list', companyId],
    queryFn: async (): Promise<ArchitectRow[]> => {
      let q = supabase.from('architects').select('*').eq('active', true).order('full_name');
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ArchitectRow[];
    },
  });

  const { data: materials } = useQuery({
    queryKey: ['materials-all', companyId],
    queryFn: async (): Promise<MaterialRow[]> => {
      let q = supabase.from('materials').select('*').eq('active', true).order('name');
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ---- Form state -----------------------------------------------------------

  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedArchitectId, setSelectedArchitectId] = useState<string>('');
  const [fechaRetiro, setFechaRetiro] = useState<string>(today());
  const [observaciones, setObservaciones] = useState<string>('');
  const [items, setItems] = useState<RetiroFormRow[]>([{ material_id: '', cantidad: 1 }]);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // ---- Anulacion dialog state -----------------------------------------------

  const [anulacionTarget, setAnulacionTarget] = useState<string | null>(null);

  // ---- Precios for selected provider ----------------------------------------

  const { precios } = usePreciosProveedor(selectedProviderId || null);

  // ---- Retiros hook ----------------------------------------------------------

  const { retiros, isLoading: retirosLoading, registrarRetiro, isRegistrando, anularRetiro, isAnulando } = useRetiros(
    selectedProviderId || null
  );

  // ---- Live preview ---------------------------------------------------------

  const validItems = items.filter((r) => r.material_id && r.cantidad > 0);
  const preview = previewRetiroTotal(validItems, precios, fechaRetiro, companyId ?? undefined);

  // ---- Handlers -------------------------------------------------------------

  function addItem() {
    setItems((prev) => [...prev, { material_id: '', cantidad: 1 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof RetiroFormRow, value: string | number) {
    setItems((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, [field]: value } : row
      )
    );
  }

  function resetForm() {
    setSelectedProviderId('');
    setSelectedProjectId('');
    setSelectedArchitectId('');
    setFechaRetiro(today());
    setObservaciones('');
    setItems([{ material_id: '', cantidad: 1 }]);
    setFormErrors([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors = validateRetiro({
      projectId: selectedProjectId,
      architectId: selectedArchitectId,
      fechaRetiro,
      items: validItems,
      missingPrices: preview.missingPrices,
    });

    if (!selectedProviderId) errors.unshift('Seleccioná un proveedor.');

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors([]);

    registrarRetiro(
      {
        provider_id: selectedProviderId,
        project_id: selectedProjectId,
        architect_id: selectedArchitectId,
        fecha_retiro: fechaRetiro,
        items: buildRetiroItems(validItems),
        observaciones: observaciones || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
        },
      }
    );
  }

  function handleAnular(motivo: string) {
    if (!anulacionTarget) return;
    anularRetiro(
      { retiro_id: anulacionTarget, motivo },
      {
        onSuccess: () => setAnulacionTarget(null),
      }
    );
  }

  // ---- Material name helper -------------------------------------------------

  function materialName(id: string): string {
    return (materials ?? []).find((m) => m.id === id)?.name ?? id;
  }

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registro de Retiros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registrá los materiales retirados por los arquitectos en el proveedor.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Row 1: Proveedor + Obra + Arquitecto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="proveedor">Proveedor</Label>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger id="proveedor">
                <SelectValue placeholder="Seleccioná un proveedor" />
              </SelectTrigger>
              <SelectContent>
                {(providers ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="obra">Obra</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger id="obra">
                <SelectValue placeholder="Seleccioná una obra" />
              </SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="arquitecto">Arquitecto</Label>
            <Select value={selectedArchitectId} onValueChange={setSelectedArchitectId}>
              <SelectTrigger id="arquitecto">
                <SelectValue placeholder="Seleccioná un arquitecto" />
              </SelectTrigger>
              <SelectContent>
                {(architects ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Fecha + Observaciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="fecha-retiro">Fecha de retiro</Label>
            <Input
              id="fecha-retiro"
              type="date"
              max={today()}
              value={fechaRetiro}
              onChange={(e) => setFechaRetiro(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="observaciones">
              Observaciones <span className="text-muted-foreground text-xs">(opcional)</span>
            </Label>
            <Input
              id="observaciones"
              placeholder="Notas adicionales..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Materiales retirados</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar ítem
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="w-32">Cantidad</TableHead>
                  <TableHead className="w-36">Precio unitario</TableHead>
                  <TableHead className="w-36">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row, idx) => {
                  const previewItem = preview.items.find((p) => p.material_id === row.material_id && row.material_id);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select
                          value={row.material_id}
                          onValueChange={(v) => updateItem(idx, 'material_id', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccioná un material" />
                          </SelectTrigger>
                          <SelectContent>
                            {(materials ?? []).map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={row.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {previewItem?.hasPrice
                          ? formatCurrency(previewItem.precioUnitario)
                          : row.material_id
                            ? <span className="text-amber-600 text-xs font-medium">Sin precio vigente</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {previewItem?.hasPrice
                          ? formatCurrency(previewItem.subtotal)
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Total */}
          {preview.total > 0 && (
            <div className="flex justify-end">
              <p className="text-sm font-semibold">
                Total estimado: {formatCurrency(preview.total)}
              </p>
            </div>
          )}

          {/* Missing prices alert */}
          {preview.missingPrices.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <strong>Sin precio vigente:</strong>{' '}
                {preview.missingPrices.map(materialName).join(', ')}.
                Actualizá la lista de precios antes de confirmar el retiro.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Form errors */}
        {formErrors.length > 0 && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-1">
            {formErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-700">{err}</p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={resetForm}>
            Limpiar
          </Button>
          <Button
            type="submit"
            disabled={isRegistrando || preview.missingPrices.length > 0}
          >
            {isRegistrando ? 'Registrando...' : 'Confirmar retiro'}
          </Button>
        </div>
      </form>

      {/* Retiros list */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Historial de retiros</h2>

        {!selectedProviderId && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Seleccioná un proveedor para ver el historial de retiros.
          </p>
        )}

        {selectedProviderId && retirosLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {selectedProviderId && !retirosLoading && retiros.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No hay retiros registrados para este proveedor.
          </p>
        )}

        {selectedProviderId && !retirosLoading && retiros.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Arquitecto</TableHead>
                  <TableHead>Ítems</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {retiros.map((retiro) => {
                  const total = retiro.retiro_item.reduce((acc, it) => acc + it.subtotal, 0);
                  return (
                    <TableRow key={retiro.id}>
                      <TableCell className="text-sm">{retiro.fecha_retiro}</TableCell>
                      <TableCell className="text-sm">{retiro.project?.name ?? retiro.project_id}</TableCell>
                      <TableCell className="text-sm">{retiro.architect?.full_name ?? retiro.architect_id}</TableCell>
                      <TableCell className="text-sm">{retiro.retiro_item.length}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(total)}</TableCell>
                      <TableCell>
                        {retiro.estado === 'activo' ? (
                          <Badge variant="default" className="bg-green-600">Activo</Badge>
                        ) : (
                          <Badge variant="destructive">Anulado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {retiro.estado === 'activo' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setAnulacionTarget(retiro.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Anular
                          </Button>
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

      {/* Anulacion dialog */}
      <AnulacionDialog
        retiroId={anulacionTarget}
        onConfirm={handleAnular}
        onCancel={() => setAnulacionTarget(null)}
        isLoading={isAnulando}
      />
    </div>
  );
}
