import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Star, Trash2, Pencil, CheckCircle, XCircle, Eye, Search, Copy } from "lucide-react";

interface ProviderForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  categories: string;
}

const emptyForm: ProviderForm = { name: "", contact_name: "", email: "", phone: "", categories: "" };

const verificationLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  verified: { label: "Verificado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
};

export default function Proveedores() {
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: providerDocs } = useQuery({
    queryKey: ["provider-docs", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data, error } = await supabase.from("provider_documents").select("*").eq("provider_id", detailId);
      if (error) throw error;
      return data;
    },
    enabled: !!detailId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (f: ProviderForm) => {
      const cats = f.categories.split(",").map((c) => c.trim()).filter(Boolean);
      const payload = { name: f.name, contact_name: f.contact_name || null, email: f.email || null, phone: f.phone || null, categories: cats };
      if (editId) {
        const { error } = await supabase.from("providers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("providers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      toast({ title: editId ? "Proveedor actualizado" : "Proveedor creado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast({ title: "Proveedor eliminado" });
    },
  });

  const updateVerification = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase
        .from("providers")
        .update({ verification_status: status, verification_notes: notes || null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast({ title: "Estado de verificación actualizado" });
    },
  });

  const openEdit = (p: any) => {
    setForm({ name: p.name, contact_name: p.contact_name || "", email: p.email || "", phone: p.phone || "", categories: (p.categories || []).join(", ") });
    setEditId(p.id);
    setOpen(true);
  };

  const registrationUrl = `${window.location.origin}/registro-proveedor`;

  const filtered = providers?.filter((p: any) => {
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.contact_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || p.verification_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const detailProvider = providers?.find((p) => p.id === detailId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestión de proveedores, onboarding y scoring</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(registrationUrl);
              toast({ title: "Enlace copiado", description: "Comparte este enlace con tus proveedores" });
            }}
          >
            <Copy className="h-4 w-4 mr-1" />Link de Registro
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm); setEditId(null); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Agregar Proveedor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); upsertMutation.mutate(form); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre de empresa *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Contacto</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Categorías (separadas por coma)</Label>
                  <Input placeholder="Acero, Cemento, Eléctrico" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? "Guardando..." : editId ? "Actualizar" : "Crear Proveedor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar proveedor..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {["all", "pending", "verified", "rejected"].map((s) => (
            <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)}>
              {s === "all" ? "Todos" : verificationLabels[s]?.label || s}
            </Button>
          ))}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Detalle del Proveedor</DialogTitle>
          </DialogHeader>
          {detailProvider && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{(detailProvider as any).name}</h3>
                <Badge variant={verificationLabels[(detailProvider as any).verification_status]?.variant || "outline"}>
                  {verificationLabels[(detailProvider as any).verification_status]?.label || (detailProvider as any).verification_status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Contacto:</span> {(detailProvider as any).contact_name || "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {(detailProvider as any).email || "—"}</div>
                <div><span className="text-muted-foreground">Teléfono:</span> {(detailProvider as any).phone || "—"}</div>
                <div><span className="text-muted-foreground">RFC:</span> {(detailProvider as any).rfc || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Razón Social:</span> {(detailProvider as any).razon_social || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Dirección Fiscal:</span> {(detailProvider as any).direccion_fiscal || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Régimen:</span> {(detailProvider as any).tax_regime || "—"}</div>
              </div>

              {(detailProvider as any).categories?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Categorías:</p>
                  <div className="flex flex-wrap gap-1">
                    {((detailProvider as any).categories as string[]).map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {(detailProvider as any).terms_accepted_at && (
                <p className="text-xs text-primary">✓ T&C aceptados: {new Date((detailProvider as any).terms_accepted_at).toLocaleDateString("es-MX")}</p>
              )}

              {/* Documents */}
              {providerDocs && providerDocs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Documentos:</p>
                  {providerDocs.map((doc: any) => (
                    <a
                      key={doc.id}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      📄 {doc.doc_type}: {doc.file_name}
                    </a>
                  ))}
                </div>
              )}

              {/* Verification actions */}
              {(detailProvider as any).verification_status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => updateVerification.mutate({ id: detailProvider.id, status: "verified" })}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />Verificar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => updateVerification.mutate({ id: detailProvider.id, status: "rejected", notes: "Documentación incompleta" })}
                  >
                    <XCircle className="h-3 w-3 mr-1" />Rechazar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : !filtered?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay proveedores registrados.</p>
            <p className="text-xs mt-1">Agrega proveedores o comparte el enlace de registro.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-display">{p.name}</CardTitle>
                  {p.contact_name && <p className="text-sm text-muted-foreground">{p.contact_name}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={verificationLabels[p.verification_status]?.variant || "outline"} className="text-xs">
                    {verificationLabels[p.verification_status]?.label || p.verification_status}
                  </Badge>
                  <div className="flex items-center gap-1 text-warning">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="text-sm font-medium">{Number(p.score).toFixed(1)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.email && <p className="text-sm text-muted-foreground">{p.email}</p>}
                {p.phone && <p className="text-sm text-muted-foreground">{p.phone}</p>}
                {p.rfc && <p className="text-xs text-muted-foreground">RFC: {p.rfc}</p>}
                {p.categories && p.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(p.categories as string[]).map((c: string) => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setDetailId(p.id)}><Eye className="h-3 w-3 mr-1" />Detalle</Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
