"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/context/LanguageContext";

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
  const { t, translateBusinessText, isRtl } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 192; // w-48 = 12rem = 192px
      const rawLeft = isRtl
        ? rect.left + window.scrollX
        : rect.right - menuWidth + window.scrollX;
      // Clamp within viewport
      const maxLeft = window.innerWidth + window.scrollX - menuWidth - 16;
      const minLeft = window.scrollX + 16;
      
      setCoords({
        top: rect.bottom + window.scrollY + 6,
        left: Math.max(minLeft, Math.min(maxLeft, rawLeft)),
      });
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const translatedPlaceholder = placeholder === "Actions" ? t("actionsCol") : translateBusinessText(placeholder);

  return (
    <div className="relative inline-block text-start" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className="inline-flex items-center justify-between gap-2.5 min-h-[44px] px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-bold text-slate-700 shadow-2xs hover:border-slate-300 transition duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <span>{translatedPlaceholder}</span>
        <span className="text-[10px] text-slate-400 font-bold">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className="z-[9999] w-48 rounded-2xl bg-white border border-slate-200 shadow-2xl py-1 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    opt.onClick();
                  }}
                  className={`w-full text-start px-4 py-3 min-h-[44px] text-xs md:text-sm font-semibold transition-colors duration-150 cursor-pointer flex items-center justify-between ${
                    opt.danger
                      ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {translateBusinessText(opt.label)}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
