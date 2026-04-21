import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReminderScheduler } from "@/hooks/useReminderScheduler";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MedicineForm } from "@/components/MedicineForm";
import { MedicineCard } from "@/components/MedicineCard";
import { AdherenceHistory } from "@/components/AdherenceHistory";
import { AdherenceAnalytics } from "@/components/AdherenceAnalytics";
import { AlarmModal } from "@/components/AlarmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Pill, Bell, Send } from "lucide-react";
import { toast } from "sonner";

interface Medicine {
  id: string; name: string; dosage: string; notes: string | null;
  times: string[]; active: boolean;
}

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [caregiverChatId, setCaregiverChatId] = useState("");
  const [missedMinutes, setMissedMinutes] = useState(30);
  const [testing, setTesting] = useState(false);

  const loadMeds = async () => {
    const { data } = await supabase.from("medicines").select("*").order("created_at", { ascending: false });
    setMeds((data as any) ?? []);
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, caregiver_email, caregiver_telegram_chat_id, missed_alert_minutes")
      .eq("user_id", user.id).maybeSingle();
    if (data) {
      setDisplayName(data.display_name ?? "");
      setCaregiverEmail(data.caregiver_email ?? "");
      setCaregiverChatId(data.caregiver_telegram_chat_id ?? "");
      setMissedMinutes(data.missed_alert_minutes ?? 30);
    }
  };

  useEffect(() => { if (user) { loadMeds(); loadProfile(); } }, [user]);

  const { activeAlarm, dismissAlarm } = useReminderScheduler(meds, user?.id);

  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      display_name: displayName || null,
      caregiver_email: caregiverEmail || null,
      caregiver_telegram_chat_id: caregiverChatId || null,
      missed_alert_minutes: missedMinutes,
    }).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
  };

  const testTelegram = async () => {
    if (!caregiverChatId) return toast.error("Enter a Telegram chat ID first");
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("test-caregiver-telegram", {
      body: { chat_id: caregiverChatId },
    });
    setTesting(false);
    if (error || !data?.ok) {
      toast.error(`Test failed: ${data?.error ?? error?.message ?? "unknown"}`);
    } else {
      toast.success("Test message sent! Check Telegram.");
    }
  };

  const enableNotifs = async () => {
    if (!("Notification" in window)) return toast.error("Notifications not supported");
    const p = await Notification.requestPermission();
    if (p === "granted") toast.success("Notifications enabled");
    else toast.error("Notifications blocked");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <>
    <AlarmModal alarm={activeAlarm} onClose={dismissAlarm} />
    <div className="min-h-screen gradient-soft">
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-4xl flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center">
              <Pill className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="font-semibold text-lg">MediReminder</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={enableNotifs} className="gap-2">
              <Bell className="w-4 h-4" /> <span className="hidden sm:inline">Notifications</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold tracking-tight">
            Hi{displayName ? `, ${displayName}` : ""} 👋
          </h2>
          <p className="text-muted-foreground mt-1">
            Stay on top of your medication. Reminders publish to HiveMQ in real time.
          </p>
        </div>

        <Tabs defaultValue="meds">
          <TabsList className="mb-6">
            <TabsTrigger value="meds">Medicines</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="meds">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Your medicines</h3>
              <MedicineForm onCreated={loadMeds} />
            </div>
            {meds.length === 0 ? (
              <Card className="p-12 text-center shadow-card">
                <Pill className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No medicines yet. Add your first one to start receiving reminders.</p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {meds.map((m) => <MedicineCard key={m.id} medicine={m} onChange={loadMeds} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <h3 className="text-lg font-semibold mb-4">Weekly adherence</h3>
            <AdherenceAnalytics refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="history">
            <h3 className="text-lg font-semibold mb-4">Recent reminders</h3>
            <AdherenceHistory refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="profile">
            <Card className="p-6 max-w-xl shadow-card space-y-5">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Caregiver email (optional)</Label>
                <Input type="email" value={caregiverEmail} onChange={(e) => setCaregiverEmail(e.target.value)} placeholder="caregiver@example.com" />
              </div>

              <div className="border-t pt-5 space-y-4">
                <div>
                  <h4 className="font-semibold flex items-center gap-2"><Send className="w-4 h-4" /> Caregiver Telegram alerts</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get a Telegram message when a dose is missed. Ask your caregiver to:
                  </p>
                  <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                    <li>Open Telegram and search for your bot, then press <em>Start</em>.</li>
                    <li>Message <code className="bg-muted px-1 rounded">@userinfobot</code> to get their numeric chat ID.</li>
                    <li>Paste that ID below.</li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <Label>Caregiver Telegram chat ID</Label>
                  <div className="flex gap-2">
                    <Input value={caregiverChatId} onChange={(e) => setCaregiverChatId(e.target.value)} placeholder="e.g. 123456789" />
                    <Button type="button" variant="outline" onClick={testTelegram} disabled={testing || !caregiverChatId}>
                      {testing ? "Sending…" : "Test"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Alert after dose is missed for (minutes)</Label>
                  <Input
                    type="number" min={5} max={240}
                    value={missedMinutes}
                    onChange={(e) => setMissedMinutes(parseInt(e.target.value || "30", 10))}
                  />
                  <p className="text-xs text-muted-foreground">If the dose isn't marked taken within this window, the caregiver gets a Telegram alert.</p>
                </div>
              </div>

              <Button onClick={saveProfile}>Save changes</Button>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
