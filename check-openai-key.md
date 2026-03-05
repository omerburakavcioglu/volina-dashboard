# OpenAI API Key Sorun Giderme

## Kontrol Listesi

### 1. API Key'in Doğru Projede Olduğundan Emin Olun
- https://platform.openai.com/api-keys adresine gidin
- API key'inizin hangi projeye ait olduğunu kontrol edin
- Usage dashboard'da seçili projenin "Default project" olduğundan emin olun

### 2. Billing Ayarlarını Kontrol Edin
- https://platform.openai.com/account/billing adresine gidin
- "Payment methods" bölümünde ödeme yönteminin aktif olduğundan emin olun
- "Usage limits" bölümünde herhangi bir limit olmadığından emin olun
- "Pay as you go" seçeneğinin aktif olduğundan emin olun

### 3. Yeni API Key Oluşturun (Önerilen)
1. https://platform.openai.com/api-keys adresine gidin
2. Mevcut key'i silin (opsiyonel)
3. Yeni bir key oluşturun
4. `.env.local` dosyasındaki `OPENAI_API_KEY` değerini güncelleyin
5. Development server'ı yeniden başlatın:
   ```bash
   # Server'ı durdurun (Ctrl+C)
   npm run dev
   ```

### 4. Test Edin
```bash
curl -X POST "http://localhost:3003/api/calls/re-evaluate-structured" \
  -H "Content-Type: application/json" \
  -d '{"callId":"35f29c50-e941-4cf9-897e-67e18996cfeb","force":true}'
```

## Alternatif: Mock Evaluation ile Test

Eğer API sorunu devam ederse, geçici olarak mock evaluation kullanabiliriz.
