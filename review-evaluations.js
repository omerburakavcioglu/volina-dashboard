/**
 * Evaluation Review Script
 * 5 eski call'ı al, transcript'lerini ve evaluation sonuçlarını göster
 * Kullanıcı feedback'e göre prompt'u geliştireceğiz
 * 
 * Kullanım:
 * node review-evaluations.js
 */

// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        process.env[key] = value;
      }
    });
  }
}

loadEnvFile();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ydgsarbkvtyjevyzyuzq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable bulunamadı!');
  process.exit(1);
}

async function fetchCallsWithTranscripts(limit = 5) {
  try {
    // Direkt Supabase'den call'ları çek
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/calls?select=id,created_at,transcript,summary&transcript=not.is.null&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error('Error fetching calls:', error);
    throw error;
  }
}

async function getCallDetails(callId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/calls?id=eq.${callId}&select=id,transcript,summary,evaluation_score,evaluation_summary,metadata,created_at,duration`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status}`);
    }

    const data = await response.json();
    return data[0] || null;
  } catch (error) {
    console.error(`Error fetching call ${callId}:`, error);
    return null;
  }
}

async function evaluateCall(callId) {
  try {
    const response = await fetch(`${BASE_URL}/api/calls/re-evaluate-structured`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: callId,
        force: true,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function displayCallReview(call, evaluation, index) {
  console.log('\n' + '='.repeat(100));
  console.log(`\n📞 CALL ${index + 1} - ID: ${call.id}`);
  console.log(`📅 Tarih: ${new Date(call.created_at).toLocaleString('tr-TR')}`);
  console.log(`⏱️  Süre: ${call.duration || 'N/A'} saniye`);
  console.log(`\n${'─'.repeat(100)}\n`);

  // Transcript
  console.log('📝 TRANSCRIPT:');
  console.log('─'.repeat(100));
  if (call.transcript) {
    const transcript = call.transcript.length > 2000 
      ? call.transcript.substring(0, 2000) + '...\n[TRUNCATED]'
      : call.transcript;
    console.log(transcript);
  } else if (call.summary) {
    console.log('⚠️  Transcript yok, Summary kullanılıyor:');
    console.log(call.summary);
  } else {
    console.log('❌ Transcript ve Summary bulunamadı');
  }
  console.log('─'.repeat(100));

  // Evaluation Sonuçları
  if (evaluation.success) {
    const eval = evaluation.evaluation.successEvaluation;
    console.log('\n🎯 BİZİM EVALUATION SONUÇLARI:');
    console.log('─'.repeat(100));
    console.log(`📊 Score: ${eval.score}/10`);
    console.log(`😊 Sentiment: ${eval.sentiment}`);
    console.log(`🎯 Outcome: ${eval.outcome}`);
    console.log(`🏷️  Tags: ${eval.tags?.join(', ') || 'N/A'}`);
    if (eval.objections && eval.objections.length > 0) {
      console.log(`🚫 Objections: ${eval.objections.join(', ')}`);
    }
    if (eval.nextAction) {
      console.log(`➡️  Next Action: ${eval.nextAction}`);
    }
    console.log(`\n📝 Summary:`);
    console.log(`   ${evaluation.evaluation.callSummary.callSummary}`);
    console.log('─'.repeat(100));
  } else {
    console.log('\n❌ EVALUATION HATASI:');
    console.log(`   ${evaluation.error || evaluation.details}`);
  }

  // Eski evaluation (varsa)
  if (call.evaluation_score !== null) {
    console.log('\n📊 ESKİ EVALUATION (VAPI):');
    console.log('─'.repeat(100));
    console.log(`   Score: ${call.evaluation_score}`);
    if (call.evaluation_summary) {
      console.log(`   Summary: ${call.evaluation_summary.substring(0, 200)}...`);
    }
    console.log('─'.repeat(100));
  }

  console.log('\n' + '='.repeat(100));
}

async function reviewEvaluations() {
  console.log('\n🔍 5 Call\'ı review ediyorum...\n');

  try {
    // 1. Call'ları getir
    const calls = await fetchCallsWithTranscripts(5);
    
    if (calls.length === 0) {
      console.log('❌ Test edilecek call bulunamadı.');
      return;
    }

    console.log(`📊 ${calls.length} call bulundu, detayları getiriliyor...\n`);

    const results = [];

    // 2. Her call için detayları getir ve evaluate et
    for (let i = 0; i < calls.length; i++) {
      const callId = calls[i].id;
      
      console.log(`\n[${i + 1}/${calls.length}] Processing call: ${callId}...`);

      // Call detaylarını getir
      const callDetails = await getCallDetails(callId);
      
      if (!callDetails) {
        console.log(`   ⚠️  Call detayları alınamadı, atlanıyor...`);
        continue;
      }

      // Evaluate et
      const evaluation = await evaluateCall(callId);

      if (evaluation.success) {
        displayCallReview(callDetails, evaluation, i);
        results.push({
          call: callDetails,
          evaluation: evaluation,
        });
      } else {
        console.log(`   ❌ Evaluation başarısız: ${evaluation.error || evaluation.details}`);
      }

      // Rate limiting için bekle
      if (i < calls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n\n' + '='.repeat(100));
    console.log('✅ REVIEW TAMAMLANDI');
    console.log('='.repeat(100));
    console.log(`\n💡 Şimdi her call için evaluation sonuçlarını gözden geçirin.`);
    console.log(`💡 Eğer bir call için farklı düşünüyorsanız, hangi call ve ne değişmesi gerektiğini söyleyin.`);
    console.log(`💡 Prompt'u buna göre geliştireceğiz.\n`);

    return results;

  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

// Script'i çalıştır
reviewEvaluations();
