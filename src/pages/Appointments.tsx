import { useState } from "react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, User, Phone, Plus, Bell, CheckCircle2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
// Select components imported but not used - may be needed for future features
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppointments, type Appointment } from "@/hooks/useAppointments";

const STATUS_COLORS = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  confirmed: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
  completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const STATUS_LABELS = {
  pending: "En attente",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};

const Appointments = () => {
  const { toast } = useToast();
  const { appointments, isLoading, addAppointment, updateAppointment, deleteAppointment } =
    useAppointments();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sendingAccessInfo, setSendingAccessInfo] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [formData, setFormData] = useState({
    contact_name: "",
    contact_phone: "",
    start_time: "09:00",
    end_time: "10:00",
    service: "",
    notes: "",
  });

  const handleSendAccessInfo = async (appointmentId: string) => {
    setSendingAccessInfo(appointmentId);
    try {
      const { data, error } = await supabase.functions.invoke("send-access-info", {
        body: { appointment_id: appointmentId },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Informations envoyées",
          description: "Les informations d'accès ont été envoyées au client avec succès.",
        });
        // Refresh appointments to show updated status
        window.location.reload();
      } else {
        throw new Error(data?.error || "Échec de l'envoi");
      }
    } catch (error: any) {
      console.error("Error sending access info:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible d'envoyer les informations d'accès",
      });
    } finally {
      setSendingAccessInfo(null);
    }
  };

  const handleCompleteAppointment = async (appointmentId: string) => {
    try {
      const { data, error } = await supabase.rpc("complete_appointment_and_unpin", {
        p_appointment_id: appointmentId,
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Rendez-vous terminé",
          description: "Le rendez-vous a été marqué comme terminé et la conversation a été dépinglée.",
        });
        // Refresh appointments
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Error completing appointment:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible de terminer le rendez-vous",
      });
    }
  };

  const handleSubmit = () => {
    if (!selectedDate) return;

    const startTime = formData.start_time;
    const endTime = formData.end_time;
    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const endHour = parseInt(endTime.split(":")[0]);
    const endMinute = parseInt(endTime.split(":")[1]);
    const durationMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);

    addAppointment({
      contact_name: formData.contact_name,
      contact_phone: formData.contact_phone,
      appointment_date: format(selectedDate, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      service: formData.service,
      status: "pending",
      notes: formData.notes,
    });

    setIsDialogOpen(false);
    setFormData({
      contact_name: "",
      contact_phone: "",
      start_time: "09:00",
      end_time: "10:00",
      service: "",
      notes: "",
    });
    setSelectedDate(undefined);
  };

  const upcomingAppointments = appointments
    .filter((apt) => new Date(`${apt.appointment_date}T${apt.start_time}`) >= new Date())
    .sort((a, b) => {
      const dateA = new Date(`${a.appointment_date}T${a.start_time}`);
      const dateB = new Date(`${b.appointment_date}T${b.start_time}`);
      return dateA.getTime() - dateB.getTime();
    });

  const pastAppointments = appointments
    .filter((apt) => new Date(`${apt.appointment_date}T${apt.start_time}`) < new Date())
    .sort((a, b) => {
      const dateA = new Date(`${a.appointment_date}T${a.start_time}`);
      const dateB = new Date(`${b.appointment_date}T${b.start_time}`);
      return dateB.getTime() - dateA.getTime();
    });

  const AppointmentCard = ({ appointment }: { appointment: Appointment }) => {
    const appointmentDate = new Date(appointment.appointment_date);
    const isTodayAppointment = isToday(appointmentDate);
    const clientArrived = (appointment as any).client_arrived;
    const providerReady = (appointment as any).provider_ready_to_receive;

    return (
      <Card className={isTodayAppointment && appointment.status === "confirmed" ? "border-blue-300" : ""}>
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{appointment.contact_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{appointment.contact_phone}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Badge className={STATUS_COLORS[appointment.status]}>
                {STATUS_LABELS[appointment.status]}
              </Badge>
              {isTodayAppointment && appointment.status === "confirmed" && clientArrived && (
                <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                  <Bell className="h-3 w-3 mr-1" />
                  Client arrivé
                </Badge>
              )}
              {isTodayAppointment && appointment.status === "confirmed" && providerReady && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Infos envoyées
                </Badge>
              )}
            </div>
          </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span>
              {format(new Date(appointment.appointment_date), "EEEE d MMMM yyyy", { locale: fr })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {appointment.start_time} - {appointment.end_time} ({appointment.duration_minutes} min)
            </span>
          </div>
          {appointment.service && (
            <div className="text-muted-foreground">Service: {appointment.service}</div>
          )}
          {appointment.notes && (
            <div className="text-muted-foreground italic text-xs mt-2">{appointment.notes}</div>
          )}
        </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {appointment.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateAppointment({ id: appointment.id, status: "confirmed" })}
              >
                Confirmer
              </Button>
            )}

            {/* Prêt à Recevoir button - only show for today's confirmed appointments where client has arrived */}
            {isTodayAppointment &&
              appointment.status === "confirmed" &&
              clientArrived &&
              !providerReady && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleSendAccessInfo(appointment.id)}
                  disabled={sendingAccessInfo === appointment.id}
                >
                  <Send className="h-3 w-3 mr-1" />
                  {sendingAccessInfo === appointment.id ? "Envoi..." : "Prêt à Recevoir"}
                </Button>
              )}

            {appointment.status !== "cancelled" && appointment.status !== "completed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateAppointment({ id: appointment.id, status: "cancelled" })}
              >
                Annuler
              </Button>
            )}

            {appointment.status === "confirmed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCompleteAppointment(appointment.id)}
              >
                Terminer
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => deleteAppointment(appointment.id)}
            >
              Supprimer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 p-6">
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2 flex-1">
              <CalendarIcon className="h-5 w-5" />
              <h1 className="text-xl font-semibold">Rendez-vous</h1>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau rendez-vous
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Créer un rendez-vous</DialogTitle>
                  <DialogDescription>
                    Ajoutez un nouveau rendez-vous à votre calendrier
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nom du client</Label>
                      <Input
                        value={formData.contact_name}
                        onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                        placeholder="Nom complet"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input
                        value={formData.contact_phone}
                        onChange={(e) =>
                          setFormData({ ...formData, contact_phone: e.target.value })
                        }
                        placeholder="+33 6 12 34 56 78"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Date du rendez-vous</Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-md border"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Heure de début</Label>
                      <Input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Heure de fin</Label>
                      <Input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Service (optionnel)</Label>
                    <Input
                      value={formData.service}
                      onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                      placeholder="Type de prestation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optionnel)</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Informations complémentaires"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!selectedDate || !formData.contact_name || !formData.contact_phone}
                  >
                    Créer le rendez-vous
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </header>

          <div className="p-6 max-w-6xl mx-auto">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Rendez-vous à venir</CardTitle>
                    <CardDescription>
                      {upcomingAppointments.length} rendez-vous planifiés
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {upcomingAppointments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Aucun rendez-vous à venir
                      </p>
                    ) : (
                      upcomingAppointments.map((apt) => (
                        <AppointmentCard key={apt.id} appointment={apt} />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Historique</CardTitle>
                    <CardDescription>Rendez-vous passés</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pastAppointments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Aucun historique
                      </p>
                    ) : (
                      pastAppointments
                        .slice(0, 10)
                        .map((apt) => <AppointmentCard key={apt.id} appointment={apt} />)
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Appointments;
