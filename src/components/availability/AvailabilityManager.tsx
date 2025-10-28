import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { useAvailabilities } from "@/hooks/useAvailabilities";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export const AvailabilityManager = () => {
  const { availabilities, isLoading, addAvailability, updateAvailability, deleteAvailability } = useAvailabilities();
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const handleAdd = () => {
    if (!startTime || !endTime) return;
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
          Définissez vos horaires de disponibilité pour chaque jour de la semaine
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
              Ajouter
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {DAYS.map((day, dayIndex) => {
            const dayAvails = groupedByDay[dayIndex] || [];
            if (dayAvails.length === 0) return null;

            return (
              <div key={dayIndex} className="space-y-2">
                <h4 className="font-medium text-sm">{day}</h4>
                <div className="space-y-2">
                  {dayAvails.map((avail) => (
                    <div
                      key={avail.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm">
                          {avail.start_time} - {avail.end_time}
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
                  ))}
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
