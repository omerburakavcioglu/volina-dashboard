"use client";

import { useState, useEffect, useCallback } from "react";
import type { Appointment, Call } from "@/lib/types";

// Hook for real-time appointment updates
export function useRealtimeAppointments(initialAppointments: Appointment[]) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  // Realtime updates disabled in mock mode

  const addAppointment = useCallback((appointment: Appointment) => {
    setAppointments((prev) => [...prev, appointment]);
  }, []);

  const updateAppointment = useCallback((id: string, updates: Partial<Appointment>) => {
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === id ? { ...apt, ...updates } : apt))
    );
  }, []);

  const removeAppointment = useCallback((id: string) => {
    setAppointments((prev) => prev.filter((apt) => apt.id !== id));
  }, []);

  return {
    appointments,
    addAppointment,
    updateAppointment,
    removeAppointment,
  };
}

// Hook for real-time call updates
export function useRealtimeCalls(initialCalls: Call[]) {
  const [calls, setCalls] = useState<Call[]>(initialCalls);

  useEffect(() => {
    setCalls(initialCalls);
  }, [initialCalls]);

  // Realtime updates disabled in mock mode

  const addCall = useCallback((call: Call) => {
    setCalls((prev) => [call, ...prev]);
  }, []);

  const updateCall = useCallback((id: string, updates: Partial<Call>) => {
    setCalls((prev) =>
      prev.map((call) => (call.id === id ? { ...call, ...updates } : call))
    );
  }, []);

  const removeCall = useCallback((id: string) => {
    setCalls((prev) => prev.filter((call) => call.id !== id));
  }, []);

  return {
    calls,
    addCall,
    updateCall,
    removeCall,
  };
}

