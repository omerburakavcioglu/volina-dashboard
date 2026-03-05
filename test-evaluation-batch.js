/**
 * Batch Evaluation Test Script
 * Eski call'ları 5'er 5'er test ederek evaluation sistemini geliştir
 * 
 * Kullanım:
 * node test-evaluation-batch.js [batchNumber]
 * 
 * Örnek:
 * node test-evaluation-batch.js 1  # İlk 5 call'ı test et
 * node test-evaluation-batch.js 2  # Sonraki 5 call'ı test et
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';
const BATCH_SIZE = 5;

async function fetchCallsWithTranscripts(limit = 50) {
  try {
    const response = await fetch(`${BASE_URL}/api/calls/re-evaluate-structured?limit=${limit}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch calls');
    }
    
    return data.calls || [];
  } catch (error) {
    console.error('Error fetching calls:', error);
    throw error;
  }
}

async function getCallDetails(callId) {
  try {
    // Supabase'den direkt call detaylarını almak için API endpoint'i kullanabiliriz
    // Şimdilik sadece ID'yi kullanacağız
    return { id: callId };
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
        force: true, // Mevcut evaluation'ı override et
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

function compareEvaluations(oldEvaluation, newEvaluation) {
  const comparison = {
    callId: oldEvaluation.callId || newEvaluation.callId,
    oldScore: oldEvaluation.score || null,
    newScore: newEvaluation.score || null,
    scoreChanged: oldEvaluation.score !== newEvaluation.score,
    oldSentiment: oldEvaluation.sentiment || null,
    newSentiment: newEvaluation.sentiment || null,
    oldOutcome: oldEvaluation.outcome || null,
    newOutcome: newEvaluation.outcome || null,
    outcomeChanged: oldEvaluation.outcome !== newEvaluation.outcome,
  };
  
  return comparison;
}

async function testBatch(batchNumber = 1) {
  console.log(`\n🔍 Batch ${batchNumber} - ${BATCH_SIZE} call test ediliyor...\n`);
  console.log('='.repeat(80));

  try {
    // 1. Call'ları getir
    const allCalls = await fetchCallsWithTranscripts(100);
    
    if (allCalls.length === 0) {
      console.log('❌ Test edilecek call bulunamadı.');
      return;
    }

    // 2. Batch'i seç
    const startIndex = (batchNumber - 1) * BATCH_SIZE;
    const endIndex = startIndex + BATCH_SIZE;
    const batchCalls = allCalls.slice(startIndex, endIndex);

    if (batchCalls.length === 0) {
      console.log(`❌ Batch ${batchNumber} için yeterli call yok.`);
      return;
    }

    console.log(`📊 Toplam ${allCalls.length} call bulundu`);
    console.log(`📦 Batch ${batchNumber}: ${batchCalls.length} call test edilecek\n`);

    const results = [];

    // 3. Her call'ı evaluate et
    for (let i = 0; i < batchCalls.length; i++) {
      const call = batchCalls[i];
      console.log(`\n[${i + 1}/${batchCalls.length}] Evaluating Call: ${call.id}`);
      console.log(`   Created: ${new Date(call.created_at).toLocaleString('tr-TR')}`);

      const result = await evaluateCall(call.id);

      if (result.success) {
        const eval = result.evaluation.successEvaluation;
        console.log(`   ✅ Başarılı!`);
        console.log(`   📊 Score: ${eval.score}`);
        console.log(`   😊 Sentiment: ${eval.sentiment}`);
        console.log(`   🎯 Outcome: ${eval.outcome}`);
        console.log(`   🏷️  Tags: ${eval.tags?.join(', ') || 'N/A'}`);
        console.log(`   📝 Summary: ${result.evaluation.callSummary.callSummary?.substring(0, 60)}...`);

        results.push({
          callId: call.id,
          success: true,
          evaluation: eval,
          summary: result.evaluation.callSummary.callSummary,
        });
      } else {
        console.log(`   ❌ Hata: ${result.error || result.details}`);
        results.push({
          callId: call.id,
          success: false,
          error: result.error || result.details,
        });
      }

      // Rate limiting için bekle
      if (i < batchCalls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 4. Özet
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Batch ${batchNumber} Özet:\n`);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Başarılı: ${successful.length}/${batchCalls.length}`);
    console.log(`❌ Başarısız: ${failed.length}/${batchCalls.length}`);

    if (successful.length > 0) {
      console.log(`\n📈 Score Dağılımı:`);
      const scoreCounts = {};
      successful.forEach(r => {
        const score = r.evaluation.score;
        scoreCounts[score] = (scoreCounts[score] || 0) + 1;
      });
      Object.entries(scoreCounts)
        .sort(([a], [b]) => a - b)
        .forEach(([score, count]) => {
          console.log(`   Score ${score}: ${count} call`);
        });

      console.log(`\n😊 Sentiment Dağılımı:`);
      const sentimentCounts = {};
      successful.forEach(r => {
        const sentiment = r.evaluation.sentiment;
        sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
      });
      Object.entries(sentimentCounts).forEach(([sentiment, count]) => {
        console.log(`   ${sentiment}: ${count} call`);
      });

      console.log(`\n🎯 Outcome Dağılımı:`);
      const outcomeCounts = {};
      successful.forEach(r => {
        const outcome = r.evaluation.outcome;
        outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
      });
      Object.entries(outcomeCounts).forEach(([outcome, count]) => {
        console.log(`   ${outcome}: ${count} call`);
      });
    }

    if (failed.length > 0) {
      console.log(`\n❌ Başarısız Call'lar:`);
      failed.forEach(r => {
        console.log(`   ${r.callId}: ${r.error}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n💡 Sonraki batch için: node test-evaluation-batch.js ${batchNumber + 1}\n`);

    return results;

  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

// Script'i çalıştır
const batchNumber = parseInt(process.argv[2]) || 1;
testBatch(batchNumber);
