/**
 * VAPI Lead Extractor
 * Extracts lead information from VAPI call transcripts and summaries
 */

export interface ExtractedLead {
  full_name: string | null;
  phone: string | null;
  business_type: string | null;
  treatment_interest: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  interested: boolean;
  appointment_requested: boolean;
}

// Turkish name patterns
const NAME_PATTERNS = [
  /(?:adım|ismim|ben)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]+)?)/gi,
  /(?:Teşekkür ederim|Teşekkürler)\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+(?:Bey|Hanım))?)/gi,
  /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)(?:\s+(?:Bey|Hanım))?/g,
];

// Phone number patterns (Turkish format)
const PHONE_PATTERNS = [
  /(?:beş yüz|altı yüz|yedi yüz)[\s,]+(?:\w+[\s,]+){3,8}/gi,
  /(?:0?\d{3})\s*[\s-]?\s*(\d{3})\s*[\s-]?\s*(\d{2})\s*[\s-]?\s*(\d{2})/g,
  /(\d{3})\s+(\d{3})\s+(\d{2})\s+(\d{2})/g,
];

// Business/sector keywords
const BUSINESS_KEYWORDS: Record<string, string[]> = {
  'Sağlık / Klinik': ['sağlık', 'klinik', 'hastane', 'doktor', 'tedavi', 'hasta'],
  'Diş Hekimliği': ['diş', 'dental', 'ortodonti', 'implant', 'dolgu'],
  'Güzellik / Estetik': ['güzellik', 'estetik', 'botox', 'dolgu', 'cilt'],
  'Restoran / Kafe': ['restoran', 'kafe', 'cafe', 'yemek', 'mutfak'],
  'Berber / Kuaför': ['berber', 'kuaför', 'saç', 'tıraş'],
  'Pastane / Fırın': ['pastane', 'fırın', 'baklava', 'pasta', 'unlu mamul'],
  'Otel / Konaklama': ['otel', 'hotel', 'konaklama', 'rezervasyon'],
  'Dondurma': ['dondurma', 'dondurmacı'],
  'Diğer': [],
};

// Words to convert Turkish number words to digits
const TURKISH_NUMBERS: Record<string, string> = {
  'sıfır': '0', 'bir': '1', 'iki': '2', 'üç': '3', 'dört': '4',
  'beş': '5', 'altı': '6', 'yedi': '7', 'sekiz': '8', 'dokuz': '9',
  'on': '10', 'yirmi': '20', 'otuz': '30', 'kırk': '40', 'elli': '50',
  'altmış': '60', 'yetmiş': '70', 'seksen': '80', 'doksan': '90',
  'yüz': '100',
};

/**
 * Extract lead information from a VAPI call
 */
export function extractLeadFromCall(call: {
  transcript?: string | null;
  summary?: string | null;
  sentiment?: string | null;
  type?: string | null;
  caller_phone?: string | null;
}): ExtractedLead {
  const transcript = call.transcript || '';
  const summary = call.summary || '';
  const combinedText = `${transcript} ${summary}`.toLowerCase();

  return {
    full_name: extractName(transcript, summary),
    phone: extractPhone(transcript) || call.caller_phone || null,
    business_type: extractBusinessType(combinedText),
    treatment_interest: extractTreatmentInterest(combinedText),
    sentiment: (call.sentiment as 'positive' | 'neutral' | 'negative') || 'neutral',
    interested: detectInterest(combinedText),
    appointment_requested: detectAppointmentRequest(combinedText, call.type),
  };
}

/**
 * Extract name from transcript
 */
function extractName(transcript: string, summary: string): string | null {
  // First try to find name in summary (usually more accurate)
  const summaryMatch = summary.match(/(?:user|caller|customer)[,\s]+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)/i);
  if (summaryMatch && summaryMatch[1]) {
    return cleanName(summaryMatch[1]);
  }

  // Look for name patterns in transcript
  for (const pattern of NAME_PATTERNS) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const name = cleanName(match[1]);
        if (isValidName(name)) {
          return name;
        }
      }
    }
  }

  // Try to find names after specific phrases
  const afterPhrases = [
    /User:\s*(?:ben\s+)?([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)/gi,
    /adınızı?\s*(?:ve\s*)?(?:soyadınızı?)?\s*(?:öğrenebilir|alabilir)[\s\S]*?User:\s*([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)/gi,
  ];

  for (const pattern of afterPhrases) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const name = cleanName(match[1]);
      if (isValidName(name)) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Clean and normalize a name
 */
function cleanName(name: string): string {
  // Remove common suffixes
  return name
    .replace(/\s*(Bey|Hanım|bey|hanım)\s*$/g, '')
    .replace(/^\s*(Ben|ben)\s+/g, '')
    .trim();
}

/**
 * Check if a string is a valid name
 */
function isValidName(name: string): boolean {
  // Filter out common non-name words
  const invalidWords = [
    'evet', 'hayır', 'tamam', 'olur', 'tabii', 'merhaba', 'günaydın',
    'teşekkür', 'rica', 'iyi', 'günler', 'volina', 'volia', 'ahu',
    'demo', 'randevu', 'bilgi', 'sektör', 'işletme',
  ];

  const lowerName = name.toLowerCase();
  if (invalidWords.some(word => lowerName.includes(word))) {
    return false;
  }

  // Must have at least 2 characters
  if (name.length < 2) {
    return false;
  }

  // Should start with uppercase (proper noun)
  if (!/^[A-ZÇĞİÖŞÜ]/.test(name)) {
    return false;
  }

  return true;
}

/**
 * Extract phone number from transcript
 */
function extractPhone(transcript: string): string | null {
  // First try to find direct phone format
  const directMatch = transcript.match(/(?:0?\d{3})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})/);
  if (directMatch) {
    return directMatch[0].replace(/[\s-]/g, '');
  }

  // Try to parse Turkish spoken numbers
  const phoneSection = transcript.match(/(?:telefon|numara|numarası)[\s\S]*?(?:doğru|evet|tamam)/gi);
  if (phoneSection) {
    const numbers = extractSpokenNumbers(phoneSection[0]);
    if (numbers && numbers.length >= 10) {
      return numbers;
    }
  }

  // Look for number sequences in "User:" lines
  const userLines = transcript.match(/User:[\s\S]*?(?=AI:|$)/gi) || [];
  for (const line of userLines) {
    const numbers = extractSpokenNumbers(line);
    if (numbers && numbers.length >= 10 && numbers.length <= 11) {
      return numbers;
    }
  }

  return null;
}

/**
 * Convert Turkish spoken numbers to digits
 */
function extractSpokenNumbers(text: string): string | null {
  const lowerText = text.toLowerCase();
  let result = '';

  // Split by common separators
  const parts = lowerText.split(/[,.\s]+/);

  for (const part of parts) {
    // Check compound numbers like "beş yüz" (500)
    if (part.includes('yüz')) {
      const splitParts = part.split('yüz');
      const multiplier = splitParts[0] || '';
      const mult = TURKISH_NUMBERS[multiplier.trim()] || '1';
      result += mult.charAt(0);
      continue;
    }

    // Check tens + ones like "kırk beş" (45)
    for (const [word, digit] of Object.entries(TURKISH_NUMBERS)) {
      if (part === word) {
        if (parseInt(digit) >= 10 && parseInt(digit) < 100) {
          result += digit.charAt(0);
        } else {
          result += digit;
        }
        break;
      }
    }

    // Check for raw digits
    const digitMatch = part.match(/^\d+$/);
    if (digitMatch) {
      result += digitMatch[0];
    }
  }

  return result.length >= 7 ? result : null;
}

/**
 * Extract business type from text
 */
function extractBusinessType(text: string): string {
  for (const [category, keywords] of Object.entries(BUSINESS_KEYWORDS)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  return 'Diğer';
}

/**
 * Extract treatment/service interest
 */
function extractTreatmentInterest(text: string): string | null {
  const interests: string[] = [];

  // Health/medical interests
  if (text.includes('diş') || text.includes('dental')) {
    if (text.includes('implant')) interests.push('Diş Implantı');
    else if (text.includes('dolgu')) interests.push('Diş Dolgusu');
    else if (text.includes('tedavi')) interests.push('Diş Tedavisi');
    else interests.push('Diş Hizmetleri');
  }

  if (text.includes('hasta takip') || text.includes('hasta programı')) {
    interests.push('Hasta Takip Sistemi');
  }

  if (text.includes('randevu')) {
    interests.push('Randevu Yönetimi');
  }

  if (text.includes('rezervasyon')) {
    interests.push('Rezervasyon Sistemi');
  }

  if (text.includes('sekretarya') || text.includes('asistan')) {
    interests.push('Sanal Asistan');
  }

  return interests.length > 0 ? interests.join(', ') : 'AI Telefon Asistanı';
}

/**
 * Detect if the caller showed interest
 */
function detectInterest(text: string): boolean {
  const positiveIndicators = [
    'evet', 'olur', 'tabii', 'isterim', 'ilgileniyorum',
    'demo', 'görüşme', 'randevu', 'entegre', 'düşünüyorum',
  ];

  const negativeIndicators = [
    'hayır', 'istemiyorum', 'gerek yok', 'ilgilenmiyorum',
  ];

  const positiveCount = positiveIndicators.filter(ind => text.includes(ind)).length;
  const negativeCount = negativeIndicators.filter(ind => text.includes(ind)).length;

  return positiveCount > negativeCount;
}

/**
 * Detect if appointment was requested
 */
function detectAppointmentRequest(text: string, type?: string | null): boolean {
  if (type === 'appointment') return true;

  const appointmentIndicators = [
    'demo görüşme', 'randevu', 'görüşme ayarla', 'dönüş yap',
    'iletişime geç', 'bilgi al',
  ];

  return appointmentIndicators.some(ind => text.includes(ind));
}

/**
 * Determine lead status based on call data
 */
export function determineLeadStatus(lead: ExtractedLead): string {
  if (lead.appointment_requested && lead.phone) {
    return 'appointment_set';
  }
  if (lead.interested && lead.phone) {
    return 'interested';
  }
  if (lead.interested) {
    return 'contacted';
  }
  return 'new';
}

/**
 * Determine lead priority based on call data
 */
export function determineLeadPriority(lead: ExtractedLead): string {
  if (lead.appointment_requested && lead.full_name && lead.phone) {
    return 'high';
  }
  if (lead.interested && lead.phone) {
    return 'high';
  }
  if (lead.interested) {
    return 'medium';
  }
  return 'low';
}

