"use client";

import { useState, useCallback, useEffect } from "react";
import { 
  startVoiceCall, 
  stopVoiceCall, 
  cleanupVapiListeners,
  setMuted,
  isMuted as getIsMuted
} from "@/lib/vapi";

interface UseVapiReturn {
  isCallActive: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  volume: number;
  error: Error | null;
  startCall: () => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
}

export function useVapi(): UseVapiReturn {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMutedState] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupVapiListeners();
    };
  }, []);

  const startCall = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await startVoiceCall({
        onCallStart: () => {
          setIsConnecting(false);
          setIsCallActive(true);
        },
        onCallEnd: () => {
          setIsCallActive(false);
          setIsSpeaking(false);
          setVolume(0);
          setIsMutedState(false);
        },
        onSpeechStart: () => {
          setIsSpeaking(true);
        },
        onSpeechEnd: () => {
          setIsSpeaking(false);
        },
        onVolumeLevel: (vol) => {
          setVolume(vol);
        },
        onError: (err) => {
          console.error("Vapi error:", err);
          setError(err);
          setIsConnecting(false);
          setIsCallActive(false);
        },
      });
    } catch (err) {
      console.error("Failed to start call:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsConnecting(false);
    }
  }, []);

  const endCall = useCallback(() => {
    stopVoiceCall();
    cleanupVapiListeners();
    setIsCallActive(false);
    setIsSpeaking(false);
    setVolume(0);
    setIsMutedState(false);
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !getIsMuted();
    setMuted(newMuted);
    setIsMutedState(newMuted);
  }, []);

  return {
    isCallActive,
    isConnecting,
    isSpeaking,
    isMuted,
    volume,
    error,
    startCall,
    endCall,
    toggleMute,
  };
}

