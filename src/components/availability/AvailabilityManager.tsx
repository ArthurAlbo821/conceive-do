import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Clock } from "lucide-react";
import { useAvailabilities } from "@/hooks/useAvailabilities";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export const AvailabilityManager = () => {
  const { availabilities, isLoading, addAvailability, updateAvailability, deleteAvailability } = useAvailabilities();
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const handleAdd = () => {
    if (!startTime || !endTime) return;
    
    // Check if slot crosses midnight
    const crossesMidnight = endTime <= startTime;
    
    // Validation: check for overlaps on the same day
    const dayAvails = groupedByDay[selectedDay] || [];
    const hasOverlap = dayAvails.some((avail) => {
      const existingStart = avail.start_time;
      const existingEnd = avail.end_time;
      const existingCrossesMidnight = existingEnd <= existingStart;
      
      // If both slots cross midnight, check overlap more carefully
      if (crossesMidnight && existingCrossesMidnight) {
        // Both slots cross midnight - they overlap if either time overlaps
        return true; // Simplified: prevent multiple midnight-crossing slots for now
      }
      
      // If only one crosses midnight, more complex logic needed
      if (crossesMidnight) {
        // New slot crosses midnight: check if it overlaps with existing slot
        // New slot is [start -> 23:59] + [00:00 -> end]
        return (startTime <= existingEnd && existingEnd <= "23:59") ||
               (existingStart <= endTime);
      }
      
      if (existingCrossesMidnight) {
        // Existing slot crosses midnight
        return (existingStart <= endTime) ||
               (startTime <= existingEnd);
      }
      
      // Standard overlap check for slots within same day
      return (
        (startTime >= existingStart && startTime < existingEnd) ||
        (endTime > existingStart && endTime <= existingEnd) ||
        (startTime <= existingStart && endTime >= existingEnd)
      );
    });

    if (hasOverlap) {
      return; // Let the mutation handle the error toast
    }

    addAvailability({
      day_of_week: selectedDay,
      start_time: startTime,
      end_time: endTime,
      is_active: true,
    });
    setStartTime("09:00");
    setEndTime("18:00");
  };

  const groupedByDay = availabilities.reduce((acc, avail) => {
    if (!acc[avail.day_of_week]) acc[avail.day_of_week] = [];
    acc[avail.day_of_week].push(avail);
    return acc;
  }, {} as Record<number, typeof availabilities>);

  if (isLoading) {
    return <div className="text-muted-foreground">Chargement des disponibilités...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disponibilités hebdomadaires</CardTitle>
        <CardDescription>
          Définissez vos horaires de disponibilité pour chaque jour de la semaine. 
          Vous pouvez ajouter plusieurs créneaux horaires pour un même jour.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Jour</Label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {DAYS.map((day, index) => (
                <option key={index} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Heure de début</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Heure de fin</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un créneau
            </Button>
          </div>
        </div>

        <div className="bg-muted/50 p-3 rounded-lg">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Astuce :</strong> Vous pouvez ajouter plusieurs créneaux horaires pour le même jour.
            Les créneaux traversant minuit sont supportés (ex: Lundi 22h-02h passera au Mardi à minuit).
          </p>
        </div>

        <div className="space-y-4">
          {DAYS.map((day, dayIndex) => {
            const dayAvails = groupedByDay[dayIndex] || [];
            if (dayAvails.length === 0) return null;

            return (
              <div key={dayIndex} className="space-y-2">
                <h4 className="font-medium text-sm">{day}</h4>
                <div className="space-y-2">
                  {dayAvails.map((avail) => {
                    const crossesMidnight = avail.end_time <= avail.start_time;
                    const nextDay = (dayIndex + 1) % 7;
                    
                    return (
                      <div
                        key={avail.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {avail.start_time.substring(0, 5)} - {avail.end_time.substring(0, 5)}
                            {crossesMidnight && (
                              <span className="text-xs text-muted-foreground">
                                (→ {DAYS[nextDay]})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={avail.is_active}
                              onCheckedChange={(checked) =>
                                updateAvailability({ id: avail.id, is_active: checked })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {avail.is_active ? "Actif" : "Inactif"}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAvailability(avail.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {availabilities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune disponibilité configurée. Ajoutez vos premiers horaires ci-dessus.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
