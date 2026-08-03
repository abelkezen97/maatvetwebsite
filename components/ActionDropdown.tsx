"use client";

import React, { useState, useRef, useEffect } from "react";

export interface ActionOption {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ActionDropdownProps {
  options: ActionOption[];
  placeholder?: string;
}

export function ActionDropdown({ options, placeholder = "Actions" }: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={dropdownRef}
      className="relative inline-block text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 transition duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <span>{placeholder}</span>
        <span className="text-[9px] text-slate-400 font-bold transition-transform duration-200">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 origin-top-right rounded-xl bg-white border border-slate-200 shadow-xl py-1 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="py-1">
            {options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  opt.onClick();
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors duration-150 cursor-pointer flex items-center justify-between ${
                  opt.danger
                    ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
