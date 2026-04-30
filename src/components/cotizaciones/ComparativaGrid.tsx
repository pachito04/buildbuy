import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, ChevronUp, ChevronDown } from "lucide-react";

interface ComparativaRow {
  id: string;
  label: string;
  request_number: number | null;
  created_at: string;
  closing_datetime: string | null;
  description: string | null;
  creator_name: string | null;
  quote_count: number;
  status: string;
}

type SortColumn = "label" | "created_at" | "closing_datetime" | "description" | "creator_name" | "quote_count";
type SortDir = "asc" | "desc";

interface ComparativaGridProps {
  rows: ComparativaRow[];
  isLoading: boolean;
  onSelect: (rfq: ComparativaRow) => void;
}

const columns: { key: SortColumn; label: string; align?: "center" }[] = [
  { key: "label", label: "N° Solicitud" },
  { key: "created_at", label: "Fecha apertura" },
  { key: "closing_datetime", label: "Fecha cierre" },
  { key: "description", label: "Descripción" },
  { key: "creator_name", label: "Creado por" },
  { key: "quote_count", label: "Cotizaciones", align: "center" },
];

function compareValues(a: ComparativaRow, b: ComparativaRow, col: SortColumn, dir: SortDir): number {
  let result = 0;

  switch (col) {
    case "label": {
      const aNum = a.request_number;
      const bNum = b.request_number;
      if (aNum != null && bNum != null) result = aNum - bNum;
      else if (aNum != null) result = -1;
      else if (bNum != null) result = 1;
      else result = a.label.localeCompare(b.label);
      break;
    }
    case "created_at":
      result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      break;
    case "closing_datetime": {
      const aTime = a.closing_datetime ? new Date(a.closing_datetime).getTime() : 0;
      const bTime = b.closing_datetime ? new Date(b.closing_datetime).getTime() : 0;
      result = aTime - bTime;
      break;
    }
    case "description":
      result = (a.description || "").localeCompare(b.description || "");
      break;
    case "creator_name":
      result = (a.creator_name || "").localeCompare(b.creator_name || "");
      break;
    case "quote_count":
      result = a.quote_count - b.quote_count;
      break;
  }

  return dir === "desc" ? -result : result;
}

export function ComparativaGrid({ rows, isLoading, onSelect }: ComparativaGridProps) {
  const [sortCol, setSortCol] = useState<SortColumn>("label");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compareValues(a, b, sortCol, sortDir)),
    [rows, sortCol, sortDir]
  );

  const handleSort = (col: SortColumn) => {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No hay comparativas disponibles.</p>
          <p className="text-xs mt-1">Las comparativas aparecerán cuando los proveedores envíen cotizaciones.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium select-none cursor-pointer hover:bg-muted/80 transition-colors ${col.align === "center" ? "text-center" : "text-left"}`}
                onClick={() => handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortCol === col.key && (
                    sortDir === "asc"
                      ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
                      : <ChevronDown className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className="border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onSelect(row)}
            >
              <td className="px-4 py-3 font-mono font-medium text-primary">{row.label}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("es-AR")}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.closing_datetime
                  ? new Date(row.closing_datetime).toLocaleString("es-AR")
                  : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground max-w-[250px] truncate">
                {row.description || "—"}
              </td>
              <td className="px-4 py-3">{row.creator_name || "—"}</td>
              <td className="px-4 py-3 text-center">
                <Badge variant={row.quote_count > 0 ? "default" : "secondary"}>
                  {row.quote_count}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
