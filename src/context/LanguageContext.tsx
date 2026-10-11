"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  translations, 
  Language, 
  translateBusinessText as translateBusinessTextFn, 
  formatCurrency as formatCurrencyFn, 
  formatDate as formatDateFn, 
  formatNumber as formatNumberFn 
} from "@/lib/i18n";

export type { Language };

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateBusinessText: (value: string | null | undefined) => string;
  formatCurrency: (amount: number | string | null | undefined) => string;
  formatDate: (dateVal: string | Date | null | undefined) => string;
  formatNumber: (num: number | string | null | undefined) => string;
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export { translations };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    // Read saved language preference if any
    const savedLang = localStorage.getItem("maat_lang") as Language;
    if (savedLang && (savedLang === "en" || savedLang === "ar")) {
      setLanguageState(savedLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("maat_lang", lang);
  };

  useEffect(() => {
    // Dynamically adjust layout direction
    const root = window.document.documentElement;
    if (language === "ar") {
      root.setAttribute("dir", "rtl");
      root.setAttribute("lang", "ar");
    } else {
      root.setAttribute("dir", "ltr");
      root.setAttribute("lang", "en");
    }
  }, [language]);

  const t = (key: string): string => {
    const dict = translations[language] || translations["en"];
    return dict[key] || translations["en"][key] || key;
  };

  const translateBusinessText = (value: string | null | undefined): string => {
    return translateBusinessTextFn(value, language);
  };

  const formatCurrency = (amount: number | string | null | undefined): string => {
    return formatCurrencyFn(amount, language);
  };

  const formatDate = (dateVal: string | Date | null | undefined): string => {
    return formatDateFn(dateVal, language);
  };

  const formatNumber = (num: number | string | null | undefined): string => {
    return formatNumberFn(num, language);
  };

  const isRtl = language === "ar";

  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        setLanguage, 
        t, 
        translateBusinessText, 
        formatCurrency, 
        formatDate, 
        formatNumber, 
        isRtl 
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
