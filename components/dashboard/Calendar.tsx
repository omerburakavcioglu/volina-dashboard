"use client";

import { useEffect, useState, useCallback } from "react";
import { parseISO, isSameDay } from "date-fns";
import { Bot, Clock, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  getTimeSlots, 
  calculateGridPosition, 
  formatTime 
} from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Doctor, Appointment } from "@/lib/types";

interface CalendarProps {
  doctors: Doctor[];
  appointments: Appointment[];
  selectedDate: Date;
  onAppointmentClick?: (appointment: Appointment) => void;
}

const TIME_SLOTS = getTimeSlots(9, 18, 30); // 9 AM to 6 PM, 30-min slots

export function Calendar({ 
  doctors, 
  appointments: initialAppointments, 
  selectedDate,
  onAppointmentClick 
}: CalendarProps) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  // Realtime updates disabled in mock mode

  // Update appointments when initial data changes
  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  // Filter appointments for selected date
  const getDoctorAppointments = useCallback(
    (doctorId: string) => {
      return appointments.filter(
        (apt) =>
          apt.doctor_id === doctorId &&
          isSameDay(parseISO(apt.start_time), selectedDate)
      );
    },
    [appointments, selectedDate]
  );

  // Calculate grid position for appointment
  const getAppointmentStyle = (appointment: Appointment) => {
    const { gridRow, gridRowEnd } = calculateGridPosition(
      appointment.start_time,
      appointment.end_time,
      9
    );

    return {
      gridRow: `${gridRow} / ${gridRowEnd}`,
    };
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Doctor headers */}
      <div className="grid grid-cols-[80px_repeat(3,1fr)] border-b border-gray-100 dark:border-gray-700">
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50" />
        {doctors.map((doctor) => (
          <div
            key={doctor.id}
            className="p-4 border-l border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 ring-2 ring-white dark:ring-gray-700 shadow-sm">
                <AvatarFallback
                  style={{ backgroundColor: doctor.color_code }}
                  className="text-white font-medium text-sm"
                >
                  {doctor.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                  {doctor.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {doctor.specialty}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[80px_repeat(3,1fr)] max-h-[600px] overflow-y-auto">
        {/* Time column */}
        <div className="sticky left-0 bg-white dark:bg-gray-800 z-10">
          {TIME_SLOTS.map((time, index) => (
            <div
              key={time}
              className={cn(
                "h-16 px-3 flex items-start justify-end pt-1",
                index % 2 === 0 && "border-t border-gray-100 dark:border-gray-700"
              )}
            >
              {index % 2 === 0 && (
                <span className="text-xs text-gray-400 font-medium">
                  {time}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Doctor columns */}
        {doctors.map((doctor) => {
          const doctorAppointments = getDoctorAppointments(doctor.id);

          return (
            <div
              key={doctor.id}
              className="relative border-l border-gray-100 dark:border-gray-700"
              style={{
                display: "grid",
                gridTemplateRows: `repeat(${TIME_SLOTS.length}, 64px)`,
              }}
            >
              {/* Time slot backgrounds */}
              {TIME_SLOTS.map((time, index) => (
                <div
                  key={time}
                  className={cn(
                    "border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer",
                    index % 2 === 0 && "border-t-gray-100 dark:border-t-gray-700",
                    hoveredSlot === `${doctor.id}-${time}` && "bg-blue-50/50 dark:bg-blue-900/20"
                  )}
                  onMouseEnter={() => setHoveredSlot(`${doctor.id}-${time}`)}
                  onMouseLeave={() => setHoveredSlot(null)}
                />
              ))}

              {/* Appointments */}
              {doctorAppointments.map((appointment) => {
                const style = getAppointmentStyle(appointment);

                return (
                  <div
                    key={appointment.id}
                    className={cn(
                      "absolute inset-x-1 rounded-lg p-2 cursor-pointer transition-all hover:shadow-md",
                      "border-l-4",
                      appointment.created_via_ai && "ring-2 ring-primary/20",
                      appointment.status === "scheduled" && "bg-blue-50 dark:bg-blue-900/30 border-l-primary",
                      appointment.status === "confirmed" && "bg-green-50 dark:bg-green-900/30 border-l-green-500",
                      appointment.status === "completed" && "bg-gray-50 dark:bg-gray-700/50 border-l-gray-400",
                      appointment.status === "cancelled" && "bg-red-50 dark:bg-red-900/30 border-l-red-400 opacity-60"
                    )}
                    style={{
                      ...style,
                      top: `calc(${(parseInt(style.gridRow.split(" / ")[0] ?? "1") - 1) * 64}px + 2px)`,
                      height: `calc(${
                        (parseInt(style.gridRow.split(" / ")[1] ?? "2") -
                          parseInt(style.gridRow.split(" / ")[0] ?? "1")) *
                        64
                      }px - 4px)`,
                      gridRow: undefined,
                    }}
                    onClick={() => onAppointmentClick?.(appointment)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                          {appointment.patient_name}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>
                            {formatTime(appointment.start_time)} -{" "}
                            {formatTime(appointment.end_time)}
                          </span>
                        </div>
                        {appointment.patient_phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <Phone className="w-3 h-3" />
                            <span className="truncate">{appointment.patient_phone}</span>
                          </div>
                        )}
                      </div>
                      {appointment.created_via_ai && (
                        <div
                          className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"
                          title="Booked via AI"
                        >
                          <Bot className="w-3 h-3 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-3 h-3 text-primary" />
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400">AI Booked</span>
        </div>
      </div>
    </div>
  );
}
