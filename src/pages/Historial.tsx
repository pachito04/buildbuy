import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Download,
  TrendingUp,
  DollarSign,
  FileText,
  ShoppingCart,
  Layers,
  Percent,
} from "lucide-react";

const COLORS = [
  "hsl(24, 95%, 53%)",
  "hsl(200, 80%, 50%)",
  "hsl(142, 71%, 45%)",
  "hsl(280, 65%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 75%, 55%)",
  "hsl(170, 60%, 45%)",
  "hsl(50, 85%, 50%)",
];

function getMonthOptions() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
    });
  }
  return months;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Historial() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  const [year, month] = selectedMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  // Fetch all data for the selected month
  const { data: orders } = useQuery({
    queryKey: ["report-orders", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name)")
        .gte("created_at", startDate)
        .lt("created_at", endDate)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: rfqs } = useQuery({
    queryKey: ["report-rfqs", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select("id, status, created_at, pool_id, request_id")
        .gte("created_at", startDate)
        .lt("created_at", endDate);
      if (error) throw error;
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["report-requests", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select("id, status, created_at")
        .gte("created_at", startDate)
        .lt("created_at", endDate);
      if (error) throw error;
      return data;
    },
  });

  const { data: pools } = useQuery({
    queryKey: ["report-pools", selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_pools")
        .select("id, name, status, is_shared, created_at")
        .gte("created_at", startDate)
        .lt("created_at", endDate);
      if (error) throw error;
      return data;
    },
  });

  // Historical trend (last 6 months)
  const { data: trendOrders } = useQuery({
    queryKey: ["report-trend"],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("created_at, total_amount")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // === Computed metrics ===
  const totalSpend = (orders || []).reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const totalOrders = orders?.length || 0;
  const totalRfqs = rfqs?.length || 0;
  const totalRequests = requests?.length || 0;
  const totalPools = pools?.length || 0;
  const sharedPools = (pools || []).filter((p) => p.is_shared).length;
  const poolRfqs = (rfqs || []).filter((r) => r.pool_id).length;
  const directRfqs = (rfqs || []).filter((r) => r.request_id && !r.pool_id).length;

  // Spend by provider
  const spendByProvider = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    (orders || []).forEach((o: any) => {
      const name = o.providers?.name || "Desconocido";
      if (!map[name]) map[name] = { name, total: 0, count: 0 };
      map[name].total += Number(o.total_amount) || 0;
      map[name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [orders]);

  // Monthly trend
  const trendData = useMemo(() => {
    const map: Record<string, { month: string; gasto: number; ordenes: number }> = {};
    (trendOrders || []).forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
      if (!map[key]) map[key] = { month: label, gasto: 0, ordenes: 0 };
      map[key].gasto += Number(o.total_amount) || 0;
      map[key].ordenes += 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [trendOrders]);

  // Pie: RFQ source distribution
  const rfqSourceData = [
    { name: "Desde Pool", value: poolRfqs },
    { name: "Directo", value: directRfqs },
  ].filter((d) => d.value > 0);

  // === CSV export ===
  const exportSpendByProvider = () => {
    downloadCsv(
      `gasto-proveedor-${selectedMonth}.csv`,
      ["Proveedor", "Gasto Total", "Órdenes"],
      spendByProvider.map((p) => [p.name, p.total.toFixed(2), String(p.count)])
    );
  };

  const exportOrders = () => {
    downloadCsv(
      `ordenes-${selectedMonth}.csv`,
      ["ID", "Proveedor", "Monto", "Estado", "Fecha"],
      (orders || []).map((o: any) => [
        o.id.slice(0, 8),
        o.providers?.name || "",
        String(Number(o.total_amount) || 0),
        o.status,
        new Date(o.created_at).toLocaleDateString("es-MX"),
      ])
    );
  };

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label || "";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Reportes Mensuales</h1>
          <p className="text-muted-foreground text-sm mt-1">Métricas de compras, pools y proveedores</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportOrders}>
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <DollarSign className="h-4 w-4 text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Gasto Total</p>
            <p className="text-lg font-bold font-display">${totalSpend.toLocaleString("es-MX", { minimumFractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <ShoppingCart className="h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Órdenes</p>
            <p className="text-lg font-bold font-display">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <FileText className="h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">RFQs</p>
            <p className="text-lg font-bold font-display">{totalRfqs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <TrendingUp className="h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Pedidos</p>
            <p className="text-lg font-bold font-display">{totalRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <Layers className="h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Pools</p>
            <p className="text-lg font-bold font-display">{totalPools}</p>
            {sharedPools > 0 && <p className="text-[10px] text-primary">{sharedPools} inter-empresa</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <Percent className="h-4 w-4 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Proveedores</p>
            <p className="text-lg font-bold font-display">{spendByProvider.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend by provider */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="font-display text-base">Gasto por Proveedor — {monthLabel}</CardTitle>
            <Button variant="ghost" size="sm" onClick={exportSpendByProvider}>
              <Download className="h-3 w-3 mr-1" />CSV
            </Button>
          </CardHeader>
          <CardContent>
            {spendByProvider.length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">Sin datos este mes</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={spendByProvider} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={120} fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, "Gasto"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24}>
                    {spendByProvider.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* RFQ source pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Origen de RFQs</CardTitle>
          </CardHeader>
          <CardContent>
            {rfqSourceData.length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">Sin RFQs este mes</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={rfqSourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {rfqSourceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base">Tendencia de Gasto — Últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted-foreground">Sin datos históricos</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis yAxisId="left" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={12} />
                <YAxis yAxisId="right" orientation="right" fontSize={12} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "gasto"
                      ? [`$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, "Gasto"]
                      : [value, "Órdenes"]
                  }
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="gasto" stroke="hsl(24, 95%, 53%)" strokeWidth={2.5} dot={{ r: 4 }} name="Gasto" />
                <Line yAxisId="right" type="monotone" dataKey="ordenes" stroke="hsl(200, 80%, 50%)" strokeWidth={2} dot={{ r: 3 }} name="Órdenes" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Provider ranking table */}
      {spendByProvider.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Ranking de Proveedores — {monthLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                  <th className="text-right px-3 py-2 font-medium">Gasto Total</th>
                  <th className="text-right px-3 py-2 font-medium">Órdenes</th>
                  <th className="text-right px-3 py-2 font-medium">% del Gasto</th>
                </tr>
              </thead>
              <tbody>
                {spendByProvider.map((p, i) => (
                  <tr key={p.name} className="border-b">
                    <td className="px-3 py-2">
                      {i === 0 ? <Badge className="text-[10px] py-0">🥇</Badge> :
                       i === 1 ? <Badge variant="secondary" className="text-[10px] py-0">🥈</Badge> :
                       i === 2 ? <Badge variant="outline" className="text-[10px] py-0">🥉</Badge> :
                       <span className="text-muted-foreground">{i + 1}</span>}
                    </td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="text-right px-3 py-2 font-mono">${p.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                    <td className="text-right px-3 py-2">{p.count}</td>
                    <td className="text-right px-3 py-2 text-muted-foreground">
                      {totalSpend > 0 ? ((p.total / totalSpend) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
