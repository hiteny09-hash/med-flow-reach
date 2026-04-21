import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { format, startOfDay, subDays } from "date-fns";

interface LogRow {
  medicine_id: string;
  status: string;
  fired_at: string;
  medicines: { name: string } | null;
}

interface DayBucket {
  day: string;
  taken: number;
  skipped: number;
  missed: number;
  fired: number;
}

interface MedSummary {
  id: string;
  name: string;
  total: number;
  taken: number;
  skipped: number;
  missed: number;
  fired: number;
  rate: number;
}

const chartConfig = {
  taken: { label: "Taken", color: "hsl(var(--primary))" },
  skipped: { label: "Skipped", color: "hsl(var(--muted-foreground))" },
  missed: { label: "Missed", color: "hsl(var(--destructive))" },
} as const;

export const AdherenceAnalytics = ({ refreshKey }: { refreshKey: number }) => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = subDays(startOfDay(new Date()), 6).toISOString();
      const { data } = await supabase
        .from("adherence_log")
        .select("medicine_id, status, fired_at, medicines(name)")
        .gte("fired_at", since)
        .order("fired_at", { ascending: true });
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, [refreshKey]);

  const { weekly, perMed, totals } = useMemo(() => {
    const days: DayBucket[] = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(startOfDay(new Date()), 6 - i);
      return { day: format(d, "EEE"), taken: 0, skipped: 0, missed: 0, fired: 0 };
    });
    const dayKey = (d: Date) => format(startOfDay(d), "yyyy-MM-dd");
    const dayIndex = new Map<string, number>();
    days.forEach((_, i) => {
      dayIndex.set(dayKey(subDays(startOfDay(new Date()), 6 - i)), i);
    });

    const medMap = new Map<string, MedSummary>();

    for (const r of rows) {
      const idx = dayIndex.get(dayKey(new Date(r.fired_at)));
      if (idx !== undefined) {
        const bucket = days[idx];
        if (r.status in bucket) (bucket as any)[r.status] += 1;
      }
      const name = r.medicines?.name ?? "Unknown";
      const cur =
        medMap.get(r.medicine_id) ??
        { id: r.medicine_id, name, total: 0, taken: 0, skipped: 0, missed: 0, fired: 0, rate: 0 };
      cur.total += 1;
      if (r.status in cur) (cur as any)[r.status] += 1;
      medMap.set(r.medicine_id, cur);
    }

    const perMed = Array.from(medMap.values())
      .map((m) => ({ ...m, rate: m.total > 0 ? Math.round((m.taken / m.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);

    const totals = perMed.reduce(
      (acc, m) => {
        acc.total += m.total;
        acc.taken += m.taken;
        acc.skipped += m.skipped;
        acc.missed += m.missed;
        acc.fired += m.fired;
        return acc;
      },
      { total: 0, taken: 0, skipped: 0, missed: 0, fired: 0 },
    );

    return { weekly: days, perMed, totals };
  }, [rows]);

  if (loading) {
    return <Card className="p-8 text-center text-muted-foreground shadow-card">Loading analytics…</Card>;
  }

  if (totals.total === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground shadow-card">
        No data yet. Once your reminders fire, weekly stats will appear here.
      </Card>
    );
  }

  const overallRate = totals.total > 0 ? Math.round((totals.taken / totals.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Adherence" value={`${overallRate}%`} accent="text-primary" />
        <StatCard label="Taken" value={totals.taken} />
        <StatCard label="Skipped" value={totals.skipped} />
        <StatCard label="Missed" value={totals.missed} accent="text-destructive" />
      </div>

      <Card className="p-4 sm:p-6 shadow-card">
        <h4 className="font-semibold mb-1">Last 7 days</h4>
        <p className="text-xs text-muted-foreground mb-4">Doses by status, per day</p>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <ResponsiveContainer>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="taken" stackId="a" fill="var(--color-taken)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="skipped" stackId="a" fill="var(--color-skipped)" />
              <Bar dataKey="missed" stackId="a" fill="var(--color-missed)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </Card>

      <Card className="p-4 sm:p-6 shadow-card">
        <h4 className="font-semibold mb-1">By medicine</h4>
        <p className="text-xs text-muted-foreground mb-4">Adherence rate over the last 7 days</p>
        <div className="space-y-3">
          {perMed.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate pr-2">{m.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">{m.rate}%</Badge>
                  <span className="text-xs text-muted-foreground">
                    {m.taken}/{m.total}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                <Segment value={m.taken} total={m.total} className="bg-primary" />
                <Segment value={m.skipped} total={m.total} className="bg-muted-foreground/50" />
                <Segment value={m.missed} total={m.total} className="bg-destructive" />
                <Segment value={m.fired} total={m.total} className="bg-secondary" />
              </div>
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span>✓ {m.taken} taken</span>
                <span>↷ {m.skipped} skipped</span>
                <span>⚠ {m.missed} missed</span>
                {m.fired > 0 && <span>• {m.fired} pending</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const StatCard = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <Card className="p-4 shadow-card">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{value}</p>
  </Card>
);

const Segment = ({ value, total, className }: { value: number; total: number; className: string }) => {
  if (value === 0 || total === 0) return null;
  const pct = (value / total) * 100;
  return <div className={className} style={{ width: `${pct}%` }} />;
};
