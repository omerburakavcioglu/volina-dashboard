/**
 * Our Own Call Evaluation Prompt
 * This is the prompt used for evaluating calls with OpenAI API
 * Used in both VAPI webhook handler and manual re-evaluation
 */

export const EVALUATION_SYSTEM_PROMPT = `Analyze this call and evaluate its success. You must fill ALL required fields in the structured output.

⚠️ CRITICAL: Before classifying as HARD REJECT, check these FIRST:
1. Is it a TECHNICAL ERROR? → outcome "wrong_number" (NOT hard reject)
   - "Number you requested cannot be dialed" = TECHNICAL ERROR
   - "This number is not in service" = TECHNICAL ERROR
   - Automated error messages = TECHNICAL ERROR
2. Is it a VOICEMAIL SYSTEM MESSAGE? → outcome "voicemail" (NOT hard reject)
   - "Mailbox that has not been set up yet" = VOICEMAIL SYSTEM
3. Is it a POLITE "NO"? → outcome "not_interested", score 3-4 (SOFT REJECT, NOT hard reject)
   - "Sorry. No." = POLITE DECLINE = soft reject
   - "No, thank you" = POLITE DECLINE = soft reject
   - "No, I need [something else]" = POLITE DECLINE = soft reject
4. HARD REJECT is ONLY when a REAL PERSON says STRONG rejection words like "not interested", "stop calling", "remove me", or is hostile

CRITICAL RULES FOR SCORING (1-10 scale) - APPLY IN ORDER:

PRIORITY 1 - FAILED CONNECTIONS (Score 1-2, outcome "voicemail", "no_answer", "wrong_number", or "busy"):
1. If caller NEVER responded or only AI spoke → score 1, outcome "no_answer"
2. If voicemail system answered OR customer said "leave me a message", "you can leave me a brief message", "leave a message", "I'll get back to you", "I will call you back", "I missed your call. Please leave me your name, number, and a brief message, and I will call you back" → score 1, outcome "voicemail" (CRITICAL: "leave me a message" = voicemail, NOT a conversation. Also: "I missed your call" + "leave me your name/number" + "I will call you back" = voicemail)
2a. VOICEMAIL SYSTEM MESSAGES: If you hear automated voicemail messages like "Mailbox that has not been set up yet", "mailbox is full", "mailbox is not set up", "please leave a message after the tone", "mailbox unavailable" → score 1, outcome "voicemail" (NOT hard reject - this is voicemail system, NOT customer rejection)
3. If customer said "can't take your call", "can't talk", "unavailable", "busy right now", "in a meeting" → score 1-2, outcome "busy" (this is NOT a successful call, user is not available to engage)
4. If call lasted <15 seconds with no real conversation → score 1 or 2, outcome "no_answer" or "not_interested"
5. OPERATOR/RECEPTIONIST SCREENING: If someone other than the target person answered and said things like "I'll see if this person is available", "please stay on the line", "let me check", "hold on", "let me transfer you", "I'll connect you" and then the call ended without reaching the actual person → score 1, outcome "no_answer" (this is NOT a real conversation - the AI never spoke to the actual target person)
6. AUTOMATED SYSTEMS: If an automated system or IVR answered ("press 1", "please hold", "your call is important", "stay on the line") → score 1, outcome "no_answer"
7. TECHNICAL ERRORS / WRONG NUMBER (CRITICAL - NOT HARD REJECT): 
   - If you hear automated messages like "number you requested cannot be dialed", "this number is not in service", "the number you have dialed is incorrect", "wrong number", "this is not the right person", "you have the wrong number", "number cannot be dialed" → score 1-2, outcome "wrong_number" 
   - THIS IS NOT HARD REJECT - it's a technical error or wrong number, NOT customer rejection
   - Hard reject is ONLY for when the actual customer explicitly rejects the offer
   - Technical errors = "wrong_number" outcome, NOT "not_interested"
8. VOICEMAIL SYSTEM MESSAGES (CRITICAL - NOT HARD REJECT):
   - "Mailbox that has not been set up yet", "mailbox is full", "mailbox is not set up", "mailbox unavailable", "please leave a message after the tone" → score 1, outcome "voicemail" (NOT hard reject - this is voicemail system message, NOT customer rejection)
   - These are automated voicemail system messages, NOT a real person rejecting the offer

PRIORITY 2 - HARD REJECT (Score 1-2, ONLY for explicit rejection by REAL PERSON):
⚠️ CRITICAL: HARD REJECT is ONLY when a REAL PERSON (not automated system) EXPLICITLY and STRONGLY rejects the service/offer:
5. HARD REJECT is ONLY for when a REAL CUSTOMER (not automated system) EXPLICITLY and STRONGLY rejects the service/offer or is hostile:
   - REAL PERSON said "not interested", "no thanks", "don't want", "stop calling", "remove me", "I don't want this", "don't call me again", "I'm not interested", "stop calling me" → score 1-2, outcome "not_interested" (HARD REJECT - explicit and strong rejection of the offer)
   - REAL PERSON was hostile, rude, or angry → score 1-2, outcome "not_interested" (HARD REJECT)
   - REAL PERSON hung up immediately after hearing the pitch → score 2, outcome "not_interested" (HARD REJECT - explicit rejection by hanging up)
6. If REAL PERSON asked for different language (e.g., "someone speak Spanish", "speak Turkish") → score 2, outcome "not_interested" (language mismatch)
7. ⚠️ NOT HARD REJECT - These are POLITE DECLINES (see PRIORITY 3):
   - "Sorry. No." → soft reject (3-4), outcome "not_interested", NOT hard reject
   - "No, thank you" → soft reject (3-4), outcome "not_interested", NOT hard reject
   - "No, I need [something else]" → soft reject (3-4), outcome "not_interested", NOT hard reject
   - "No. I need young. No." → soft reject (3-4), outcome "not_interested", NOT hard reject
   - Any polite "no" response → soft reject (3-4), NOT hard reject
   - Hard reject requires STRONG rejection words like "not interested", "stop calling", "remove me", "don't call me again"
   - If customer says "no" politely (even multiple times) but is not hostile → soft reject (3-4), NOT hard reject
7. ⚠️ NOT HARD REJECT - These are TECHNICAL ERRORS (see PRIORITY 1, rule 7):
   - "Number you requested cannot be dialed" → outcome "wrong_number" (NOT hard reject)
   - "This number is not in service" → outcome "wrong_number" (NOT hard reject)
   - Any automated error message → outcome "wrong_number" (NOT hard reject)
8. IMPORTANT: If customer NEVER responded or only AI spoke → this is NOT hard reject, this is "no_answer" (score 1, outcome "no_answer") - see PRIORITY 1
9. IMPORTANT: If customer gave minimal response like "I'm good" or just "hello" → this is NOT hard reject, this is soft reject (score 3-4) - see PRIORITY 3
10. IMPORTANT: If customer said "try again later", "call back later", "not set up yet", "not ready", "not available right now" → this is NOT hard reject, this is soft reject (score 3-4) or "busy" (score 1-2) - customer is not rejecting the offer, just saying timing is wrong
11. ⚠️ NOT HARD REJECT - These are VOICEMAIL SYSTEM MESSAGES (see PRIORITY 1, rule 2a):
   - "Mailbox that has not been set up yet" → outcome "voicemail" (NOT hard reject)
   - "Mailbox is full" → outcome "voicemail" (NOT hard reject)
   - "Mailbox is not set up" → outcome "voicemail" (NOT hard reject)
   - Any automated voicemail system message → outcome "voicemail" (NOT hard reject)

PRIORITY 3 - MINIMAL ENGAGEMENT / SOFT REJECT (Score 3-6):
8. If customer gave minimal polite responses like "I'm good", "fine", "okay", "yes", "hello" without showing interest or asking questions → score 3-4, outcome "not_interested" (SOFT REJECT - polite but not engaged)
9. If customer barely spoke (only greetings like "hello", "hi", "yes", "okay" without context) → score 3-4, outcome "not_interested" (SOFT REJECT)
10. If customer only gave minimal passive responses (just "okay", "hello?", "yes" without context, no questions asked) → score 3-4, outcome "needs_info" or "not_interested" (SOFT REJECT)
11. If customer said "no", "sorry, no", "no thank you", "no, I need [something else]", "not really" but was polite and didn't hang up → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
11a. POLITE "NO" RESPONSES (CRITICAL - NOT HARD REJECT): 
   - "Sorry. No." → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
   - "No, thank you" → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
   - "No, I need [something else]" → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
   - "No. I need young. No." → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
   - Multiple polite "no" responses → score 3-4, outcome "not_interested" (SOFT REJECT - polite decline, NOT hard reject)
   - If customer says "no" politely (even multiple times) but is not hostile or saying "stop calling" → SOFT REJECT (3-4), NOT hard reject
   - Hard reject requires STRONG rejection words: "not interested", "stop calling", "remove me", "don't call me again"
12. If customer said "try again later", "call back later", "not set up yet", "not ready", "not available right now", "try your call again later" → score 3-4, outcome "not_interested" or "busy" (SOFT REJECT - timing issue, not explicit rejection)
13. If customer said multiple "no" WITHOUT any positive engagement later → score 4-5, outcome "not_interested" (SOFT REJECT)
14. If call duration <20 seconds and customer showed no interest → score 3-4, outcome "not_interested" (SOFT REJECT)

PRIORITY 4 - POSITIVE ENGAGEMENT (Score 7-10):
12. IMPORTANT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "finding a solution", "let me think about it") → score 7-8, outcome "interested" (this shows they changed their mind or are open to learning more)
13. ONLY give score 7-8 if customer showed GENUINE interest: asked questions, discussed details, engaged in conversation, OR changed their mind after initial hesitation
14. ONLY give score 9-10 if appointment was set, sale was made, or strong commitment was given → outcome "appointment_set" or "interested"
15. If customer requested callback or follow-up → score 8-9, outcome "callback_requested"

Scoring (1-10):
- 1: No connection (voicemail, no answer, busy, only AI spoke, customer never responded, call <15 seconds, operator/receptionist screening)
- 2: Hard reject (explicit "not interested", "stop calling", "remove me", hostile/rude, immediate hang up - ONLY from real person, NOT technical errors)
- 3: Soft reject - minimal polite response (just "I'm good", "fine", "okay", "yes" without engagement, polite but not interested)
- 4: Soft reject - polite decline (said "no" politely, minimal conversation, no questions asked, brief polite responses)
- 5: Neutral conversation (brief chat, listened but unclear interest, some "no" responses, non-committal)
- 6: Neutral with some interest (listened, asked basic questions, but non-committal, needs more info)
- 7: Positive interest (engaged conversation, asked questions, wants more info, showed genuine interest)
- 8: Strong interest (engaged, asked detailed questions, wants follow-up, discussed details)
- 9: Success (appointment set, callback scheduled, strong commitment, hot lead)
- 10: Great success (sale made, appointment confirmed, very strong commitment, VIP lead)

CRITICAL SCORING GUIDELINES:
- Be STRICT with high scores (7-10). Only give them if there's clear evidence of genuine interest or success.
- ALWAYS check call duration FIRST: very short calls (<20 seconds) cannot be highly successful (MAX score 4)
- ALWAYS check user engagement: if user said very few words (<10 words), it cannot be a great call (MAX score 5)
- If customer said "can't take your call", "unavailable", "busy", "in a meeting" → score 1-2, outcome "busy" (user is not available, this is NOT a successful engagement)
- ⚠️ CRITICAL: HARD REJECT (1-2) is ONLY for STRONG and EXPLICIT rejection by a REAL PERSON: "not interested", "stop calling", "remove me", "don't call me again", hostility, or immediate hang up after hearing the pitch
- ⚠️ CRITICAL: Polite "no" responses like "Sorry. No.", "No, thank you", "No, I need [something else]", "No. I need young. No." = SOFT REJECT (3-4), outcome "not_interested", NOT hard reject
- ⚠️ CRITICAL: Multiple polite "no" responses (even if customer says "no" multiple times) = SOFT REJECT (3-4), NOT hard reject
- Hard reject requires STRONG rejection words like "not interested", "stop calling", "remove me", "don't call me again", NOT just polite "no"
- If customer is polite but says "no" → SOFT REJECT (3-4), NOT hard reject
- ⚠️ CRITICAL: "Number you requested cannot be dialed" = AUTOMATED TECHNICAL ERROR = outcome "wrong_number" (score 1-2), NOT "not_interested", NOT hard reject
- ⚠️ CRITICAL: Any automated error message ("number not in service", "cannot be dialed", etc.) = TECHNICAL ERROR = outcome "wrong_number", NOT hard reject
- ⚠️ CRITICAL: "Mailbox that has not been set up yet" = AUTOMATED VOICEMAIL SYSTEM MESSAGE = outcome "voicemail" (score 1), NOT "not_interested", NOT hard reject
- ⚠️ CRITICAL: Any automated voicemail message ("mailbox is full", "mailbox not set up", etc.) = VOICEMAIL SYSTEM = outcome "voicemail", NOT hard reject
- If customer NEVER responded or only AI spoke → score 1, outcome "no_answer" (NOT hard reject)
- If customer gave minimal polite responses like "I'm good", "fine", "okay" without engagement → score 3-4 (SOFT REJECT), outcome "not_interested"
- If customer said "try again later", "call back later", "not set up yet", "not ready" → score 3-4 (SOFT REJECT), NOT hard reject - this is timing issue, not rejection of the offer
- Technical errors like "number cannot be dialed", "number you requested cannot be dialed", "not in service", "wrong number" → score 1-2, outcome "wrong_number" (NOT hard reject - this is technical error, NOT customer rejection)
- Hard reject is ONLY when a REAL PERSON (not automated system) explicitly rejects the offer
- Polite minimal responses are SOFT REJECT (3-4), NOT hard reject
- No response = "no_answer" (F), NOT hard reject. Hard reject requires explicit rejection of the offer/service from the customer.
- "Try again later" = soft reject (timing), NOT hard reject (rejection)
- Technical errors = "wrong_number" (F), NOT hard reject
- BUT: If customer initially said "no" but THEN showed positive engagement (e.g., "I'm gonna hear", "tell me more", "yeah", "open to", "considering", "let me think"), this is POSITIVE - give score 7-8, outcome "interested"
- If call was very short (<20 seconds) and customer didn't engage, NEVER give score > 4
- If customer barely spoke (only greetings like "hello", "hi"), NEVER give score > 3
- Pay attention to the FULL conversation: initial "no" followed by positive engagement indicates genuine interest - score 7-8
- NEVER give high scores (7-10) if user explicitly said they can't take the call or are unavailable - this is a failed connection, not a success
- Count user's actual words: if user said less than 10 meaningful words, MAX score is 5
- If user only responded with single words ("yes", "no", "okay", "hello") without context, MAX score is 3
- CRITICAL: If user only said numbers (like "1 4 5 0 3 0 2 3 3"), random characters, or meaningless input → score 1-2, outcome "no_answer" (NOT a real conversation, likely wrong number or user didn't understand)
- NEVER give high scores (7-10) if user only said numbers or meaningless input - this is NOT engagement
- OPERATOR/RECEPTIONIST: If someone says "I'll see if this person is available", "please stay on the line", "hold on", "let me check", "let me transfer" → this is NOT the target person. The AI never reached the actual customer. Score 1, outcome "no_answer". Do NOT treat operator phrases as customer engagement.
- "Please stay on the line" is NOT a real conversation. It is an operator or automated system. Score 1.

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

You must respond with a valid JSON object matching this exact structure:
{
  "successEvaluation": {
    "score": <1-10>,
    "sentiment": "<positive|neutral|negative>",
    "outcome": "<appointment_set|callback_requested|interested|not_interested|needs_info|no_answer|voicemail|wrong_number|busy>",
    "tags": ["<tag1>", "<tag2>"],
    "objections": ["<objection1>"] (optional),
    "nextAction": "<recommended next step>" (optional)
  },
  "callSummary": {
    "callSummary": "<2-3 sentence summary in call's language>"
  }
}`;
