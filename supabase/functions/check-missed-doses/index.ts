// Cron-triggered: finds doses that fired >= profile.missed_alert_minutes ago
// without being marked taken, marks them "missed", and notifies caregiver via Telegram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function sendTelegram(chatId: string, text: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY not configured");

  const res = await fetch(`${TG_GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find doses that fired >= 30 min ago (worst case), still 'fired', not yet alerted.
    // We over-fetch then filter per-user with their actual threshold.
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString(); // at least 5 min old
    const { data: candidates, error } = await supabase
      .from("adherence_log")
      .select("id, user_id, medicine_id, scheduled_time, fired_at, medicines(name, dosage)")
      .eq("status", "fired")
      .eq("missed_alert_sent", false)
      .lt("fired_at", cutoff)
      .limit(200);

    if (error) throw error;

    let processed = 0;
    let alerted = 0;
    const errors: string[] = [];

    // Group user_ids to fetch profiles in one query
    const userIds = [...new Set((candidates ?? []).map((c) => c.user_id))];
    const profilesMap = new Map<string, { chat_id: string | null; threshold: number; name: string | null }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, caregiver_telegram_chat_id, missed_alert_minutes, display_name")
        .in("user_id", userIds);
      for (const p of profs ?? []) {
        profilesMap.set(p.user_id, {
          chat_id: p.caregiver_telegram_chat_id,
          threshold: p.missed_alert_minutes ?? 30,
          name: p.display_name,
        });
      }
    }

    for (const row of candidates ?? []) {
      const prof = profilesMap.get(row.user_id);
      const threshold = prof?.threshold ?? 30;
      const ageMin = (Date.now() - new Date(row.fired_at).getTime()) / 60_000;
      if (ageMin < threshold) continue;

      processed++;
      const med = (row as any).medicines;
      const medName = med?.name ?? "medicine";
      const dosage = med?.dosage ?? "";

      // Mark missed first (avoid duplicate alerts on retry)
      const { error: upErr } = await supabase
        .from("adherence_log")
        .update({ status: "missed", missed_alert_sent: true })
        .eq("id", row.id);
      if (upErr) {
        errors.push(`update ${row.id}: ${upErr.message}`);
        continue;
      }

      // Telegram alert
      if (prof?.chat_id) {
        try {
          const who = prof.name ? `<b>${prof.name}</b>` : "Your loved one";
          const text =
            `⚠️ <b>Missed dose alert</b>\n\n` +
            `${who} hasn't confirmed taking <b>${medName}</b>` +
            (dosage ? ` (${dosage})` : "") +
            `\nScheduled at <b>${row.scheduled_time}</b>\n` +
            `(${Math.round(ageMin)} minutes ago)`;
          await sendTelegram(prof.chat_id, text);
          alerted++;
        } catch (e) {
          errors.push(`telegram ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: candidates?.length ?? 0, processed, alerted, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("check-missed-doses error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
