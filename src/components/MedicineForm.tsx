import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const MedicineForm = ({ onCreated }: { onCreated: () => void }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [notes, setNotes] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setDosage(""); setNotes(""); setTimes(["08:00"]); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("medicines").insert({
      user_id: user.id, name, dosage, notes: notes || null, times,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Medicine added");
    reset(); setOpen(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Add medicine</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New medicine</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metformin" />
          </div>
          <div className="space-y-2">
            <Label>Dosage</Label>
            <Input required value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500mg, 1 tablet" />
          </div>
          <div className="space-y-2">
            <Label>Reminder times</Label>
            <div className="space-y-2">
              {times.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="time" value={t} onChange={(e) => {
                    const next = [...times]; next[i] = e.target.value; setTimes(next);
                  }} />
                  {times.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setTimes(times.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setTimes([...times, "12:00"])}>
                <Plus className="w-3 h-3 mr-1" /> Add time
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="With food, before sleep…" />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save medicine"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
