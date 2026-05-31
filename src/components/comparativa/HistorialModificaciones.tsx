import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RFQ_FIELD_LABELS } from "@/lib/rfq-header-utils";
import type { RfqHeaderField } from "@/lib/rfq-header-utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangeLogEntry {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  changed_by: string | null;
  changer_name: string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HistorialModificacionesProps {
  rfqId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldLabel(field: string): string {
  return RFQ_FIELD_LABELS[field as RfqHeaderField] ?? field;
}

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistorialModificaciones({ rfqId }: HistorialModificacionesProps) {
  const [open, setOpen] = useState(false);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["rfq-change-log", rfqId],
    enabled: !!rfqId,
    queryFn: async (): Promise<ChangeLogEntry[]> => {
      // Fetch the change log rows newest-first
      const { data: logs, error } = await supabase
        .from("rfq_change_log" as any)
        .select("id, field, old_value, new_value, created_at, changed_by")
        .eq("rfq_id", rfqId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!logs || logs.length === 0) return [];

      // Collect unique changer user IDs
      const changerIds = [
        ...new Set(
          (logs as any[])
            .map((l: any) => l.changed_by)
            .filter(Boolean) as string[]
        ),
      ];

      // Fetch profile names in bulk
      let nameMap = new Map<string, string>();
      if (changerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", changerIds);

        for (const p of profiles ?? []) {
          nameMap.set(p.id, p.full_name);
        }
      }

      return (logs as any[]).map((l: any) => ({
        id: l.id,
        field: l.field,
        old_value: l.old_value,
        new_value: l.new_value,
        created_at: l.created_at,
        changed_by: l.changed_by,
        changer_name: l.changed_by ? (nameMap.get(l.changed_by) ?? "Usuario desconocido") : null,
      }));
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2"
        >
          <History className="h-3.5 w-3.5" />
          <span className="text-xs">Historial de modificaciones</span>
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {entries && entries.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium">
              {entries.length}
            </span>
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 rounded-lg border bg-muted/20 p-3 space-y-0">
          {isLoading ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Cargando historial...
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              <History className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
              <p>Sin modificaciones registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {entries.map((entry) => (
                <div key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-foreground">
                        {formatFieldLabel(entry.field)}
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="rounded bg-red-50 px-1 py-0.5 font-mono text-red-700 border border-red-100 line-through">
                          {entry.old_value || "—"}
                        </span>
                        <span className="text-muted-foreground/60">→</span>
                        <span className="rounded bg-green-50 px-1 py-0.5 font-mono text-green-700 border border-green-100">
                          {entry.new_value || "—"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {entry.changer_name && (
                        <p className="text-[11px] font-medium text-foreground/80">
                          {entry.changer_name}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatTimestamp(entry.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
