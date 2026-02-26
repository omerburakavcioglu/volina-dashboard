# VAPI Structured Outputs - Purpose ve Description

## 1. Success Evaluation (Numeric Scale) Structured Output

### Purpose (What is the purpose of this structured output?)
```
Evaluate the success of the call on a 1-10 numeric scale, determine the outcome, sentiment, and provide relevant tags for lead qualification and follow-up actions.
```

### Description (Detailed prompt)
```
Analyze this call and evaluate its success. You must fill ALL required fields in the structured output.

CRITICAL RULES FOR SCORING (1-10 scale) - APPLY IN ORDER:

PRIORITY 1 - FAILED CONNECTIONS (Score 1-2, outcome "voicemail", "no_answer", or "busy"):
1. If caller NEVER responded or only AI spoke → score 1, outcome "no_answer"
2. If voicemail system answered OR customer said "leave me a message", "you can leave me a brief message", "leave a message", "I'll get back to you", "I will call you back", "I missed your call. Please leave me your name, number, and a brief message, and I will call you back", "déjeme su nombre, número de teléfono y un breve mensaje. Y le regreso la llamada" (Spanish) → score 1, outcome "voicemail" (CRITICAL: "leave me a message" = voicemail, NOT a conversation. Also: "I missed your call" + "leave me your name/number" + "I will call you back" = voicemail. Spanish: "déjeme su nombre, número" + "le regreso la llamada" = voicemail)
3. If customer said "can't take your call", "can't talk", "unavailable", "busy right now", "in a meeting" → score 1-2, outcome "busy" (this is NOT a successful call, user is not available to engage)
4. If call lasted <15 seconds with no real conversation → score 1 or 2, outcome "no_answer" or "not_interested"

PRIORITY 2 - IMMEDIATE REJECTIONS (Score 2-4):
5. If customer hung up immediately without engaging → score 2, outcome "not_interested"
6. If customer said "not interested", "no thanks", "don't want" AND maintained rejection throughout → MAX score 4, outcome "not_interested"
7. If customer asked for different language (e.g., "someone speak Spanish", "speak Turkish") → MAX score 3-4, outcome "not_interested" (language mismatch = not interested in current conversation)

PRIORITY 3 - MINIMAL ENGAGEMENT (Score 3-5):
8. If customer barely spoke (only greetings like "hello", "hi", "yes", "okay" without context) → MAX score 3, outcome "not_interested"
9. If customer only gave minimal passive responses (just "okay", "hello?", "yes" without context, no questions asked) → MAX score 3, outcome "needs_info" or "not_interested"
10. If customer said multiple "no" WITHOUT any positive engagement later → MAX score 5, outcome "not_interested"
11. If call duration <20 seconds and customer showed no interest → MAX score 4, outcome "not_interested"

PRIORITY 4 - POSITIVE ENGAGEMENT (Score 7-10):
12. IMPORTANT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "finding a solution", "let me think about it") → score 7-8, outcome "interested" (this shows they changed their mind or are open to learning more)
13. ONLY give score 7-8 if customer showed GENUINE interest: asked questions, discussed details, engaged in conversation, OR changed their mind after initial hesitation
14. ONLY give score 9-10 if appointment was set, sale was made, or strong commitment was given → outcome "appointment_set" or "interested"
15. If customer requested callback or follow-up → score 8-9, outcome "callback_requested"

Scoring (1-10):
- 1: No connection (voicemail, no answer, busy, only AI spoke, customer never responded, call <15 seconds)
- 2: Connected but immediately rejected (immediate hang up, "not interested" immediately, "wrong number", hostile)
- 3: Connected but minimal engagement (only greetings, barely spoke, no real conversation)
- 4: Connected but negative (said "not interested", "no thanks", declined, no engagement, call <20 seconds)
- 5: Neutral conversation (brief chat, listened but unclear interest, some "no" responses)
- 6: Neutral with some interest (listened, asked basic questions, but non-committal)
- 7: Positive interest (engaged conversation, asked questions, wants more info, showed genuine interest)
- 8: Strong interest (engaged, asked detailed questions, wants follow-up, discussed details)
- 9: Success (appointment set, callback scheduled, strong commitment, hot lead)
- 10: Great success (sale made, appointment confirmed, very strong commitment, VIP lead)

CRITICAL SCORING GUIDELINES:
- Be STRICT with high scores (7-10). Only give them if there's clear evidence of genuine interest or success.
- ALWAYS check call duration FIRST: very short calls (<20 seconds) cannot be highly successful (MAX score 4)
- ALWAYS check user engagement: if user said very few words (<10 words), it cannot be a great call (MAX score 5)
- If customer said "can't take your call", "unavailable", "busy", "in a meeting" → score 1-2, outcome "busy" (user is not available, this is NOT a successful engagement)
- If customer said "not interested" or similar AND maintained rejection throughout, NEVER give score > 4, outcome "not_interested"
- BUT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "let me think"), this is POSITIVE - give score 7-8, outcome "interested"
- If call was very short (<20 seconds) and customer didn't engage, NEVER give score > 4
- If customer barely spoke (only greetings like "hello", "hi"), NEVER give score > 3
- Pay attention to the FULL conversation: initial "no" followed by positive engagement indicates genuine interest - score 7-8
- NEVER give high scores (7-10) if user explicitly said they can't take the call or are unavailable - this is a failed connection, not a success
- Count user's actual words: if user said less than 10 meaningful words, MAX score is 5
- If user only responded with single words ("yes", "no", "okay", "hello") without context, MAX score is 3

OUTCOME VALUES (choose the most appropriate - MUST match the score):
- "appointment_set": Appointment or meeting was scheduled (score 9-10)
- "callback_requested": Customer asked to be called back later (score 8-9)
- "interested": Customer showed genuine interest but no commitment yet (score 7-8)
- "not_interested": Customer explicitly declined or showed no interest (score 2-4)
- "needs_info": Customer needs more information before deciding (score 5-6)
- "no_answer": Customer never answered the call (score 1)
- "voicemail": Call went to voicemail (score 1)
- "wrong_number": Wrong number or person reached (score 2)
- "busy": Line was busy or customer was unavailable (score 1-2)

SENTIMENT VALUES:
- "positive": Customer was positive, engaged, interested
- "neutral": Customer was neutral, neither positive nor negative
- "negative": Customer was negative, hostile, or clearly not interested

TAGS (add relevant tags from this list):
- "appointment_set", "callback_requested", "follow_up_needed"
- "hot_lead", "warm_lead", "cold_lead"
- "price_concern", "timing_concern", "needs_info"
- "interested", "not_interested", "highly_interested"
- "successful_call", "failed_call", "voicemail", "no_answer"
- "referral", "complaint", "vip_customer"

OBJECTIONS (optional - list any objections raised):
- "price_concern": Customer mentioned price as an issue
- "timing_concern": Customer mentioned timing as an issue
- "not_needed": Customer said they don't need the service
- "already_have": Customer already has similar service

NEXT ACTION (optional - recommended follow-up):
- "Schedule appointment"
- "Send information"
- "Follow up in X days"
- "No follow-up needed"
```

---

## 2. Call Summary Structured Output

### Purpose (What is the purpose of this structured output?)
```
Generate a concise summary of the call conversation in 2-3 sentences, capturing key points, customer interest level, decisions made, and next steps for the sales team.
```

### Description (Detailed prompt)
```
Create a concise summary of this call conversation. The summary should be 2-3 sentences maximum and written in the same language as the call.

The summary MUST include:
1. Customer's interest level and engagement (interested, not interested, needs info, etc.) - ALWAYS mention this first
2. Key conversation points (what was discussed, questions asked, concerns raised, objections mentioned)
3. Decisions or commitments made (appointment set, callback requested, information to be sent, etc.)
4. Next steps (what should happen next - follow-up, send info, schedule appointment, etc.) - ALWAYS include this

IMPORTANT GUIDELINES:
- Keep it concise: 2-3 sentences maximum (if longer, condense it)
- Be specific: Mention concrete details (e.g., "Customer wants appointment on Monday morning" not just "Customer wants appointment")
- Include customer quotes if relevant (e.g., "Customer said 'I'm interested but need to check my schedule'")
- Mention any objections or concerns raised (price, timing, etc.)
- Always include next steps or recommended action at the end
- Write in the same language as the call (Turkish for Turkish calls, English for English calls)
- If call was voicemail or no answer, state that clearly: "Call went to voicemail" or "Customer did not answer"
- If customer was unavailable or busy, mention that: "Customer was unavailable to take the call"
- If customer showed no interest, state it clearly: "Customer declined and showed no interest"
- If customer showed interest but needs more info, mention what info is needed
- If appointment was set, mention the date/time if discussed
- If callback was requested, mention when customer wants to be called back

EXAMPLES:

Good summary:
"Müşteri randevu almak istiyor ancak önce fiyat bilgisi görmek istiyor. Pazartesi sabahı uygun olduğunu belirtti. Fiyat listesi WhatsApp üzerinden gönderilecek ve sonrasında randevu planlanacak."

Good summary:
"Customer showed interest in the service and asked several questions about pricing and availability. They mentioned they need to check their schedule and requested a callback next week. Follow up in 3-4 days to schedule appointment."

Bad summary (too vague):
"Customer was interested. Will follow up." (Too vague, no details)

Bad summary (too long):
"Müşteri aradı ve randevu hakkında sorular sordu. Fiyat bilgisi istedi. Pazartesi uygun olduğunu söyledi. WhatsApp'tan bilgi göndereceğiz. Sonra randevu planlayacağız. Müşteri çok ilgili görünüyordu." (Too long, should be 2-3 sentences)
```

---

## VAPI Dashboard'da Nasıl Kullanılır?

### Success Evaluation Structured Output için:

1. **Name:** `successEvaluation`
2. **Purpose:** Yukarıdaki "Purpose" kısmını kopyalayıp yapıştırın
3. **Description:** Yukarıdaki "Description" kısmını kopyalayıp yapıştırın
4. **Schema:** JSON Schema'yı `VAPI_STRUCTURED_OUTPUTS.md` dosyasından kopyalayın

### Call Summary Structured Output için:

1. **Name:** `callSummary`
2. **Purpose:** Yukarıdaki "Purpose" kısmını kopyalayıp yapıştırın
3. **Description:** Yukarıdaki "Description" kısmını kopyalayıp yapıştırın
4. **Schema:** JSON Schema'yı `VAPI_STRUCTURED_OUTPUTS.md` dosyasından kopyalayın

## Notlar

- **Purpose** alanı kısa ve öz olmalı (1-2 cümle)
- **Description** alanı detaylı prompt içermeli (yukarıdaki gibi)
- Her iki structured output da arama sona erdiğinde otomatik olarak doldurulmalı
- Asistan system prompt'una şunu ekleyin: "Arama sona erdiğinde, successEvaluation ve callSummary structured output'larını mutlaka doldur."
