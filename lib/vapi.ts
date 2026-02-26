// ===========================================
// VOLINA AI - Vapi.ai Client Configuration
// ===========================================

import Vapi from '@vapi-ai/web';

// Singleton instance for the Vapi client
let vapiInstance: Vapi | null = null;

// Vapi event types
export type VapiEventType = 
  | 'call-start'
  | 'call-end'
  | 'speech-start'
  | 'speech-end'
  | 'volume-level'
  | 'message'
  | 'error';

export interface VapiCallbacks {
  onCallStart?: () => void;
  onCallEnd?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVolumeLevel?: (volume: number) => void;
  onMessage?: (message: unknown) => void;
  onError?: (error: Error) => void;
}

// Demo mode flag
export const isVapiDemoMode = !process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

// Get or create Vapi instance
export function getVapiInstance(): Vapi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  
  if (!publicKey) {
    console.warn('Vapi running in demo mode - no API key configured');
    return null;
  }

  if (vapiInstance) {
    return vapiInstance;
  }

  vapiInstance = new Vapi(publicKey);
  return vapiInstance;
}

// Start a call with the Volina AI assistant
export async function startVoiceCall(callbacks?: VapiCallbacks): Promise<void> {
  const vapi = getVapiInstance();
  
  if (!vapi) {
    // Demo mode - simulate a call
    console.warn('Vapi not configured - running in demo mode');
    callbacks?.onError?.(new Error('Vapi API key not configured. Add NEXT_PUBLIC_VAPI_PUBLIC_KEY to enable voice calls.'));
    return;
  }

  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  // Register event listeners
  if (callbacks?.onCallStart) {
    vapi.on('call-start', callbacks.onCallStart);
  }
  if (callbacks?.onCallEnd) {
    vapi.on('call-end', callbacks.onCallEnd);
  }
  if (callbacks?.onSpeechStart) {
    vapi.on('speech-start', callbacks.onSpeechStart);
  }
  if (callbacks?.onSpeechEnd) {
    vapi.on('speech-end', callbacks.onSpeechEnd);
  }
  if (callbacks?.onVolumeLevel) {
    vapi.on('volume-level', callbacks.onVolumeLevel);
  }
  if (callbacks?.onMessage) {
    vapi.on('message', callbacks.onMessage);
  }
  if (callbacks?.onError) {
    vapi.on('error', callbacks.onError);
  }

  // Start the call
  if (assistantId) {
    await vapi.start(assistantId);
  } else {
    // Use inline assistant config if no assistant ID is provided
    await vapi.start({
      name: 'Volina AI',
      firstMessage: "Hello! This is Volina AI. I'm here to help you schedule appointments or answer any questions you have. How can I assist you today?",
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en-US',
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are Volina AI, a professional and friendly voice assistant for a healthcare clinic. Your primary responsibilities are:

1. Schedule appointments with doctors (Dr. Sarah Chen - Cardiology, Dr. Michael Torres - Neurology, Dr. Emily Watson - Dermatology)
2. Answer general inquiries about the clinic
3. Handle appointment cancellations and rescheduling
4. Provide basic information about available services

Guidelines:
- Be warm, professional, and efficient
- Confirm all appointment details before finalizing
- If you can't help with something, politely explain and offer alternatives
- Keep responses concise but helpful
- Always verify patient contact information for appointments`,
          },
        ],
      },
      voice: {
        provider: 'playht',
        voiceId: 'jennifer',
      },
    });
  }
}

// Stop the current call
export function stopVoiceCall(): void {
  const vapi = getVapiInstance();
  
  if (vapi) {
    vapi.stop();
  }
}

// Check if a call is currently active
export function isCallActive(): boolean {
  const vapi = getVapiInstance();
  // Note: This is a simplified check - the actual Vapi SDK may have different methods
  return vapi !== null;
}

// Clean up event listeners
export function cleanupVapiListeners(): void {
  const vapi = getVapiInstance();
  
  if (vapi) {
    vapi.removeAllListeners();
  }
}

// Mute/unmute the microphone
export function setMuted(muted: boolean): void {
  const vapi = getVapiInstance();
  
  if (vapi) {
    vapi.setMuted(muted);
  }
}

// Get the current mute state
export function isMuted(): boolean {
  const vapi = getVapiInstance();
  
  if (vapi) {
    return vapi.isMuted();
  }
  
  return false;
}

// Send a message to the assistant
export function sendMessage(message: string): void {
  const vapi = getVapiInstance();
  
  if (vapi) {
    vapi.send({
      type: 'add-message',
      message: {
        role: 'user',
        content: message,
      },
    });
  }
}

