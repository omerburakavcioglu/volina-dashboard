import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create a loosely typed Supabase client for seeding outbound tables
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Mock data arrays
const callNames = [
  'Ahmet Yılmaz', 'Mehmet Demir', 'Ayşe Kaya', 'Fatma Çelik', 'Ali Öztürk',
  'Zeynep Arslan', 'Mustafa Şahin', 'Elif Aydın', 'Hüseyin Koç', 'Hatice Yıldız',
  'Emre Polat', 'Selin Aktaş', 'Oğuz Erdem', 'Deniz Korkmaz', 'Burak Özkan',
  'Ceren Güneş', 'Kaan Yavuz', 'Esra Taş', 'Murat Aksoy', 'Gizem Sarı',
  'John Smith', 'Emily Johnson', 'Michael Brown', 'Sarah Davis', 'David Wilson',
  'Emma Martinez', 'James Anderson', 'Olivia Taylor', 'Robert Thomas', 'Sophia Moore'
];

const callPhones = [
  '+905551234501', '+905551234502', '+905551234503', '+905551234504', '+905551234505',
  '+905551234506', '+905551234507', '+905551234508', '+905551234509', '+905551234510',
  '+905551234511', '+905551234512', '+905551234513', '+905551234514', '+905551234515',
  '+905551234516', '+905551234517', '+905551234518', '+905551234519', '+905551234520',
  '+447551234501', '+447551234502', '+447551234503', '+447551234504', '+447551234505',
  '+447551234506', '+447551234507', '+447551234508', '+447551234509', '+447551234510'
];

const treatments = [
  'Diş İmplantı', 'Saç Ekimi', 'Burun Estetiği', 'Göz Kapağı', 'Yüz Germe',
  'Dental Veneers', 'Hair Transplant', 'Rhinoplasty', 'Blepharoplasty', 'Facelift',
  'Hollywood Smile', 'Zirkonyum', 'Diş Beyazlatma', 'All-on-4', 'All-on-6'
];

const sources = ['web_form', 'instagram', 'referral', 'facebook', 'google_ads'];

const summariesTr = [
  'Hasta diş implantı fiyatları hakkında bilgi aldı. Online randevu için istekli.',
  'Saç ekimi prosedürü detaylı anlatıldı. 3 ay sonra Türkiye\'ye gelmek istiyor.',
  'Hollywood Smile paketimiz hakkında bilgi verildi. Fotoğraf göndermesini bekleyeceğiz.',
  'Burun estetiği öncesi konsültasyon istedi. Online doktor görüşmesi ayarlandı.',
  'Fiyat teklifimizi değerlendirecek. Hafta sonuna kadar dönüş yapacak.',
  'Tedavi planı gönderildi. Çok ilgili, ailesine danışacak.',
  'All-on-4 implant tedavisi için hazır. Randevu tarihi belirlendi.',
  'Bütçe konusunda tereddütlü. Taksit seçenekleri sunuldu.',
  'Daha önce başka klinikten teklif almış. Fiyatlarımız daha uygun.',
  'Hemen gelmek istiyor. Acil randevu ayarlandı.'
];

const evaluationsTr = [
  'Yüksek ilgi. Hemen takip edilmeli. Online randevu için çok istekli.',
  'Orta ilgi. Fiyat karşılaştırması yapıyor. 2 gün içinde takip önerilir.',
  'Çok ilgili hasta. Tedavi planı istedi. Öncelikli takip.',
  'Düşük ilgi. Sadece fiyat sorguluyor. Standart takip yeterli.',
  'Sıcak lead. Aile onayı bekliyor. 3 gün sonra aranmalı.',
  'Çok motive. Tarih belirleme aşamasında. Bugün takip et.',
  'Bütçe sıkıntısı var. Taksit planı ile ikna edilebilir.',
  'Rakip klinik ile karşılaştırıyor. Avantajlarımız anlatıldı.',
  'Acil hasta. 1 hafta içinde gelmek istiyor. Öncelikli.',
  'İlgili ama kararsız. Detaylı bilgi paketi gönderilmeli.'
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.random() * daysAgo);
  date.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);
  return date.toISOString();
}

export async function POST(request: Request) {
  try {
    // Get user ID from request body (logged-in user)
    let userId: string | null = null;
    
    try {
      const body = await request.json();
      userId = body.userId;
    } catch {
      // If no body, try to get first user (backward compatibility)
    }
    
    // If no userId provided, get the first user (fallback)
    if (!userId) {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .limit(1);

      if (profileError || !profiles?.[0]) {
        return NextResponse.json(
          { success: false, error: "No user found. Please create a user first." },
          { status: 400 }
        );
      }
      userId = profiles[0].id;
    }
    
    // Verify user exists
    const { data: userCheck, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();
      
    if (userError || !userCheck) {
      return NextResponse.json(
        { success: false, error: "User not found. Please sign in again." },
        { status: 400 }
      );
    }

    // Clean existing data
    await supabaseAdmin.from("online_appointments").delete().eq("user_id", userId);
    await supabaseAdmin.from("outreach").delete().eq("user_id", userId);
    await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    await supabaseAdmin.from("message_templates").delete().eq("user_id", userId);
    await supabaseAdmin.from("calls").delete().eq("user_id", userId);
    await supabaseAdmin.from("leads").delete().eq("user_id", userId);
    await supabaseAdmin.from("campaigns").delete().eq("user_id", userId);

    // Create campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .insert({
        user_id: userId,
        name: "Medical Tourism 2024",
        description: "Ana satış kampanyası - Diş ve estetik tedavileri",
        is_active: true,
        duration_days: 730,
        schedule: [
          { day: 0, channel: "call", description: "İlk arama" },
          { day: 1, channel: "whatsapp", description: "Takip mesajı" },
          { day: 7, channel: "call", description: "Haftalık takip" },
          { day: 15, channel: "email", description: "Bilgi paketi" }
        ],
        default_language: "tr"
      })
      .select()
      .single();

    if (campaignError) {
      console.error("Campaign error:", campaignError);
    }

    const campaignId = campaign?.id;

    // Create leads
    const leadStatuses = [
      ...Array(8).fill('new'),
      ...Array(6).fill('contacted'),
      ...Array(6).fill('interested'),
      ...Array(4).fill('appointment_set'),
      ...Array(3).fill('converted'),
      ...Array(2).fill('unreachable'),
      ...Array(1).fill('lost')
    ];

    const leadsToInsert = leadStatuses.map((status, i) => ({
      user_id: userId,
      full_name: callNames[i] || `Lead ${i + 1}`,
      email: (callNames[i] || `lead${i}`).toLowerCase().replace(' ', '.') + '@email.com',
      phone: callPhones[i] || `+9055512345${String(i).padStart(2, '0')}`,
      whatsapp: callPhones[i] || `+9055512345${String(i).padStart(2, '0')}`,
      instagram: Math.random() > 0.5 ? '@' + (callNames[i] || 'user').toLowerCase().replace(' ', '_') : null,
      language: i < 20 ? 'tr' : 'en',
      source: randomItem(sources),
      treatment_interest: randomItem(treatments),
      notes: Math.random() > 0.3 ? `Lead ${callNames[i] || i} için notlar.` : null,
      status,
      priority: Math.random() < 0.3 ? 'high' : Math.random() < 0.6 ? 'medium' : 'low',
      first_contact_date: randomDate(30),
      last_contact_date: randomDate(7),
      next_contact_date: ['new', 'contacted', 'interested'].includes(status) ? randomDate(-3) : null,
      contact_attempts: randomInt(0, 5),
      campaign_id: campaignId,
      campaign_day: status === 'new' ? 0 : status === 'contacted' ? 1 : status === 'interested' ? 7 : 15,
      assigned_to: 'AI Asistan',
      created_at: randomDate(60)
    }));

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .insert(leadsToInsert)
      .select();

    if (leadsError) {
      console.error("Leads error:", leadsError);
      return NextResponse.json(
        { success: false, error: "Failed to create leads", details: leadsError.message },
        { status: 500 }
      );
    }

    const leadIds = leads?.map(l => l.id) || [];

    // Create calls (50 calls distributed over 30 days)
    const callsToInsert = [];
    for (let i = 0; i < 50; i++) {
      const outcomeRoll = randomInt(0, 9);
      let sentiment: string;
      let duration: number;
      let score: number;

      if (outcomeRoll <= 3) {
        // High interest - positive outcome
        sentiment = 'positive';
        duration = randomInt(180, 480); // 3-8 minutes
        score = randomInt(8, 10);
      } else if (outcomeRoll <= 6) {
        // Medium interest - neutral outcome
        sentiment = 'neutral';
        duration = randomInt(90, 240); // 1.5-4 minutes
        score = randomInt(5, 7);
      } else {
        // Low interest - negative/short call
        sentiment = randomInt(0, 1) === 0 ? 'negative' : 'neutral';
        duration = randomInt(30, 120); // 0.5-2 minutes
        score = randomInt(2, 4);
      }

      // Distribute calls - more recent calls
      const daysAgo = 30 - (i / 50 * 30);
      const callDate = new Date();
      callDate.setDate(callDate.getDate() - daysAgo);
      callDate.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);

      callsToInsert.push({
        user_id: userId,
        vapi_call_id: `mock_call_${i}_${Date.now()}`,
        recording_url: `https://storage.vapi.ai/mock-recording-${i}.mp3`,
        transcript: duration > 60 ? 'Merhaba, ben Volina AI asistanınızım. Size nasıl yardımcı olabilirim? [Transkript devamı...]' : 'Kısa görüşme yapıldı.',
        summary: randomItem(summariesTr),
        sentiment,
        duration,
        type: score >= 8 ? 'appointment' : score >= 5 ? 'inquiry' : 'follow_up',
        caller_phone: randomItem(callPhones),
        caller_name: randomItem(callNames),
        evaluation_summary: randomItem(evaluationsTr),
        evaluation_score: score,
        metadata: {
          appointmentBooked: score >= 8,
          callbackRequested: score >= 5 && score < 8,
          source: 'outbound_campaign'
        },
        created_at: callDate.toISOString()
      });
    }

    const { error: callsError } = await supabaseAdmin.from("calls").insert(callsToInsert);
    if (callsError) {
      console.error("Calls error:", callsError);
    }

    // Create outreach records
    const outreachResults = [
      'answered_interested', 'answered_interested', 'answered_interested',
      'answered_appointment_set',
      'answered_not_interested', 'answered_not_interested',
      'answered_callback_requested',
      'no_answer', 'no_answer',
      'busy',
      'voicemail',
      'message_sent'
    ];

    const outreachToInsert = [];
    for (let i = 0; i < 40; i++) {
      const result = randomItem(outreachResults);
      const sentiment = ['answered_interested', 'answered_appointment_set'].includes(result) 
        ? 'positive' 
        : result === 'answered_not_interested' 
          ? 'negative' 
          : 'neutral';
      const duration = result.startsWith('answered') ? randomInt(60, 360) : 0;
      const callDate = randomDate(30);

      outreachToInsert.push({
        user_id: userId,
        lead_id: randomItem(leadIds),
        campaign_id: campaignId,
        channel: randomInt(0, 9) < 7 ? 'call' : 'whatsapp',
        direction: 'outbound',
        status: 'completed',
        result,
        duration,
        recording_url: duration > 0 ? `https://storage.vapi.ai/outreach-${i}.mp3` : null,
        transcript: duration > 60 ? 'Merhaba, Smile and Holiday\'den arıyorum...' : null,
        ai_summary: duration > 0 ? randomItem(summariesTr) : null,
        ai_sentiment: sentiment,
        ai_next_action: result === 'answered_interested' 
          ? 'Tedavi planı gönder' 
          : result === 'answered_callback_requested' 
            ? '2 gün sonra tekrar ara' 
            : result === 'no_answer' 
              ? 'Yarın tekrar dene' 
              : null,
        scheduled_for: callDate,
        completed_at: callDate,
        vapi_call_id: `outreach_${i}_${Date.now()}`,
        notes: Math.random() > 0.5 ? `Müşteri ${result.startsWith('answered') ? 'görüşme yapıldı' : 'ulaşılamadı'}` : null,
        performed_by: 'AI Asistan',
        created_at: callDate
      });
    }

    const { error: outreachError } = await supabaseAdmin.from("outreach").insert(outreachToInsert);
    if (outreachError) {
      console.error("Outreach error:", outreachError);
    }

    // Create messages - more comprehensive with all channels
    const whatsappMessages = [
      'Merhaba! 👋 Smile and Holiday\'den arıyoruz. Tedavi planınız hazır.',
      'İyi günler! Size özel fiyat teklifimizi paylaşmak istiyoruz. 💰',
      'Randevunuz için onay bekliyoruz. Tarihi uygun mu? 📅',
      'Tedavi hakkında sorularınız varsa yanıtlamaktan memnuniyet duyarız. 😊',
      'Takip mesajımızdır. Kararınızı merak ediyoruz. 🤔',
      'Merhaba! Daha önce görüştüğümüz tedavi konusunda bilgi almak ister misiniz?',
      'Kampanyamızdan yararlanmak için son 3 gün! 🎉',
      'Online randevunuz yarın saat 14:00\'da. Hatırlatma mesajı. ⏰'
    ];

    const emailMessages = [
      'Değerli hastamız, tedavi planınız ekte yer almaktadır. Detayları incelemenizi rica ederiz.',
      'Size özel hazırladığımız fiyat teklifini ekte bulabilirsiniz.',
      'Randevu talebiniz alınmıştır. Onay için lütfen yanıt verin.',
      'Sağlık turizmi hakkında bilgilendirme dosyamız ektedir.',
      'Hollywood Smile tedavisi hakkında detaylı bilgi için tıklayın.'
    ];

    const smsMessages = [
      'Smile and Holiday: Randevunuz 15 Ocak 14:00. Onay için 1 yanıtlayın.',
      'Tedavi fiyat teklifiniz hazır. Detaylar WhatsApp\'tan gönderildi.',
      'Hatırlatma: Online görüşmeniz yarın!',
      'Smile and Holiday\'e hoşgeldiniz. Size nasıl yardımcı olabiliriz?'
    ];

    const instagramMessages = [
      'Merhaba! DM\'iniz için teşekkürler 🙏 Size yardımcı olmak isteriz.',
      'Profilimizdeki highlight\'lardan tedavi öncesi-sonrası görsellere ulaşabilirsiniz!',
      'Ücretsiz online konsültasyon için bize yazın ✨',
      'Tedavi sürecinizle ilgili sorularınızı yanıtlamaktan mutluluk duyarız 😊'
    ];

    const messagesToInsert = [];
    const channels = ['whatsapp', 'email', 'sms', 'instagram_dm'];
    
    // Create 15 messages per channel
    for (const channel of channels) {
      const channelMessages = channel === 'whatsapp' ? whatsappMessages :
                              channel === 'email' ? emailMessages :
                              channel === 'sms' ? smsMessages : instagramMessages;
      
      for (let i = 0; i < 15; i++) {
        const messageDate = randomDate(30);
        const isRead = Math.random() > 0.4;
        const isReplied = Math.random() > 0.7;
        const statusOptions = ['pending', 'sent', 'delivered', 'delivered'];

        messagesToInsert.push({
          user_id: userId,
          lead_id: randomItem(leadIds),
          channel,
          direction: randomInt(0, 4) === 0 ? 'inbound' : 'outbound',
          recipient: channel === 'email' 
            ? (randomItem(callNames) || 'contact').toLowerCase().replace(' ', '.') + '@email.com'
            : channel === 'instagram_dm'
              ? '@' + (randomItem(callNames) || 'user').toLowerCase().replace(' ', '_')
              : randomItem(callPhones),
          subject: channel === 'email' ? `Tedavi Planınız - ${randomItem(treatments)}` : null,
          content: randomItem(channelMessages),
          status: randomItem(statusOptions),
          read_at: isRead ? randomDate(5) : null,
          replied_at: isReplied ? randomDate(3) : null,
          created_at: messageDate
        });
      }
    }

    const { error: messagesError } = await supabaseAdmin.from("messages").insert(messagesToInsert);
    if (messagesError) {
      console.error("Messages error:", messagesError);
    }

    // Create message templates
    const templatesData = [
      {
        user_id: userId,
        name: 'Hoş Geldiniz',
        channel: 'whatsapp',
        language: 'tr',
        subject: null,
        content: 'Merhaba {{name}}! 👋 Smile and Holiday ailesine hoş geldiniz. Size nasıl yardımcı olabiliriz?',
        variables: ['name'],
        is_active: true,
        use_count: 45
      },
      {
        user_id: userId,
        name: 'Fiyat Teklifi',
        channel: 'whatsapp',
        language: 'tr',
        subject: null,
        content: 'Merhaba {{name}}, {{treatment}} için hazırladığımız özel fiyat teklifimiz: {{price}}. Detaylar için arayabilir misiniz?',
        variables: ['name', 'treatment', 'price'],
        is_active: true,
        use_count: 32
      },
      {
        user_id: userId,
        name: 'Randevu Hatırlatma',
        channel: 'whatsapp',
        language: 'tr',
        subject: null,
        content: '⏰ Randevu Hatırlatma: Sayın {{name}}, {{date}} tarihli online görüşmeniz için hazır mısınız?',
        variables: ['name', 'date'],
        is_active: true,
        use_count: 28
      },
      {
        user_id: userId,
        name: 'Tedavi Bilgi Paketi',
        channel: 'email',
        language: 'tr',
        subject: '{{treatment}} Tedavisi Hakkında Detaylı Bilgi',
        content: 'Sayın {{name}},\n\n{{treatment}} tedavisi hakkında hazırladığımız bilgi paketini ekte bulabilirsiniz.\n\nSorularınız için bize ulaşmaktan çekinmeyin.\n\nSaygılarımızla,\nSmile and Holiday',
        variables: ['name', 'treatment'],
        is_active: true,
        use_count: 22
      },
      {
        user_id: userId,
        name: 'Welcome Message',
        channel: 'whatsapp',
        language: 'en',
        subject: null,
        content: 'Hello {{name}}! 👋 Welcome to Smile and Holiday. How can we help you today?',
        variables: ['name'],
        is_active: true,
        use_count: 18
      },
      {
        user_id: userId,
        name: 'Follow-up',
        channel: 'whatsapp',
        language: 'tr',
        subject: null,
        content: 'Merhaba {{name}}, geçen görüşmemizin ardından düşündünüz mü? Size yardımcı olabilecek başka bilgi var mı?',
        variables: ['name'],
        is_active: true,
        use_count: 35
      },
      {
        user_id: userId,
        name: 'SMS Randevu Onay',
        channel: 'sms',
        language: 'tr',
        subject: null,
        content: 'Smile and Holiday: {{date}} tarihli randevunuz için onay bekliyoruz. Onay için 1, iptal için 2 yanıtlayın.',
        variables: ['date'],
        is_active: true,
        use_count: 15
      },
      {
        user_id: userId,
        name: 'Instagram DM Response',
        channel: 'instagram_dm',
        language: 'tr',
        subject: null,
        content: 'Merhaba! 🙏 Mesajınız için teşekkürler. {{treatment}} hakkında size özel bilgi göndermemi ister misiniz?',
        variables: ['treatment'],
        is_active: true,
        use_count: 12
      }
    ];

    const { error: templatesError } = await supabaseAdmin.from("message_templates").insert(templatesData);
    if (templatesError) {
      console.error("Templates error:", templatesError);
    }

    // Create online appointments
    const doctors = ['Dr. Ahmet Yılmaz', 'Dr. Ayşe Demir', 'Dr. Mehmet Kaya', 'Dr. Zeynep Öztürk'];
    const platforms = ['zoom', 'google_meet', 'whatsapp_video'];
    const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'scheduled', 'scheduled'];

    // Get leads with appointment_set or converted status
    const appointmentLeads = leadIds.slice(20, 28);
    const appointmentsToInsert = appointmentLeads.map((leadId, i) => {
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + (i + 1) * 3);
      appointmentDate.setHours(randomInt(10, 18), 0, 0, 0);

      return {
        user_id: userId,
        lead_id: leadId,
        appointment_date: appointmentDate.toISOString(),
        doctor_name: randomItem(doctors),
        treatment_type: randomItem(treatments),
        status: randomItem(appointmentStatuses),
        meeting_link: `https://meet.google.com/abc-defg-${i}`,
        meeting_platform: randomItem(platforms),
        notes: `Online konsültasyon - ${randomItem(treatments)}`,
        created_at: randomDate(14)
      };
    });

    const { error: appointmentsError } = await supabaseAdmin.from("online_appointments").insert(appointmentsToInsert);
    if (appointmentsError) {
      console.error("Appointments error:", appointmentsError);
    }

    // Update/Create AI settings
    const { error: aiSettingsError } = await supabaseAdmin
      .from("ai_settings")
      .upsert({
        user_id: userId,
        company_name: 'Smile and Holiday',
        agent_name: 'Volina AI Asistan',
        opening_script_tr: 'Merhaba! Ben Smile and Holiday\'den arıyorum. Sağlık turizmimiz hakkında size bilgi vermek istiyorum. Uygun musunuz?',
        opening_script_en: 'Hello! I am calling from Smile and Holiday. I would like to share information about our medical tourism services. Is this a good time?',
        announce_ai: true,
        persistence_level: 'medium',
        primary_goal: 'online_appointment',
        call_hours_start: '09:00',
        call_hours_end: '20:00'
      }, {
        onConflict: 'user_id'
      });

    if (aiSettingsError) {
      console.error("AI Settings error:", aiSettingsError);
    }

    return NextResponse.json({
      success: true,
      message: "Mock data created successfully",
      stats: {
        leads: leadsToInsert.length,
        calls: callsToInsert.length,
        outreach: outreachToInsert.length,
        messages: messagesToInsert.length,
        templates: templatesData.length,
        appointments: appointmentsToInsert.length
      }
    });

  } catch (error) {
    console.error("Seed mock data error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to seed mock data for outbound dashboard",
    warning: "This will delete existing data for the user"
  });
}

