import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShieldAlert } from "lucide-react";

type AppRole = "arquitecto" | "compras" | "proveedor" | "admin";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  role: AppRole | null;
  role_row_id: string | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  arquitecto: "Arquitecto",
  compras: "Compras",
  proveedor: "Proveedor",
  admin: "Administrador",
};

const ROLE_COLORS: Record<AppRole, string> = {
  arquitecto: "bg-blue-100 text-blue-800 border-blue-200",
  compras: "bg-emerald-100 text-emerald-800 border-emerald-200",
  proveedor: "bg-violet-100 text-violet-800 border-violet-200",
  admin: "bg-orange-100 text-orange-800 border-orange-200",
};

// Demo rows shown when DB has no real users (for testing)
const DEMO_USERS: UserRow[] = [
  {
    id: "demo-1",
    full_name: "Juan García",
    email: "juan@constructora.com",
    avatar_url: null,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    role: "admin",
    role_row_id: null,
  },
  {
    id: "demo-2",
    full_name: "María López",
    email: "maria@constructora.com",
    avatar_url: null,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    role: "arquitecto",
    role_row_id: null,
  },
  {
    id: "demo-3",
    full_name: "Carlos Ruiz",
    email: "carlos@constructora.com",
    avatar_url: null,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    role: "compras",
    role_row_id: null,
  },
  {
    id: "demo-4",
    full_name: "Sofía Martínez",
    email: "sofia@proveedor.com",
    avatar_url: null,
    created_at: new Date().toISOString(),
    role: null,
    role_row_id: null,
  },
];

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

function RoleBadge({ role }: { role: AppRole | null }) {
  if (!role) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-500 border-zinc-200">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Sin rol
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[role]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {ROLE_LABELS[role]}
    </span>
  );
}

export default function Usuarios() {
  const { actualRole } = useViewRole();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("id, user_id, role");

      const roleMap = new Map(
        (roles ?? []).map((r) => [r.user_id, { role: r.role as AppRole, id: r.id }])
      );

      return (profiles ?? []).map((p): UserRow => ({
        ...p,
        role: roleMap.get(p.id)?.role ?? null,
        role_row_id: roleMap.get(p.id)?.id ?? null,
      }));
    },
  });

  const assignRole = useMutation({
    mutationFn: async ({ userId, role, existingRoleId }: { userId: string; role: AppRole | "none"; existingRoleId: string | null }) => {
      if (role === "none") {
        // Remove role
        if (existingRoleId) {
          const { error } = await supabase.from("user_roles").delete().eq("id", existingRoleId);
          if (error) throw error;
        }
        return;
      }

      if (existingRoleId) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role })
          .eq("id", existingRoleId);
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast({
        title: "Rol actualizado",
        description: vars.role === "none" ? "Rol eliminado correctamente." : `Rol asignado: ${ROLE_LABELS[vars.role as AppRole]}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setUpdatingId(null),
  });

  const handleRoleChange = (user: UserRow, newRole: string) => {
    if (user.id.startsWith("demo-")) {
      toast({ title: "Datos de prueba", description: "Esta acción no afecta datos de demostración." });
      return;
    }
    setUpdatingId(user.id);
    assignRole.mutate({ userId: user.id, role: newRole as AppRole | "none", existingRoleId: user.role_row_id });
  };

  // Only admins can access this page
  if (actualRole !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">Acceso restringido</p>
        <p className="text-muted-foreground text-sm mt-1">Solo los administradores pueden ver esta sección.</p>
      </div>
    );
  }

  const displayUsers = (!isLoading && (!users || users.length === 0)) ? DEMO_USERS : (users ?? []);
  const isDemo = !isLoading && (!users || users.length === 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Usuarios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestioná los miembros de tu organización y sus roles de acceso
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
        </div>
      </div>

      {/* Demo notice */}
      {isDemo && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <span className="text-amber-600 text-sm font-medium">Datos de prueba</span>
          <span className="text-amber-600 text-sm">— Registrá usuarios reales desde la pantalla de inicio de sesión.</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total usuarios", value: displayUsers.length },
          { label: "Con rol asignado", value: displayUsers.filter((u) => u.role).length },
          { label: "Sin rol", value: displayUsers.filter((u) => !u.role).length },
          { label: "Administradores", value: displayUsers.filter((u) => u.role === "admin").length },
        ].map(({ label, value }) => (
          <Card key={label} className="border-0 shadow-sm bg-muted/40">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="px-6 py-4 border-b bg-muted/20">
          <CardTitle className="text-base font-semibold">Miembros de la organización</CardTitle>
          <CardDescription className="text-xs">
            Asigná roles para controlar el acceso de cada usuario
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-36" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6 text-xs font-medium text-muted-foreground">Usuario</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Email</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Rol actual</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground pr-6">Asignar rol</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Miembro desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayUsers.map((user) => (
                  <TableRow key={user.id} className="group">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                            {getInitials(user.full_name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {user.full_name ?? "Sin nombre"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{user.email ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role ?? "none"}
                        onValueChange={(v) => handleRoleChange(user, v)}
                        disabled={updatingId === user.id}
                      >
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                          <SelectValue placeholder="Asignar rol..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">Sin rol</span>
                          </SelectItem>
                          <SelectItem value="arquitecto">Arquitecto</SelectItem>
                          <SelectItem value="compras">Compras</SelectItem>
                          <SelectItem value="proveedor">Proveedor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-6">
                      <span className="text-xs text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
