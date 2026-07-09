import React from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export function SearchInput({ value, onChange, onClear, className = "", ...props }: SearchInputProps) {
  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <Search className="absolute left-4 text-slate-400 w-5 h-5 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        className="w-full pl-11 pr-10 py-3 text-base md:text-sm bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all duration-200 shadow-sm placeholder:text-slate-400"
        {...props}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
