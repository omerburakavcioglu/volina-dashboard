"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getAppointments, getDoctors, createAppointment, updateAppointmentStatus } from "@/lib/supabase";
import type { Appointment, Doctor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  RefreshCw, 
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CheckCircle,
  XCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300",
  confirmed: "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300",
  cancelled: "bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300",
  completed: "bg-gray-100 border-gray-300 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300",
};

export default function CalendarPage() {
  const params = useParams();
  const tenant = params?.tenant as string;
  const { tenantProfile, isLoading: tenantLoading } = useTenant();
  const { user } = useAuth();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    patient_name: "",
    patient_phone: "",
    doctor_id: "",
    start_time: "",
    end_time: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      const [appointmentsData, doctorsData] = await Promise.all([
        getAppointments(),
        getDoctors(),
      ]);
      
      setAppointments(appointmentsData);
      setDoctors(doctorsData);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
  }, []);

  useEffect(() => {
    loadData().then(() => setIsLoading(false));
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleAddAppointment = async () => {
    setIsSaving(true);
    try {
      await createAppointment({
        patient_name: formData.patient_name,
        patient_phone: formData.patient_phone,
        patient_email: null,
        doctor_id: formData.doctor_id,
        start_time: formData.start_time,
        end_time: formData.end_time,
        notes: formData.notes,
        status: "scheduled",
        created_via_ai: false,
      });
      setShowAddDialog(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error("Error creating appointment:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (appointmentId: string, status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show") => {
    try {
      await updateAppointmentStatus(appointmentId, status);
      await loadData();
    } catch (error) {
      console.error("Error updating appointment status:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      patient_name: "",
      patient_phone: "",
      doctor_id: doctors[0]?.id || "",
      start_time: "",
      end_time: "",
      notes: "",
    });
  };

  const openAddDialog = (date?: Date) => {
    if (date) {
      const dateStr = format(date, "yyyy-MM-dd");
      setFormData({
        ...formData,
        start_time: `${dateStr}T09:00`,
        end_time: `${dateStr}T09:30`,
        doctor_id: doctors[0]?.id || "",
      });
    }
    setShowAddDialog(true);
  };

  // Calendar grid generation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: tr });
  const calendarEnd = endOfWeek(monthEnd, { locale: tr });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getAppointmentsForDay = (date: Date) => {
    return appointments.filter(apt => isSameDay(new Date(apt.start_time), date));
  };

  if (tenantLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const selectedDateAppointments = selectedDate ? getAppointmentsForDay(selectedDate) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Takvim</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Randevuları yönetin
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => openAddDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Yeni Randevu
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {format(currentMonth, "MMMM yyyy", { locale: tr })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>
                Bugün
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayAppointments = getAppointmentsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "min-h-[80px] p-1 border rounded-lg cursor-pointer transition-colors",
                      isCurrentMonth ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-900",
                      isSelected ? "border-primary ring-2 ring-primary/20" : "border-gray-200 dark:border-gray-700",
                      isToday && !isSelected && "border-blue-300 dark:border-blue-700"
                    )}
                  >
                    <div className={cn(
                      "text-sm font-medium mb-1",
                      !isCurrentMonth && "text-gray-400",
                      isToday && "text-primary"
                    )}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.slice(0, 2).map((apt) => (
                        <div
                          key={apt.id}
                          className={cn(
                            "text-xs px-1 py-0.5 rounded truncate border",
                            statusColors[apt.status]
                          )}
                        >
                          {format(new Date(apt.start_time), "HH:mm")} {apt.patient_name}
                        </div>
                      ))}
                      {dayAppointments.length > 2 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{dayAppointments.length - 2} daha
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              {selectedDate ? format(selectedDate, "d MMMM yyyy", { locale: tr }) : "Gün Seçin"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <div className="text-center py-8 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Detayları görmek için bir gün seçin</p>
              </div>
            ) : selectedDateAppointments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Bu günde randevu yok</p>
                <Button className="mt-4" variant="outline" onClick={() => openAddDialog(selectedDate)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Randevu Ekle
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateAppointments.map((apt) => {
                  const doctor = doctors.find(d => d.id === apt.doctor_id);
                  return (
                    <div
                      key={apt.id}
                      className={cn(
                        "p-3 rounded-lg border",
                        statusColors[apt.status]
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{apt.patient_name}</p>
                          <p className="text-sm opacity-80">{apt.patient_phone}</p>
                        </div>
                        <span className="text-sm font-medium">
                          {format(new Date(apt.start_time), "HH:mm")} - {format(new Date(apt.end_time), "HH:mm")}
                        </span>
                      </div>
                      {doctor && (
                        <div className="flex items-center gap-2 text-sm mb-2">
                          <User className="w-4 h-4" />
                          <span>Dr. {doctor.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {apt.status === "scheduled" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleStatusChange(apt.id, "confirmed")}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Onayla
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleStatusChange(apt.id, "cancelled")}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              İptal
                            </Button>
                          </>
                        )}
                        {apt.status === "confirmed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(apt.id, "completed")}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Tamamlandı
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button className="w-full" variant="outline" onClick={() => openAddDialog(selectedDate)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Randevu Ekle
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Appointment Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Yeni Randevu</DialogTitle>
            <DialogDescription>Yeni bir randevu oluşturun.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hasta Adı *</Label>
                <Input
                  value={formData.patient_name}
                  onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={formData.patient_phone}
                  onChange={(e) => setFormData({ ...formData, patient_phone: e.target.value })}
                  placeholder="+90 555 123 4567"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Doktor</Label>
              <Select
                value={formData.doctor_id}
                onValueChange={(value) => setFormData({ ...formData, doctor_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Doktor seçin" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      Dr. {doctor.name} - {doctor.specialty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Başlangıç *</Label>
                <Input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bitiş *</Label>
                <Input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notlar</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Ek notlar..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>İptal</Button>
            <Button 
              onClick={handleAddAppointment} 
              disabled={isSaving || !formData.patient_name || !formData.start_time || !formData.end_time}
            >
              {isSaving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
