import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpRight, Plus, Pencil, Trash2, Building2, Search, MapPin, User, Inbox, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Link } from "react-router-dom";
import { PROVINCIAS, PROVINCIA_NAMES } from "@/data/argentina-geo";
import { WizardNuevaObra } from "@/components/obras/WizardNuevaObra";
import { useObrasAvance } from "@/hooks/useObrasAvance";
import { formatCurrency } from "@/lib/computo-utils";

type Obra = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  code: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  contact_name: string | null;
  active: boolean;
  created_at: string;
};

export default function Obras() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Obra | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [contactName, setContactName] = useState("");

  const { toast } = useToast();
  const qc = useQueryClient();
  const { companyId, loading: roleLoading } = useViewRole();

  const { data: avanceMap } = useObrasAvance(companyId);

  const { data: obras, isLoading } = useQuery({
    queryKey: ["obras", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Obra[];
    },
    enabled: !!companyId && !roleLoading,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId || !editing) throw new Error("No hay empresa asociada");
      const payload = {
        company_id: companyId,
        name,
        description: description || null,
        code: code || null,
        address: address || null,
        city: city || null,
        province: province || null,
        contact_name: contactName || null,
      };
      const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obras"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      closeEditDialog();
      toast({ title: "Obra actualizada" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("projects")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obras"] });
      toast({ title: "Obra desactivada" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditing(null);
    setName("");
    setDescription("");
    setCode("");
    setAddress("");
    setCity("");
    setProvince("");
    setContactName("");
  };

  const openEdit = (o: Obra) => {
    setEditing(o);
    setName(o.name);
    setDescription(o.description || "");
    setCode(o.code || "");
    setAddress(o.address || "");
    setCity(o.city || "");
    setProvince(o.province || "");
    setContactName(o.contact_name || "");
    setEditDialogOpen(true);
  };

  const filtered = obras?.filter(
    (o) =>
      !searchQuery ||
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        eyebrow="Proyectos"
        title="Obras"
        subtitle="Proyectos de obra asociados a tu empresa"
        actions={
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2.5 rounded-full bg-foreground py-2 pl-5 pr-2 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
          >
            Nueva Obra
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </button>
        }
      />

      <WizardNuevaObra open={wizardOpen} onOpenChange={setWizardOpen} />

      <Dialog open={editDialogOpen} onOpenChange={(o) => (o ? setEditDialogOpen(true) : closeEditDialog())}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <span className="eyebrow">Proyectos</span>
            <DialogTitle>Editar Obra</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nombre de la obra *</Label>
              <Input
                placeholder="Ej: Edificio Palermo III"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Descripción del proyecto..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código de obra</Label>
                <Input
                  placeholder="Ej: OBR-2024-003"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Persona de contacto</Label>
                <Input
                  placeholder="Nombre y apellido"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Domicilio</Label>
              <Input
                placeholder="Calle y número"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provincia</Label>
                <Select
                  value={province}
                  onValueChange={(v) => {
                    setProvince(v);
                    setCity("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCIA_NAMES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Select
                  value={city}
                  onValueChange={setCity}
                  disabled={!province}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={province ? "Seleccionar ciudad..." : "Elegí una provincia primero"} />
                  </SelectTrigger>
                  <SelectContent>
                    {province && PROVINCIAS[province]?.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">* Campo obligatorio</p>

            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, código o ciudad..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading || roleLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filtered?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery
                ? "No hay obras que coincidan con la búsqueda."
                : "No hay obras registradas."}
            </p>
            {!searchQuery && (
              <p className="text-xs mt-1">
                Creá tu primera obra para gestionar pedidos de materiales por proyecto.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <Card key={o.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{o.name}</h3>
                      {o.code && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {o.code}
                        </Badge>
                      )}
                    </div>
                    {o.description && (
                      <p className="text-xs text-muted-foreground mt-1">{o.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {(o.address || o.city || o.province) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[o.address, o.city, o.province].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {o.contact_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          {o.contact_name}
                        </span>
                      )}
                    </div>
                    {avanceMap?.get(o.id) && (() => {
                      const av = avanceMap.get(o.id)!;
                      const total = Math.max(av.presupuesto, av.comprometido, 1);
                      const pctRecibido = Math.min((av.recibido / total) * 100, 100);
                      const pctComprometido = Math.min((av.comprometido / total) * 100, 100);
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="relative h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-green-300 transition-all duration-500"
                              style={{ width: `${pctComprometido}%` }}
                            />
                            <div
                              className="absolute inset-y-0 left-0 bg-green-600 transition-all duration-500"
                              style={{ width: `${pctRecibido}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>{av.itemCount} ítems</span>
                            <span>Presup. {formatCurrency(av.presupuesto)}</span>
                            <span>Recib. {formatCurrency(av.recibido)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/obras/${o.id}`}>
                        <LayoutDashboard className="h-4 w-4 mr-1" />
                        Dashboard
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/obras/${o.id}/requerimientos`}>
                        <Inbox className="h-4 w-4 mr-1" />
                        Requerimientos
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove.mutate(o.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">{filtered.length} obra(s)</p>
        </div>
      )}
    </div>
  );
}
