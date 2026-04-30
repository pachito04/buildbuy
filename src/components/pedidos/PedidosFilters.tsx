import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Table2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
}

interface PedidosFiltersProps {
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  statusOptions: string[];
  statusLabels: Record<string, string>;
  obraFilter: string;
  onObraFilterChange: (v: string) => void;
  projects: Project[];
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  viewMode: "grid" | "board";
  onViewModeChange: (v: "grid" | "board") => void;
  showViewToggle: boolean;
}

export function PedidosFilters({
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  statusLabels,
  obraFilter,
  onObraFilterChange,
  projects,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  viewMode,
  onViewModeChange,
  showViewToggle,
}: PedidosFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          {statusOptions.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => onStatusFilterChange(s)}
            >
              {statusLabels[s] ?? s}
            </Button>
          ))}
        </div>

        {showViewToggle && (
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-none px-3"
              onClick={() => onViewModeChange("grid")}
            >
              <Table2 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "board" ? "default" : "ghost"}
              size="sm"
              className="rounded-none px-3"
              onClick={() => onViewModeChange("board")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={obraFilter} onValueChange={onObraFilterChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las obras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las obras</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            placeholder="Desde"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            placeholder="Hasta"
          />
        </div>
      </div>
    </div>
  );
}
