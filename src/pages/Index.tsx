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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Pill, Bell } from "lucide-react";
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

  const loadMeds = async () => {
    const { data } = await supabase.from("medicines").select("*").order("created_at", { ascending: false });
    setMeds((data as any) ?? []);
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("display_name, caregiver_email").eq("user_id", user.id).maybeSingle();
    if (data) {
      setDisplayName(data.display_name ?? "");
      setCaregiverEmail(data.caregiver_email ?? "");
    }
  };

  useEffect(() => { if (user) { loadMeds(); loadProfile(); } }, [user]);

  useReminderScheduler(meds, user?.id);

  // Refresh history every minute (cheap) so MQTT badge appears
  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      display_name: displayName || null,
      caregiver_email: caregiverEmail || null,
    }).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
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

          <TabsContent value="history">
            <h3 className="text-lg font-semibold mb-4">Recent reminders</h3>
            <AdherenceHistory refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="profile">
            <Card className="p-6 max-w-md shadow-card space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Caregiver email (optional)</Label>
                <Input type="email" value={caregiverEmail} onChange={(e) => setCaregiverEmail(e.target.value)} placeholder="caregiver@example.com" />
                <p className="text-xs text-muted-foreground">For future caregiver notifications.</p>
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
