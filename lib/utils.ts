// ===========================================
// VOLINA AI - Utility Functions
// ===========================================

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO, isToday, isTomorrow, isYesterday } from 'date-fns';

// Tailwind CSS class merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ===========================================
// Date & Time Formatting
// ===========================================

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatSmartDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  
  if (isToday(d)) {
    return `Today at ${format(d, 'h:mm a')}`;
  }
  if (isTomorrow(d)) {
    return `Tomorrow at ${format(d, 'h:mm a')}`;
  }
  if (isYesterday(d)) {
    return `Yesterday at ${format(d, 'h:mm a')}`;
  }
  
  return format(d, 'MMM d at h:mm a');
}

export function getTimeSlots(startHour = 9, endHour = 18, intervalMinutes = 30): string[] {
  const slots: string[] = [];
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(time);
    }
  }
  
  return slots;
}

export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ===========================================
// Duration Formatting
// ===========================================

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}

export function formatDurationLong(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

// ===========================================
// Phone Number Formatting
// ===========================================

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as US phone number
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
}

// ===========================================
// Sentiment Helpers
// ===========================================

export function getSentimentColor(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-600 bg-green-50';
    case 'negative':
      return 'text-red-600 bg-red-50';
    case 'neutral':
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getSentimentIcon(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return '😊';
    case 'negative':
      return '😟';
    case 'neutral':
    default:
      return '😐';
  }
}

// ===========================================
// Status Helpers
// ===========================================

export function getStatusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'confirmed':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'completed':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    case 'cancelled':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'no_show':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function getCallTypeLabel(type: string): string {
  switch (type) {
    case 'appointment':
      return 'Appointment';
    case 'inquiry':
      return 'Inquiry';
    case 'follow_up':
      return 'Follow Up';
    case 'cancellation':
      return 'Cancellation';
    default:
      return type;
  }
}

export function getCallTypeColor(type: string): string {
  switch (type) {
    case 'appointment':
      return 'text-primary-600 bg-primary-50';
    case 'inquiry':
      return 'text-purple-600 bg-purple-50';
    case 'follow_up':
      return 'text-amber-600 bg-amber-50';
    case 'cancellation':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

// ===========================================
// Percentage & Number Formatting
// ===========================================

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

// ===========================================
// String Utilities
// ===========================================

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Cleans markdown-formatted call summaries from VAPI into plain text
 * Removes bullet points, bold text, and formats into readable sentences
 */
export function cleanCallSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  
  let cleaned = summary;
  
  // Remove "Here's a summary of the call:" prefix
  cleaned = cleaned.replace(/^Here'?s a summary of the call:?\s*/i, '');
  
  // Remove markdown bullet points and asterisks
  cleaned = cleaned.replace(/\*\s+\*\*/g, ''); // "* **" at start of bullets
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold text** -> bold text
  cleaned = cleaned.replace(/^\s*[\*\-•]\s*/gm, ''); // Remove bullet markers at start of lines
  cleaned = cleaned.replace(/\s*[\*\-•]\s+/g, ' '); // Remove inline bullet markers
  
  // Clean up field-style formatting (e.g., "Lead Status: value")
  // Convert "Field Name:** value" to "Field Name: value"
  cleaned = cleaned.replace(/:\*\*\s*/g, ': ');
  
  // Remove any remaining asterisks
  cleaned = cleaned.replace(/\*/g, '');
  
  // Clean up excessive whitespace and newlines
  cleaned = cleaned.replace(/\n+/g, ' ');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.trim();
  
  // If still too long or messy, try to extract key info
  if (cleaned.length > 300) {
    // Extract just the essential parts - look for key phrases
    const keyPhrases: string[] = [];
    
    // Lead/Customer status
    const statusMatch = cleaned.match(/(?:Lead Status|Customer Status)[:\s]+([^.]+)/i);
    if (statusMatch?.[1]) keyPhrases.push(statusMatch[1].trim());
    
    // Main concerns
    const concernsMatch = cleaned.match(/(?:Main Concerns?|Issues?)[:\s]+([^.]+)/i);
    if (concernsMatch?.[1] && !concernsMatch[1].toLowerCase().includes('none')) {
      keyPhrases.push(concernsMatch[1].trim());
    }
    
    // Next steps
    const nextStepMatch = cleaned.match(/(?:Next Step|Action)[:\s]+([^.]+)/i);
    if (nextStepMatch?.[1] && !nextStepMatch[1].toLowerCase().includes('none')) {
      keyPhrases.push(nextStepMatch[1].trim());
    }
    
    // Notable info
    const notableMatch = cleaned.match(/(?:Notable Information?|Key Info)[:\s]+([^.]+)/i);
    if (notableMatch?.[1]) keyPhrases.push(notableMatch[1].trim());
    
    if (keyPhrases.length > 0) {
      cleaned = keyPhrases.join('. ');
      if (!cleaned.endsWith('.')) cleaned += '.';
    }
  }
  
  // Final cleanup
  cleaned = cleaned.replace(/\s+\./g, '.');
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  
  return cleaned || null;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ===========================================
// Grid Position Calculator (for Calendar)
// ===========================================

export function calculateGridPosition(
  startTime: string,
  endTime: string,
  startHour = 9
): { gridRow: number; gridRowEnd: number } {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const baseMinutes = startHour * 60;
  
  // Each row represents 30 minutes
  const gridRow = Math.floor((startMinutes - baseMinutes) / 30) + 1;
  const gridRowEnd = Math.floor((endMinutes - baseMinutes) / 30) + 1;
  
  return { gridRow, gridRowEnd };
}
