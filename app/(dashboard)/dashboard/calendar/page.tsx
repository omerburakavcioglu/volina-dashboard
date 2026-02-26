"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { format, addDays, subDays, isSameDay, parseISO } from "date-fns";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  RefreshCw,
  Plus,
  Clock,
  User,
  Phone,
  Bot,
  X,
  Check,
  ExternalLink,
  Unlink
} from "lucide-react";
import { Calendar } from "@/components/dashboard/Calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTime, getStatusColor } from "@/lib/utils";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { 
  getDoctors, 
  getAppointments, 
  createAppointment, 
  updateAppointmentStatus, 
  deleteAppointment,
  subscribeToAppointments 
} from "@/lib/supabase";
import type { Doctor, Appointment } from "@/lib/types";

// Google Calendar appointment type
interface GoogleAppointment {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string;
  created_via_ai: boolean;
  google_event_id: string;
  google_calendar_link?: string;
}


export default function CalendarPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { data: googleSession, status: googleStatus } = useSession();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [googleAppointments, setGoogleAppointments] = useState<GoogleAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [showGoogleCalendar, setShowGoogleCalendar] = useState(true);
  const [newAppointment, setNewAppointment] = useState({
    name: "",
    email: "",
    phone: "",
    assignee: "",
    time: "09:00",
    notes: "",
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load Google Calendar appointments
  const loadGoogleCalendar = useCallback(async () => {
    if (!googleSession?.accessToken) return;
    
    setIsLoadingGoogle(true);
    try {
      const response = await fetch(`/api/calendar/google?date=${format(selectedDate, "yyyy-MM-dd")}`);
      const data = await response.json();
      
      if (data.success && data.appointments) {
        setGoogleAppointments(data.appointments);
      }
    } catch (error) {
      console.error("Error loading Google Calendar:", error);
    } finally {
      setIsLoadingGoogle(false);
    }
  }, [googleSession?.accessToken, selectedDate]);

  // Load Google Calendar when session is available
  useEffect(() => {
    if (googleSession?.accessToken && showGoogleCalendar) {
      loadGoogleCalendar();
    }
  }, [googleSession?.accessToken, showGoogleCalendar, loadGoogleCalendar]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [doctorsData, appointmentsData] = await Promise.all([
        getDoctors(),
        getAppointments(format(selectedDate, "yyyy-MM-dd")),
      ]);
      
      setDoctors(doctorsData);
      setAppointments(appointmentsData);
      
      // Set default assignee if doctors loaded and no assignee set
      const firstDoctor = doctorsData[0];
      if (firstDoctor && !newAppointment.assignee) {
        setNewAppointment(prev => ({ ...prev, assignee: firstDoctor.id }));
      }
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
  }, [selectedDate, newAppointment.assignee]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData().then(() => setIsLoading(false));
    }
  }, [isAuthenticated, loadData]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const subscription = subscribeToAppointments((payload) => {
      if (payload.eventType === "INSERT" && payload.new) {
        const newApt = payload.new as Appointment;
        if (isSameDay(parseISO(newApt.start_time), selectedDate)) {
          setAppointments(prev => [...prev, newApt]);
        }
      } else if (payload.eventType === "UPDATE" && payload.new) {
        setAppointments(prev => prev.map(apt => 
          apt.id === (payload.new as Appointment).id ? payload.new as Appointment : apt
        ));
      } else if (payload.eventType === "DELETE" && payload.old) {
        setAppointments(prev => prev.filter(apt => apt.id !== (payload.old as Appointment).id));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isAuthenticated, selectedDate]);

  // Reload appointments when date changes
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      getAppointments(format(selectedDate, "yyyy-MM-dd")).then(setAppointments);
    }
  }, [selectedDate, isAuthenticated, isLoading]);

  const handlePrevDay = () => {
    setSelectedDate((prev) => subDays(prev, 1));
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => addDays(prev, 1));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    if (googleSession?.accessToken) {
      await loadGoogleCalendar();
    }
    setIsRefreshing(false);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
  };

  const handleCreateAppointment = async () => {
    if (!newAppointment.name.trim() || !newAppointment.assignee) {
      alert("Please enter a client name and select an assignee");
      return;
    }

    setIsSaving(true);

    const baseDate = format(selectedDate, "yyyy-MM-dd");
    const timeParts = newAppointment.time.split(":");
    const hours = parseInt(timeParts[0] || "9", 10);
    const minutes = parseInt(timeParts[1] || "0", 10);
    
    // Calculate end time (30 minutes after start)
    let endHours = hours;
    let endMinutes = minutes + 30;
    if (endMinutes >= 60) {
      endHours += 1;
      endMinutes -= 60;
    }
    const endTimeStr = `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;

    const appointmentData = {
      doctor_id: newAppointment.assignee,
      patient_name: newAppointment.name.trim(),
      patient_phone: newAppointment.phone.trim() || null,
      patient_email: newAppointment.email.trim() || null,
      start_time: `${baseDate}T${newAppointment.time}:00`,
      end_time: `${baseDate}T${endTimeStr}:00`,
      status: "scheduled" as const,
      notes: newAppointment.notes.trim() || null,
      created_via_ai: false,
    };

    try {
      const newApt = await createAppointment(appointmentData);
      
      if (newApt) {
        setAppointments(prev => [...prev, newApt]);
    setSaveSuccess(true);
    
    setTimeout(() => {
      setSaveSuccess(false);
      setShowNewAppointment(false);
      setNewAppointment({
        name: "",
        email: "",
        phone: "",
            assignee: doctors[0]?.id || "",
        time: "09:00",
        notes: "",
      });
    }, 1500);
      } else {
        alert("Failed to create appointment. Please try again.");
      }
    } catch (error) {
      console.error("Error creating appointment:", error);
      alert("Failed to create appointment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmAppointment = async () => {
    if (selectedAppointment) {
      const updated = await updateAppointmentStatus(selectedAppointment.id, "confirmed");
      if (updated) {
      setAppointments(appointments.map(apt => 
        apt.id === selectedAppointment.id 
          ? { ...apt, status: "confirmed" as const }
          : apt
      ));
      setSelectedAppointment({ ...selectedAppointment, status: "confirmed" });
      }
    }
  };

  const handleCancelAppointment = async () => {
    if (selectedAppointment) {
      const success = await deleteAppointment(selectedAppointment.id);
      if (success) {
      setAppointments(appointments.filter(apt => apt.id !== selectedAppointment.id));
      setSelectedAppointment(null);
      }
    }
  };

  const getDoctor = (doctorId: string) => {
    return doctors.find((d) => d.id === doctorId);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="h-[700px] bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  // Show empty state if no doctors
  if (doctors.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendar CRM</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Manage appointments across all team members with real-time updates.
            </p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No team members yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">
            Add team members (doctors/agents) to start scheduling appointments. You can do this from the Settings page.
          </p>
          <Button onClick={() => router.push("/dashboard/settings")}>
            Go to Settings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendar CRM</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage appointments across all team members with real-time updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Google Calendar Connection */}
          {googleStatus === "authenticated" ? (
            <Button
              variant="outline"
              onClick={() => signOut()}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            >
              <Unlink className="w-4 h-4 mr-2" />
              Disconnect Google
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => signIn("google", { callbackUrl: "/dashboard/calendar" })}
              className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Connect Google Calendar
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setShowNewAppointment(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Appointment
          </Button>
        </div>
      </div>

      {/* Google Calendar Events */}
      {googleStatus === "authenticated" && googleAppointments.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Google Calendar ({googleAppointments.length} events)
              </h3>
              {isLoadingGoogle && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGoogleCalendar(!showGoogleCalendar)}
              className="text-gray-500"
            >
              {showGoogleCalendar ? "Hide" : "Show"}
            </Button>
          </div>
          
          {showGoogleCalendar && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {googleAppointments.map((event) => (
                <div
                  key={event.id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {event.patient_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {event.start_time ? format(new Date(event.start_time), "h:mm a") : "All day"}
                        {event.end_time && ` - ${format(new Date(event.end_time), "h:mm a")}`}
                      </p>
                    </div>
                    {event.google_calendar_link && (
                      <a
                        href={event.google_calendar_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {event.notes && (
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{event.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Date navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay} className="dark:bg-gray-700 dark:border-gray-600">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextDay} className="dark:bg-gray-700 dark:border-gray-600">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={handleToday} className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
            Today
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h2>
        </div>

        <div className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-medium text-primary">{appointments.length}</span>{" "}
          appointments today
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {doctors.map((doctor) => {
          const doctorAppointments = appointments.filter(
            (apt) => apt.doctor_id === doctor.id
          );
          const aiBooked = doctorAppointments.filter((apt) => apt.created_via_ai).length;

          return (
            <div key={doctor.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div
                className="h-1"
                style={{ backgroundColor: doctor.color_code }}
              />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{doctor.name}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {doctorAppointments.length}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Bot className="w-3 h-3" />
                      <span>{aiBooked} AI booked</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar */}
      <Calendar
        doctors={doctors}
        appointments={appointments}
        selectedDate={selectedDate}
        onAppointmentClick={handleAppointmentClick}
      />

      {/* Appointment Detail Modal */}
      <Dialog
        open={!!selectedAppointment}
        onOpenChange={() => setSelectedAppointment(null)}
      >
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              Appointment Details
              {selectedAppointment?.created_via_ai && (
                <span className="inline-flex items-center gap-1 text-xs font-normal bg-primary/10 text-primary px-2 py-1 rounded-full">
                  <Bot className="w-3 h-3" />
                  AI Booked
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {selectedAppointment && format(parseISO(selectedAppointment.start_time), "EEEE, MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4 mt-4">
              {/* Client info */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {selectedAppointment.patient_name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedAppointment.patient_email || "No email"}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">Time</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatTime(selectedAppointment.start_time)} -{" "}
                    {formatTime(selectedAppointment.end_time)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                    <Phone className="w-4 h-4" />
                    <span className="text-xs">Phone</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedAppointment.patient_phone || "N/A"}
                  </p>
                </div>
              </div>

              {/* Assignee */}
              {(() => {
                const doctor = getDoctor(selectedAppointment.doctor_id);
                return doctor ? (
                  <div className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-xl">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                      style={{ backgroundColor: doctor.color_code }}
                    >
                      {doctor.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{doctor.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{doctor.specialty}</p>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Status */}
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-xl">
                <span className="text-gray-600 dark:text-gray-400">Status</span>
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium capitalize",
                    getStatusColor(selectedAppointment.status)
                  )}
                >
                  {selectedAppointment.status}
                </span>
              </div>

              {/* Notes */}
              {selectedAppointment.notes && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{selectedAppointment.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  onClick={handleCancelAppointment}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleConfirmAppointment}
                  disabled={selectedAppointment.status === "confirmed"}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {selectedAppointment.status === "confirmed" ? "Confirmed" : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Appointment Modal */}
      <Dialog open={showNewAppointment} onOpenChange={setShowNewAppointment}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">New Appointment</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Schedule a new appointment for {format(selectedDate, "MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="dark:text-gray-300">Client Name</Label>
              <Input
                id="name"
                value={newAppointment.name}
                onChange={(e) => setNewAppointment({ ...newAppointment, name: e.target.value })}
                placeholder="John Smith"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="dark:text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newAppointment.email}
                  onChange={(e) => setNewAppointment({ ...newAppointment, email: e.target.value })}
                  placeholder="john@email.com"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="dark:text-gray-300">Phone</Label>
                <Input
                  id="phone"
                  value={newAppointment.phone}
                  onChange={(e) => setNewAppointment({ ...newAppointment, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assignee" className="dark:text-gray-300">Assign To</Label>
                <select
                  id="assignee"
                  value={newAppointment.assignee}
                  onChange={(e) => setNewAppointment({ ...newAppointment, assignee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} - {doctor.specialty}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time" className="dark:text-gray-300">Time</Label>
                <select
                  id="time"
                  value={newAppointment.time}
                  onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {Array.from({ length: 18 }, (_, i) => {
                    const hour = Math.floor(i / 2) + 9;
                    const minute = i % 2 === 0 ? "00" : "30";
                    const time = `${hour.toString().padStart(2, "0")}:${minute}`;
                    return (
                      <option key={time} value={time}>
                        {hour > 12 ? hour - 12 : hour}:{minute} {hour >= 12 ? "PM" : "AM"}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="dark:text-gray-300">Notes (optional)</Label>
              <Input
                id="notes"
                value={newAppointment.notes}
                onChange={(e) => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                placeholder="Add any notes..."
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowNewAppointment(false)}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateAppointment}
              disabled={!newAppointment.name || !newAppointment.assignee || saveSuccess || isSaving}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Created!
                </>
              ) : isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Appointment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
