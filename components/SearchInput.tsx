"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export function SearchInput({ value, onChange, onClear, placeholder, className = "", ...props }: SearchInputProps) {
  const { translateBusinessText } = useLanguage();
  const translatedPlaceholder = placeholder ? translateBusinessText(placeholder) : undefined;

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <Search className="absolute ltr:left-4 rtl:right-4 text-slate-400 w-5 h-5 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={translatedPlaceholder}
        className="w-full ltr:pl-11 ltr:pr-10 rtl:pr-11 rtl:pl-10 py-3 text-base md:text-sm bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-200 shadow-sm placeholder:text-slate-400 text-start"
        {...props}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute ltr:right-3 rtl:left-3 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
