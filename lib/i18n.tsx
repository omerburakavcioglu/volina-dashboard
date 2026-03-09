"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Language = "en" | "tr";

// Translation keys organized by section
export const translations = {
  // Common
  common: {
    loading: { en: "Loading...", tr: "Yükleniyor..." },
    save: { en: "Save", tr: "Kaydet" },
    cancel: { en: "Cancel", tr: "İptal" },
    delete: { en: "Delete", tr: "Sil" },
    edit: { en: "Edit", tr: "Düzenle" },
    search: { en: "Search", tr: "Ara" },
    filter: { en: "Filter", tr: "Filtrele" },
    all: { en: "All", tr: "Tümü" },
    refresh: { en: "Refresh", tr: "Yenile" },
    noData: { en: "No data found", tr: "Veri bulunamadı" },
    play: { en: "Play", tr: "Oynat" },
  },
  
  // Sidebar Navigation
  sidebar: {
    dashboard: { en: "Dashboard", tr: "Panel" },
    leads: { en: "Leads", tr: "Müşteri Adayları" },
    funnel: { en: "Funnel", tr: "Huni" },
    calls: { en: "Calls", tr: "Aramalar" },
    campaigns: { en: "Campaigns", tr: "Kampanyalar" },
    settings: { en: "Settings", tr: "Ayarlar" },
    lightMode: { en: "Light Mode", tr: "Açık Mod" },
    darkMode: { en: "Dark Mode", tr: "Koyu Mod" },
    signOut: { en: "Sign Out", tr: "Çıkış Yap" },
    language: { en: "Language", tr: "Dil" },
  },
  
  // Calls Page
  calls: {
    title: { en: "Calls", tr: "Aramalar" },
    subtitle: { en: "View and manage your call history", tr: "Arama geçmişinizi görüntüleyin ve yönetin" },
    searchPlaceholder: { en: "Search calls...", tr: "Aramalarda ara..." },
    noCalls: { en: "No calls found", tr: "Arama bulunamadı" },
    
    // Stats
    allCalls: { en: "All", tr: "Tümü" },
    answered: { en: "Answered", tr: "Cevaplanan" },
    interested: { en: "Interested", tr: "İlgili" },
    
    // Sorting
    sortBy: { en: "Sort by...", tr: "Sırala..." },
    latestFirst: { en: "Latest First", tr: "En Yeni" },
    earliestFirst: { en: "Earliest First", tr: "En Eski" },
    highestScore: { en: "Highest Score", tr: "En Yüksek Puan" },
    lowestScore: { en: "Lowest Score", tr: "En Düşük Puan" },
    
    // Table Headers
    customer: { en: "Customer", tr: "Müşteri" },
    score: { en: "Score", tr: "Puan" },
    duration: { en: "Duration", tr: "Süre" },
    date: { en: "Date", tr: "Tarih" },
    
    // Call Status
    callStatus: { en: "Call Status", tr: "Arama Durumu" },
    voicemail: { en: "Voicemail", tr: "Sesli Mesaj" },
    notReached: { en: "Not Reached", tr: "Ulaşılamadı" },
    hotLead: { en: "Hot Lead", tr: "Sıcak Müşteri" },
    neutral: { en: "Neutral", tr: "Nötr" },
    notInterested: { en: "Not Interested", tr: "İlgisiz" },
    
    // Sales Advice
    voicemailAdvice: { en: "Voicemail - should be called back", tr: "Sesli mesaja düştü - tekrar aranmalı" },
    failedAdvice: { en: "Connection failed - should be called back", tr: "Bağlantı kurulamadı - tekrar aranmalı" },
    hotLeadAdvice: { en: "🔥 Hot lead!", tr: "🔥 Sıcak müşteri!" },
    interestedAdvice: { en: "✅ Interested customer!", tr: "✅ İlgili müşteri!" },
    neutralAdvice: { en: "📊 Neutral conversation", tr: "📊 Nötr görüşme" },
    lowInterestAdvice: { en: "⚠️ Low interest", tr: "⚠️ Düşük ilgi" },
    notInterestedAdvice: { en: "❌ Not interested", tr: "❌ İlgisiz" },
    followUpAdvice: { en: "Follow up quickly and schedule an appointment.", tr: "Hızlıca takip edin ve randevu alın." },
    
    // Details
    summary: { en: "Summary", tr: "Özet" },
    transcript: { en: "Transcript", tr: "Transkript" },
    
    // Actions
    play: { en: "Play", tr: "Oynat" },
    deleteAll: { en: "Delete All", tr: "Tümünü Sil" },
    confirmDelete: { en: "Are you sure you want to delete all calls?", tr: "Tüm aramaları silmek istediğinize emin misiniz?" },
    cancel: { en: "Cancel", tr: "İptal" },
    refresh: { en: "Refresh", tr: "Yenile" },
  },
  
  // Dashboard
  dashboard: {
    title: { en: "Dashboard", tr: "Panel" },
    totalCalls: { en: "Total Calls", tr: "Toplam Arama" },
    todayCalls: { en: "Today's Calls", tr: "Bugünkü Aramalar" },
    thisMonth: { en: "This Month", tr: "Bu Ay" },
    avgDuration: { en: "Avg Duration", tr: "Ort. Süre" },
    conversionRate: { en: "Conversion Rate", tr: "Dönüşüm Oranı" },
    recentCalls: { en: "Recent Calls", tr: "Son Aramalar" },
    topLeads: { en: "Top Leads", tr: "En İyi Adaylar" },
  },
  
  // Leads
  leads: {
    title: { en: "Leads", tr: "Müşteri Adayları" },
    subtitle: { en: "Manage your potential customers", tr: "Potansiyel müşterilerinizi yönetin" },
    addLead: { en: "Add Lead", tr: "Aday Ekle" },
    name: { en: "Name", tr: "İsim" },
    phone: { en: "Phone", tr: "Telefon" },
    email: { en: "Email", tr: "E-posta" },
    status: { en: "Status", tr: "Durum" },
    lastContact: { en: "Last Contact", tr: "Son İletişim" },
    noLeads: { en: "No leads found", tr: "Müşteri adayı bulunamadı" },
  },
  
  // Funnel
  funnel: {
    subtitle: { en: "Automate your lead follow-up", tr: "Müşteri takibinizi otomatikleştirin" },
    startFunnel: { en: "Start Funnel", tr: "Huniyi Başlat" },
    pauseAll: { en: "Pause All", tr: "Tümünü Durdur" },
    resume: { en: "Resume", tr: "Devam Et" },
    running: { en: "Running", tr: "Çalışıyor" },
    paused: { en: "Paused", tr: "Duraklatıldı" },
    notStarted: { en: "Not Started", tr: "Başlamadı" },
    stageNew: { en: "New", tr: "Yeni" },
    stageContacting: { en: "Contacting", tr: "İletişimde" },
    stageNurturing: { en: "Nurturing", tr: "Takipte" },
    stageReady: { en: "Ready", tr: "Hazır" },
    stageInTreatment: { en: "In Treatment", tr: "Tedavide" },
    stageLoyal: { en: "Loyal", tr: "Sadık" },
    activeLeads: { en: "Active Leads", tr: "Aktif Adaylar" },
    callsToday: { en: "Calls Today", tr: "Bugünkü Aramalar" },
    responses: { en: "Responses", tr: "Yanıtlar" },
    conversions: { en: "Conversions", tr: "Dönüşümler" },
    activityFeed: { en: "Activity Feed", tr: "Aktivite Akışı" },
    performance: { en: "Performance", tr: "Performans" },
    automationFlow: { en: "Automation Flow", tr: "Otomasyon Akışı" },
    dashboard: { en: "Dashboard", tr: "Panel" },
  },

  // Campaigns
  campaigns: {
    title: { en: "Campaigns", tr: "Kampanyalar" },
    subtitle: { en: "Manage your outreach campaigns", tr: "Arama kampanyalarınızı yönetin" },
    createCampaign: { en: "Create Campaign", tr: "Kampanya Oluştur" },
    active: { en: "Active", tr: "Aktif" },
    paused: { en: "Paused", tr: "Duraklatıldı" },
    completed: { en: "Completed", tr: "Tamamlandı" },
    noCampaigns: { en: "No campaigns found", tr: "Kampanya bulunamadı" },
  },
} as const;

// Type for nested translation keys
type TranslationSection = keyof typeof translations;
type TranslationKey<S extends TranslationSection> = keyof typeof translations[S];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: <S extends TranslationSection>(section: S, key: TranslationKey<S>) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  // Load language from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("volina-language") as Language;
    if (saved && (saved === "en" || saved === "tr")) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("volina-language", lang);
  }, []);

  // Translation function
  const t = useCallback(<S extends TranslationSection>(section: S, key: TranslationKey<S>): string => {
    const sectionData = translations[section];
    const entry = sectionData[key] as { en: string; tr: string };
    return entry[language] || entry.en;
  }, [language]);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <LanguageContext.Provider value={{ language: "en", setLanguage, t }}>
        {children}
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Hook for getting translations for a specific section
export function useTranslation<S extends TranslationSection>(section: S) {
  const { language, t } = useLanguage();
  
  const tSection = useCallback((key: TranslationKey<S>): string => {
    return t(section, key);
  }, [t, section]);
  
  return { t: tSection, language };
}
