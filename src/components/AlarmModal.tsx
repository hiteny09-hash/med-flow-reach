import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Pill, X, Check } from "lucide-react";
import { toast } from "sonner";

export interface ActiveAlarm {
  logId: string;
  medicineName: string;
  dosage: string;
  scheduledTime: string;
}

interface Props {
  alarm: ActiveAlarm | null;
  onClose: () => void;
}

const STOP_PHRASE = "medicine taken";

// ------- Web Audio looping alarm tone -------
function useAlarmTone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    osc.start();
    oscRef.current = osc;

    let beepHigh = true;
    const beep = () => {
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(beepHigh ? 880 : 660, now);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      beepHigh = !beepHigh;
    };
    beep();
    intervalRef.current = window.setInterval(beep, 600);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      try { osc.stop(); } catch {}
      try { ctx.close(); } catch {}
      ctxRef.current = null;
      oscRef.current = null;
      gainRef.current = null;
      intervalRef.current = null;
    };
  }, [active]);
}

// ------- Speech recognition listener -------
function useVoiceStop(active: boolean, onMatch: () => void) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (!active) return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recRef.current = rec;

    let stopped = false;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      // auto-restart while alarm active
      if (!stopped) {
        try { rec.start(); } catch {}
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSupported(false);
        stopped = true;
      }
    };
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      const cleaned = text.toLowerCase().trim();
      setHeard(cleaned);
      if (cleaned.includes(STOP_PHRASE)) {
        stopped = true;
        try { rec.stop(); } catch {}
        onMatch();
      }
    };

    try { rec.start(); } catch {}

    return () => {
      stopped = true;
      try { rec.stop(); } catch {}
      recRef.current = null;
      setListening(false);
      setHeard("");
    };
  }, [active, onMatch]);

  return { supported, listening, heard };
}

export const AlarmModal = ({ alarm, onClose }: Props) => {
  const active = !!alarm;
  useAlarmTone(active);

  const handleTaken = async () => {
    if (!alarm) return;
    const { error } = await supabase
      .from("adherence_log")
      .update({ status: "taken" })
      .eq("id", alarm.logId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${alarm.medicineName} marked as taken`);
    onClose();
  };

  const { supported, listening, heard } = useVoiceStop(active, handleTaken);

  const handleSkip = async () => {
    if (!alarm) return;
    await supabase.from("adherence_log").update({ status: "skipped" }).eq("id", alarm.logId);
    onClose();
  };

  return (
    <Dialog open={active} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center animate-pulse">
              <Pill className="w-5 h-5 text-primary-foreground" />
            </span>
            Time for your medicine
          </DialogTitle>
        </DialogHeader>

        {alarm && (
          <div className="space-y-5">
            <div className="text-center py-4">
              <p className="text-2xl font-semibold">{alarm.medicineName}</p>
              <p className="text-muted-foreground">{alarm.dosage}</p>
              <p className="text-xs text-muted-foreground mt-1">scheduled {alarm.scheduledTime}</p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  {listening ? (
                    <Mic className="w-4 h-4 text-primary animate-pulse" />
                  ) : (
                    <MicOff className="w-4 h-4 text-muted-foreground" />
                  )}
                  Say "<span className="text-primary">medicine taken</span>" to stop
                </span>
                {listening && <Badge variant="outline" className="text-[10px]">Listening</Badge>}
              </div>
              {!supported && (
                <p className="text-xs text-destructive">
                  Microphone unavailable. Tap "I took it" below to stop the alarm.
                </p>
              )}
              {heard && (
                <p className="text-xs text-muted-foreground italic truncate">"{heard}"</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleTaken} className="flex-1 gap-2">
                <Check className="w-4 h-4" /> I took it
              </Button>
              <Button onClick={handleSkip} variant="outline" className="gap-2">
                <X className="w-4 h-4" /> Skip
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
