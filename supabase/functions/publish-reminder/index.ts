// Publishes a medicine reminder event to HiveMQ Cloud over MQTT (WebSocket TLS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mqtt from "npm:mqtt@5.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReminderPayload {
  medicine_id: string;
  medicine_name: string;
  dosage: string;
  scheduled_time: string; // HH:MM
  notes?: string | null;
  box_number?: number; // 1, 2, or 3
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      token,
    );
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    // Validate body
    const body = (await req.json()) as ReminderPayload;
    if (!body?.medicine_id || !body?.medicine_name || !body?.scheduled_time) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const HOST = Deno.env.get("HIVEMQ_HOST");
    const USER = Deno.env.get("HIVEMQ_USERNAME");
    const PASS = Deno.env.get("HIVEMQ_PASSWORD");
    if (!HOST || !USER || !PASS) {
      return new Response(
        JSON.stringify({ error: "HiveMQ secrets not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // HiveMQ Cloud: secure WebSocket on port 8884, path /mqtt
    const url = `wss://${HOST}:8884/mqtt`;
    const box = body.box_number && [1, 2, 3].includes(body.box_number) ? body.box_number : 1;
    // Per-box topic so the IoT device can subscribe to a specific compartment
    const topic = `medireminder/${userId}/box/${box}`;
    const message = JSON.stringify({
      ...body,
      box_number: box,
      user_id: userId,
      fired_at: new Date().toISOString(),
    });

    const client = mqtt.connect(url, {
      username: USER,
      password: PASS,
      protocolVersion: 5,
      connectTimeout: 8000,
      reconnectPeriod: 0,
      clientId: `medireminder-edge-${crypto.randomUUID().slice(0, 8)}`,
    });

    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        const timer = setTimeout(() => {
          try {
            client.end(true);
          } catch (_) {/* noop */}
          resolve({ ok: false, error: "MQTT connect timeout" });
        }, 10000);

        client.on("connect", () => {
          client.publish(
            topic,
            message,
            { qos: 1, retain: false },
            (err) => {
              clearTimeout(timer);
              client.end(true);
              if (err) resolve({ ok: false, error: err.message });
              else resolve({ ok: true });
            },
          );
        });
        client.on("error", (err) => {
          clearTimeout(timer);
          try {
            client.end(true);
          } catch (_) {/* noop */}
          resolve({ ok: false, error: err.message });
        });
      },
    );

    if (!result.ok) {
      console.error("MQTT publish failed:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, topic }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("publish-reminder error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
