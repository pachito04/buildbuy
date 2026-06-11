import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';
import { useAuth } from '@/hooks/useAuth';
import { useOwnProviderId } from '@/hooks/useOwnProviderId';
import { usePreciosProveedor, preciosKey, type PrecioWithMaterial } from '@/hooks/usePreciosProveedor';
import { resolvePrecioVigente } from '@/lib/precio-vigencia';
import { PreciosUploader, type ParsedPrecioRow } from '@/components/precios/PreciosUploader';
import { ComparativaPrecios } from '@/components/precios/ComparativaPrecios';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, AlertTriangle, Search, Pencil, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaterialRow = Database['public']['Tables']['materials']['Row'];
type ProviderRow = Database['public']['Tables']['providers']['Row'];

interface PrecioForm {
  material_id: string;
  precio_unitario: string;
  unidad_medida: string;
  vigencia_desde: string;
  vigencia_hasta: string;
}

const emptyForm: PrecioForm = {
  material_id: '',
  precio_unitario: '',
  unidad_medida: '',
  vigencia_desde: new Date().toISOString().split('T')[0],
  vigencia_hasta: '',
};

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

function vigenciaStatus(row: PrecioWithMaterial): 'active' | 'expired' | 'future' {
  const t = today();
  if (row.vigencia_desde > t) return 'future';
  if (row.vigencia_hasta !== null && row.vigencia_hasta <= t) return 'expired';
  return 'active';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ListaPreciosProveedor() {
  const { viewRole, companyId } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isProvider = viewRole === 'proveedor';
  const isCompras = viewRole === 'compras' || viewRole === 'admin';

  // ---- Provider selection (Compras selects any; Proveedor auto-resolved) ---

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Providers list (for Compras selector)
  const { data: providers } = useQuery({
    queryKey: ['providers-list', companyId],
    enabled: isCompras,
    queryFn: async (): Promise<ProviderRow[]> => {
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  // Resolve own provider_id when logged in as proveedor
  const ownProviderId = useOwnProviderId();

  const effectiveProviderId = isProvider ? ownProviderId : selectedProviderId;

  // ---- Materials for the dropdown -------------------------------------------

  const { data: materials } = useQuery({
    queryKey: ['materials-all', companyId],
    enabled: !!companyId || isProvider,
    queryFn: async (): Promise<MaterialRow[]> => {
      let query = supabase.from('materials').select('*').eq('active', true).order('name');
      if (companyId) query = query.eq('company_id', companyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ---- Prices for the selected provider ------------------------------------

  const { precios, isLoading, insertPrecio, isInserting, closeVigencia, deletePrecio } =
    usePreciosProveedor(effectiveProviderId);

  // ---- Prices for ALL providers (Comparativa tab) --------------------------

  const { data: allPrecios } = useQuery({
    queryKey: ['all-precios-proveedor', companyId],
    enabled: isCompras,
    queryFn: async (): Promise<PrecioWithMaterial[]> => {
      const { data, error } = await supabase
        .from('precio_proveedor')
        .select(
          `id, company_id, provider_id, material_id, precio_unitario, unidad_medida,
           vigencia_desde, vigencia_hasta, created_by, created_at,
           material:materials!precio_proveedor_material_id_fkey(id, name, unit)`
        )
        .order('vigencia_desde', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PrecioWithMaterial[];
    },
  });

  // ---- Dialog / form state -------------------------------------------------

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState<PrecioForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [closeDialogId, setCloseDialogId] = useState<string | null>(null);
  const [closeDate, setCloseDate] = useState('');

  // ---- Alerts: materials without active price ------------------------------

  const materialsWithoutActivePrice = (materials ?? []).filter((mat) => {
    const provPrecios = precios.filter((p) => p.material_id === mat.id);
    return resolvePrecioVigente(provPrecios, today()) === null;
  });

  const expiredPrecios = precios.filter((p) => vigenciaStatus(p) === 'expired');

  // ---- Filtered precios ----------------------------------------------------

  const filteredPrecios = precios.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = p.material?.name?.toLowerCase() ?? '';
    return name.includes(q);
  });

  // ---- Handlers ------------------------------------------------------------

  function resetForm() {
    setForm(emptyForm);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const precio_unitario = parseFloat(form.precio_unitario);
    if (!form.material_id) { setFormError('Seleccioná un material.'); return; }
    if (isNaN(precio_unitario) || precio_unitario <= 0) {
      setFormError('El precio debe ser mayor a 0.');
      return;
    }
    if (!effectiveProviderId) { setFormError('No se pudo determinar el proveedor.'); return; }

    insertPrecio(
      {
        provider_id: effectiveProviderId,
        material_id: form.material_id,
        precio_unitario,
        unidad_medida: form.unidad_medida || null,
        vigencia_desde: form.vigencia_desde,
        vigencia_hasta: form.vigencia_hasta || null,
        // Providers publish global prices (company_id = null).
        // Only compras/admin may write a company-scoped override.
        company_id: isProvider ? null : (companyId ?? null),
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          resetForm();
        },
        onError: (e) => {
          setFormError(e.message);
        },
      }
    );
  }

  function handleCloseVigencia() {
    if (!closeDialogId || !closeDate) return;
    closeVigencia(
      { id: closeDialogId, vigencia_hasta: closeDate },
      {
        onSuccess: () => {
          setCloseDialogId(null);
          setCloseDate('');
        },
      }
    );
  }

  // ---- Excel bulk import ---------------------------------------------------

  const handleParsed = useCallback(
    async (rows: ParsedPrecioRow[]) => {
      if (!effectiveProviderId || !user?.id) return;

      // Providers publish global prices (company_id = null).
      // Only compras/admin may write a company-scoped override.
      const resolvedCompanyId = isProvider ? null : (companyId ?? null);

      // Resolve material_id client-side (keeps "material not found" message
      // in the client layer; RPC validates overlap server-side).
      let unknownMaterialCount = 0;
      const resolvedRows: {
        provider_id: string;
        material_id: string;
        precio_unitario: number;
        unidad_medida: string | null;
        vigencia_desde: string;
        vigencia_hasta: string | null;
        company_id: string | null;
        created_by: string;
      }[] = [];

      for (const row of rows) {
        const mat = (materials ?? []).find(
          (m) => m.name.toLowerCase() === row.material_name.toLowerCase()
        );
        if (!mat) {
          unknownMaterialCount++;
          continue;
        }
        resolvedRows.push({
          provider_id: effectiveProviderId,
          material_id: mat.id,
          precio_unitario: row.precio_unitario,
          unidad_medida: row.unidad_medida || null,
          vigencia_desde: row.vigencia_desde,
          vigencia_hasta: row.vigencia_hasta ?? null,
          company_id: resolvedCompanyId,
          created_by: user.id,
        });
      }

      let insertedCount = 0;
      let overlapCount = 0;

      if (resolvedRows.length > 0) {
        // Single RPC call — sets batch token inside one transaction so the
        // trigger fires exactly ONE summary notification instead of N.
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'precio_proveedor_bulk_insert',
          {
            p_rows: resolvedRows as unknown as import('@/integrations/supabase/types').Json,
            p_provider_id: effectiveProviderId,
            // null = global price; the RPC resolves the company via profiles.
            // Passing '' would hit "invalid input syntax for type uuid".
            p_company_id: resolvedCompanyId,
          }
        );

        if (rpcError) {
          toast({
            title: 'Error al importar precios',
            description: rpcError.message,
            variant: 'destructive',
          });
          return;
        }

        const result = rpcResult as { inserted: number; rejected: { reason: string }[] } | null;
        insertedCount = result?.inserted ?? 0;
        overlapCount = (result?.rejected ?? []).length;
      }

      qc.invalidateQueries({ queryKey: preciosKey(effectiveProviderId, resolvedCompanyId) });
      setUploadOpen(false);

      const rejectedCount = unknownMaterialCount + overlapCount;
      const rejectedParts: string[] = [];
      if (unknownMaterialCount > 0) rejectedParts.push(`${unknownMaterialCount} material(es) no encontrado(s)`);
      if (overlapCount > 0) rejectedParts.push(`${overlapCount} con vigencia solapada`);

      toast({
        title: 'Importación completada',
        description:
          insertedCount === 0 && rejectedCount > 0
            ? `No se importó ningún precio. ${rejectedParts.join(', ')}.`
            : `${insertedCount} precio(s) importado(s)${rejectedCount > 0 ? `. ${rejectedParts.join(', ')} rechazado(s).` : '.'}`,
        variant: rejectedCount > 0 ? 'destructive' : 'default',
      });
    },
    [effectiveProviderId, user?.id, materials, companyId, isProvider, qc, toast]
  );

  // ---- Render --------------------------------------------------------------

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lista de Precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isProvider
              ? 'Gestioná los precios de tu lista.'
              : 'Precios por proveedor y comparativa entre proveedores.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Excel import */}
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!effectiveProviderId}>
                <Upload className="h-4 w-4 mr-2" />
                Importar Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Importar lista de precios desde Excel</DialogTitle>
              </DialogHeader>
              <PreciosUploader onParsed={handleParsed} />
            </DialogContent>
          </Dialog>

          {/* New price */}
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" disabled={!effectiveProviderId}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo precio
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar precio</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {/* Material */}
                <div className="space-y-1">
                  <Label htmlFor="material_id">Material</Label>
                  <Select
                    value={form.material_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, material_id: v }))}
                  >
                    <SelectTrigger id="material_id">
                      <SelectValue placeholder="Seleccioná un material" />
                    </SelectTrigger>
                    <SelectContent>
                      {(materials ?? []).map((mat) => (
                        <SelectItem key={mat.id} value={mat.id}>
                          {mat.name} ({mat.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Precio */}
                <div className="space-y-1">
                  <Label htmlFor="precio_unitario">Precio unitario</Label>
                  <Input
                    id="precio_unitario"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={form.precio_unitario}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, precio_unitario: e.target.value }))
                    }
                  />
                </div>

                {/* Unidad de medida (override) */}
                <div className="space-y-1">
                  <Label htmlFor="unidad_medida">
                    Unidad de medida{' '}
                    <span className="text-muted-foreground text-xs">(opcional)</span>
                  </Label>
                  <Input
                    id="unidad_medida"
                    placeholder="ej. kg, m², pza"
                    value={form.unidad_medida}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, unidad_medida: e.target.value }))
                    }
                  />
                </div>

                {/* Vigencia desde */}
                <div className="space-y-1">
                  <Label htmlFor="vigencia_desde">Vigencia desde</Label>
                  <Input
                    id="vigencia_desde"
                    type="date"
                    value={form.vigencia_desde}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vigencia_desde: e.target.value }))
                    }
                  />
                </div>

                {/* Vigencia hasta */}
                <div className="space-y-1">
                  <Label htmlFor="vigencia_hasta">
                    Vigencia hasta{' '}
                    <span className="text-muted-foreground text-xs">(vacío = sin vencimiento)</span>
                  </Label>
                  <Input
                    id="vigencia_hasta"
                    type="date"
                    value={form.vigencia_hasta}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vigencia_hasta: e.target.value }))
                    }
                  />
                </div>

                {formError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{formError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isInserting}>
                    {isInserting ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provider selector (Compras only) */}
      {isCompras && (
        <div className="flex items-center gap-3">
          <Label htmlFor="provider-select" className="shrink-0 text-sm">
            Proveedor
          </Label>
          <Select
            value={selectedProviderId ?? ''}
            onValueChange={(v) => setSelectedProviderId(v || null)}
          >
            <SelectTrigger id="provider-select" className="w-64">
              <SelectValue placeholder="Seleccioná un proveedor" />
            </SelectTrigger>
            <SelectContent>
              {(providers ?? []).map((prov) => (
                <SelectItem key={prov.id} value={prov.id}>
                  {prov.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Alerts */}
      {effectiveProviderId && (
        <div className="space-y-2">
          {materialsWithoutActivePrice.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <strong>{materialsWithoutActivePrice.length} material(es)</strong> sin precio
                vigente:{' '}
                {materialsWithoutActivePrice
                  .slice(0, 5)
                  .map((m) => m.name)
                  .join(', ')}
                {materialsWithoutActivePrice.length > 5 && ' y más…'}
              </AlertDescription>
            </Alert>
          )}

          {expiredPrecios.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">
                <strong>{expiredPrecios.length} precio(s)</strong> con vigencia vencida. Actualizalos
                para evitar bloqueos en los retiros.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Tabs: Lista | Comparativa */}
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista de precios</TabsTrigger>
          {isCompras && (
            <TabsTrigger value="comparativa">Comparativa entre proveedores</TabsTrigger>
          )}
        </TabsList>

        {/* ---- Tab: Lista ---- */}
        <TabsContent value="lista" className="mt-4 space-y-4">
          {/* Search */}
          {effectiveProviderId && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por material..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {!effectiveProviderId && (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {isCompras
                ? 'Seleccioná un proveedor para ver su lista de precios.'
                : 'No se encontró tu proveedor asociado. Contactá al administrador.'}
            </p>
          )}

          {effectiveProviderId && isLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          )}

          {effectiveProviderId && !isLoading && filteredPrecios.length === 0 && (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No hay precios registrados{searchQuery ? ' que coincidan con la búsqueda' : ''}.
            </p>
          )}

          {effectiveProviderId && !isLoading && filteredPrecios.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Precio unitario</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Vigencia desde</TableHead>
                    <TableHead>Vigencia hasta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPrecios.map((p) => {
                    const status = vigenciaStatus(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.material?.name ?? p.material_id}
                        </TableCell>
                        <TableCell>{formatCurrency(p.precio_unitario)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {p.unidad_medida ?? p.material?.unit ?? '—'}
                        </TableCell>
                        <TableCell>{p.vigencia_desde}</TableCell>
                        <TableCell>
                          {p.vigencia_hasta ?? (
                            <span className="text-muted-foreground text-xs">sin vencimiento</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {status === 'active' && (
                            <Badge variant="default" className="bg-green-600">
                              Vigente
                            </Badge>
                          )}
                          {status === 'expired' && (
                            <Badge variant="destructive">Vencido</Badge>
                          )}
                          {status === 'future' && (
                            <Badge variant="secondary">Futuro</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Close vigencia */}
                            {p.vigencia_hasta === null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Cerrar vigencia"
                                onClick={() => {
                                  setCloseDialogId(p.id);
                                  setCloseDate(today());
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              onClick={() => deletePrecio(p.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ---- Tab: Comparativa ---- */}
        {isCompras && (
          <TabsContent value="comparativa" className="mt-4">
            <ComparativaPrecios
              allPrecios={allPrecios ?? []}
              providers={(providers ?? []).map((p) => ({ id: p.id, name: p.name }))}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Close-vigencia dialog */}
      <Dialog
        open={!!closeDialogId}
        onOpenChange={(open) => {
          if (!open) { setCloseDialogId(null); setCloseDate(''); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cerrar vigencia</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ingresá la fecha hasta la cual aplica este precio (exclusive).
          </p>
          <div className="space-y-1 mt-2">
            <Label htmlFor="close-date">Vigencia hasta</Label>
            <Input
              id="close-date"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setCloseDialogId(null); setCloseDate(''); }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCloseVigencia} disabled={!closeDate}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
