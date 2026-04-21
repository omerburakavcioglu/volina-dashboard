"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/SupabaseProvider";
import type { Call } from "@/lib/types";
import {
  parseScore,
  estimateScore as estimateScoreShared,
  adjustScoreBasedOnContent,
  computeCallScore,
} from "@/lib/dashboard/call-scoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Phone, 
  RefreshCw, 
  Search,
  Play,
  Pause,
  Rewind,
  FastForward,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { format, startOfDay, endOfDay, isWithinInterval, parseISO } from "date-fns";
import { cn, cleanCallSummary } from "@/lib/utils";
import { useTranslation, useLanguage } from "@/lib/i18n";
import { useCallContentTranslation } from "@/hooks/useCallContentTranslation";

// Audio Player Component
function AudioPlayer({ 
  call, 
  isOpen, 
  onClose 
}: { 
  call: Call | null; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRefs = useRef<number[]>([]);

  // Format time helper with proper alignment
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format duration for display (with seconds)
  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) {
      return `${secs} sec.`;
    }
    return `${mins} min. ${secs} sec.`;
  };

  // Initialize audio when call changes
  useEffect(() => {
    if (!call?.recording_url || !isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        audioRef.current = null;
      }
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setIsLoading(false);
      setError(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    
    // Create audio element and set crossOrigin BEFORE setting src
    // Add cache-busting parameter to prevent browser caching issues
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    const cacheBuster = `${call.recording_url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    audio.src = call.recording_url + cacheBuster;
    audioRef.current = audio;
    
    // Generate waveform heights
    waveformRefs.current = Array.from({ length: 60 }, () => Math.random() * 60 + 20);
    
    let loadTimeout: NodeJS.Timeout | null = null;
    let hasLoaded = false;
    
    const handleLoadedMetadata = () => {
      hasLoaded = true;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoading(false);
      } else if (call.duration) {
        // Use call duration as fallback
        setDuration(call.duration);
        setIsLoading(false);
      }
    };
    
    const handleCanPlay = () => {
      hasLoaded = true;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      setIsLoading(false);
    };
    
    const handleError = () => {
      // Extract error details from MediaError
      const mediaError = audio.error;
      let errorMessage = "Unable to load audio recording.";
      
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = "Audio loading was aborted.";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = "Network error while loading audio. The recording URL may have expired.";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = "Audio decoding error. The file may be corrupted.";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Audio format not supported or recording unavailable.";
            break;
        }
        console.error("Audio loading error:", mediaError.code, mediaError.message);
      }
      
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      setError(errorMessage);
      setIsLoading(false);
      audioRef.current = null;
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handlePlay = () => {
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Reset audio position for replay
      if (audio) {
        audio.currentTime = 0;
      }
    };
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    
    // Preload audio
    audio.load();
    
    // Timeout fallback - if audio doesn't load in 10 seconds, show error
    loadTimeout = setTimeout(() => {
      if (!hasLoaded) {
        console.error("Audio loading timeout");
        setError("Audio loading timed out. The recording may be unavailable or expired.");
        setIsLoading(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      }
    }, 10000);
    
    return () => {
      if (loadTimeout) {
        clearTimeout(loadTimeout);
      }
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // Release resources properly
      audioRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.recording_url, call?.duration, isOpen]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      // If audio ended, reset before playing
      if (audio.ended) {
        audio.currentTime = 0;
      }
      audio.play().catch((err) => {
        console.error("Audio play error:", err);
        setError("Failed to play audio. Try reopening the player.");
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percent * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  const { language: playerLang } = useLanguage();
  const playerMeta = call?.metadata as Record<string, unknown> | undefined;
  const playerOverrides = playerMeta?.overrides as { summary?: string | null } | undefined;
  const effectiveSummaryForPlayer =
    playerOverrides?.summary !== undefined ? playerOverrides.summary : call?.summary ?? null;

  const playerTranslation = useCallContentTranslation({
    callId: call?.id ?? "",
    enabled: Boolean(isOpen && playerLang === "tr" && call?.id),
    language: playerLang,
    summaryRaw: effectiveSummaryForPlayer,
    transcriptRaw: null,
    evaluationSummaryRaw: null,
  });

  if (!call || !call.recording_url) return null;

  const displayPlayerSummary =
    playerLang === "tr" && playerTranslation.translations?.summary
      ? cleanCallSummary(playerTranslation.translations.summary)
      : effectiveSummaryForPlayer
        ? cleanCallSummary(effectiveSummaryForPlayer)
        : null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = duration - currentTime;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl bg-white dark:bg-gray-800 p-0 gap-0 [&>button]:hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              {getCallerDisplay(call).name}
            </DialogTitle>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="px-6 py-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Call Info Bubble */}
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 inline-block">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-800 dark:bg-gray-900 flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {getCallerDisplay(call).name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Audiocall</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono tabular-nums">
                  {duration > 0 ? formatDuration(duration) : (call.duration ? formatDuration(call.duration) : "—")}
                </p>
              </div>
            </div>
          </div>

          {/* Waveform Visualization */}
          <div className="relative h-32 bg-gray-100 dark:bg-gray-700/50 rounded-lg overflow-hidden flex items-center justify-center">
            <div className="flex items-center gap-0.5 h-full px-4">
              {waveformRefs.current.map((height, i) => {
                const isActive = (i / 60) * 100 <= progress;
                const isPlayingNow = isPlaying && isActive;
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 rounded-full transition-all duration-100",
                      isActive
                        ? "bg-orange-500"
                        : "bg-gray-300 dark:bg-gray-600"
                    )}
                    style={{
                      height: isActive ? `${height}%` : "20%",
                      animation: isPlayingNow ? "pulse 0.5s ease-in-out infinite" : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div 
              className="relative h-2 bg-gray-900 dark:bg-gray-700 rounded-full cursor-pointer"
              onClick={handleSeek}
            >
              {/* Progress fill */}
              <div 
                className="absolute left-0 top-0 h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
              
              {/* Progress segments/markers */}
              <div className="absolute inset-0 flex items-center">
                {Array.from({ length: 20 }).map((_, i) => {
                  const segmentPos = (i / 20) * 100;
                  const isActive = segmentPos <= progress;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute h-1 rounded-full",
                        isActive ? "bg-orange-500" : "bg-gray-700 dark:bg-gray-600"
                      )}
                      style={{
                        left: `${segmentPos}%`,
                        width: "2px",
                      }}
                    />
                  );
                })}
      </div>
              
              {/* Scrubber */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full border-2 border-white dark:border-gray-900 transition-all"
                style={{ left: `calc(${progress}% - 8px)` }}
              />
    </div>
            
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>-{formatTime(remainingTime)}</span>
      </div>
    </div>

          {/* Loading State */}
          {isLoading && !error && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading audio...</p>
            </div>
          )}

          {/* Playback Controls */}
          {!isLoading && !error && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => skip(-10)}
                disabled={!duration}
                className="w-12 h-12 rounded-lg bg-gray-900 dark:bg-gray-700 text-white flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rewind className="w-5 h-5" />
              </button>
              
              <button
                onClick={togglePlay}
                disabled={!duration || isLoading}
                className="w-16 h-16 rounded-lg bg-gray-900 dark:bg-gray-700 text-white flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-1" />
                )}
              </button>
              
              <button
                onClick={() => skip(10)}
                disabled={!duration}
                className="w-12 h-12 rounded-lg bg-gray-900 dark:bg-gray-700 text-white flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FastForward className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Summary Bubble */}
          {displayPlayerSummary && (
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 inline-block max-w-md">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1 flex items-center gap-2">
                  {playerLang === "tr" ? "Özet" : "Summary"}
                  {playerLang === "tr" && playerTranslation.loading && (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" aria-hidden />
                  )}
                </p>
                {playerTranslation.error && playerLang === "tr" && (
                  <p className="text-xs text-red-500 dark:text-red-400 mb-1">{playerTranslation.error}</p>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">{displayPlayerSummary}</p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper to check if a string looks like a phone number
function looksLikePhoneNumber(str: string | null | undefined): boolean {
  if (!str) return false;
  // Remove spaces, dashes, parentheses
  const cleaned = str.replace(/[\s\-\(\)]/g, '');
  // Check if it starts with + or is mostly digits (7+ digits)
  return cleaned.startsWith('+') || /^\d{7,}$/.test(cleaned);
}

// Helper to get proper display values for name and phone
// Handles cases where phone number ends up in name field
function getCallerDisplay(call: Call): { name: string; phone: string } {
  const callerName = call.caller_name;
  const callerPhone = call.caller_phone;
  
  // If name looks like a phone number and phone is empty, swap them
  if (looksLikePhoneNumber(callerName) && !callerPhone) {
    return {
      name: "Unknown Caller",
      phone: callerName || "No phone"
    };
  }
  
  // If both are empty
  if (!callerName && !callerPhone) {
    return {
      name: "Unknown Caller",
      phone: "No phone"
    };
  }
  
  // Normal case
  return {
    name: callerName || "Unknown Caller",
    phone: callerPhone || "No phone"
  };
}


// parseScore, adjustScoreBasedOnContent are imported from @/lib/dashboard/call-scoring
// estimateScore wrapper: accepts Call type, delegates to shared utility
function estimateScore(call: Call): number | null {
  return estimateScoreShared(call);
}


// Helper function to get sort key for calls - MUST match display logic exactly
// Returns: 1 = V (voicemail), 2 = F (failed), then 3-12 based on 1-10 score (inverted for high scores first)
function getCallSortKey(call: Call): number {
  const metadata = call.metadata as Record<string, unknown> | undefined;
  
  // === FAST PATH: If evaluated by our AI system, use its outcome/score directly ===
  const structuredData = metadata?.structuredData as Record<string, unknown> | undefined;
  const evaluationSource = structuredData?.evaluationSource as string | undefined;
  
  if (evaluationSource === 'our_evaluation_only' && structuredData?.successEvaluation) {
    const successEval = structuredData.successEvaluation as Record<string, unknown>;
    const aiScore = typeof successEval.score === 'number' ? successEval.score : null;
    const aiOutcome = (successEval.outcome as string || '').toLowerCase();
    
    // V = 1, F = 2, HR (1-2) = 3-4, SR (3-6) = 5-8, Score (7-10) = 9-12
    if (aiOutcome === 'voicemail') {
      return 1;
    }
    if (aiOutcome === 'no_answer' || aiOutcome === 'wrong_number' || aiOutcome === 'busy') {
      return 2;
    }
    if (aiScore !== null && aiScore >= 1 && aiScore <= 10) {
      return aiScore + 2; // Score 1 → 3, Score 10 → 12
    }
    // Fallback
    return 2;
  }
  
  // === LEGACY PATH: Pattern-based sorting for calls not evaluated by our AI ===
  const endedReason = (metadata?.endedReason as string || '').toLowerCase();
  const evalSummary = (call.evaluation_summary || '').toLowerCase();
  const callSummary = (call.summary || '').toLowerCase();
  const transcript = (call.transcript || '').toLowerCase();
  
  // Extract user text first (needed for IVR detection)
  const userParts = transcript.split(/ai:/i).filter(part => part.includes('user:'));
  const userTextRaw = userParts.map(p => p.split('user:')[1] || '').join(' ').toLowerCase();
  const userText = userTextRaw.replace(/[.,!?;:'"]/g, ' ').replace(/\s+/g, ' ');
  
  // IVR (Interactive Voice Response) / Automated phone system detection
  const ivrPatterns = [
    'this is your first call with us',
    'please listen closely',
    'press 1', 'press 2', 'press 3', 'press 4', 'press 5', 'press 6', 'press 7', 'press 8', 'press 9',
    'press one', 'press two', 'press three', 'press four', 'press five', 'press six', 'press seven', 'press eight', 'press nine',
    'i\'ll forward you to a representative',
    'forward you to a representative',
    'welcome to', 'this call may be recorded',
    'para español', 'for spanish', 'for english',
    'if you\'re not calling to', 'if you are not calling to',
    'please say the', 'say the full',
    'if the pickup location is', 'if those options were not',
    'book a ride', 'pickup location', 'street name', 'town',
    'yellow checker cab', 'cab company', 'taxi company',
    'renewable energy tracking system', 'gateway place',
    'knox services', 'county center plaza'
  ];
  
  const hasIvrPattern = ivrPatterns.some(p => 
    userText.includes(p) || 
    callSummary.includes(p) || 
    transcript.includes(p)
  );
  
  // If IVR detected, treat as voicemail (sort key 1)
  if (hasIvrPattern) {
    return 1;
  }

  // MUST match display logic patterns exactly (same as CallRow component)
  const voicemailSystemPhrases = [
    'voicemail', 'sesli mesaj',
    'can\'t take your call', 'can\'t take call', 'can\'t take the call',
    'can\'t take call right now', 'can\'t take your call right now', 'can\'t take the call right now',
    'please leave a message', 'leave a message', 'leave your message', 'leave a voice message', 'leave voice messages',
    'after the beep', 'after the tone', 'at the tone', // Voicemail tone indicators
    'unavailable to take your call', 'not available to take your call',
    'mesaj bırakın', 'bip sesinden sonra', 'sesli mesaj bırakın',
    'record your message',
    'unable to take your call', 'can t take your call', 'cannot take your call',
    'mailbox', 'mailbox is full', 'mailbox full',
    'press hash', 'press 5', 'press 1', 'press 2', 'press 3', 'press 4',
    'to send an sms notification', 'send an sms notification',
    'to get through, please press', 'to get through press', 'please press',
    'call control', 'has call control', 'number has call control',
    'not accepting calls', 'not accepting calls at this time',
    'the number you have reached', 'number you have reached',
    'hang up', 'just hang up', 'when you re done', 'when you\'re done',
    'please stay on the line', 'stay on the line', // Voicemail system phrases
    'is on another line', 'on another line', // "Is on another line. Just leave your message after the tone."
    'after leaving a message', 'after leaving message', 'press pound for more options',
    'i\'m not here right now', 'not here right now', 'sorry i got you',
    // "I missed your call" + "leave me" patterns
    'i missed your call', 'missed your call', 'missed the call',
    'please leave me your name', 'leave me your name', 'leave me your number',
    'leave me your name, number', 'leave me your name number',
    'leave me your name, number, and a brief message', 'leave me your name number and a brief message',
    'i will call you back', 'will call you back', 'call you back as soon as possible',
    // Spanish voicemail patterns
    'déjeme su nombre', 'dejame su nombre', 'déjeme su número', 'dejame su número',
    'déjeme su nombre, número', 'dejame su nombre, numero',
    'déjeme su nombre, número de teléfono', 'dejame su nombre, numero de telefono',
    'déjeme su nombre, número de teléfono y un breve mensaje', 'dejame su nombre, numero de telefono y un breve mensaje',
    'le regreso la llamada', 'regreso la llamada', 'le regresaré la llamada', 'regresare la llamada',
    'le regreso la llamada lo más pronto posible', 'regreso la llamada lo mas pronto posible',
    'si prefiere envíeme un texto', 'si prefiere envie un texto', 'envíeme un texto', 'envie un texto',
    'no va transferir su llamada', 'no va a transferir su llamada',
    // Hold/connecting patterns (telephone system automated messages)
    'please hold while we try to connect you', 'please hold while we try to connect',
    'please hold while we connect you', 'please hold while we connect',
    'hold while we try to connect you', 'hold while we try to connect',
    'hold while we connect you', 'hold while we connect',
    'please wait while we connect', 'wait while we connect',
    'connecting you', 'trying to connect you', 'we are connecting you',
    'please hold on', 'hold on', 'one moment please',
    // Operator/receptionist screening patterns
    'before i try to connect you', 'before i try to connect',
    'can i ask what you\'re calling about', 'can i ask what you are calling about',
    'what are you calling about', 'what you\'re calling about',
    'the person you\'re calling cannot take your call', 'the person you are calling cannot take your call',
    'person you\'re calling cannot take your call right now', 'person you are calling cannot take your call right now',
    'unfortunately, the person you\'re calling', 'unfortunately the person you\'re calling',
    'unfortunately, the person you are calling', 'unfortunately the person you are calling'
  ];
  
  const failedPatterns = [
    'no-answer', 'customer-did-not-answer', 'busy', 'customer-busy', 'failed',
    // Turkish failed phrases  
    'ulaşılamadı', 'meşgul', 'cevap yok', 'hat meşgul',
    'bağlantı kurulamadı', 'bağlanamadı', 'aranılamadı', 'cevaplanmadı'
  ];
  
  const meaningfulUserPatterns = [
    'who is this', 'who are you', 'which company', 'what do you want',
    'call me', 'call back', 'another time', 'not interested', 'no thanks',
    'yes', 'no', 'okay', 'sure', 'hello', 'hi', 'what', 'why', 'how much',
    'i\'m', 'i am', 'i don\'t', 'i cant', 'i can\'t',
    // Turkish - MUST match display logic
    'kimsiniz', 'ne istiyorsunuz', 'sonra ara', 'ilgilenmiyorum', 'hayır', 'evet'
  ];
  
  const positiveIndicators = [
    // Interest signals - affirmative responses
    'interested', 'yes please', 'sure', 'okay', 'sounds good', 'yes i am',
    'yep', 'yeah', 'yea', 'yes', 'alright',  // Common affirmatives
    'tell me more', 'how much', 'when can', 'i want', 'i need', 'i would like',
    // Callback/contact requests
    'call me', 'call back', 'reach me', 'contact me', 'get back to me',
    'send me', 'email me', 'whatsapp', 'message me', 'text me',
    // Appointment
    'book', 'schedule', 'appointment', 'available', 'free time',
    // Turkish - MUST match display logic
    'ilgili', 'randevu', 'evet', 'tamam', 'olur', 'istiyorum', 'ara beni',
    'geri ara', 'iletişime geç', 'bilgi gönder'
  ];
  
  const textToCheck = `${endedReason} ${evalSummary} ${callSummary}`;
  
  // Count user responses
  const userResponses = (transcript.match(/user:/gi) || []).length;
  // userText already defined above (line 516)
  const userSaidMeaningful = meaningfulUserPatterns.some(p => userText.includes(p));
  
  // Check for phone number pattern + voicemail phrase (e.g., "370 8493 can't take your call right now")
  // More flexible pattern: looks for digits followed by voicemail phrases anywhere in user text
  // Check both normalized text (can't -> can t) and original text
  // Pattern variations: "can't take", "can t take", "cant take"
  const phoneNumberVoicemailPattern1 = /[\d\s\.\-\(\)]{3,}(can\'t take|can t take|leave|message|unavailable|voicemail|right now)/i;
  const phoneNumberVoicemailPattern2 = /[\d\s\.\-\(\)]{3,}(cant take|leave|message|unavailable|voicemail|right now)/i;
  
  // Also check transcript directly for more reliable detection
  const transcriptLower = transcript.toLowerCase();
  const isPhoneNumberVoicemail = phoneNumberVoicemailPattern1.test(userText) || 
                                  phoneNumberVoicemailPattern2.test(userText) ||
                                  phoneNumberVoicemailPattern1.test(userTextRaw) ||
                                  phoneNumberVoicemailPattern2.test(userTextRaw) ||
                                  phoneNumberVoicemailPattern1.test(transcriptLower) ||
                                  phoneNumberVoicemailPattern2.test(transcriptLower);
  
  // Also check if user text contains voicemail phrases (normalized or original)
  // Handle variations: "can't" -> "can t" or "cant"
  const hasVoicemailInUserText = voicemailSystemPhrases.some(p => {
    const normalized = p.replace(/'/g, ' ').replace(/\s+/g, ' '); // "can't" -> "can t"
    const noApostrophe = p.replace(/'/g, ''); // "can't" -> "cant"
    return userText.includes(p) || 
           userTextRaw.includes(p) ||
           userText.includes(normalized) ||
           userText.includes(noApostrophe) ||
           userTextRaw.includes(normalized) ||
           userTextRaw.includes(noApostrophe);
  }) ||
    // "I missed your call" + "leave me" + "I will call you back" pattern
    ((userText.includes('missed your call') || userText.includes('missed the call')) &&
      (userText.includes('leave me') || userText.includes('leave your')) &&
      (userText.includes('call you back') || userText.includes('call back') || userText.includes('get back to you'))) ||
    // "Please leave me your name, number, and a brief message" pattern
    (userText.includes('leave me your name') && 
      (userText.includes('number') || userText.includes('numero')) &&
      (userText.includes('brief message') || userText.includes('mensaje'))) ||
    // Spanish: "déjeme su nombre, número de teléfono y un breve mensaje" + "le regreso la llamada"
    ((userText.includes('déjeme su nombre') || userText.includes('dejame su nombre')) &&
      (userText.includes('número') || userText.includes('numero')) &&
      (userText.includes('mensaje') || userText.includes('regreso la llamada'))) ||
    // "I will call you back as soon as possible" pattern
    (userText.includes('will call you back') && 
      (userText.includes('as soon as possible') || userText.includes('soon as possible')));
  
  const userOnlyVoicemailPhrases = (hasVoicemailInUserText || isPhoneNumberVoicemail) && !userSaidMeaningful;
  
  // Special case: "Available" + "Please stay on the line" pattern (Lewis Brown case)
  // This is a typical voicemail greeting pattern
  const userWords = userText.trim().split(/\s+/).filter(w => w.length > 0);
  const userWordCount = userWords.length;
  const isOnlyAvailable = userWordCount === 1 && userText.trim() === 'available';
  
  // Check for positive engagement (yeah, yes, etc.) - if user showed engagement, it's not voicemail
  const hasPositiveEngagement = userText.toLowerCase().includes('yeah') ||
                                userText.toLowerCase().includes('yes') ||
                                userText.toLowerCase().includes('yep') ||
                                userText.toLowerCase().includes('yea') ||
                                userText.toLowerCase().includes('sure') ||
                                userText.toLowerCase().includes('okay') ||
                                userText.toLowerCase().includes('ok');
  
  // "Available" + "Please stay on the line" is voicemail ONLY if no positive engagement
  // If user said "Yeah. Yeah." or showed interest, it's a real conversation, not voicemail
  const hasAvailableAndStayOnLine = userText.includes('available') && 
                                    (userText.includes('stay on the line') || 
                                     userText.includes('please stay')) &&
                                    !hasPositiveEngagement; // Skip if positive engagement exists
  
  // Special case: "Is on another line. Just leave your message after the tone."
  // This is a classic voicemail pattern
  const hasAnotherLineAndLeaveMessage = (userText.includes('is on another line') || 
                                        userText.includes('on another line')) &&
                                       (userText.includes('leave your message') ||
                                        userText.includes('leave a message') ||
                                        userText.includes('after the tone') ||
                                        userText.includes('after the beep'));
  
  // Special case: "Just leave your message after the tone" (even with "No" at the start)
  // This is a classic voicemail pattern - "No. Just leave your message after the tone."
  const hasJustLeaveMessageAfterTone = (userText.toLowerCase().includes('just leave') || 
                                        userText.toLowerCase().includes('leave your message') ||
                                        userText.toLowerCase().includes('leave a voice message') ||
                                        userText.toLowerCase().includes('leave voice messages')) &&
                                       (userText.toLowerCase().includes('after the tone') ||
                                        userText.toLowerCase().includes('after the beep') ||
                                        userText.toLowerCase().includes('at the tone') ||
                                        userText.toLowerCase().includes('you can hang up') ||
                                        userText.toLowerCase().includes('can hang up') ||
                                        userText.toLowerCase().includes('hang up after'));

  // Special case: "After leaving a message, you can hang up"
  const hasAfterLeavingMessage = userText.toLowerCase().includes('after leaving a message') ||
                                 userText.toLowerCase().includes('after leaving message');

  // Special case: "Just leave a voice messages" (without "after the tone")
  const hasJustLeaveVoiceMessage = (userText.toLowerCase().includes('just leave') && 
                                    (userText.toLowerCase().includes('voice message') || 
                                     userText.toLowerCase().includes('voice messages'))) ||
                                   (userText.toLowerCase().includes('leave') && 
                                    userText.toLowerCase().includes('voice message'));

  // Special case: "press pound for more options"
  const hasPressPound = userText.toLowerCase().includes('press pound') ||
                        userText.toLowerCase().includes('press #');

  // Special case: "Mailbox is full" / "To send an SMS notification, press 5"
  const hasMailboxFull = userText.toLowerCase().includes('mailbox is full') ||
                         userText.toLowerCase().includes('mailbox full') ||
                         (userText.toLowerCase().includes('mailbox') && userText.toLowerCase().includes('full'));

  const hasSmsNotification = userText.toLowerCase().includes('to send an sms notification') ||
                             userText.toLowerCase().includes('send an sms notification') ||
                             (userText.toLowerCase().includes('sms notification') && userText.toLowerCase().includes('press'));

  const hasPressNumber = (userText.toLowerCase().includes('press 5') ||
                          userText.toLowerCase().includes('press 1') ||
                          userText.toLowerCase().includes('press 2') ||
                          userText.toLowerCase().includes('press 3') ||
                          userText.toLowerCase().includes('press 4')) &&
                         (userText.toLowerCase().includes('notification') || 
                          userText.toLowerCase().includes('sms') || 
                          userText.toLowerCase().includes('message') ||
                          userText.toLowerCase().includes('get through'));

  const hasNotHereRightNow = userText.toLowerCase().includes('i\'m not here right now') ||
                              userText.toLowerCase().includes('not here right now') ||
                              (userText.toLowerCase().includes('sorry') && userText.toLowerCase().includes('not here'));

  // Call control patterns
  const hasCallControl = userText.toLowerCase().includes('call control') ||
                         userText.toLowerCase().includes('has call control') ||
                         userText.toLowerCase().includes('number has call control');

  const hasToGetThrough = userText.toLowerCase().includes('to get through, please press') ||
                          userText.toLowerCase().includes('to get through press') ||
                          (userText.toLowerCase().includes('to get through') && userText.toLowerCase().includes('press'));

  const hasNotAcceptingCalls = userText.toLowerCase().includes('not accepting calls') ||
                                userText.toLowerCase().includes('not accepting calls at this time');

  const hasNumberReached = userText.toLowerCase().includes('the number you have reached') ||
                           userText.toLowerCase().includes('number you have reached');

  // Operator/receptionist screening patterns (no word count limit - these are always voicemail)
  const hasOperatorScreening = userText.toLowerCase().includes('before i try to connect you') ||
                               userText.toLowerCase().includes('before i try to connect') ||
                               (userText.toLowerCase().includes('can i ask what you') && userText.toLowerCase().includes('calling about')) ||
                               userText.toLowerCase().includes('the person you\'re calling cannot take your call') ||
                               userText.toLowerCase().includes('the person you are calling cannot take your call') ||
                               userText.toLowerCase().includes('person you\'re calling cannot take your call right now') ||
                               userText.toLowerCase().includes('person you are calling cannot take your call right now') ||
                               userText.toLowerCase().includes('unfortunately, the person you\'re calling') ||
                               userText.toLowerCase().includes('unfortunately the person you\'re calling') ||
                               userText.toLowerCase().includes('unfortunately, the person you are calling') ||
                               userText.toLowerCase().includes('unfortunately the person you are calling');
  
  const hasVoicemailPhrases = voicemailSystemPhrases.some(p => transcript.includes(p));
  // Key change: even if userResponses >= 2, if user ONLY said voicemail phrases, it's still voicemail
  const isRealConversation = userSaidMeaningful; // Simplified - must say something meaningful
  
  // "I missed your call" + "leave me" pattern (NO word count limit - always voicemail)
  const hasMissedCallAndLeaveMe = (userText.toLowerCase().includes('missed your call') || userText.toLowerCase().includes('missed the call')) &&
    (userText.toLowerCase().includes('leave me') || userText.toLowerCase().includes('leave your')) &&
    (userText.toLowerCase().includes('call you back') || userText.toLowerCase().includes('call back') || userText.toLowerCase().includes('get back to you') || userText.toLowerCase().includes('regreso la llamada'));

  // "Please leave me your name, number, and a brief message" pattern (NO word count limit - always voicemail)
  const hasLeaveMeNameNumber = (userText.toLowerCase().includes('leave me your name') || userText.toLowerCase().includes('dejame su nombre') || userText.toLowerCase().includes('déjeme su nombre')) &&
    (userText.toLowerCase().includes('number') || userText.toLowerCase().includes('numero') || userText.toLowerCase().includes('número')) &&
    (userText.toLowerCase().includes('brief message') || userText.toLowerCase().includes('mensaje') || userText.toLowerCase().includes('breve mensaje'));

  // Spanish: "déjeme su nombre, número de teléfono y un breve mensaje" + "le regreso la llamada" (NO word count limit - always voicemail)
  const hasSpanishVoicemailPattern = (userText.toLowerCase().includes('déjeme su nombre') || userText.toLowerCase().includes('dejame su nombre')) &&
    (userText.toLowerCase().includes('número') || userText.toLowerCase().includes('numero')) &&
    (userText.toLowerCase().includes('mensaje') || userText.toLowerCase().includes('regreso la llamada'));

  // "Please give me a callback" + short message + "bye" pattern (NO word count limit - always voicemail)
  // This is a voicemail message, not a real conversation
  const hasGiveMeCallbackAndBye = (userText.toLowerCase().includes('give me a callback') || userText.toLowerCase().includes('give me callback') || userText.toLowerCase().includes('give me a call back')) &&
    (userText.toLowerCase().includes('when you get a chance') || userText.toLowerCase().includes('when you get chance') || userText.toLowerCase().includes('get a chance')) &&
    (userText.toLowerCase().includes('bye') || userText.toLowerCase().includes('good day') || userText.toLowerCase().includes('have a good day'));

  // Short message + "callback" + "bye" pattern (voicemail, not real conversation)
  // Note: userWordCount is already defined above (line 691)
  const hasShortCallbackAndBye = userWordCount <= 15 &&
    (userText.toLowerCase().includes('callback') || userText.toLowerCase().includes('call back')) &&
    (userText.toLowerCase().includes('bye') || userText.toLowerCase().includes('good day') || userText.toLowerCase().includes('have a good day')) &&
    !userText.toLowerCase().includes('interested') && !userText.toLowerCase().includes('tell me') && !userText.toLowerCase().includes('how much');
  
  // Voicemail detection - MUST match display logic EXACTLY
  // Also catch "Available" + "Please stay on the line" pattern (Lewis Brown case)
  // Also catch "Is on another line. Just leave your message after the tone." pattern
  // Also catch "Just leave your message after the tone" pattern (even with "No" at start)
  const isVoicemail = isPhoneNumberVoicemail ||  // Highest priority - phone number + voicemail phrase
                      hasMissedCallAndLeaveMe ||  // "I missed your call" + "leave me" pattern (NO word count limit)
                      hasLeaveMeNameNumber ||  // "Please leave me your name, number" pattern (NO word count limit)
                      hasSpanishVoicemailPattern ||  // Spanish voicemail pattern (NO word count limit)
                      hasGiveMeCallbackAndBye ||  // "Please give me a callback" + "bye" pattern (NO word count limit)
                      hasShortCallbackAndBye ||  // Short callback + "bye" pattern
                      (hasVoicemailInUserText && !userSaidMeaningful) ||  // User said voicemail phrase but nothing meaningful
                      (hasVoicemailPhrases && !isRealConversation) || 
                      (userOnlyVoicemailPhrases) ||
                      isOnlyAvailable ||  // Single word "Available" is voicemail greeting
                      hasAvailableAndStayOnLine ||  // "Available" + "Please stay on the line" pattern
                      hasAnotherLineAndLeaveMessage ||  // "Is on another line. Just leave your message after the tone." pattern
                      hasJustLeaveMessageAfterTone ||  // "Just leave your message after the tone" pattern (even with "No" at start)
                      hasAfterLeavingMessage ||  // "After leaving a message, you can hang up"
                      hasJustLeaveVoiceMessage ||  // "Just leave a voice messages"
                      hasPressPound ||  // "press pound for more options"
                      hasMailboxFull ||  // "Mailbox is full"
                      hasSmsNotification ||  // "To send an SMS notification"
                      hasPressNumber ||  // "press 5" for SMS notification
                      hasNotHereRightNow ||  // "I'm not here right now"
                      hasCallControl ||  // "call control"
                      hasToGetThrough ||  // "To get through, please press 5"
                      hasNotAcceptingCalls ||  // "not accepting calls"
                      hasNumberReached ||  // "The number you have reached"
                      hasOperatorScreening;  // Operator/receptionist screening (e.g., "Before I try to connect you" + "person you're calling cannot take your call")
  const isSilenceTimeout = endedReason === 'silence-timed-out';
  const isShortCall = (call.duration || 0) < 30;
  const likelyVoicemailByBehavior = isSilenceTimeout && isShortCall && !isRealConversation;
  const isVoicemailFinal = isVoicemail || likelyVoicemailByBehavior || hasIvrPattern;
  
  // If voicemail → V (sort key 1)
  if (isVoicemailFinal) {
    return 1;
  }
  
  // Get effective score for failed check
  const parsedScore = parseScore(call.evaluation_score);
  const estimatedScore = estimateScore(call);
  const rawScore = parsedScore !== null ? parsedScore : estimatedScore;
  
  // Apply the same score adjustment as display logic
  let effectiveScore = rawScore !== null 
    ? adjustScoreBasedOnContent(rawScore, transcript, callSummary, userText, call.duration)
    : null;
  
  // Additional adjustment for language mismatch (communication barrier) - MUST match CallRow logic
  const languageMismatchPatterns = [
    'no speak english', 'no speak', 'don\'t speak english', 'don\'t speak',
    'i speak portuguese', 'i speak spanish', 'i speak turkish', 'i speak french',
    'speak portuguese', 'speak spanish', 'speak turkish', 'speak french',
    'no english', 'no entiendo', 'no comprendo', 'no falo',
    'someone speak', 'speak turkish', 'speak portuguese', 'speak spanish',
    'language', 'lingua', 'idioma'
  ];
  
  const hasLanguageMismatch = languageMismatchPatterns.some(p =>
    userText.includes(p) ||
    transcript.includes(p) ||
    callSummary.includes(p)
  );
  
  if (effectiveScore !== null && hasLanguageMismatch && effectiveScore > 3) {
    effectiveScore = Math.min(effectiveScore, 3);
  }
  
  const isFailedByText = failedPatterns.some(p => textToCheck.includes(p));
  const isVeryShortCall = (call.duration || 0) < 15;
  const aiOnlySpoke = transcript.includes('ai:') && userResponses === 0;
  const customerHungUpQuickly = endedReason === 'customer-ended-call' && isVeryShortCall;
  
  // Check if user never responded (0 words) - this is always a failed call
  const userNeverResponded = userWordCount === 0;
  
  // Failed call: no score (null) means failed connection, or explicit failure patterns
  // OR user never responded (no answer at all)
  const isFailedCall = isFailedByText || 
    effectiveScore === null ||  // No score means failed to connect (V or F)
    userNeverResponded ||  // User never responded → failed call
    (customerHungUpQuickly && !isRealConversation) ||
    (aiOnlySpoke && isVeryShortCall);
  
  // If failed → F (sort key 2)
  if (isFailedCall) {
    return 2;
  }
  
  // For scored calls, return sort key based on ADJUSTED score (3-12 range)
  // Higher scores get higher sort keys for "score_high" sorting
  // Score 1 → sort key 3, Score 10 → sort key 12
  return (effectiveScore || 5) + 2;
}

// Helper function to get valid evaluation summary
function getValidEvaluationSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const trimmed = summary.trim().toLowerCase();
  // Filter out invalid values
  if (trimmed === 'false' || trimmed === 'true' || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  return summary;
}

// Generate actionable summary for salespeople based on call score
function getSalesAdvice(
  scoreDisplay: string,
  transcript: string,
  userText: string,
  lang: "en" | "tr" = "en"
): string {
  const texts = {
    voicemail: { en: "Voicemail - should be called back", tr: "Sesli mesaja düştü - tekrar aranmalı" },
    failed: { en: "Connection failed - should be called back", tr: "Bağlantı kurulamadı - tekrar aranmalı" },
    hotLead: { en: "🔥 Hot lead!", tr: "🔥 Sıcak lead!" },
    interested: { en: "✅ Interested customer!", tr: "✅ İlgili müşteri!" },
    neutral: { en: "📊 Neutral conversation", tr: "📊 Nötr görüşme" },
    lowInterest: { en: "⚠️ Low interest", tr: "⚠️ Düşük ilgi" },
    notInterested: { en: "❌ Not interested", tr: "❌ İlgisiz" },
    zoomMeeting: { en: "Zoom meeting to be scheduled.", tr: "Zoom görüşmesi planlanacak." },
    callbackRequested: { en: "Requested callback.", tr: "Geri arama istedi." },
    infoRequested: { en: "Requested information to be sent.", tr: "Bilgi gönderilmesini istedi." },
    dayPreference: { en: "Preferred specific day - check calendar.", tr: "Belirli gün tercih etti - takvimi kontrol edin." },
    timePreference: { en: "Specified time preference.", tr: "Saat tercihi belirtti." },
    followUp: { en: "Follow up quickly and schedule an appointment.", tr: "Hızlıca takip edin ve randevu alın." },
  };

  // For voicemail and failed - simple messages
  if (scoreDisplay === 'V') {
    return texts.voicemail[lang];
  }
  if (scoreDisplay === 'F') {
    return texts.failed[lang];
  }
  
  const score = Number(scoreDisplay);
  const lowerTranscript = transcript.toLowerCase();
  const lowerUserText = userText.toLowerCase();
  
  const advice: string[] = [];
  
  // Generate advice based on score
  if (score >= 9) {
    advice.push(texts.hotLead[lang]);
  } else if (score >= 7) {
    advice.push(texts.interested[lang]);
  } else if (score >= 5) {
    advice.push(texts.neutral[lang]);
  } else if (score >= 3) {
    advice.push(texts.lowInterest[lang]);
  } else {
    advice.push(texts.notInterested[lang]);
  }
  
  // For scores >= 6, add detailed advice
  if (score >= 6) {
    // Check what they agreed to
    if (lowerTranscript.includes('zoom') || lowerTranscript.includes('q and a')) {
      advice.push(texts.zoomMeeting[lang]);
    }
    if (lowerUserText.includes('call me') || lowerUserText.includes('call back') || lowerUserText.includes('ara')) {
      advice.push(texts.callbackRequested[lang]);
    }
    if (lowerUserText.includes('send') || lowerUserText.includes('email') || lowerUserText.includes('whatsapp')) {
      advice.push(texts.infoRequested[lang]);
    }
    if (lowerUserText.includes('monday') || lowerUserText.includes('tuesday') || lowerUserText.includes('wednesday') || 
        lowerUserText.includes('thursday') || lowerUserText.includes('friday') || lowerUserText.includes('saturday') ||
        lowerUserText.includes('pazartesi') || lowerUserText.includes('salı') || lowerUserText.includes('çarşamba')) {
      advice.push(texts.dayPreference[lang]);
    }
    if (lowerUserText.includes('morning') || lowerUserText.includes('afternoon') || lowerUserText.includes('evening') ||
        lowerUserText.includes('sabah') || lowerUserText.includes('öğleden') || lowerUserText.includes('akşam')) {
      advice.push(texts.timePreference[lang]);
    }
    
    // If no specific action found for interested customers
    if (advice.length === 1 && score >= 7) {
      advice.push(texts.followUp[lang]);
    }
  }
  
  return advice.join(" ");
}

// Call labels with translations
const callLabels = {
  summary: { en: "Summary", tr: "Özet" },
  callStatus: { en: "Call Status", tr: "Arama Durumu" },
  transcript: { en: "Transcript", tr: "Transkript" },
  voicemail: { en: "Voicemail", tr: "Sesli Mesaj" },
  notReached: { en: "Not Reached", tr: "Ulaşılamadı" },
  hotLead: { en: "Hot Lead", tr: "Sıcak Müşteri" },
  interested: { en: "Interested", tr: "İlgili" },
  neutral: { en: "Neutral", tr: "Nötr" },
  notInterested: { en: "Not Interested", tr: "İlgisiz" },
};

// Call Row Component with Expandable Detail - Mobile Responsive
function CallRow({ 
  call, 
  onPlay,
  onUpdate,
  onCallUpdated,
  lang
}: { 
  call: Call;
  onPlay: (call: Call) => void;
  onUpdate?: (forceRefresh?: boolean) => void;
  onCallUpdated?: (callId: string, updatedCall: Call) => void;
  lang?: "en" | "tr";
}) {
  const [expanded, setExpanded] = useState(false);
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const { language: contextLanguage } = useLanguage();
  
  // Use prop lang if provided, otherwise use context language
  // Ensure it's a valid language code
  const currentLang: "en" | "tr" = (lang === "tr" || lang === "en") ? lang : 
                                    (contextLanguage === "tr" || contextLanguage === "en") ? contextLanguage : "en";

  const handleReEvaluate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReEvaluating) return;
    
    setIsReEvaluating(true);
    try {
      const response = await fetch('/api/calls/re-evaluate-structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, force: true }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Show success message with new score
          console.log('Re-evaluation successful:', data);
          const newScore = data.newScore;
          const newOutcome = data.newOutcome;
          console.log(`New score: ${newScore}, New outcome: ${newOutcome}`);
          
          // Show success notification
          if (newScore !== undefined) {
            console.log(`[Re-evaluate] New score received: ${newScore}, outcome: ${newOutcome}`);
          }
          
          // Update call in state immediately with new score
          if (onCallUpdated && newScore !== undefined) {
            const updatedCall: Call = {
              ...call,
              evaluation_score: newScore,
              metadata: {
                ...call.metadata,
                structuredData: {
                  ...(call.metadata?.structuredData as Record<string, unknown> || {}),
                  successEvaluation: {
                    ...((call.metadata?.structuredData as Record<string, unknown>)?.successEvaluation as Record<string, unknown> || {}),
                    score: newScore,
                    outcome: newOutcome || 'no_answer',
                  },
                  evaluatedAt: new Date().toISOString(),
                  evaluationSource: 'our_evaluation_only',
                },
              },
            };
            console.log(`[Re-evaluate] Updating call ${call.id} in state with score ${newScore}`);
            onCallUpdated(call.id, updatedCall);
          }
          
          // Also refresh the full list after a delay to ensure DB is updated
          setTimeout(() => {
            if (onUpdate) {
              console.log('[Re-evaluate] Refreshing full call list...');
              (onUpdate as (forceRefresh?: boolean) => void)(true);
            }
          }, 2000);
        } else {
          console.error('Re-evaluation failed:', data);
          alert(currentLang === "tr" ? "Re-evaluation başarısız: " + (data.error || "Bilinmeyen hata") : "Re-evaluation failed: " + (data.error || "Unknown error"));
        }
      } else {
        const error = await response.json();
        console.error('Re-evaluation API error:', error);
        alert(currentLang === "tr" ? "Re-evaluation başarısız: " + (error.error || "Bilinmeyen hata") : "Re-evaluation failed: " + (error.error || "Unknown error"));
      }
    } catch (error) {
      console.error('Re-evaluation error:', error);
      alert(currentLang === "tr" ? "Re-evaluation sırasında hata oluştu" : "Error during re-evaluation");
    } finally {
      setIsReEvaluating(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get proper caller name and phone display (handles swapped data)
  const callerDisplay = getCallerDisplay(call);

  // Pre-calculate valid score and summary
  const metadata = call.metadata as Record<string, unknown> | undefined;
  const endedReason = (metadata?.endedReason as string || '').toLowerCase();
  const evalSummary = (call.evaluation_summary || '').toLowerCase();
  const callSummary = (call.summary || '').toLowerCase();
  const transcript = (call.transcript || '').toLowerCase();
  
  // === CHECK: If evaluated by our AI system, trust it directly ===
  const structuredData = metadata?.structuredData as Record<string, unknown> | undefined;
  const evaluationSource = structuredData?.evaluationSource as string | undefined;
  const isOurEvaluation = evaluationSource === 'our_evaluation_only';
  
  // === SMART CALL CLASSIFICATION ALGORITHM ===
  
  // Extract what the user actually said FIRST (needed for score adjustment)
  const userParts = transcript.split(/ai:/i).filter(part => part.includes('user:'));
  const userTextRaw = userParts.map(p => p.split('user:')[1] || '').join(' ').toLowerCase();
  const userText = userTextRaw.replace(/[.,!?;:'"]/g, ' ').replace(/\s+/g, ' ');
  
  // Calculate user word count for voicemail detection
  const userWords = userText.trim().split(/\s+/).filter(w => w.length > 0);
  const userWordCount = userWords.length;
  
  // Get the score first (check override, then evaluation, then estimated)
  // Score is now on 1-10 scale, null means V or F
  const overrides = metadata?.overrides as { 
    evaluation_score?: number | null;
    sentiment?: 'positive' | 'neutral' | 'negative' | null;
    summary?: string | null;
    evaluation_summary?: string | null;
  } | undefined;
  const overrideScore = overrides?.evaluation_score;
  const scoreToParse = overrideScore !== undefined ? overrideScore : call.evaluation_score;
  const parsedScore = parseScore(scoreToParse);
  const estimatedScoreValue = estimateScore(call);
  const rawScore = parsedScore !== null ? parsedScore : estimatedScoreValue;
  
  // Language mismatch patterns (check before score adjustment)
  const languageMismatchPatterns = [
    'no speak english', 'no speak', 'don\'t speak english', 'don\'t speak',
    'i speak portuguese', 'i speak spanish', 'i speak turkish', 'i speak french',
    'speak portuguese', 'speak spanish', 'speak turkish', 'speak french',
    'no english', 'no entiendo', 'no comprendo', 'no falo',
    'someone speak', 'speak turkish', 'speak portuguese', 'speak spanish',
    'language', 'lingua', 'idioma'
  ];

  const hasLanguageMismatch = languageMismatchPatterns.some(p =>
    userText.includes(p) ||
    transcript.includes(p) ||
    callSummary.includes(p)
  );
  
  // Adjust score based on transcript content (catches wrong high scores like "not interested" getting 10)
  let effectiveScore = rawScore !== null 
    ? adjustScoreBasedOnContent(rawScore, transcript, callSummary, userText, call.duration)
    : null;

  // Additional adjustment for language mismatch (communication barrier)
  if (effectiveScore !== null && hasLanguageMismatch && effectiveScore > 3) {
    effectiveScore = Math.min(effectiveScore, 3);
  }
  
  // IVR (Interactive Voice Response) / Automated phone system detection
  const ivrPatterns = [
    'this is your first call with us',
    'please listen closely',
    'press 1', 'press 2', 'press 3', 'press 4', 'press 5', 'press 6', 'press 7', 'press 8', 'press 9',
    'press one', 'press two', 'press three', 'press four', 'press five', 'press six', 'press seven', 'press eight', 'press nine',
    'i\'ll forward you to a representative',
    'forward you to a representative',
    'welcome to', 'this call may be recorded',
    'para español', 'for spanish', 'for english',
    'if you\'re not calling to', 'if you are not calling to',
    'please say the', 'say the full',
    'if the pickup location is', 'if those options were not',
    'book a ride', 'pickup location', 'street name', 'town',
    'yellow checker cab', 'cab company', 'taxi company',
    'renewable energy tracking system', 'gateway place',
    'knox services', 'county center plaza'
  ];
  
  const hasIvrPattern = ivrPatterns.some(p => 
    userText.includes(p) || 
    callSummary.includes(p) || 
    transcript.includes(p)
  );
  
  // If IVR detected, treat as voicemail (score 1, display V)
  if (hasIvrPattern) {
    effectiveScore = 1;
  }
  
  // Voicemail system phrases (these appear in automated voicemail greetings)
  const voicemailSystemPhrases = [
    'voicemail', 'sesli mesaj',
    'can\'t take your call', 'can\'t take call', 'can\'t take the call',
    'can\'t take call right now', 'can\'t take your call right now', 'can\'t take the call right now',
    'please leave a message', 'leave a message', 'leave your message', 'leave a voice message', 'leave voice messages',
    'after the beep', 'after the tone', 'at the tone', // Voicemail tone indicators
    'unavailable to take your call', 'not available to take your call',
    'mesaj bırakın', 'bip sesinden sonra', 'sesli mesaj bırakın',
    'record your message',
    'unable to take your call', 'can t take your call', 'cannot take your call',
    'mailbox', 'mailbox is full', 'mailbox full',
    'press hash', 'press 5', 'press 1', 'press 2', 'press 3', 'press 4',
    'to send an sms notification', 'send an sms notification',
    'to get through, please press', 'to get through press', 'please press',
    'call control', 'has call control', 'number has call control',
    'not accepting calls', 'not accepting calls at this time',
    'the number you have reached', 'number you have reached',
    'hang up', 'just hang up', 'when you re done', 'when you\'re done',
    'please stay on the line', 'stay on the line', // Voicemail system phrases
    'is on another line', 'on another line', // "Is on another line. Just leave your message after the tone."
    'after leaving a message', 'after leaving message', 'press pound for more options',
    'i\'m not here right now', 'not here right now', 'sorry i got you',
    // "I missed your call" + "leave me" patterns
    'i missed your call', 'missed your call', 'missed the call',
    'please leave me your name', 'leave me your name', 'leave me your number',
    'leave me your name, number', 'leave me your name number',
    'leave me your name, number, and a brief message', 'leave me your name number and a brief message',
    'i will call you back', 'will call you back', 'call you back as soon as possible',
    // Spanish voicemail patterns
    'déjeme su nombre', 'dejame su nombre', 'déjeme su número', 'dejame su número',
    'déjeme su nombre, número', 'dejame su nombre, numero',
    'déjeme su nombre, número de teléfono', 'dejame su nombre, numero de telefono',
    'déjeme su nombre, número de teléfono y un breve mensaje', 'dejame su nombre, numero de telefono y un breve mensaje',
    'le regreso la llamada', 'regreso la llamada', 'le regresaré la llamada', 'regresare la llamada',
    'le regreso la llamada lo más pronto posible', 'regreso la llamada lo mas pronto posible',
    'si prefiere envíeme un texto', 'si prefiere envie un texto', 'envíeme un texto', 'envie un texto',
    'no va transferir su llamada', 'no va a transferir su llamada',
    // Hold/connecting patterns (telephone system automated messages)
    'please hold while we try to connect you', 'please hold while we try to connect',
    'please hold while we connect you', 'please hold while we connect',
    'hold while we try to connect you', 'hold while we try to connect',
    'hold while we connect you', 'hold while we connect',
    'please wait while we connect', 'wait while we connect',
    'connecting you', 'trying to connect you', 'we are connecting you',
    'please hold on', 'hold on', 'one moment please',
    // Operator/receptionist screening patterns
    'before i try to connect you', 'before i try to connect',
    'can i ask what you\'re calling about', 'can i ask what you are calling about',
    'what are you calling about', 'what you\'re calling about',
    'the person you\'re calling cannot take your call', 'the person you are calling cannot take your call',
    'person you\'re calling cannot take your call right now', 'person you are calling cannot take your call right now',
    'unfortunately, the person you\'re calling', 'unfortunately the person you\'re calling',
    'unfortunately, the person you are calling', 'unfortunately the person you are calling'
  ];
  
  // Hold/wait phrases (can appear in both voicemail AND real calls)
  // But if combined with "connecting" or "try to connect", it's likely a phone system message
  const holdPhrases = [
    'please hold', 'not available',
    'please hold while we try to connect you', 'please hold while we try to connect',
    'please hold while we connect you', 'please hold while we connect',
    'hold while we try to connect you', 'hold while we try to connect',
    'hold while we connect you', 'hold while we connect',
    'please wait while we connect', 'wait while we connect',
    'connecting you', 'trying to connect you', 'we are connecting you',
    'please hold on', 'hold on', 'one moment please',
    // Operator/receptionist screening patterns
    'before i try to connect you', 'before i try to connect',
    'can i ask what you\'re calling about', 'can i ask what you are calling about',
    'what are you calling about', 'what you\'re calling about',
    'the person you\'re calling cannot take your call', 'the person you are calling cannot take your call',
    'person you\'re calling cannot take your call right now', 'person you are calling cannot take your call right now',
    'unfortunately, the person you\'re calling', 'unfortunately the person you\'re calling',
    'unfortunately, the person you are calling', 'unfortunately the person you are calling'
  ];
  
  // Failed call patterns (in endedReason or summary)
  const failedPatterns = [
    'no-answer', 'customer-did-not-answer', 'busy', 'customer-busy', 'failed',
    // Turkish failed phrases  
    'ulaşılamadı', 'meşgul', 'cevap yok', 'hat meşgul',
    'bağlantı kurulamadı', 'bağlanamadı', 'aranılamadı', 'cevaplanmadı'
  ];
  
  // Meaningful user responses (indicates real conversation, not voicemail)
  const meaningfulUserPatterns = [
    'who is this', 'who are you', 'which company', 'what do you want',
    'call me', 'call back', 'another time', 'not interested', 'no thanks',
    'yes', 'no', 'okay', 'sure', 'hello', 'hi', 'what', 'why', 'how much',
    'i\'m', 'i am', 'i don\'t', 'i cant', 'i can\'t',
    // Turkish
    'kimsiniz', 'ne istiyorsunuz', 'sonra ara', 'ilgilenmiyorum', 'hayır', 'evet'
  ];
  
  const textToCheck = `${endedReason} ${evalSummary} ${callSummary}`;
  
  // Count user responses in transcript
  const userResponses = (transcript.match(/user:/gi) || []).length;
  
  // Check if user said something meaningful (not just voicemail system)
  const userSaidMeaningful = meaningfulUserPatterns.some(p => userText.includes(p));
  
  // Check for phone number pattern + voicemail phrase (e.g., "370 8493 can't take your call right now")
  // This is a typical voicemail pattern: phone number followed by automated message
  // More flexible pattern: looks for digits followed by voicemail phrases anywhere in user text
  // Check both normalized text (can't -> can t) and original text
  // Pattern variations: "can't take", "can t take", "cant take"
  const phoneNumberVoicemailPattern1 = /[\d\s\.\-\(\)]{3,}(can\'t take|can t take|leave|message|unavailable|voicemail|right now)/i;
  const phoneNumberVoicemailPattern2 = /[\d\s\.\-\(\)]{3,}(cant take|leave|message|unavailable|voicemail|right now)/i;
  
  // Also check transcript directly for more reliable detection
  const transcriptLower = transcript.toLowerCase();
  const isPhoneNumberVoicemail = phoneNumberVoicemailPattern1.test(userText) || 
                                  phoneNumberVoicemailPattern2.test(userText) ||
                                  phoneNumberVoicemailPattern1.test(userTextRaw) ||
                                  phoneNumberVoicemailPattern2.test(userTextRaw) ||
                                  phoneNumberVoicemailPattern1.test(transcriptLower) ||
                                  phoneNumberVoicemailPattern2.test(transcriptLower);
  
  // Also check if user text contains voicemail phrases (normalized or original)
  // Handle variations: "can't" -> "can t" or "cant"
  const hasVoicemailInUserText = voicemailSystemPhrases.some(p => {
    const normalized = p.replace(/'/g, ' ').replace(/\s+/g, ' '); // "can't" -> "can t"
    const noApostrophe = p.replace(/'/g, ''); // "can't" -> "cant"
    return userText.includes(p) || 
           userTextRaw.includes(p) ||
           userText.includes(normalized) ||
           userText.includes(noApostrophe) ||
           userTextRaw.includes(normalized) ||
           userTextRaw.includes(noApostrophe);
  }) ||
    // "I missed your call" + "leave me" + "I will call you back" pattern
    ((userText.includes('missed your call') || userText.includes('missed the call')) &&
      (userText.includes('leave me') || userText.includes('leave your')) &&
      (userText.includes('call you back') || userText.includes('call back') || userText.includes('get back to you'))) ||
    // "Please leave me your name, number, and a brief message" pattern
    (userText.includes('leave me your name') && 
      (userText.includes('number') || userText.includes('numero')) &&
      (userText.includes('brief message') || userText.includes('mensaje'))) ||
    // Spanish: "déjeme su nombre, número de teléfono y un breve mensaje" + "le regreso la llamada"
    ((userText.includes('déjeme su nombre') || userText.includes('dejame su nombre')) &&
      (userText.includes('número') || userText.includes('numero')) &&
      (userText.includes('mensaje') || userText.includes('regreso la llamada'))) ||
    // "I will call you back as soon as possible" pattern
    (userText.includes('will call you back') && 
      (userText.includes('as soon as possible') || userText.includes('soon as possible')));
  
  const userOnlyVoicemailPhrases = (hasVoicemailInUserText || isPhoneNumberVoicemail) && !userSaidMeaningful;
  
  // Special case: "Available" + "Please stay on the line" pattern (Lewis Brown case)
  // This is a typical voicemail greeting pattern
  const isOnlyAvailable = userWordCount === 1 && userText.trim() === 'available';
  
  // Check for positive engagement (yeah, yes, etc.) - if user showed engagement, it's not voicemail
  const hasPositiveEngagement = userText.toLowerCase().includes('yeah') ||
                                userText.toLowerCase().includes('yes') ||
                                userText.toLowerCase().includes('yep') ||
                                userText.toLowerCase().includes('yea') ||
                                userText.toLowerCase().includes('sure') ||
                                userText.toLowerCase().includes('okay') ||
                                userText.toLowerCase().includes('ok');
  
  // "Available" + "Please stay on the line" is voicemail ONLY if no positive engagement
  // If user said "Yeah. Yeah." or showed interest, it's a real conversation, not voicemail
  const hasAvailableAndStayOnLine = userText.includes('available') && 
                                    (userText.includes('stay on the line') || 
                                     userText.includes('please stay')) &&
                                    !hasPositiveEngagement; // Skip if positive engagement exists
  
  // Special case: "Is on another line. Just leave your message after the tone."
  // This is a classic voicemail pattern
  const hasAnotherLineAndLeaveMessage = (userText.includes('is on another line') || 
                                        userText.includes('on another line')) &&
                                       (userText.includes('leave your message') ||
                                        userText.includes('leave a message') ||
                                        userText.includes('after the tone') ||
                                        userText.includes('after the beep'));
  
  // Special case: "Just leave your message after the tone" (even with "No" at the start)
  // This is a classic voicemail pattern - "No. Just leave your message after the tone."
  const hasJustLeaveMessageAfterTone = (userText.toLowerCase().includes('just leave') || 
                                        userText.toLowerCase().includes('leave your message') ||
                                        userText.toLowerCase().includes('leave a voice message') ||
                                        userText.toLowerCase().includes('leave voice messages')) &&
                                       (userText.toLowerCase().includes('after the tone') ||
                                        userText.toLowerCase().includes('after the beep') ||
                                        userText.toLowerCase().includes('at the tone') ||
                                        userText.toLowerCase().includes('you can hang up') ||
                                        userText.toLowerCase().includes('can hang up') ||
                                        userText.toLowerCase().includes('hang up after'));

  // Special case: "After leaving a message, you can hang up"
  const hasAfterLeavingMessage = userText.toLowerCase().includes('after leaving a message') ||
                                 userText.toLowerCase().includes('after leaving message');

  // Special case: "Just leave a voice messages" (without "after the tone")
  const hasJustLeaveVoiceMessage = (userText.toLowerCase().includes('just leave') && 
                                    (userText.toLowerCase().includes('voice message') || 
                                     userText.toLowerCase().includes('voice messages'))) ||
                                   (userText.toLowerCase().includes('leave') && 
                                    userText.toLowerCase().includes('voice message'));

  // Special case: "press pound for more options"
  const hasPressPound = userText.toLowerCase().includes('press pound') ||
                        userText.toLowerCase().includes('press #');

  // Special case: "Mailbox is full" / "To send an SMS notification, press 5"
  const hasMailboxFull = userText.toLowerCase().includes('mailbox is full') ||
                         userText.toLowerCase().includes('mailbox full') ||
                         (userText.toLowerCase().includes('mailbox') && userText.toLowerCase().includes('full'));

  const hasSmsNotification = userText.toLowerCase().includes('to send an sms notification') ||
                             userText.toLowerCase().includes('send an sms notification') ||
                             (userText.toLowerCase().includes('sms notification') && userText.toLowerCase().includes('press'));

  const hasPressNumber = (userText.toLowerCase().includes('press 5') ||
                          userText.toLowerCase().includes('press 1') ||
                          userText.toLowerCase().includes('press 2') ||
                          userText.toLowerCase().includes('press 3') ||
                          userText.toLowerCase().includes('press 4')) &&
                         (userText.toLowerCase().includes('notification') || 
                          userText.toLowerCase().includes('sms') || 
                          userText.toLowerCase().includes('message') ||
                          userText.toLowerCase().includes('get through'));

  const hasNotHereRightNow = userText.toLowerCase().includes('i\'m not here right now') ||
                              userText.toLowerCase().includes('not here right now') ||
                              (userText.toLowerCase().includes('sorry') && userText.toLowerCase().includes('not here'));

  // Call control patterns
  const hasCallControl = userText.toLowerCase().includes('call control') ||
                         userText.toLowerCase().includes('has call control') ||
                         userText.toLowerCase().includes('number has call control');

  const hasToGetThrough = userText.toLowerCase().includes('to get through, please press') ||
                          userText.toLowerCase().includes('to get through press') ||
                          (userText.toLowerCase().includes('to get through') && userText.toLowerCase().includes('press'));

  const hasNotAcceptingCalls = userText.toLowerCase().includes('not accepting calls') ||
                                userText.toLowerCase().includes('not accepting calls at this time');

  const hasNumberReached = userText.toLowerCase().includes('the number you have reached') ||
                           userText.toLowerCase().includes('number you have reached');

  // Operator/receptionist screening patterns (no word count limit - these are always voicemail)
  const hasOperatorScreening = userText.toLowerCase().includes('before i try to connect you') ||
                               userText.toLowerCase().includes('before i try to connect') ||
                               (userText.toLowerCase().includes('can i ask what you') && userText.toLowerCase().includes('calling about')) ||
                               userText.toLowerCase().includes('the person you\'re calling cannot take your call') ||
                               userText.toLowerCase().includes('the person you are calling cannot take your call') ||
                               userText.toLowerCase().includes('person you\'re calling cannot take your call right now') ||
                               userText.toLowerCase().includes('person you are calling cannot take your call right now') ||
                               userText.toLowerCase().includes('unfortunately, the person you\'re calling') ||
                               userText.toLowerCase().includes('unfortunately the person you\'re calling') ||
                               userText.toLowerCase().includes('unfortunately, the person you are calling') ||
                               userText.toLowerCase().includes('unfortunately the person you are calling');
  
  // Determine if this is a voicemail
  // It's voicemail if: voicemail phrases exist AND user didn't say anything meaningful
  const hasVoicemailPhrases = voicemailSystemPhrases.some(p => transcript.includes(p));
  const hasOnlyHoldPhrases = holdPhrases.some(p => transcript.includes(p)) && !hasVoicemailPhrases;
  
  // Key insight: Even if user responded multiple times, if they ONLY said voicemail phrases, it's still voicemail
  const isRealConversation = userSaidMeaningful; // Simplified - must say something meaningful
  
  // "I missed your call" + "leave me" pattern (NO word count limit - always voicemail)
  const hasMissedCallAndLeaveMe = (userText.toLowerCase().includes('missed your call') || userText.toLowerCase().includes('missed the call')) &&
    (userText.toLowerCase().includes('leave me') || userText.toLowerCase().includes('leave your')) &&
    (userText.toLowerCase().includes('call you back') || userText.toLowerCase().includes('call back') || userText.toLowerCase().includes('get back to you') || userText.toLowerCase().includes('regreso la llamada'));

  // "Please leave me your name, number, and a brief message" pattern (NO word count limit - always voicemail)
  const hasLeaveMeNameNumber = (userText.toLowerCase().includes('leave me your name') || userText.toLowerCase().includes('dejame su nombre') || userText.toLowerCase().includes('déjeme su nombre')) &&
    (userText.toLowerCase().includes('number') || userText.toLowerCase().includes('numero') || userText.toLowerCase().includes('número')) &&
    (userText.toLowerCase().includes('brief message') || userText.toLowerCase().includes('mensaje') || userText.toLowerCase().includes('breve mensaje'));

  // Spanish: "déjeme su nombre, número de teléfono y un breve mensaje" + "le regreso la llamada" (NO word count limit - always voicemail)
  const hasSpanishVoicemailPattern = (userText.toLowerCase().includes('déjeme su nombre') || userText.toLowerCase().includes('dejame su nombre')) &&
    (userText.toLowerCase().includes('número') || userText.toLowerCase().includes('numero')) &&
    (userText.toLowerCase().includes('mensaje') || userText.toLowerCase().includes('regreso la llamada'));

  // "Please give me a callback" + short message + "bye" pattern (NO word count limit - always voicemail)
  // This is a voicemail message, not a real conversation
  const hasGiveMeCallbackAndBye = (userText.toLowerCase().includes('give me a callback') || userText.toLowerCase().includes('give me callback') || userText.toLowerCase().includes('give me a call back')) &&
    (userText.toLowerCase().includes('when you get a chance') || userText.toLowerCase().includes('when you get chance') || userText.toLowerCase().includes('get a chance')) &&
    (userText.toLowerCase().includes('bye') || userText.toLowerCase().includes('good day') || userText.toLowerCase().includes('have a good day'));

  // Short message + "callback" + "bye" pattern (voicemail, not real conversation)
  // Note: userWordCount is already defined above (line 1078)
  const hasShortCallbackAndBye = userWordCount <= 15 &&
    (userText.toLowerCase().includes('callback') || userText.toLowerCase().includes('call back')) &&
    (userText.toLowerCase().includes('bye') || userText.toLowerCase().includes('good day') || userText.toLowerCase().includes('have a good day')) &&
    !userText.toLowerCase().includes('interested') && !userText.toLowerCase().includes('tell me') && !userText.toLowerCase().includes('how much');
  
  // If phone number + voicemail pattern detected, it's definitely voicemail (highest priority)
  // This catches cases like "3 7 0 8 4 9 3 can't take your call right now"
  // Also catch "Available" + "Please stay on the line" pattern (Lewis Brown case)
  // Also catch "Is on another line. Just leave your message after the tone." pattern
  // Also catch "Just leave your message after the tone" pattern (even with "No" at start)
  // Otherwise check other voicemail indicators
  const isVoicemail = isPhoneNumberVoicemail ||  // Highest priority - phone number + voicemail phrase
                      hasMissedCallAndLeaveMe ||  // "I missed your call" + "leave me" pattern (NO word count limit)
                      hasLeaveMeNameNumber ||  // "Please leave me your name, number" pattern (NO word count limit)
                      hasSpanishVoicemailPattern ||  // Spanish voicemail pattern (NO word count limit)
                      hasGiveMeCallbackAndBye ||  // "Please give me a callback" + "bye" pattern (NO word count limit)
                      hasShortCallbackAndBye ||  // Short callback + "bye" pattern
                      (hasVoicemailInUserText && !userSaidMeaningful) ||  // User said voicemail phrase but nothing meaningful
                      (hasVoicemailPhrases && !isRealConversation) || 
                      (userOnlyVoicemailPhrases) ||
                      isOnlyAvailable ||  // Single word "Available" is voicemail greeting
                      hasAvailableAndStayOnLine ||  // "Available" + "Please stay on the line" pattern
                      hasAnotherLineAndLeaveMessage ||  // "Is on another line. Just leave your message after the tone." pattern
                      hasJustLeaveMessageAfterTone ||  // "Just leave your message after the tone" pattern (even with "No" at start)
                      hasAfterLeavingMessage ||  // "After leaving a message, you can hang up"
                      hasJustLeaveVoiceMessage ||  // "Just leave a voice messages"
                      hasPressPound ||  // "press pound for more options"
                      hasMailboxFull ||  // "Mailbox is full"
                      hasSmsNotification ||  // "To send an SMS notification"
                      hasPressNumber ||  // "press 5" for SMS notification
                      hasNotHereRightNow ||  // "I'm not here right now"
                      hasCallControl ||  // "call control"
                      hasToGetThrough ||  // "To get through, please press 5"
                      hasNotAcceptingCalls ||  // "not accepting calls"
                      hasNumberReached ||  // "The number you have reached"
                      hasOperatorScreening;  // Operator/receptionist screening (e.g., "Before I try to connect you" + "person you're calling cannot take your call")
  
  // Silence timeout with short call = likely voicemail
  const isSilenceTimeout = endedReason === 'silence-timed-out';
  const isShortCall = (call.duration || 0) < 30;
  const likelyVoicemailByBehavior = isSilenceTimeout && isShortCall && !isRealConversation;
  
  // Check for explicit failed patterns
  const isFailedByText = failedPatterns.some(p => textToCheck.includes(p));
  
  // Very short call where customer hung up without engaging
  const isVeryShortCall = (call.duration || 0) < 15;
  const aiOnlySpoke = transcript.includes('ai:') && userResponses === 0;
  const customerHungUpQuickly = endedReason === 'customer-ended-call' && isVeryShortCall;
  
  // Check if user never responded (0 words) - this is always a failed call
  const userNeverResponded = userWordCount === 0;
  
  // Determine call category
  const isVoicemailFinal = isVoicemail || likelyVoicemailByBehavior || hasIvrPattern;
  
  // Failed call: no score (null) OR explicit failure patterns
  // OR user never responded (no answer at all)
  const isFailedCall = isFailedByText || 
    effectiveScore === null ||  // No score means failed to connect
    userNeverResponded ||  // User never responded → failed call
    (customerHungUpQuickly && !isRealConversation) ||
    (aiOnlySpoke && isVeryShortCall);
  
  // Determine what to display in score badge
  // V = Voicemail (grey), F = Failed (grey), HR = Hard Reject (red), SR = Soft Reject (yellow), 7-10 = Score (green)
  let scoreDisplay: string;
  let badgeColor: { bg: string; text: string };
  
  // If evaluated by our AI system, trust its outcome/score directly (skip pattern matching)
  if (isOurEvaluation && structuredData?.successEvaluation) {
    const successEval = structuredData.successEvaluation as Record<string, unknown>;
    const aiScore = typeof successEval.score === 'number' ? successEval.score : null;
    const aiOutcome = (successEval.outcome as string || '').toLowerCase();
    
    if (aiOutcome === 'voicemail') {
      scoreDisplay = "V";
      badgeColor = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" };
    } else if (aiOutcome === 'no_answer' || aiOutcome === 'wrong_number' || aiOutcome === 'busy') {
      scoreDisplay = "F";
      badgeColor = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" };
    } else if (aiScore !== null && aiScore <= 2) {
      scoreDisplay = "HR";
      badgeColor = { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" };
    } else if (aiScore !== null && aiScore <= 6) {
      scoreDisplay = "SR";
      badgeColor = { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" };
    } else if (aiScore !== null && aiScore >= 7) {
      scoreDisplay = aiScore.toString();
      badgeColor = { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" };
    } else {
      // Fallback for our evaluation without clear score
      scoreDisplay = "F";
      badgeColor = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" };
    }
  } else if (isVoicemailFinal) {
    scoreDisplay = "V";
    badgeColor = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" };
  } else if (isFailedCall) {
    scoreDisplay = "F";
    badgeColor = { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" };
  } else {
    // Legacy: Show score with system: HR (1-2), SR (3-6), or score (7-10)
    const displayScore = effectiveScore || 5;
    
    if (displayScore <= 2) {
      scoreDisplay = "HR";
      badgeColor = { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" };
    } else if (displayScore <= 6) {
      scoreDisplay = "SR";
      badgeColor = { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" };
    } else {
      scoreDisplay = displayScore.toString();
      badgeColor = { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" };
    }
  }
  
  // Get effective values (override if exists, otherwise original)
  const effectiveSummary = (overrides?.summary !== undefined) 
    ? overrides.summary 
    : call.summary;
  const effectiveEvaluationSummary = (overrides?.evaluation_summary !== undefined)
    ? overrides.evaluation_summary
    : call.evaluation_summary;
  const effectiveSentiment = (overrides?.sentiment !== undefined)
    ? overrides.sentiment
    : call.sentiment;
  
  const validSummary = getValidEvaluationSummary(effectiveEvaluationSummary);

  const contentTranslation = useCallContentTranslation({
    callId: call.id,
    enabled: expanded && currentLang === "tr",
    language: currentLang,
    summaryRaw: effectiveSummary,
    transcriptRaw: call.transcript,
    evaluationSummaryRaw: effectiveEvaluationSummary,
  });

  const displaySummaryBody =
    currentLang === "tr" && contentTranslation.translations?.summary
      ? cleanCallSummary(contentTranslation.translations.summary)
      : effectiveSummary
        ? cleanCallSummary(effectiveSummary)
        : null;

  const displayTranscript =
    currentLang === "tr" && contentTranslation.translations?.transcript
      ? contentTranslation.translations.transcript
      : call.transcript;
  
  // Get evaluation metadata (structuredData and evaluationSource already declared above)
  const evaluatedAt = (structuredData as { evaluatedAt?: string } | undefined)?.evaluatedAt;
  
  // Generate actionable sales advice based on score
  const salesAdvice = getSalesAdvice(
    scoreDisplay,
    call.transcript || '',
    userText,
    lang
  );

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div 
        className="px-4 sm:px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Mobile Layout */}
        <div className="sm:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {callerDisplay.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {callerDisplay.phone}
              </p>
              <div className="flex items-center gap-3 mt-2">
                {call.transcript && (
                  <button 
                    onClick={handleReEvaluate}
                    disabled={isReEvaluating}
                    className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={currentLang === "tr" ? "Yeniden Değerlendir" : "Re-evaluate"}
                  >
                    {isReEvaluating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(call.created_at), "MMM d, HH:mm")}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {formatDuration(call.duration)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Score badge - V (voicemail), F (failed), L (lead), N (neutral) */}
              <span className={cn(
                "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold",
                badgeColor.bg,
                badgeColor.text
              )}>
                {scoreDisplay}
              </span>
              {call.recording_url && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(call);
                  }}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              <ChevronDown className={cn(
                "w-4 h-4 text-gray-400 transition-transform",
                expanded && "rotate-180"
              )} />
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center gap-4">
          {/* Index/Number */}
          <div className="w-8 text-center text-sm text-gray-400 dark:text-gray-500">
            #
          </div>
          
          {/* Customer Info */}
          <div className="w-64">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {callerDisplay.name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {callerDisplay.phone}
            </p>
          </div>
          
          {/* Score - V (voicemail), F (failed), L (lead), N (neutral) */}
          <div className="w-16 flex justify-center">
            <span className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold",
              badgeColor.bg,
              badgeColor.text
            )}>
              {scoreDisplay}
            </span>
          </div>
          
          {/* Duration */}
          <div className="w-20 text-sm text-gray-600 dark:text-gray-300 text-center font-mono tabular-nums">
            {formatDuration(call.duration)}
          </div>
          
          {/* Date */}
          <div className="w-28 text-sm text-gray-500 dark:text-gray-400 text-center">
            {format(new Date(call.created_at), "MMM d, HH:mm")}
          </div>
          
          {/* Actions */}
          <div className="w-28 flex items-center justify-end gap-2">
            {call.transcript && (
              <button 
                onClick={handleReEvaluate}
                disabled={isReEvaluating}
                className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={currentLang === "tr" ? "Yeniden Değerlendir" : "Re-evaluate"}
              >
                {isReEvaluating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
              </button>
            )}
            {call.recording_url && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(call);
                }}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
            <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 sm:px-6 pb-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="sm:ml-12 space-y-4">
            {/* Summary */}
            {displaySummaryBody && (
          <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1 flex items-center gap-2">
                  {currentLang === "tr" ? "Özet" : "Summary"}
                  {currentLang === "tr" && contentTranslation.loading && (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" aria-hidden />
                  )}
                </p>
                {contentTranslation.error && currentLang === "tr" && (
                  <p className="text-xs text-red-500 dark:text-red-400 mb-1">{contentTranslation.error}</p>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">{displaySummaryBody}</p>
          </div>
            )}
            
            {/* AI Evaluation - Always show since we always have a score now */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{callLabels.callStatus[currentLang]}</p>
                {evaluatedAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {currentLang === "tr" ? "Değerlendirme: " : "Evaluated: "}
                    {format(new Date(evaluatedAt), currentLang === "tr" ? "dd.MM.yyyy HH:mm" : "MMM d, HH:mm")}
                    {evaluationSource === 'our_evaluation_only' && (
                      <span className="ml-1 text-blue-500" title={currentLang === "tr" ? "Bizim sistem" : "Our system"}>✓</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-4">
                {/* Status Display - V (voicemail), F (failed), or 1-10 score */}
                <div className={cn(
                  "flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl",
                  badgeColor.bg
                )}>
                  <span className={cn("text-xl sm:text-2xl font-bold", badgeColor.text)}>
                    {scoreDisplay}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {scoreDisplay === 'V' ? (lang === "tr" ? "oicemail" : "oicemail") :
                     scoreDisplay === 'F' ? (lang === "tr" ? "ailed" : "ailed") : "/10"}
                  </span>
          </div>
                
                {/* Sales Advice */}
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{salesAdvice}</p>
                  
                  {/* Status label */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      badgeColor.bg,
                      badgeColor.text
                    )}>
                      {scoreDisplay === 'V' ? callLabels.voicemail[currentLang] :
                       scoreDisplay === 'F' ? callLabels.notReached[currentLang] :
                       Number(scoreDisplay) >= 8 ? callLabels.hotLead[currentLang] :
                       Number(scoreDisplay) >= 6 ? callLabels.interested[currentLang] :
                       Number(scoreDisplay) >= 4 ? callLabels.neutral[currentLang] : callLabels.notInterested[currentLang]}
                    </span>
                    {effectiveSentiment && effectiveSentiment !== 'neutral' && (
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize",
                        effectiveSentiment === 'positive' 
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                      )}>
                        {effectiveSentiment}
                      </span>
                    )}
        </div>
      </div>
              </div>
            </div>
            
            {/* Transcript */}
            {call.transcript && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase flex items-center gap-2">
                    {callLabels.transcript[currentLang]}
                    {currentLang === "tr" && contentTranslation.loading && (
                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" aria-hidden />
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {evaluatedAt && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {currentLang === "tr" ? "Son değerlendirme: " : "Last evaluated: "}
                        {format(new Date(evaluatedAt), currentLang === "tr" ? "dd.MM.yyyy HH:mm" : "MMM d, HH:mm")}
                      </span>
                    )}
                    <button
                      onClick={handleReEvaluate}
                      disabled={isReEvaluating}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isReEvaluating ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{currentLang === "tr" ? "Değerlendiriliyor..." : "Evaluating..."}</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3 h-3" />
                          <span>{currentLang === "tr" ? "Yeniden Değerlendir" : "Re-evaluate"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  {contentTranslation.error && currentLang === "tr" && (
                    <p className="text-xs text-red-500 dark:text-red-400 mb-2">{contentTranslation.error}</p>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm">{displayTranscript}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SortOption = "latest" | "earliest" | "score_high" | "score_low";
  
function CallsPageContent() {
  const searchParams = useSearchParams();
  const isMockMode = searchParams.get("mock") === "true";
  const { user, isLoading: authLoading } = useAuth();
  const { t, language } = useTranslation("calls");
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("latest");

  // Update a specific call in the calls list
  const handleCallUpdated = useCallback((callId: string, updatedCall: Call) => {
    setCalls(prevCalls => {
      const updatedCalls = prevCalls.map(c => c.id === callId ? updatedCall : c);
      return updatedCalls;
    });
    setFilteredCalls(prevFiltered => {
      const updatedFiltered = prevFiltered.map(c => c.id === callId ? updatedCall : c);
      return updatedFiltered;
    });
    console.log(`[CallsPage] Updated call ${callId} in state`);
  }, []);

  // Mock data for mock mode - comprehensive list with proper scoring
  const mockCalls: Call[] = [
    {
      id: "1",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-1",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI calling. How can I help you today? User: Hi, I'm interested in scheduling an appointment. AI: Great! When would be convenient for you? User: Tomorrow afternoon would work. AI: Perfect, I can schedule you for 2:00 PM tomorrow. User: That sounds great, thank you!",
      summary: "New appointment scheduled with John Doe for tomorrow at 2:00 PM",
      sentiment: "positive",
      duration: 245,
      type: "appointment",
      caller_phone: "+1234567890",
      caller_name: "John Doe",
      evaluation_summary: "High interest",
      evaluation_score: 8,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "2",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-2",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. How can I assist you? User: I'd like to know about your services and pricing. AI: We offer several packages. User: Can you tell me more about the premium option? AI: The premium package includes full consultation and follow-up. User: Okay, I'll think about it. Thanks.",
      summary: "Inquiry about services and pricing",
      sentiment: "neutral",
      duration: 180,
      type: "inquiry",
      caller_phone: "+1234567891",
      caller_name: "Jane Smith",
      evaluation_summary: "Neutral interest",
      evaluation_score: 6,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "3",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-3",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Good morning! This is Volina AI calling. User: Hi there! AI: I'm calling to confirm your appointment for next week. User: Yes, I'm very excited! AI: Great! The appointment is scheduled for Tuesday at 10 AM. User: Perfect, I'll be there. Thank you so much!",
      summary: "Appointment confirmed with Sarah Johnson for next week",
      sentiment: "positive",
      duration: 320,
      type: "appointment",
      caller_phone: "+1234567892",
      caller_name: "Sarah Johnson",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "4",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-4",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I need to reschedule my appointment. AI: No problem, when would work better? User: Next Friday at 3 PM would be perfect. AI: I've rescheduled you for Friday at 3 PM. User: Thank you!",
      summary: "Appointment rescheduled with Michael Brown",
      sentiment: "positive",
      duration: 195,
      type: "appointment",
      caller_phone: "+1234567893",
      caller_name: "Michael Brown",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "5",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-5",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Emily, this is Volina AI following up. User: Hi, thanks for calling. AI: I wanted to discuss treatment options with you. User: Yes, I have some questions. AI: Of course, what would you like to know? User: How long does the procedure take? AI: Typically about 2 hours. User: And what about recovery time? AI: Most patients are back to normal within a week. User: That sounds good, I'm very interested.",
      summary: "Follow-up call with Emily Davis",
      sentiment: "positive",
      duration: 420,
      type: "follow_up",
      caller_phone: "+1234567894",
      caller_name: "Emily Davis",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "6",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-6",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I'm calling about pricing. AI: I'd be happy to help. User: What are your payment options? AI: We offer several financing plans. User: Can you tell me more? AI: Yes, we have monthly payment plans available. User: Okay, I'll consider it.",
      summary: "Pricing inquiry from Robert Wilson",
      sentiment: "neutral",
      duration: 280,
      type: "inquiry",
      caller_phone: "+1234567895",
      caller_name: "Robert Wilson",
      evaluation_summary: "Moderate interest",
      evaluation_score: 5,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "7",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-7",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I need to cancel my appointment. AI: I'm sorry to hear that. User: I have a scheduling conflict. AI: Would you like to reschedule? User: Maybe next month. AI: I can help with that. User: Thanks, I'll call back.",
      summary: "Appointment cancellation from Lisa Anderson",
      sentiment: "neutral",
      duration: 150,
      type: "cancellation",
      caller_phone: "+1234567896",
      caller_name: "Lisa Anderson",
      evaluation_summary: "Neutral",
      evaluation_score: 4,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "8",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-8",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hello, I'm interested in your services. AI: Great! What would you like to know? User: I'd like to schedule a consultation. AI: I can help with that. When works for you? User: Next week would be perfect. AI: I've scheduled you for next Tuesday. User: Excellent, thank you!",
      summary: "New inquiry from David Martinez",
      sentiment: "positive",
      duration: 365,
      type: "inquiry",
      caller_phone: "+1234567897",
      caller_name: "David Martinez",
      evaluation_summary: "High interest",
      evaluation_score: 8,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "9",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-9",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Jennifer, this is Volina AI. User: Hi! AI: I'm calling to confirm your appointment for tomorrow at 10 AM. User: Yes, I'm all set and very excited! AI: Perfect, see you tomorrow. User: Thank you!",
      summary: "Appointment confirmation with Jennifer Taylor",
      sentiment: "positive",
      duration: 120,
      type: "appointment",
      caller_phone: "+1234567898",
      caller_name: "Jennifer Taylor",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "10",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-10",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Christopher, this is Volina AI following up. User: Hi, thanks for calling. AI: How are you feeling after the consultation? User: Good, I have some questions. AI: I'm here to help. User: What's the recovery time? AI: Typically 5-7 days. User: And what about aftercare? AI: We'll provide detailed instructions. User: Perfect, thanks!",
      summary: "Follow-up call with Christopher Lee",
      sentiment: "positive",
      duration: 380,
      type: "follow_up",
      caller_phone: "+1234567899",
      caller_name: "Christopher Lee",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "11",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-11",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, are there any special promotions? AI: Yes, we have current offers. User: Can you tell me more? AI: We have a 20% discount this month. User: That's interesting, I'll think about it.",
      summary: "Promotion inquiry from Amanda White",
      sentiment: "neutral",
      duration: 220,
      type: "inquiry",
      caller_phone: "+1234567900",
      caller_name: "Amanda White",
      evaluation_summary: "Moderate interest",
      evaluation_score: 5,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "12",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-12",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello James, this is Volina AI. User: Hi! I'm very satisfied with my previous service. AI: That's wonderful to hear! User: I'd like to schedule another appointment. AI: I'd be happy to help. When works for you? User: Next month would be perfect. AI: I've scheduled you for next month. User: Thank you so much!",
      summary: "Follow-up appointment with James Harris",
      sentiment: "positive",
      duration: 195,
      type: "appointment",
      caller_phone: "+1234567901",
      caller_name: "James Harris",
      evaluation_summary: "Very interested",
      evaluation_score: 10,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "13",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-13",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I'm interested in learning more. AI: I'd be happy to help. User: What services do you offer? AI: We offer comprehensive consultation services. User: I'd like to schedule a consultation. AI: I've scheduled you for next week. User: Perfect, thank you!",
      summary: "New inquiry from Patricia Clark",
      sentiment: "positive",
      duration: 310,
      type: "inquiry",
      caller_phone: "+1234567902",
      caller_name: "Patricia Clark",
      evaluation_summary: "High interest",
      evaluation_score: 8,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "14",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-14",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Daniel, this is Volina AI. User: Hi, I'd like to discuss treatment options. AI: I'm here to help. User: What are the different options available? AI: We have several treatment plans. User: Can you explain each one? AI: Of course. The first option is... User: That sounds interesting. AI: Would you like to schedule a consultation? User: Yes, absolutely!",
      summary: "Treatment discussion with Daniel Lewis",
      sentiment: "positive",
      duration: 450,
      type: "inquiry",
      caller_phone: "+1234567903",
      caller_name: "Daniel Lewis",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "15",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-15",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Michelle, this is Volina AI. User: Hi! AI: I'm calling to remind you about tomorrow's appointment. User: Yes, I'll be there. AI: Perfect, see you tomorrow. User: Thank you!",
      summary: "Appointment reminder with Michelle Walker",
      sentiment: "positive",
      duration: 95,
      type: "appointment",
      caller_phone: "+1234567904",
      caller_name: "Michelle Walker",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "16",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-16",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I have questions about insurance. AI: I can help with that. User: Do you accept my insurance? AI: We accept most major insurance plans. User: What about payment plans? AI: We offer flexible payment options. User: Okay, I'll check with my insurance.",
      summary: "Insurance inquiry from Mark Young",
      sentiment: "neutral",
      duration: 275,
      type: "inquiry",
      caller_phone: "+1234567905",
      caller_name: "Mark Young",
      evaluation_summary: "Moderate interest",
      evaluation_score: 6,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "17",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-17",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Nancy, this is Volina AI following up. User: Hi, thanks for calling. AI: How are you feeling after treatment? User: I'm very satisfied! AI: That's great to hear. User: I'm actually considering additional services. AI: I'd be happy to discuss options. User: Yes, let's schedule something.",
      summary: "Post-treatment follow-up with Nancy King",
      sentiment: "positive",
      duration: 340,
      type: "follow_up",
      caller_phone: "+1234567906",
      caller_name: "Nancy King",
      evaluation_summary: "Very interested",
      evaluation_score: 9,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "18",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-18",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi, I'm interested in scheduling a consultation. AI: Great! When works for you? User: Next week would be perfect. AI: I've scheduled you for next Tuesday. User: Excellent, I'm very excited!",
      summary: "New inquiry from Kevin Wright",
      sentiment: "positive",
      duration: 290,
      type: "inquiry",
      caller_phone: "+1234567907",
      caller_name: "Kevin Wright",
      evaluation_summary: "High interest",
      evaluation_score: 8,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "19",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-19",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Laura, this is Volina AI. User: Hi, I need to reschedule. AI: No problem, when works better? User: Next week would be great. AI: I've rescheduled you. User: Perfect, thank you!",
      summary: "Appointment rescheduled with Laura Scott",
      sentiment: "positive",
      duration: 165,
      type: "appointment",
      caller_phone: "+1234567908",
      caller_name: "Laura Scott",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "20",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-20",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello Steven, this is Volina AI. User: Hi, I have questions about preparation. AI: I'm here to help. User: What should I do before the appointment? AI: Please arrive 15 minutes early. User: Any dietary restrictions? AI: Just avoid heavy meals. User: Perfect, thanks!",
      summary: "Pre-appointment inquiry from Steven Green",
      sentiment: "positive",
      duration: 210,
      type: "inquiry",
      caller_phone: "+1234567909",
      caller_name: "Steven Green",
      evaluation_summary: "Interested",
      evaluation_score: 7,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Add a voicemail call
    {
      id: "21",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-21",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI calling. Please leave a message after the beep. I missed your call, please leave me your name, number, and a brief message. I will call you back as soon as possible.",
      summary: "Voicemail left for Thomas Moore",
      sentiment: "neutral",
      duration: 45,
      type: "inquiry",
      caller_phone: "+1234567910",
      caller_name: "Thomas Moore",
      evaluation_summary: "Voicemail",
      evaluation_score: null,
      tags: [],
      metadata: { endedReason: "voicemail" },
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Add a low score call
    {
      id: "22",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-22",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Not interested. AI: I understand. User: No thanks. AI: Have a good day. User: Bye.",
      summary: "Low interest call from Rachel Adams",
      sentiment: "negative",
      duration: 60,
      type: "inquiry",
      caller_phone: "+1234567911",
      caller_name: "Rachel Adams",
      evaluation_summary: "Not interested",
      evaluation_score: 2,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Add a medium score call
    {
      id: "23",
      user_id: "mock-user",
      vapi_call_id: "mock-vapi-23",
      appointment_id: null,
      recording_url: null,
      transcript: "AI: Hello, this is Volina AI. User: Hi. AI: How can I help? User: Just calling to get information. AI: I can provide that. User: Okay, send me some info. AI: I'll send it to you. User: Thanks.",
      summary: "Information request from Brian Turner",
      sentiment: "neutral",
      duration: 120,
      type: "inquiry",
      caller_phone: "+1234567912",
      caller_name: "Brian Turner",
      evaluation_summary: "Neutral",
      evaluation_score: 3,
      tags: [],
      metadata: { endedReason: "completed" },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const loadMockData = useCallback(() => {
    setIsLoading(true);
    try {
      // Sort by created_at descending (latest first)
      const sortedCalls = [...mockCalls].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setCalls(sortedCalls);
      setFilteredCalls(sortedCalls);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mockCalls is a constant array, no need to include in deps

  const loadCalls = useCallback(async (forceRefresh = false) => {
    if (isMockMode) {
      loadMockData();
      return;
    }
    
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Add timestamp to bypass cache if forceRefresh is true
      const cacheBuster = forceRefresh ? `&_t=${Date.now()}` : '';
      const response = await fetch(`/api/dashboard/calls?days=365&userId=${user.id}${cacheBuster}`);
      if (response.ok) {
        const data = await response.json();
        
        // Log debug info in browser console
        if (data.debug) {
          console.group('📊 [Calls Dashboard] Debug Info');
          console.log('📥 Total calls from DB:', data.debug.totalFromDB);
          console.log('✅ Filtered calls (visible):', data.debug.filteredCount);
          console.log('❌ Removed by filters:', data.debug.removedCount);
          if (data.debug.assistantIdCounts) {
            console.log('🔍 Calls by assistant_id:', data.debug.assistantIdCounts.byAssistantId);
            console.log('📞 Calls without assistant_id (legacy):', data.debug.assistantIdCounts.withoutAssistantId);
            console.log('🎯 Expected assistant_id:', data.debug.assistantIdCounts.expectedAssistantId);
          }
          console.groupEnd();
        }
        
        if (data.success && data.data) {
          const transformedCalls: Call[] = data.data.map((call: {
            id: string;
            vapi_call_id: string;
            recording_url: string | null;
            transcript: string | null;
            summary: string | null;
            sentiment: string | null;
            duration: number | null;
            type: string;
            caller_phone: string | null;
            caller_name: string | null;
            evaluation_summary: string | null;
            evaluation_score: number | string | null;
            metadata: Record<string, unknown> | null;
            created_at: string;
            updated_at: string;
          }) => {
            // Use parseScore helper to handle all edge cases (string, number, null, undefined)
            const parsedScore = parseScore(call.evaluation_score);

            return {
            id: call.id,
            user_id: "",
            vapi_call_id: call.vapi_call_id,
            appointment_id: null,
            recording_url: call.recording_url,
            transcript: call.transcript,
            summary: call.summary,
            sentiment: call.sentiment as Call["sentiment"],
            duration: call.duration,
            type: call.type as Call["type"],
            caller_phone: call.caller_phone,
            caller_name: call.caller_name,
            evaluation_summary: call.evaluation_summary,
              evaluation_score: parsedScore,
              tags: [],
              metadata: call.metadata || {},
            created_at: call.created_at,
            updated_at: call.updated_at,
            };
          });
          setCalls(transformedCalls);
          setFilteredCalls(transformedCalls);
        } else {
          setCalls([]);
          setFilteredCalls([]);
        }
      } else {
        console.error("Failed to load calls:", response.statusText);
        setCalls([]);
        setFilteredCalls([]);
      }
    } catch (error) {
      console.error("Error loading calls:", error);
      setCalls([]);
      setFilteredCalls([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isMockMode, loadMockData]);

  useEffect(() => {
    if (isMockMode) {
      loadMockData();
      return;
    }
    
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (user?.id) {
      loadCalls();
    } else {
      setIsLoading(false);
      setCalls([]);
      setFilteredCalls([]);
    }
  }, [user?.id, authLoading, loadCalls, isMockMode, loadMockData]);

  // Filter and sort calls
  useEffect(() => {
    let filtered = [...calls];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(call => 
        call.caller_name?.toLowerCase().includes(query) ||
        call.caller_phone?.includes(query) ||
        call.summary?.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (selectedDate) {
      const filterDate = parseISO(selectedDate);
      const dayStart = startOfDay(filterDate);
      const dayEnd = endOfDay(filterDate);
      filtered = filtered.filter(call => {
        const callDate = new Date(call.created_at);
        return isWithinInterval(callDate, { start: dayStart, end: dayEnd });
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "latest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "earliest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "score_high":
          // Sort by status: L (leads) first, then N, F, V
          return getCallSortKey(b) - getCallSortKey(a);
        case "score_low":
          // Sort by status: V (voicemail) first, then F, N, L
          return getCallSortKey(a) - getCallSortKey(b);
        default:
          return 0;
      }
    });
    
    setFilteredCalls(filtered);
  }, [calls, searchQuery, selectedDate, sortBy]);

  const handleRefresh = async () => {
    if (!user?.id) return;
    setIsRefreshing(true);
    try {
      // Pull latest calls from VAPI into DB first, in case the webhook
      // missed any. Only last 2 days — recent gaps are what matter; older
      // calls should already be synced. Failures here are non-fatal.
      try {
        await fetch(`/api/vapi/sync?userId=${user.id}&days=2`, {
          method: "POST",
        });
      } catch (syncError) {
        console.warn("VAPI sync failed, continuing with DB reload:", syncError);
      }
      await loadCalls(true);
    } catch (error) {
      console.error("Error during refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearAll = async () => {
    if (!user?.id) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/dashboard/calls?userId=${user.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
      const data = await response.json();
      if (data.success) {
          setCalls([]);
          setFilteredCalls([]);
          setShowClearAllDialog(false);
      } else {
          alert("Failed to delete calls: " + (data.error || "Unknown error"));
        }
      } else {
        alert("Failed to delete calls. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting calls:", error);
      alert("An error occurred while deleting calls. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Stats
  const totalCalls = calls.length;
  
  // Calculate answered calls (F ve V harici - excluding F and V)
  const answeredCalls = calls.filter(c => {
    const scoreResult = computeCallScore({
      evaluation_score: c.evaluation_score,
      transcript: c.transcript,
      summary: c.summary,
      evaluation_summary: c.evaluation_summary,
      duration: c.duration,
      sentiment: c.sentiment,
      metadata: c.metadata,
    });
    return scoreResult.display !== "F" && scoreResult.display !== "V";
  }).length;
  
  // Calculate interested calls (7 üstü - 7 or higher)
  const interestedCalls = calls.filter(c => {
    const scoreResult = computeCallScore({
      evaluation_score: c.evaluation_score,
      transcript: c.transcript,
      summary: c.summary,
      evaluation_summary: c.evaluation_summary,
      duration: c.duration,
      sentiment: c.sentiment,
      metadata: c.metadata,
    });
    return scoreResult.numericScore !== null && scoreResult.numericScore >= 7;
  }).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
                </div>
              <Button 
                variant="outline" 
                onClick={handleRefresh} 
                disabled={isRefreshing}
          className="border-gray-200 dark:border-gray-700 w-full sm:w-auto"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
          {t("refresh")}
              </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("allCalls")}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{totalCalls}</p>
      </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("answered")}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{answeredCalls}</p>
          </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t("interested")}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{interestedCalls}</p>
            </div>
            </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
            placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-gray-200 dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

        {/* Date Picker */}
        <div className="relative w-full sm:w-auto">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none z-10" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="pl-10 pr-3 w-full sm:w-44 border-gray-200 dark:border-gray-700 dark:bg-gray-800 [&::-webkit-calendar-picker-indicator]:dark:invert"
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}
      </div>

        {/* Sort Dropdown */}
        <div className="w-full sm:w-auto">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-52 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
              <ArrowUpDown className="w-4 h-4 mr-2 text-gray-400" />
              <SelectValue placeholder={t("sortBy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{t("latestFirst")}</SelectItem>
              <SelectItem value="earliest">{t("earliestFirst")}</SelectItem>
              <SelectItem value="score_high">{t("highestScore")}</SelectItem>
              <SelectItem value="score_low">{t("lowestScore")}</SelectItem>
            </SelectContent>
          </Select>
            </div>
          </div>

      {/* Calls Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Table Header - Hidden on mobile */}
        <div className="hidden sm:block px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <div className="w-8 text-center">#</div>
            <div className="w-64">{t("customer")}</div>
            <div className="w-16 text-center">{t("score")}</div>
            <div className="w-20 text-center">{t("duration")}</div>
            <div className="w-28 text-center">{t("date")}</div>
            <div className="w-20"></div>
                          </div>
                        </div>

        {/* Table Body */}
        {filteredCalls.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Phone className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">{t("noCalls")}</p>
                            </div>
        ) : (
                              <div>
            {filteredCalls.map((call) => (
              <CallRow 
                key={call.id} 
                call={call} 
                lang={language}
                onPlay={(call) => {
                  setSelectedCall(call);
                  setIsPlayerOpen(true);
                }}
                onUpdate={(forceRefresh?: boolean) => loadCalls(forceRefresh)}
                onCallUpdated={handleCallUpdated}
              />
            ))}
                          </div>
                        )}
                              </div>

      {/* Audio Player Modal */}
      <AudioPlayer
        call={selectedCall}
        isOpen={isPlayerOpen}
        onClose={() => {
          setIsPlayerOpen(false);
          setSelectedCall(null);
        }}
      />

      {/* Clear All Confirmation Dialog */}
      <Dialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteAll")}</DialogTitle>
            <DialogDescription>
              {t("confirmDelete")} ({calls.length})
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAllDialog(false)} disabled={isDeleting}>
              {t("cancel")}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleClearAll} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("deleteAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <CallsPageContent />
    </Suspense>
  );
}
