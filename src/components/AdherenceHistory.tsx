import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Radio } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Row {
  id: string;
  medicine_id: string;
  scheduled_time: string;
  fired_at: string;
  status: "fired" | "taken" | "skipped" | "missed";
  mqtt_published: boolean;
  medicines: { name: string; dosage: string } | null;
}

export const AdherenceHistory = ({ refreshKey }: { refreshKey: number }) => {
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("adherence_log")
      .select("id, medicine_id, scheduled_time, fired_at, status, mqtt_published, medicines(name, dosage)")
      .order("fired_at", { ascending: false })
      .limit(25);
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [refreshKey]);

  const update = async (id: string, status: "taken" | "skipped") => {
    const { error } = await supabase.from("adherence_log").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground shadow-card">
        No reminders yet. They'll appear here once your scheduled times trigger.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.id} className="p-4 shadow-card flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{r.medicines?.name ?? "Medicine"}</span>
              <span className="text-xs text-muted-foreground">{r.medicines?.dosage}</span>
              {r.mqtt_published && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Radio className="w-3 h-3" /> MQTT
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(r.fired_at), "MMM d, HH:mm")} · scheduled {r.scheduled_time}
            </p>
          </div>
          {r.status === "fired" ? (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => update(r.id, "taken")}>
                <Check className="w-3 h-3" /> Taken
              </Button>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => update(r.id, "skipped")}>
                <X className="w-3 h-3" /> Skip
              </Button>
            </div>
          ) : (
            <Badge variant={r.status === "taken" ? "default" : r.status === "missed" ? "destructive" : "secondary"}>
              {r.status === "taken" ? "✓ Taken" : r.status === "missed" ? "⚠ Missed" : "Skipped"}
            </Badge>
          )}
        </Card>
      ))}
    </div>
  );
};
