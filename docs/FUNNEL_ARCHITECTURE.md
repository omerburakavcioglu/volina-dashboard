# Funnel Feature — Tam Mimari ve Eksikler

> Bu döküman `omerburakavcioglu/volina-dashboard` reposundaki funnel sistemini tüm detaylarıyla açıklamaktadır.  
> Kaynak dosyalar: `lib/funnel-engine.ts`, `lib/funnel-actions.ts`, `app/api/cron/funnel/route.ts`, `app/api/vapi/route.ts`, `supabase/migration-funnel.sql` ve tüm `components/funnel/` bileşenleri.

---

## 1. Funnel Nedir?

Funnel, yeni bir lead (hasta/müşteri) sisteme girdiği andan itibaren onu otomatik olarak yöneten **çok adımlı bir iletişim hattıdır**. Her aşamada:

- Otomatik AI araması (VAPI) yapılır, veya
- WhatsApp mesajı gönderilir, veya
- Canlı transfer bildirimi tetiklenir.

Kişinin bu aksiyonlara verdiği yanıta göre bir sonraki aşama belirlenir. Tüm süreç **Vercel Cron** ile her 2 dakikada bir tetiklenir; insan müdahalesi gerektirmez.

---

## 2. Veritabanı Tabloları

`supabase/migration-funnel.sql` dosyası çalıştırılınca şu tablolar oluşur:

| Tablo | Açıklama |
|-------|----------|
| `funnel_stages` | Her aşamanın adı, tipi, rengi, pozisyonu |
| `funnel_transitions` | Aşamalar arası geçiş kuralları (condition_type) |
| `funnel_leads` | Her lead'in şu anki aşaması, branş'ı, durumu |
| `funnel_events` | Her aksiyonun log kaydı (call_made, whatsapp_sent vs.) |
| `funnel_schedules` | Bekleyen / çalışan / tamamlanmış aksiyon planlamaları |
| `funnel_message_templates` | WhatsApp mesaj şablonları (her aşama için) |
| `funnel_config` | Kullanıcı başına: çalışma saatleri, günlük arama limiti, hard_waiting_days |

Ayrıca `profiles` tablosuna şu sütunlar eklenir:
- `vapi_assistant_id`
- `vapi_phone_number_id`
- `vapi_private_key`
- `whatsapp_phone_number_id`
- `whatsapp_access_token`

---

## 3. Tüm Stage'ler (Düğümler) ve Kullanılan Agent

### 3.1 Stage Haritası

```
[YENİ LEAD GİRİŞİ]
        │
        ▼
┌─────────────────────┐
│   DAY0_AI_CALL      │  ← AI Araması (VAPI)
└─────────────────────┘
        │
   ┌────┴─────────────────┐
   │ Sonuç:               │
   │ HARD → HARD_WAITING  │
   │ SOFT → SOFT_FOLLOWUP │
   │ NO_ANSWER → NO_ANSWER_WHATSAPP_INTRO
   └──────────────────────┘

NO_ANSWER DALI:
  NO_ANSWER_WHATSAPP_INTRO  → (1 gün) → NO_ANSWER_DAY1
  NO_ANSWER_DAY1            → (1 gün) → NO_ANSWER_DAY2
  NO_ANSWER_DAY2            → (13 gün) → NO_ANSWER_DAY15
  NO_ANSWER_DAY15           → (0 gün) → SOFT_FOLLOWUP

SOFT DALI:
  SOFT_FOLLOWUP (WhatsApp)
    → yanıt yoksa zaman bazlı geçiş (henüz tanımlı değil ─ EKSİK)

HARD DALI:
  HARD_WAITING (bekleme, hard_waiting_days sonra)
    → HARD_RE_ENGAGEMENT (WhatsApp)
    → (2 gün) → HARD_REACQUISITION_CALL (AI Araması)
      → SOFT → LIVE_TRANSFER
      → NO_ANSWER → tekrar dene (yeniden schedule edilmez ─ EKSİK)
      → HARD → ARCHIVE_GDPR

POST-TREATMENT DALI:
  TREATMENT → (7 gün) → POST_TREATMENT_DAY7 (satisfaction_call)
    → SOFT → REVIEW_AND_REFERRAL (WhatsApp)
      → (23 gün) → POST_TREATMENT_DAY30 (check_in_call)
        → RECOVERY_MANAGEMENT → (30 gün) → LOYAL ✓
    → HARD → URGENT_ALERT (aksiyon yok ─ EKSİK)

LIVE_TRANSFER:
  → live_transfer_alert (klinik WhatsApp bildirimi)
  → TREATMENT geçişi tanımlı değil ─ EKSİK
```

---

### 3.2 Her Node'da Kullanılan Agent

| Stage | Agent Tipi | Açıklama |
|-------|-----------|----------|
| **DAY0_AI_CALL** | **VAPI AI Agent** | `vapi_assistant_id` ile outbound arama. Profil'den alınan anahtar kullanılır; yoksa env `VAPI_PRIVATE_KEY` fallback'i. |
| **NO_ANSWER_WHATSAPP_INTRO** | **Meta WhatsApp API** | `funnel_message_templates` tablosundan bu stage için şablon çekilir. |
| **NO_ANSWER_DAY1** | **Meta WhatsApp API** | Aynı şekilde şablon tablosundan. |
| **NO_ANSWER_DAY2** | **Meta WhatsApp API** | Şablon tablosundan. |
| **NO_ANSWER_DAY15** | **Meta WhatsApp API** | Şablon tablosundan. |
| **SOFT_FOLLOWUP** | **Meta WhatsApp API** | Şablon tablosundan. |
| **HARD_WAITING** | **Yok (bekleme)** | Hiçbir aksiyon yok. Cron, `hard_waiting_days` geçince otomatik HARD_RE_ENGAGEMENT'a geçirir. |
| **HARD_RE_ENGAGEMENT** | **Meta WhatsApp API** | Şablon tablosundan. |
| **HARD_REACQUISITION_CALL** | **VAPI AI Agent** | DAY0 ile aynı VAPI konfigürasyonu. |
| **LIVE_TRANSFER** | **Meta WhatsApp API** | Klinik numarasına bildirim mesajı: "Bu hasta hemen aranmayı bekliyor." |
| **TREATMENT** | **Yok (bekleme)** | 7 gün sonra otomatik POST_TREATMENT_DAY7'ye geçer. |
| **POST_TREATMENT_DAY7** | **VAPI AI Agent** | `action_type: satisfaction_call`. Memnuniyet araması. |
| **REVIEW_AND_REFERRAL** | **Meta WhatsApp API** | Şablon tablosundan. Referral/review mesajı. |
| **POST_TREATMENT_DAY30** | **VAPI AI Agent** | `action_type: check_in_call`. Kontrol araması. |
| **RECOVERY_MANAGEMENT** | **Yok (bekleme)** | 30 gün sonra LOYAL'e geçer. |
| **LOYAL** | **Yok (terminal)** | `status: completed`. Funnel sona erer. |
| **ARCHIVE_GDPR** | **Yok (terminal)** | `status: archived`. Lead arşivlenir. |
| **DAY60_STILL_HERE** | **Meta WhatsApp API** | Şablon tablosundan. Ama bu stage'e giden zaman geçişi `TIME_TRANSITIONS`'da **tanımlı değil** — EKSİK. |
| **URGENT_ALERT** | **Yok** | `STAGE_ENTRY_ACTIONS` içinde **tanımlı değil** — aksiyon yapılmaz. EKSİK. |

---

### 3.3 VAPI Agent Detayları

Her AI araması için `lib/funnel-actions.ts → executeFunnelCall()` çalışır ve şu yapıyı kullanır:

```typescript
// Profil öncelikli; yoksa env fallback
const assistantId = profile.vapi_assistant_id || process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID
const phoneNumberId = profile.vapi_phone_number_id || process.env.VAPI_PHONE_NUMBER_ID
const apiKey = profile.vapi_private_key?.trim() || process.env.VAPI_PRIVATE_KEY
```

VAPI'ye gönderilen `metadata`:
```json
{
  "lead_id": "...",
  "user_id": "...",
  "funnel_lead_id": "...",
  "schedule_id": "...",
  "action_type": "ai_call",
  "source": "funnel",
  "language": "en"
}
```

Bu metadata, arama bitince `/api/vapi` webhook'una geri gelir ve hangi funnel schedule'ın tamamlandığı bu bilgiyle eşleştirilir.

---

### 3.4 OpenAI Değerlendirme Agent'ı (Call Evaluation)

Her VAPI araması bitince `app/api/vapi/route.ts → handleEndOfCallReport()` çalışır:

1. Transkript varsa → **OpenAI `gpt-4o-mini`** ile değerlendirme yapılır (`EVALUATION_SYSTEM_PROMPT`)
2. Transkript yoksa → `endedReason` bazlı varsayılan değerlendirme oluşturulur
3. Sonuç: `score (1-10)`, `outcome`, `sentiment`, `tags`
4. Bu değerlendirme funnel geçişini belirler:
   - `not_interested / rejected` → `call_result_hard`
   - `interested / appointment_set / callback_requested` → `call_result_soft`
   - `no_answer / voicemail / busy` → `call_result_no_answer`

Gerekli env: `OPENAI_API_KEY`

---

## 4. Cron Çalışma Akışı

**Vercel Cron:** Her 2 dakikada bir `GET /api/cron/funnel` tetiklenir (`vercel.json`).

```
CRON TETİKLENİR
    │
    ├── PART 1: Bekleyen aksiyonları işle
    │   ├── funnel_schedules → status=pending, scheduled_at <= şimdi → en fazla 50 kayıt
    │   ├── Her aksiyon için:
    │   │   ├── funnel_config.is_running=false ise atla
    │   │   ├── Çağrı aksiyonu ise günlük limit kontrolü yap
    │   │   │   └── Limit doluysa scheduled_at'ı bir sonraki slota kaydır
    │   │   ├── Profili yükle (önbellekle)
    │   │   ├── Payload'da lead bilgisi yoksa leads tablosundan backfill et
    │   │   ├── status → "processing"
    │   │   ├── executeFunnelCall() → VAPI API çağrısı
    │   │   │   └── Başarılı → schedule "processing" kalır (webhook tamamlar)
    │   │   ├── executeFunnelWhatsApp() → Meta Graph API
    │   │   │   └── Başarılı → schedule "completed"
    │   │   ├── executeFunnelLiveTransferNotification() → Kliniğe WhatsApp
    │   │   │   └── Başarılı → schedule "completed"
    │   │   └── Hata: retry_count < max_retries → 15 dk sonra tekrar dene
    │   │                  max_retries aşıldı → status "failed"
    │   │
    └── PART 2: Zaman bazlı geçişler
        ├── TIME_TRANSITIONS listesi her birini kontrol eder
        │   └── entered_current_stage_at + days <= şimdi → transitionFunnelLead()
        └── HARD_WAITING → HARD_RE_ENGAGEMENT
            └── funnel_config.hard_waiting_days geçince geçiş yapılır
```

---

## 5. VAPI Webhook → Funnel Geçiş Akışı

```
VAPI araması biter
    │
    ▼
POST /api/vapi (end-of-call-report)
    │
    ├── userId tespiti:
    │   1. metadata.user_id
    │   2. outreach kaydından
    │   3. leads tablosundan (lead_id ile)
    │   4. Telefon eşleşmesi (leads.phone)
    │   5. profiles.vapi_org_id ile
    │   6. profiles.vapi_assistant_id ile
    │
    ├── Değerlendirme:
    │   ├── Transkript/özet varsa → OpenAI gpt-4o-mini
    │   └── Yoksa → endedReason'a göre varsayılan
    │
    ├── calls tablosuna kayıt
    │
    └── FUNNEL ENTEGRASYONU (lead funnel'daysa):
        ├── funnelCondition = mapCallResultToFunnelCondition(endedReason, outcome, score)
        ├── Mevcut stage'e göre next stage belirle:
        │   ├── DAY0_AI_CALL:
        │   │   ├── hard → HARD_WAITING
        │   │   ├── soft → SOFT_FOLLOWUP
        │   │   └── no_answer → NO_ANSWER_WHATSAPP_INTRO
        │   ├── HARD_REACQUISITION_CALL:
        │   │   ├── soft → LIVE_TRANSFER
        │   │   ├── no_answer → null (geçiş yok, EKSİK)
        │   │   └── hard → ARCHIVE_GDPR
        │   ├── POST_TREATMENT_DAY7:
        │   │   ├── soft → REVIEW_AND_REFERRAL
        │   │   └── hard → URGENT_ALERT
        │   └── POST_TREATMENT_DAY30 → RECOVERY_MANAGEMENT
        │
        ├── transitionFunnelLead() çağrılır
        └── schedule_id "completed" yapılır
```

---

## 6. Tam Çalışması İçin Eksikler

### 6.1 Veritabanı Kurulumu (Kritik)

- [ ] `supabase/migration-funnel.sql` dosyasının Supabase SQL Editor'de çalıştırılması
- [ ] Her tenant için `seed_funnel_stages(user_id)` fonksiyonunun çağrılması (yoksa `funnel/start` route'u "Funnel stages not seeded" hatası verir)

```sql
-- Her yeni tenant için:
SELECT seed_funnel_stages('USER_UUID_HERE');
```

### 6.2 Environment Variables (Kritik)

`.env.local` ve Vercel'de tanımlı olması gerekenler:

| Değişken | Kullanım | Zorunlu mu? |
|----------|----------|-------------|
| `VAPI_PRIVATE_KEY` | VAPI outbound aramaları (env fallback) | Evet (veya profile'da) |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | VAPI assistant (env fallback) | Evet (veya profile'da) |
| `VAPI_PHONE_NUMBER_ID` | VAPI telefon numarası (env fallback) | Evet (veya profile'da) |
| `OPENAI_API_KEY` | Arama değerlendirmesi (gpt-4o-mini) | Evet |
| `CRON_SECRET` | Cron endpoint güvenliği | Önerilen |

### 6.3 Profil Alanları (Tenant Başına)

Her tenant'ın `profiles` tablosunda şu alanların dolu olması gerekir:

| Alan | Kullanım | Nasıl Doldurulur |
|------|----------|-----------------|
| `vapi_assistant_id` | AI aramaları | VAPI Dashboard → Assistant ID |
| `vapi_phone_number_id` | Çıkan numaranın ID'si | VAPI Dashboard → Phone Numbers |
| `vapi_private_key` | VAPI API anahtarı | VAPI Dashboard → API Keys |
| `whatsapp_phone_number_id` | WhatsApp gönderimi | Meta Business → Phone Number ID |
| `whatsapp_access_token` | WhatsApp API yetkisi | Meta Business → Access Token |
| `company_name` | Mesaj şablonlarında `{{clinic_name}}` | Settings sayfasından |
| `phone` | Live transfer bildiriminin gideceği klinik numarası | Settings sayfasından |

Güncelleme için Supabase SQL:
```sql
UPDATE profiles SET
  vapi_assistant_id = 'asst_xxx',
  vapi_phone_number_id = 'phone_xxx',
  vapi_private_key = 'vapi_key_xxx',
  whatsapp_phone_number_id = 'wa_phone_id',
  whatsapp_access_token = 'wa_token',
  company_name = 'Klinik Adı',
  phone = '+905551234567'
WHERE id = 'USER_UUID';
```

### 6.4 WhatsApp Mesaj Şablonları (Kritik)

WhatsApp aksiyonu olan her stage için `funnel_message_templates` tablosunda kayıt olması gerekir. Şu anda **migration seed'de şablonlar yok** — elle eklenmesi şart.

Şablon gereken stage'ler:

| Stage | `stage_name` değeri | Desteklenen değişkenler |
|-------|---------------------|------------------------|
| NO_ANSWER_WHATSAPP_INTRO | `NO_ANSWER_WHATSAPP_INTRO` | `{{lead_name}}`, `{{clinic_name}}` |
| NO_ANSWER_DAY1 | `NO_ANSWER_DAY1` | `{{lead_name}}`, `{{clinic_name}}` |
| NO_ANSWER_DAY2 | `NO_ANSWER_DAY2` | `{{lead_name}}`, `{{clinic_name}}` |
| NO_ANSWER_DAY15 | `NO_ANSWER_DAY15` | `{{lead_name}}`, `{{clinic_name}}` |
| SOFT_FOLLOWUP | `SOFT_FOLLOWUP` | `{{lead_name}}`, `{{clinic_name}}` |
| HARD_RE_ENGAGEMENT | `HARD_RE_ENGAGEMENT` | `{{lead_name}}`, `{{clinic_name}}` |
| REVIEW_AND_REFERRAL | `REVIEW_AND_REFERRAL` | `{{lead_name}}`, `{{clinic_name}}` |
| DAY60_STILL_HERE | `DAY60_STILL_HERE` | `{{lead_name}}`, `{{clinic_name}}` |

Örnek SQL:
```sql
INSERT INTO funnel_message_templates
  (user_id, stage_name, channel, language, content, variables, is_active)
VALUES
  (
    'USER_UUID',
    'NO_ANSWER_WHATSAPP_INTRO',
    'whatsapp',
    'tr',
    'Merhaba {{lead_name}}, {{clinic_name}} olarak sizi daha önce aradık ancak ulaşamadık. Size nasıl yardımcı olabiliriz?',
    '{"lead_name","clinic_name"}',
    true
  );
-- Her stage için aynı yapıda ekle
```

**Önemli:** Meta WhatsApp Business API, dış kaynaklara (new contact) gönderilen mesajlarda **onaylanmış template** gerektirebilir. Kişi daha önce mesaj atmışsa serbest metin gönderilebilir; yoksa template başvurusu gerekir.

### 6.5 VAPI Webhook Yapılandırması (Kritik)

VAPI Dashboard'da webhook URL ayarlanmalı:

```
https://your-domain.com/api/vapi
```

VAPI'nin metadata'yı webhook'a iletmesi için assistant konfigürasyonunda `metadata` forwarding açık olmalı. Funnel aramaları şu metadata'yı gönderir:

```json
{
  "source": "funnel",
  "funnel_lead_id": "...",
  "schedule_id": "...",
  "lead_id": "..."
}
```

Webhook bu `schedule_id` ile `funnel_schedules` kaydını "completed" yapar ve stage geçişini tetikler.

### 6.6 Funnel'ı Başlatma

Leads "new" statüsünde olmalı ve `StartFunnelModal` aracılığıyla funnel başlatılmalı:

```
/[tenant]/funnel → "Start Funnel" butonu
→ POST /api/funnel/start?userId=...
  body: { leadIds?, dailyCallLimit, callingHoursStart, callingHoursEnd }
```

Bu endpoint:
1. `funnel_config` oluşturur/günceller (is_running=true)
2. Status="new" olan tüm lead'leri DAY0_AI_CALL aşamasına ekler
3. Her lead için ilk `ai_call` schedule'ı oluşturur

---

## 7. Mevcut Kod Hataları ve Logic Boşlukları

### 7.1 HARD_REACQUISITION_CALL → No Answer Durumu

**Sorun:** VAPI webhook'ta `HARD_REACQUISITION_CALL` için `call_result_no_answer` gelince `nextStageName = null` atanıyor — lead hiçbir yere geçmiyor, schedule tekrar oluşturulmuyor.

```typescript
// app/api/vapi/route.ts satır 778-779
} else if (funnelCondition === "call_result_no_answer") {
  nextStageName = null; // will retry via scheduler  ← YANLIŞ: retry planlanmıyor
}
```

**Çözüm:** Bu durumda lead'i aynı stage'de bırakıp yeni bir `ai_call` schedule'ı oluşturmak gerekir.

---

### 7.2 LIVE_TRANSFER → TREATMENT Geçişi Yok

**Sorun:** Lead `LIVE_TRANSFER` aşamasına geçince klinik bildirim WhatsApp'ı gönderilir ve süreç durur. TREATMENT aşamasına geçiş ne cron'da ne webhook'ta tanımlı.

**Çözüm:** Klinik personelin "tedavi başladı" onayını sisteme iletebileceği bir endpoint veya otomatik zaman geçişi eklenmeli.

---

### 7.3 URGENT_ALERT Stage'i Boş

**Sorun:** `STAGE_ENTRY_ACTIONS` içinde `URGENT_ALERT` için hiçbir aksiyon tanımlı değil. Lead bu aşamaya düşünce hiçbir şey olmaz.

```typescript
// lib/funnel-engine.ts — URGENT_ALERT tanımsız
const STAGE_ENTRY_ACTIONS: Record<string, ...> = {
  // ... URGENT_ALERT yok
}
```

**Çözüm:** `URGENT_ALERT` için bir `live_transfer_alert` veya özel bildirim aksiyonu tanımlanmalı.

---

### 7.4 DAY60_STILL_HERE Stage'ine Giriş Yolu Yok

**Sorun:** `STAGE_ENTRY_ACTIONS`'da `DAY60_STILL_HERE` için `whatsapp_message` tanımlı, ancak `TIME_TRANSITIONS`'da bu aşamaya geçecek bir kural bulunmuyor.

**Çözüm:** `TIME_TRANSITIONS` dizisine bir kural eklenmeli:
```typescript
{ from: "RECOVERY_MANAGEMENT", to: "DAY60_STILL_HERE", days: 60 }
// veya LOYAL'den sonra bir geri dönüş senaryosu
```

---

### 7.5 Gelen WhatsApp Yanıtları İşlenmiyor

**Sorun:** `FunnelConditionType` içinde `response_positive`, `response_negative`, `response_uncertain` gibi koşullar tanımlı, ancak gelen WhatsApp mesajlarını işleyen bir webhook endpoint yok. WhatsApp reply'larına göre funnel geçişi hiç gerçekleşmiyor.

**Çözüm:** Gelen WhatsApp mesajlarını alan bir `/api/webhooks/whatsapp` endpoint'i oluşturulmalı ve `transitionFunnelLead()` çağırmalı.

---

### 7.6 Timezone Her Lead İçin Sabit "Europe/London"

**Sorun:** `app/api/funnel/start/route.ts` her lead'i `Europe/London` timezone ile başlatıyor. Farklı ülkelerden lead'ler için çağrı saatleri yanlış hesaplanır.

```typescript
// app/api/funnel/start/route.ts satır 108
metadata: { timezone: "Europe/London" },  // Sabit — EKSİK
```

**Çözüm:** `leads` tablosundan `timezone` alanı varsa kullanılmalı; yoksa `country`/`phone` prefix'inden tahmin edilmeli.

---

### 7.7 unreachable_count Her Zaman 0

**Sorun:** `app/api/funnel/stats/route.ts` içinde `unreachable_count` hardcode `0` olarak dönüyor. UI'de gösterilen bilgi hatalı.

```typescript
unreachable_count: 0, // TODO: calculate properly  ← EKSİK
```

**Çözüm:** ARCHIVE_GDPR aşamasındaki lead sayısı veya "voicemail/no_answer" etiketli event sayısından hesaplanmalı.

---

### 7.8 funnel/start Payload'ında lead_id Eksik

**Sorun:** İlk schedule oluşturulurken payload'a yalnızca `lead_name` ve `lead_phone` ekleniyor, `lead_id` eklenmiyor. Cron bunu backfill ediyor ama bu gereksiz bir DB sorgusu.

```typescript
// app/api/funnel/start/route.ts satır 139
payload: { lead_name: lead.full_name, lead_phone: lead.phone }
// lead_id, lead_email, lead_language EKSİK
```

---

### 7.9 SOFT_FOLLOWUP'tan Sonra Zaman Geçişi Yok

**Sorun:** Lead `SOFT_FOLLOWUP` aşamasına gelince WhatsApp mesajı gönderilir, ancak bu kişi yanıt vermezse sistem ne yapacağını bilmiyor. TIME_TRANSITIONS'da bu aşamadan çıkış yok.

**Çözüm:** Belirli gün sonra (örn. 7 gün) HARD_WAITING veya ARCHIVE_GDPR'ye geçiş tanımlanmalı.

---

## 8. Özet: Çalıştırmak için Yapılacaklar Listesi

### Zorunlu (olmadan hiç çalışmaz)
1. [ ] Supabase'de `migration-funnel.sql` çalıştır
2. [ ] Her tenant için `seed_funnel_stages(user_id)` çalıştır
3. [ ] `OPENAI_API_KEY` env'e ekle
4. [ ] `VAPI_PRIVATE_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID` env'e ekle
5. [ ] Her tenant'ın profiline VAPI alanlarını doldur (`vapi_assistant_id`, `vapi_phone_number_id`, `vapi_private_key`)
6. [ ] VAPI Dashboard'da webhook URL'sini `/api/vapi`'ye ayarla
7. [ ] Her WhatsApp stage için `funnel_message_templates` kaydı oluştur (8 stage)

### Önerilen (kararlı çalışma için)
8. [ ] Her tenant'ın profiline WhatsApp alanlarını doldur (`whatsapp_phone_number_id`, `whatsapp_access_token`)
9. [ ] `CRON_SECRET` env'e ekle ve Vercel'de aynı değeri tanımla

### Kod Düzeltmeleri (logic hataları)
10. [ ] `HARD_REACQUISITION_CALL` → no_answer durumunda yeniden schedule oluştur
11. [ ] `LIVE_TRANSFER` → `TREATMENT` geçişini tanımla (manual onay veya oto-geçiş)
12. [ ] `URGENT_ALERT` stage'ine aksiyon ekle
13. [ ] `DAY60_STILL_HERE` için TIME_TRANSITIONS'a giriş kuralı ekle
14. [ ] `SOFT_FOLLOWUP` için zaman bazlı çıkış kuralı ekle
15. [ ] Lead timezone'larını dinamik belirle
16. [ ] `unreachable_count` hesaplamasını düzelt
17. [ ] Gelen WhatsApp mesajları için webhook endpoint yaz

---

## 9. Sistem Mimarisi Özeti

```
[Lead Girişi]
    │
    ▼
POST /api/funnel/start
    │ funnel_leads + funnel_schedules oluşturur
    ▼
[Vercel Cron — her 2 dakika]
GET /api/cron/funnel
    │
    ├── pending schedule → VAPI outbound call
    │       │ (VAPI arıyor, sonuç webhook'a geliyor)
    │       ▼
    │   POST /api/vapi (end-of-call-report)
    │       │ OpenAI → değerlendirme
    │       │ transitionFunnelLead() → yeni stage + yeni schedule
    │
    ├── pending schedule → WhatsApp message
    │       │ Meta Graph API
    │       └── schedule "completed"
    │
    ├── pending schedule → live_transfer_alert
    │       │ Klinik WhatsApp bildirimi
    │       └── schedule "completed"
    │
    └── TIME_TRANSITIONS kontrolü
            └── Zaman dolmuşsa transitionFunnelLead()
```

---

## 10. İlgili Kaynak Dosyalar

| Dosya | Konu |
|-------|------|
| `lib/funnel-engine.ts` | Stage geçişleri, zaman hesaplama, STAGE_ENTRY_ACTIONS, TIME_TRANSITIONS |
| `lib/funnel-actions.ts` | VAPI araması, WhatsApp gönderimi, live transfer bildirimi |
| `lib/types-funnel.ts` | Tüm TypeScript type tanımları |
| `lib/mock-funnel-demo.ts` | Demo/yatırımcı modu için sahte veri |
| `app/api/cron/funnel/route.ts` | Ana cron loop — schedule işleme + zaman geçişleri |
| `app/api/funnel/start/route.ts` | Funnel başlatma — lead'leri DAY0'a ekle |
| `app/api/funnel/stages/route.ts` | Tüm stage'leri ve lead sayılarını getir |
| `app/api/funnel/stats/route.ts` | Simple pipeline istatistikleri |
| `app/api/funnel/pause/route.ts` | Funnel'ı durdur/başlat |
| `app/api/funnel/leads/route.ts` | Funnel'daki lead listesi |
| `app/api/funnel/activity/route.ts` | Son olaylar akışı |
| `app/api/funnel/config/route.ts` | Config okuma/güncelleme |
| `app/api/vapi/route.ts` | VAPI webhook handler — funnel entegrasyonu burada |
| `supabase/migration-funnel.sql` | DB şeması + seed fonksiyonu |
| `hooks/useFunnel.ts` | Frontend veri hook'u |
| `components/funnel/FunnelDashboard.tsx` | Ana dashboard bileşeni |
| `components/funnel/FunnelAdvancedFlow.tsx` | SVG stage flow görselleştirmesi |
| `components/funnel/StartFunnelModal.tsx` | Funnel başlatma modal'ı |
