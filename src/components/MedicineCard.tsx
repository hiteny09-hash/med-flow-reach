import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Pill, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  medicine: {
    id: string;
    name: string;
    dosage: string;
    notes: string | null;
    times: string[];
    active: boolean;
  };
  onChange: () => void;
}

export const MedicineCard = ({ medicine, onChange }: Props) => {
  const remove = async () => {
    if (!confirm(`Delete ${medicine.name}?`)) return;
    const { error } = await supabase.from("medicines").delete().eq("id", medicine.id);
    if (error) return toast.error(error.message);
    toast.success("Medicine deleted");
    onChange();
  };

  return (
    <Card className="p-5 shadow-card hover:shadow-glow transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <Pill className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{medicine.name}</h3>
            <p className="text-sm text-muted-foreground">{medicine.dosage}</p>
            {medicine.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{medicine.notes}</p>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={remove} className="text-muted-foreground hover:text-destructive shrink-0">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {medicine.times.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 font-mono">
            <Clock className="w-3 h-3" /> {t}
          </Badge>
        ))}
      </div>
    </Card>
  );
};
