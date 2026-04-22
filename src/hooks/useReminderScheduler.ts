import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ActiveAlarm } from "@/components/AlarmModal";

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  notes: string | null;
  times: string[];
  active: boolean;
  box_number?: number;
}

/**
 * Polls every 30s. When local time matches a medicine reminder time
 * (and we haven't fired it already today), it:
 * 1. Shows a browser notification + toast
 * 2. Logs to adherence_log
 * 3. Calls the publish-reminder edge function (HiveMQ MQTT)
 */
export function useReminderScheduler(medicines: Medicine[], userId: string | undefined) {
  const fired = useRef<Set<string>>(new Set());
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);

  useEffect(() => {
    if (!userId) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const tick = async () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const current = `${hh}:${mm}`;
      const day = now.toISOString().slice(0, 10);

      for (const med of medicines) {
        if (!med.active) continue;
        for (const t of med.times) {
          const key = `${med.id}|${t}|${day}`;
          if (t === current && !fired.current.has(key)) {
            fired.current.add(key);
            const logId = await fireReminder(med, t, userId);
            if (logId) {
              setActiveAlarm({
                logId,
                medicineName: med.name,
                dosage: med.dosage,
                scheduledTime: t,
              });
            }
          }
        }
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [medicines, userId]);

  return { activeAlarm, dismissAlarm: () => setActiveAlarm(null) };
}

async function fireReminder(
  med: { id: string; name: string; dosage: string; notes: string | null },
  scheduled_time: string,
  userId: string,
): Promise<string | null> {
  // Browser notification
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(`Time for ${med.name}`, {
        body: `${med.dosage}${med.notes ? ` — ${med.notes}` : ""}`,
        tag: `med-${med.id}-${scheduled_time}`,
      });
    } catch (_) {/* noop */}
  }
  toast(`💊 Time for ${med.name}`, { description: `${med.dosage} (${scheduled_time})` });

  // Log
  const { data: log } = await supabase
    .from("adherence_log")
    .insert({ user_id: userId, medicine_id: med.id, scheduled_time, status: "fired" })
    .select("id")
    .single();

  // Publish to HiveMQ via edge function
  try {
    const { error } = await supabase.functions.invoke("publish-reminder", {
      body: {
        medicine_id: med.id,
        medicine_name: med.name,
        dosage: med.dosage,
        scheduled_time,
        notes: med.notes,
      },
    });
    if (!error && log) {
      await supabase.from("adherence_log").update({ mqtt_published: true }).eq("id", log.id);
    } else if (error) {
      console.error("MQTT publish failed:", error);
    }
  } catch (e) {
    console.error("MQTT invoke error:", e);
  }

  return log?.id ?? null;
}
