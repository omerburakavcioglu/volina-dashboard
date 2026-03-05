/**
 * Script to evaluate ALL calls in the database with our new prompt
 * Usage: node evaluate-all-calls.js
 */

// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    const envContent = fs.readFileSync(filePath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Remove quotes if present
          envVars[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    });
    return envVars;
  } catch (error) {
    return {};
  }
}

const envVars = loadEnvFile(path.join(__dirname, '.env.local'));
Object.keys(envVars).forEach((key) => {
  if (!process.env[key]) {
    process.env[key] = envVars[key];
  }
});

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY bulunamadı!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY bulunamadı!');
  process.exit(1);
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Read the prompt from the file
const promptPath = path.join(__dirname, 'lib', 'evaluation-prompt.ts');
let EVALUATION_SYSTEM_PROMPT = '';

try {
  const promptFile = fs.readFileSync(promptPath, 'utf8');
  // Match the prompt content between backticks (handles multiline)
  const match = promptFile.match(/export const EVALUATION_SYSTEM_PROMPT = `([\s\S]*?)`;$/m);
  if (match && match[1]) {
    EVALUATION_SYSTEM_PROMPT = match[1].trim();
  } else {
    // Try alternative pattern
    const altMatch = promptFile.match(/EVALUATION_SYSTEM_PROMPT = `([\s\S]*?)`;$/m);
    if (altMatch && altMatch[1]) {
      EVALUATION_SYSTEM_PROMPT = altMatch[1].trim();
    } else {
      console.error('❌ Prompt dosyasından prompt bulunamadı!');
      console.error('Dosya içeriği ilk 500 karakter:', promptFile.substring(0, 500));
      process.exit(1);
    }
  }
} catch (error) {
  console.error('❌ Prompt dosyası okunamadı:', error.message);
  console.error('Dosya yolu:', promptPath);
  process.exit(1);
}

async function evaluateCallWithStructuredOutput(transcript, existingSummary, endedReason) {
  const systemPrompt = EVALUATION_SYSTEM_PROMPT;
  
  const userPrompt = `Evaluate this call transcript:\n\n${transcript}\n\n${
    existingSummary ? `Existing summary: ${existingSummary}\n\n` : ''
  }${endedReason ? `Call ended reason: ${endedReason}` : ''}`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw new Error(`Failed to parse JSON: ${parseError.message}`);
  }
}

async function evaluateAllCalls() {
  console.log('🚀 Tüm call\'ları evaluate etmeye başlıyor...\n');

  // Get user_id from command line args or use all users
  const userId = process.argv[2] || null;

  // First get total count
  let countQuery = supabase.from('calls').select('*', { count: 'exact', head: true });
  if (userId) {
    countQuery = countQuery.eq('user_id', userId);
  }
  const { count: totalCount } = await countQuery;

  console.log(`📊 Toplam call sayısı: ${totalCount || 0}${userId ? ` (User ID: ${userId})` : ' (Tüm kullanıcılar)'}\n`);

  // Get ALL calls (with or without transcript) that haven't been evaluated by our system yet
  let query = supabase
    .from('calls')
    .select('id, transcript, summary, metadata, user_id')
    .order('created_at', { ascending: false });
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data: allCalls, error: fetchError } = await query;

  if (fetchError) {
    console.error('❌ Call\'lar alınamadı:', fetchError);
    return;
  }

  // Filter calls that need evaluation:
  // 1. Don't have our evaluation (evaluationSource !== 'our_evaluation_only')
  // 2. Have transcript/summary (can be evaluated)
  const unevaluatedCalls = (allCalls || []).filter(call => {
    const structuredData = call.metadata?.structuredData;
    const hasOurEvaluation = structuredData && 
                            typeof structuredData === 'object' &&
                            structuredData.evaluationSource === 'our_evaluation_only';
    
    // If it has transcript/summary but no our evaluation, it needs re-evaluation
    if ((call.transcript || call.summary) && !hasOurEvaluation) {
      return true;
    }
    
    return false;
  });

  // Also filter out calls without transcript or summary (can't evaluate)
  const calls = unevaluatedCalls.filter(call => call.transcript || call.summary);

  const withTranscript = (allCalls || []).filter(c => c.transcript).length;
  const needsEvaluation = unevaluatedCalls.length;
  const alreadyEvaluated = (allCalls || []).length - needsEvaluation;
  const evaluable = calls.length;
  const noTranscript = unevaluatedCalls.length - evaluable;
  
  // Also check for calls with transcript but old evaluation (score 1 might be from old system)
  const callsWithOldEvaluation = (allCalls || []).filter(call => {
    if (!call.transcript && !call.summary) return false;
    const structuredData = call.metadata?.structuredData;
    const hasOurEvaluation = structuredData && 
                            typeof structuredData === 'object' &&
                            structuredData.evaluationSource === 'our_evaluation_only';
    // Has transcript but no our evaluation - might have old evaluation
    return !hasOurEvaluation;
  });
  
  console.log(`📊 Detaylı istatistik:`);
  console.log(`   - Toplam call: ${totalCount || 0}`);
  console.log(`   - Transcript/summary olan: ${withTranscript}`);
  console.log(`   - Zaten evaluate edilmiş (our_evaluation_only): ${alreadyEvaluated}`);
  console.log(`   - Evaluate edilmesi gereken: ${needsEvaluation}`);
  console.log(`   - Transcript var ama eski evaluation: ${callsWithOldEvaluation.length}`);
  console.log(`   - Evaluate edilebilir (transcript/summary var): ${evaluable}`);
  console.log(`   - Evaluate edilemez (transcript/summary yok): ${noTranscript}\n`);

  if (!calls || calls.length === 0) {
    console.log('ℹ️ Evaluate edilecek call bulunamadı. Tüm call\'lar zaten evaluate edilmiş olabilir.');
    return;
  }

  const results = {
    total: calls.length,
    evaluated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Process in smaller batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < calls.length; i += batchSize) {
    const batch = calls.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(calls.length / batchSize);

    console.log(`\n📦 Batch ${batchNumber}/${totalBatches} (${batch.length} call)...`);

    await Promise.all(
      batch.map(async (call) => {
        try {
          const transcript = call.transcript || '';
          const summary = call.summary || null;
          const endedReason = call.metadata?.endedReason || null;

          if (!transcript) {
            results.skipped++;
            return;
          }

          // Evaluate with retry logic for rate limits
          let structuredEvaluation;
          let retries = 0;
          const maxRetries = 3;
          
          while (retries < maxRetries) {
            try {
              structuredEvaluation = await evaluateCallWithStructuredOutput(
                transcript,
                summary,
                endedReason
              );
              break; // Success, exit retry loop
            } catch (error) {
              if (error.message.includes('429') && retries < maxRetries - 1) {
                // Rate limit error - wait and retry
                const waitTime = (retries + 1) * 2000; // 2s, 4s, 6s
                console.log(`  ⏳ Rate limit, ${waitTime/1000}s bekleniyor... (deneme ${retries + 1}/${maxRetries})`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                retries++;
              } else {
                throw error; // Re-throw if not rate limit or max retries reached
              }
            }
          }

          // Update metadata
          const updatedMetadata = {
            ...(call.metadata || {}),
            structuredData: {
              successEvaluation: structuredEvaluation.successEvaluation,
              callSummary: structuredEvaluation.callSummary,
              evaluationSource: 'our_evaluation_only',
              evaluatedAt: new Date().toISOString(),
            },
            tags: structuredEvaluation.successEvaluation.tags,
          };

          // Update call
          const updatePayload = {
            evaluation_score: structuredEvaluation.successEvaluation.score,
            sentiment: structuredEvaluation.successEvaluation.sentiment,
            evaluation_summary: structuredEvaluation.successEvaluation.nextAction || null,
            summary: structuredEvaluation.callSummary.callSummary,
            metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          };

          const { error: updateError } = await supabase
            .from('calls')
            .update(updatePayload)
            .eq('id', call.id);

          if (updateError) {
            results.failed++;
            results.errors.push(`Call ${call.id}: ${updateError.message}`);
            console.log(`  ❌ ${call.id.substring(0, 8)}... - Başarısız`);
          } else {
            results.evaluated++;
            const score = structuredEvaluation.successEvaluation.score;
            console.log(`  ✅ ${call.id.substring(0, 8)}... - Puan: ${score}`);
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          results.failed++;
          results.errors.push(`Call ${call.id}: ${error.message}`);
          console.log(`  ❌ ${call.id.substring(0, 8)}... - Hata: ${error.message}`);
        }
      })
    );

    // Progress update
    const progress = ((i + batch.length) / calls.length * 100).toFixed(1);
    console.log(`  📈 İlerleme: ${i + batch.length}/${calls.length} (${progress}%)`);
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 ÖZET:');
  console.log(`  ✅ Başarılı: ${results.evaluated}`);
  console.log(`  ❌ Başarısız: ${results.failed}`);
  console.log(`  ⏭️  Atlandı: ${results.skipped}`);
  console.log(`  📊 Toplam: ${results.total}`);
  console.log('='.repeat(50));

  if (results.errors.length > 0) {
    console.log('\n❌ Hatalar:');
    results.errors.slice(0, 10).forEach((error) => console.log(`  - ${error}`));
    if (results.errors.length > 10) {
      console.log(`  ... ve ${results.errors.length - 10} hata daha`);
    }
  }

  console.log('\n✨ Tamamlandı!');
}

// Run
evaluateAllCalls().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
