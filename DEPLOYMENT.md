# Volina Dashboard — Deployment Checklist

## 1. Vercel Project Setup

- [ ] Create new Vercel project: **volina-dashboard**
- [ ] Connect to the `volina-dashboard` Git repository
- [ ] Framework preset: **Next.js** (auto-detected)
- [ ] Node.js version: **20.x** (match `engines` in package.json)
- [ ] Build command: `npm run build` (default)
- [ ] Output directory: `.next` (default)

## 2. Domain Configuration (GoDaddy + Vercel)

### 2a. GoDaddy’da CNAME ekleme (volina.ai → GoDaddy) abc avc

1. [godaddy.com](https://www.godaddy.com) → **My Products** → **volina.ai** → **DNS** (veya **Manage DNS**).
2. **Records** bölümünde **Add** / **Add New Record**.
3. Şu değerleri gir:
   - **Type:** `CNAME`
   - **Name:** `dashboard`  
     (Bazı arayüzlerde “Host” veya “Subdomain” olarak geçer; sadece `dashboard` yaz, `.volina.ai` ekleme.)
   - **Value / Points to:** Vercel Domains sayfasındaki **CNAME** değeri (projeye özel, örn. `6a3f6de1d2f4ca62.vercel-dns-017.com.` — ekrandaki Copy ile kopyala)
   - **TTL:** 600 (veya 1 Hour) — varsayılan kalabilir.
4. **Save** ile kaydet.

**"Linked to another Vercel account" uyarısı için TXT kaydı (zorunlu):**  
Vercel’de bu uyarı çıkıyorsa GoDaddy’da bir **TXT** kaydı daha ekle: **Type** `TXT`, **Name** `_vercel`, **Value** Vercel’deki TXT satırının tamamı (`vc-domain-verify=dashboard.volina.ai,...` — Copy ile kopyala). Doğrulama sonrası TXT’yi silebilirsin.

### 2b. Vercel’de domain eklemek

- [ ] Vercel Dashboard → **volina-dashboard** projesi → **Settings** → **Domains** → **Add** → `dashboard.volina.ai` yaz → **Add**.
- DNS yayılımı 5–30 dakika sürebilir; Vercel doğrulayınca yeşil tik gelir.
- SSL sertifikası Vercel tarafından otomatik verilir.

### 2c. Kontrol

- [ ] Tarayıcıda `https://dashboard.volina.ai` açılmalı.
- [ ] Adres çubuğunda kilit ikonu (HTTPS) görünmeli.

## 3. Environment Variables (Vercel)

Add all variables from `.env.example` to Vercel → Project Settings → Environment Variables:

| Variable | Scope | Notes |
|---|---|---|
| `NEXTAUTH_URL` | Production | **Must be** `https://dashboard.volina.ai` |
| `NEXTAUTH_SECRET` | All | Same secret as existing app or generate new |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Same as existing |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Same as existing |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Same as existing |
| `VAPI_PRIVATE_KEY` | All | Same as existing |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | All | Same as existing |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | All | Same as existing |
| `VAPI_PHONE_NUMBER_ID` | All | Same as existing |
| `GOOGLE_CLIENT_ID` | All | Same as existing |
| `GOOGLE_CLIENT_SECRET` | All | Same as existing |
| `OPENAI_API_KEY` | All | Same as existing |
| `CRON_SECRET` | All | Same as existing |

> **Critical**: `NEXTAUTH_URL` must be the canonical production URL. Mismatched values cause auth redirect failures.

## 4. Supabase Auth Configuration

- [ ] Go to Supabase Dashboard → Authentication → URL Configuration
- [ ] Add to **Redirect URLs** allowlist:
  - `https://dashboard.volina.ai/**`
  - `https://dashboard-staging.volina.ai/**` (if using staging)
- [ ] Keep existing `volina.online` entries for backward compatibility during transition

## 5. Google OAuth Configuration

- [ ] Go to Google Cloud Console → APIs & Services → Credentials
- [ ] Edit the OAuth 2.0 Client ID used by the app
- [ ] Add to **Authorized redirect URIs**:
  - `https://dashboard.volina.ai/api/auth/callback/google`
- [ ] Keep existing redirect URIs during transition period

## 6. Vapi Webhook Configuration

- [ ] In Vapi Dashboard → Assistant Settings → Server URL
- [ ] Update webhook URL to: `https://dashboard.volina.ai/api/vapi`
  (or whichever endpoint your Vapi assistant posts to)
- [ ] Tool endpoints will automatically work since paths are preserved

## 7. Cron Jobs (if using Vercel Cron)

- [ ] Add `vercel.json` with cron configuration if needed:

```json
{
  "crons": [
    {
      "path": "/api/cron/campaigns",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

- [ ] Or update external cron service URLs to point to `dashboard.volina.ai`

## 8. Legacy Redirect Deployment

- [ ] Deploy updated `next.config.mjs` in the old `volina-web1` repo
- [ ] Verify `volina.online/dashboard` → `dashboard.volina.ai/` (308 redirect)
- [ ] Verify `volina.online/dashboard/settings` → `dashboard.volina.ai/dashboard/settings` (308)

---

## Post-Launch Verification Checklist

### Authentication
- [ ] Visit `https://dashboard.volina.ai` → should redirect to `/login`
- [ ] Login with email/password → should redirect to `/{tenant}`
- [ ] Login as admin → should redirect to `/admin`
- [ ] Logout → should return to `/login`
- [ ] Google Calendar OAuth flow (connect from calendar page) completes successfully

### Tenant Pages
- [ ] `/{tenant}` — tenant home loads
- [ ] `/{tenant}/calls` — calls table loads with data
- [ ] `/{tenant}/leads` — leads page loads
- [ ] `/{tenant}/messages` — messages page loads
- [ ] `/{tenant}/campaigns` — campaigns page loads
- [ ] `/{tenant}/calendar` — calendar page loads, Google Calendar integration works
- [ ] `/{tenant}/ai-settings` — AI settings page loads
- [ ] `/{tenant}/analytics` — analytics page loads
- [ ] `/{tenant}/settings` — settings page loads

### Admin
- [ ] `/admin` — admin dashboard loads with client list
- [ ] VAPI settings dialog opens and saves

### API / Webhooks
- [ ] `/api/dashboard/calls` — returns 200 with data
- [ ] `/api/vapi` webhook — receives and processes Vapi events
- [ ] `/api/campaigns/run` — campaign execution works
- [ ] `/api/cron/campaigns` — cron endpoint responds
- [ ] `/api/calendar/google` — Google Calendar API works

### Legacy Redirects
- [ ] `volina.online/dashboard` → `dashboard.volina.ai/` (308)
- [ ] `volina.online/dashboard/calls` → `dashboard.volina.ai/dashboard/calls` (308)
- [ ] Old bookmarked/shared links still work

### Rollback Plan
If critical issues are found:
1. Revert DNS `dashboard.volina.ai` CNAME
2. Remove redirect rules from old repo's `next.config.mjs`
3. Old dashboard at `volina.online/dashboard` resumes serving
4. Supabase allowlist still has old entries, auth works immediately
