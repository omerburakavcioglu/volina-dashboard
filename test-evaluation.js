/**
 * Test Script: Kendi Evaluation Sistemimizle Call'ları Test Et
 * 
 * Kullanım:
 * node test-evaluation.js
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ydgsarbkvtyjevyzyuzq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable bulunamadı!');
  process.exit(1);
}

async function testEvaluation() {
  console.log('🔍 Mevcut call\'ları kontrol ediyorum...\n');

  try {
    // 1. Transcript'i olan call'ları getir
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/calls?select=id,created_at,transcript,summary,evaluation_score,metadata&transcript=not.is.null&order=created_at.desc&limit=5`,
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

    const calls = await response.json();
    
    if (calls.length === 0) {
      console.log('⚠️  Transcript\'i olan call bulunamadı.');
      return;
    }

    console.log(`✅ ${calls.length} call bulundu:\n`);
    
    calls.forEach((call, index) => {
      const transcriptPreview = call.transcript?.substring(0, 100) || 'N/A';
      const currentScore = call.evaluation_score || 'N/A';
      const hasOurEvaluation = call.metadata?.structuredData?.evaluationSource === 'our_evaluation_only';
      
      console.log(`${index + 1}. Call ID: ${call.id}`);
      console.log(`   Tarih: ${new Date(call.created_at).toLocaleString('tr-TR')}`);
      console.log(`   Mevcut Score: ${currentScore}`);
      console.log(`   Bizim Evaluation: ${hasOurEvaluation ? '✅ Var' : '❌ Yok'}`);
      console.log(`   Transcript Preview: ${transcriptPreview}...`);
      console.log('');
    });

    // 2. İlk 3 call'ı test et
    console.log('🚀 İlk 3 call\'ı kendi evaluation sistemimizle test ediyorum...\n');
    
    const testCalls = calls.slice(0, 3);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';
    
    for (const call of testCalls) {
      try {
        console.log(`📞 Evaluating Call ID: ${call.id}...`);
        
        const evalResponse = await fetch(`${baseUrl}/api/calls/re-evaluate-structured`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callId: call.id,
            force: true, // Mevcut evaluation'ı override et
          }),
        });

        if (!evalResponse.ok) {
          const error = await evalResponse.text();
          console.log(`   ❌ Hata: ${error}\n`);
          continue;
        }

        const result = await evalResponse.json();
        
        if (result.success) {
          const eval = result.evaluation.successEvaluation;
          console.log(`   ✅ Başarılı!`);
          console.log(`   📊 Score: ${eval.score}`);
          console.log(`   😊 Sentiment: ${eval.sentiment}`);
          console.log(`   🎯 Outcome: ${eval.outcome}`);
          console.log(`   🏷️  Tags: ${eval.tags?.join(', ') || 'N/A'}`);
          console.log(`   📝 Summary: ${result.evaluation.callSummary.callSummary?.substring(0, 80)}...`);
          console.log('');
        } else {
          console.log(`   ❌ Evaluation başarısız: ${result.error}\n`);
        }

        // Rate limiting için bekle
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`   ❌ Hata: ${error.message}\n`);
      }
    }

    console.log('✅ Test tamamlandı!');
    console.log('\n💡 Sonuçları görmek için database\'i kontrol edin veya dashboard\'u açın.');

  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

// Script'i çalıştır
testEvaluation();
