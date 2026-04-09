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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, Search, MapPin, User } from "lucide-react";

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
  const [dialogOpen, setDialogOpen] = useState(false);
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
      if (!companyId) throw new Error("No hay empresa asociada");
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
      if (editing) {
        const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obras"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      closeDialog();
      toast({ title: editing ? "Obra actualizada" : "Obra creada" });
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

  const closeDialog = () => {
    setDialogOpen(false);
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
    setDialogOpen(true);
  };

  const filtered = obras?.filter(
    (o) =>
      !searchQuery ||
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Obras</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Proyectos de obra asociados a tu empresa
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Obra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Obra" : "Nueva Obra"}</DialogTitle>
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
                  <Label>Ciudad</Label>
                  <Input
                    placeholder="Buenos Aires"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provincia</Label>
                  <Input
                    placeholder="CABA"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">* Campo obligatorio</p>

              <Button type="submit" className="w-full" disabled={save.isPending}>
                {save.isPending ? "Guardando..." : editing ? "Guardar Cambios" : "Crear Obra"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                  </div>
                  <div className="flex gap-1 shrink-0">
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
