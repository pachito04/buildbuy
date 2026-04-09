import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  metadata: Record<string, any> | null;
};

const typeIcon: Record<string, string> = {
  request_approved: "✅",
  request_rejected: "❌",
  request_created:  "📋",
  stock_available:  "📦",
  rfq_created:      "📄",
  quote_received:   "💬",
  po_issued:        "🛒",
  po_accepted:      "✅",
  po_rejected:      "❌",
  material_received:"📦",
  remito_dispatched:"🚚",
  remito_delivered: "🏗️",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000, // poll every 30s
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificaciones")
        .select("id, type, message, read, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Notif[];
    },
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications
        ?.filter((n) => !n.read)
        .map((n) => n.id);
      if (!unreadIds?.length) return;
      await supabase
        .from("notificaciones")
        .update({ read: true })
        .in("id", unreadIds);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) {
      // Mark all read when panel opens
      markAllRead.mutate();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notificaciones</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} nueva(s)</span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!notifications?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay notificaciones.
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex gap-3 px-4 py-3 border-b last:border-0 text-sm",
                  !n.read && "bg-primary/5"
                )}
              >
                <span className="text-base shrink-0 mt-0.5">
                  {typeIcon[n.type] ?? "🔔"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn("leading-snug", !n.read && "font-medium")}>
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(n.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
