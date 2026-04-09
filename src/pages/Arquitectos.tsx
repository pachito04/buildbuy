import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, HardHat, Search } from "lucide-react";

type Architect = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export default function Arquitectos() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Architect | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { companyId, loading: roleLoading } = useViewRole();

  const { data: architects, isLoading } = useQuery({
    queryKey: ["architects", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("architects")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as Architect[];
    },
    enabled: !!companyId && !roleLoading,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No hay empresa asociada");
      if (editing) {
        const { error } = await supabase
          .from("architects")
          .update({ full_name: fullName, email: email || null, phone: phone || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("architects").insert({
          company_id: companyId,
          full_name: fullName,
          email: email || null,
          phone: phone || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      closeDialog();
      toast({ title: editing ? "Arquitecto actualizado" : "Arquitecto agregado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("architects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["architects"] });
      toast({ title: "Arquitecto eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setFullName("");
    setEmail("");
    setPhone("");
  };

  const openEdit = (a: Architect) => {
    setEditing(a);
    setFullName(a.full_name);
    setEmail(a.email || "");
    setPhone(a.phone || "");
    setDialogOpen(true);
  };

  const filtered = architects?.filter(
    (a) =>
      !searchQuery ||
      a.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Arquitectos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Arquitectos asociados a tus proyectos de obra
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Agregar Arquitecto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Arquitecto" : "Nuevo Arquitecto"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre completo *</Label>
                <Input placeholder="Ej: Arq. Juan Pérez" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input placeholder="+52 55 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={save.isPending}>
                {save.isPending ? "Guardando..." : editing ? "Guardar Cambios" : "Agregar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar arquitecto..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {!companyId && !roleLoading && (
        <Card><CardContent className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No tienes una empresa asociada.</p>
        </CardContent></Card>
      )}

      {companyId && (
        <>
          {(isLoading || roleLoading) ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : !filtered?.length ? (
            <Card><CardContent className="text-center py-12 text-muted-foreground">
              <HardHat className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No hay arquitectos registrados.</p>
              <p className="text-xs mt-1">Agrega arquitectos para asociarlos a proyectos y pedidos.</p>
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{a.phone || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">{filtered?.length || 0} arquitecto(s)</p>
        </>
      )}
    </div>
  );
}
