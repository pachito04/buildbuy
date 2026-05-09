import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  className?: string;
}

export function KPICard({ title, value, subtitle, className }: KPICardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
