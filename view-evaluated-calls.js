/**
 * View Evaluated Calls Script
 * Puan verilmiş aramaların transkriptlerini göster
 * 
 * Kullanım:
 * node view-evaluated-calls.js [limit]
 * 
 * Örnek:
 * node view-evaluated-calls.js 10  # Son 10 evaluate edilmiş call'ı göster
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ydgsarbkvtyjevyzyuzq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable bulunamadı!');
  process.exit(1);
}

async function fetchEvaluatedCalls(limit = 10) {
  try {
    // Evaluate edilmiş call'ları getir (evaluation_score null değil ve bizim evaluation'ımız var)
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/calls?select=id,created_at,transcript,summary,evaluation_score,evaluation_summary,sentiment,duration,metadata&evaluation_score=not.is.null&order=created_at.desc&limit=${limit}`,
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

function extractEvaluationFromMetadata(metadata) {
  if (!metadata || !metadata.structuredData) {
    return null;
  }

  const structuredData = metadata.structuredData;
  if (structuredData.successEvaluation) {
    return structuredData.successEvaluation;
  }

  return null;
}

function displayCall(call, index) {
  console.log('\n' + '='.repeat(100));
  console.log(`\n📞 CALL ${index + 1} - ID: ${call.id}`);
  console.log(`📅 Tarih: ${new Date(call.created_at).toLocaleString('tr-TR')}`);
  console.log(`⏱️  Süre: ${call.duration || 'N/A'} saniye`);
  console.log(`\n${'─'.repeat(100)}\n`);

  // Evaluation Sonuçları
  const ourEvaluation = extractEvaluationFromMetadata(call.metadata);
  
  console.log('🎯 EVALUATION SONUÇLARI:');
  console.log('─'.repeat(100));
  
  if (ourEvaluation) {
    console.log(`📊 Score: ${ourEvaluation.score}/10`);
    console.log(`😊 Sentiment: ${ourEvaluation.sentiment}`);
    console.log(`🎯 Outcome: ${ourEvaluation.outcome}`);
    console.log(`🏷️  Tags: ${ourEvaluation.tags?.join(', ') || 'N/A'}`);
    if (ourEvaluation.objections && ourEvaluation.objections.length > 0) {
      console.log(`🚫 Objections: ${ourEvaluation.objections.join(', ')}`);
    }
    if (ourEvaluation.nextAction) {
      console.log(`➡️  Next Action: ${ourEvaluation.nextAction}`);
    }
  } else {
    // Eski evaluation (VAPI)
    console.log(`📊 Score: ${call.evaluation_score}/10`);
    console.log(`😊 Sentiment: ${call.sentiment || 'N/A'}`);
  }
  
  console.log('─'.repeat(100));

  // Transcript
  console.log('\n📝 TRANSCRIPT:');
  console.log('─'.repeat(100));
  if (call.transcript) {
    console.log(call.transcript);
  } else if (call.summary) {
    console.log('⚠️  Transcript yok, Summary:');
    console.log(call.summary);
  } else {
    console.log('❌ Transcript ve Summary bulunamadı');
  }
  console.log('─'.repeat(100));

  // Summary (eğer varsa)
  if (call.metadata?.structuredData?.callSummary?.callSummary) {
    console.log('\n📝 EVALUATION SUMMARY:');
    console.log('─'.repeat(100));
    console.log(call.metadata.structuredData.callSummary.callSummary);
    console.log('─'.repeat(100));
  } else if (call.evaluation_summary) {
    console.log('\n📝 EVALUATION SUMMARY:');
    console.log('─'.repeat(100));
    console.log(call.evaluation_summary);
    console.log('─'.repeat(100));
  }

  console.log('\n' + '='.repeat(100));
}

async function viewEvaluatedCalls(limit = 10) {
  console.log(`\n🔍 Son ${limit} evaluate edilmiş call'ı getiriyorum...\n`);

  try {
    const calls = await fetchEvaluatedCalls(limit);
    
    if (calls.length === 0) {
      console.log('❌ Evaluate edilmiş call bulunamadı.');
      return;
    }

    console.log(`✅ ${calls.length} call bulundu\n`);

    // Her call'ı göster
    calls.forEach((call, index) => {
      displayCall(call, index);
    });

    // Özet istatistikler
    console.log('\n\n' + '='.repeat(100));
    console.log('📊 ÖZET İSTATİSTİKLER');
    console.log('='.repeat(100));

    const ourEvaluations = calls
      .map(c => extractEvaluationFromMetadata(c.metadata))
      .filter(e => e !== null);

    if (ourEvaluations.length > 0) {
      // Score dağılımı
      const scoreCounts = {};
      ourEvaluations.forEach(e => {
        const score = e.score;
        scoreCounts[score] = (scoreCounts[score] || 0) + 1;
      });

      console.log('\n📈 Score Dağılımı:');
      Object.entries(scoreCounts)
        .sort(([a], [b]) => a - b)
        .forEach(([score, count]) => {
          const bar = '█'.repeat(Math.round((count / ourEvaluations.length) * 20));
          console.log(`   Score ${score}: ${count} call ${bar}`);
        });

      // Sentiment dağılımı
      const sentimentCounts = {};
      ourEvaluations.forEach(e => {
        const sentiment = e.sentiment;
        sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
      });

      console.log('\n😊 Sentiment Dağılımı:');
      Object.entries(sentimentCounts).forEach(([sentiment, count]) => {
        const bar = '█'.repeat(Math.round((count / ourEvaluations.length) * 20));
        console.log(`   ${sentiment}: ${count} call ${bar}`);
      });

      // Outcome dağılımı
      const outcomeCounts = {};
      ourEvaluations.forEach(e => {
        const outcome = e.outcome;
        outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
      });

      console.log('\n🎯 Outcome Dağılımı:');
      Object.entries(outcomeCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([outcome, count]) => {
          const bar = '█'.repeat(Math.round((count / ourEvaluations.length) * 20));
          console.log(`   ${outcome}: ${count} call ${bar}`);
        });
    }

    console.log('\n' + '='.repeat(100));
    console.log(`\n💡 Daha fazla call görmek için: node view-evaluated-calls.js ${limit + 10}\n`);

  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

// Script'i çalıştır
const limit = parseInt(process.argv[2]) || 10;
viewEvaluatedCalls(limit);
