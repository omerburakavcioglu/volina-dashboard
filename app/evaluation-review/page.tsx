'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/SupabaseProvider';

interface CallEvaluation {
  id: string;
  created_at: string;
  duration: number | null;
  transcript: string | null;
  summary: string | null;
  evaluation_score: number | null;
  evaluation_summary: string | null;
  sentiment: string | null;
  caller_phone: string | null;
  caller_name: string | null;
  metadata: {
    endedReason?: string;
    structuredData?: {
      successEvaluation?: {
        score: number;
        sentiment: string;
        outcome: string;
        tags: string[];
        objections?: string[];
        nextAction?: string;
      };
      callSummary?: {
        callSummary: string;
      };
      evaluationSource?: string;
      evaluatedAt?: string;
    };
  } | null;
}

export default function EvaluationReviewPage() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [evaluatingAll, setEvaluatingAll] = useState(false);
  const [perPage, setPerPage] = useState(5);
  const [page, setPage] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'date_asc'>('score_desc');
  // Transcripts are always visible, no toggle needed

  const loadCalls = useCallback(async () => {
    try {
      setLoading(true);
      const offset = page * perPage;
      const response = await fetch(`/api/evaluation-review?limit=${perPage}&offset=${offset}&sortBy=${sortBy}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        setCalls(data.data);
        setTotalCalls(data.total || data.data.length);
      }
    } catch (error) {
      console.error('Error loading calls:', error);
    } finally {
      setLoading(false);
    }
  }, [page, perPage]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls, sortBy]);

  const evaluateCall = async (callId: string) => {
    try {
      setEvaluatingId(callId);
      
      const response = await fetch('/api/calls/re-evaluate-structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, force: true }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadCalls();
      } else {
        alert(`❌ Hata: ${data.error || 'Evaluation başarısız'}`);
      }
    } catch (error) {
      console.error('Error evaluating call:', error);
      alert('❌ Evaluation sırasında hata oluştu');
    } finally {
      setEvaluatingId(null);
    }
  };

  const evaluateAllOnPage = async () => {
    try {
      setEvaluatingAll(true);
      const callIds = calls.map(c => c.id);
      
      const response = await fetch('/api/calls/re-evaluate-structured', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callIds, force: true }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ ${data.results.evaluated} call yeni prompt ile evaluate edildi!`);
        await loadCalls();
      } else {
        alert(`❌ Hata: ${data.error || 'Evaluation başarısız'}`);
      }
    } catch (error) {
      console.error('Error evaluating batch:', error);
      alert('❌ Evaluation sırasında hata oluştu');
    } finally {
      setEvaluatingAll(false);
    }
  };

  // No toggle needed - transcripts always visible

  const isVoicemailOrFailed = (call: CallEvaluation) => {
    const evaluation = call.metadata?.structuredData?.successEvaluation;
    const outcome = evaluation?.outcome;
    const tags = evaluation?.tags || [];
    const endedReason = (call.metadata?.endedReason || '').toLowerCase();
    const transcript = (call.transcript || '').toLowerCase();
    
    // Voicemail check (priority over failed)
    if (outcome === 'voicemail') return 'V';
    if (tags.includes('voicemail')) return 'V';
    if (transcript.includes('leave a message') || transcript.includes('voicemail') || 
        transcript.includes('leave me a message') || transcript.includes('after the beep') ||
        transcript.includes('after the tone') || transcript.includes('sesli mesaj')) return 'V';
    
    // Failed check
    if (outcome === 'no_answer' || outcome === 'busy') return 'F';
    if (tags.includes('no_answer')) return 'F';
    
    const failedReasons = ['no-answer', 'customer-did-not-answer', 'busy', 'customer-busy', 'failed'];
    if (failedReasons.some(r => endedReason.includes(r))) return 'F';
    
    return null;
  };

  const getScoreBadge = (score: number | null, vfLabel: string | null) => {
    // V = voicemail (gray)
    if (vfLabel === 'V') return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'V', sub: 'oicemail' };
    // F = failed (gray)
    if (vfLabel === 'F') return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'F', sub: 'ailed' };
    if (score === null) return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500', label: '—', sub: '' };
    // 1-2 = hard reject (red)
    if (score <= 2) return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'HR', sub: 'hard reject' };
    // 3-6 = soft reject (yellow)
    if (score <= 6) return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'SR', sub: 'soft reject' };
    // 7-10 = show score (green)
    return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: score.toString(), sub: '/10' };
  };

  const getOutcomeLabel = (outcome: string) => {
    const labels: Record<string, string> = {
      appointment_set: 'Randevu Alindi',
      callback_requested: 'Geri Arama Istedi',
      interested: 'Ilgili',
      not_interested: 'Ilgisiz',
      needs_info: 'Bilgi Gerekli',
      no_answer: 'Cevap Yok',
      voicemail: 'Sesli Mesaj',
      wrong_number: 'Yanlis Numara',
      busy: 'Mesgul',
    };
    return labels[outcome] || outcome;
  };

  const getEvalSource = (call: CallEvaluation) => {
    const source = call.metadata?.structuredData?.evaluationSource;
    const evaluatedAt = call.metadata?.structuredData?.evaluatedAt;
    if (source === 'our_evaluation_only') {
      return evaluatedAt ? `Bizim sistem (${new Date(evaluatedAt).toLocaleString('tr-TR')})` : 'Bizim sistem';
    }
    return 'VAPI (eski)';
  };

  const formatTranscript = (transcript: string) => {
    return transcript.split('\n').map((line, i) => {
      const isAI = line.toLowerCase().startsWith('ai:') || line.toLowerCase().startsWith('bot:') || line.toLowerCase().startsWith('assistant:');
      const isUser = line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('customer:');
      
      let bgClass = '';
      if (isAI) {
        bgClass = 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400';
      } else if (isUser) {
        bgClass = 'bg-green-50 dark:bg-green-900/20 border-l-2 border-green-400';
      }

      return (
        <div key={i} className={`px-3 py-1.5 ${bgClass}`}>
          <span className="text-sm">{line}</span>
        </div>
      );
    });
  };

  const totalPages = Math.ceil(totalCalls / perPage);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Evaluation Review</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Eski call&apos;lari yeni prompt ile tekrar evaluate edin ve prompt&apos;u gelistirin.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border dark:border-gray-800">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sıralama:</span>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as any); setPage(0); }}
                className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="score_desc">En Yüksek Puan</option>
                <option value="score_asc">En Düşük Puan</option>
                <option value="date_desc">En Yeni</option>
                <option value="date_asc">En Eski</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sayfa başı:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
                className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                ← Önceki
              </button>
              <span className="text-sm font-medium px-2">
                Sayfa {page + 1} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1 || loading}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Sonraki →
              </button>
            </div>

            <div className="flex-1" />

            <button
              onClick={evaluateAllOnPage}
              disabled={evaluatingAll || loading || calls.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {evaluatingAll ? (
                'Evaluating...'
              ) : (
                `Bu Sayfadaki ${calls.length} Call'i Yeni Prompt ile Evaluate Et`
              )}
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Toplam {totalCalls} call • {page * perPage + 1}-{Math.min((page + 1) * perPage, totalCalls)} arası gösteriliyor
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-lg animate-pulse">Yükleniyor...</div>
          </div>
        )}

        {/* Call List */}
        {!loading && (
          <div className="space-y-4">
            {calls.map((call, index) => {
              const evaluation = call.metadata?.structuredData?.successEvaluation;
              const summary = call.metadata?.structuredData?.callSummary?.callSummary || call.summary;
              const score = evaluation?.score ?? call.evaluation_score;
              const vfLabel = isVoicemailOrFailed(call);
              const badge = getScoreBadge(score, vfLabel);
              const isEvaluating = evaluatingId === call.id;

              return (
                <div
                  key={call.id}
                  className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-800 overflow-hidden"
                >
                  {/* Call Header Row */}
                  <div className="flex items-center gap-4 p-4 border-b dark:border-gray-800">
                    {/* Score Badge */}
                    <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center ${badge.bg}`}>
                      <span className={`text-2xl font-bold ${badge.text}`}>{badge.label}</span>
                      <span className="text-[10px] text-gray-500">{badge.sub}</span>
                    </div>

                    {/* Call Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          #{page * perPage + index + 1}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(call.created_at).toLocaleString('tr-TR')}
                        </span>
                        <span className="text-sm text-gray-400">•</span>
                        <span className="text-sm text-gray-500">
                          {call.duration ? `${call.duration}s` : 'N/A'}
                        </span>
                        {call.caller_name && (
                          <>
                            <span className="text-sm text-gray-400">•</span>
                            <span className="text-sm text-gray-500">{call.caller_name}</span>
                          </>
                        )}
                      </div>
                      {evaluation && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm">{evaluation.sentiment}</span>
                          <span className="text-sm px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                            {getOutcomeLabel(evaluation.outcome)}
                          </span>
                          {evaluation.tags?.map(tag => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        Kaynak: {getEvalSource(call)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex gap-2">
                      <button
                        onClick={() => evaluateCall(call.id)}
                        disabled={isEvaluating || evaluatingAll}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isEvaluating ? '...' : 'Tekrar Evaluate Et'}
                      </button>
                      
                    </div>
                  </div>

                  {/* Summary */}
                  {summary && (
                    <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10 border-b dark:border-gray-800">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Ozet:</span> {summary}
                      </p>
                    </div>
                  )}

                  {/* Next Action */}
                  {evaluation?.nextAction && (
                    <div className="px-4 py-2 bg-yellow-50/50 dark:bg-yellow-900/10 border-b dark:border-gray-800">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Next Action:</span> {evaluation.nextAction}
                      </p>
                    </div>
                  )}

                  {/* Transcript (always visible) */}
                  {call.transcript ? (
                    <div className="max-h-[400px] overflow-y-auto border-t dark:border-gray-800">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {formatTranscript(call.transcript)}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-gray-500 italic border-t dark:border-gray-800">
                      Transcript bulunamadı
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && calls.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800">
            Bu sayfada gösterilecek call bulunamadı.
          </div>
        )}

        {/* Bottom Pagination */}
        {!loading && calls.length > 0 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              ← Önceki {perPage}
            </button>
            <span className="px-4 py-2 text-sm font-medium">
              Sayfa {page + 1} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Sonraki {perPage} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
