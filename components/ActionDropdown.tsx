"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

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
      const menuWidth = 176; // w-44 = 11rem = 176px
      const calculatedLeft = rect.right - menuWidth + window.scrollX;
      
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: Math.max(10, calculatedLeft),
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

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className="inline-flex items-center justify-between gap-2 px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 transition duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <span>{placeholder}</span>
        <span className="text-[9px] text-slate-400 font-bold">
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
            className="z-[9999] w-44 origin-top-right rounded-xl bg-white border border-slate-200 shadow-2xl py-1 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100"
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
          </div>,
          document.body
        )}
    </div>
  );
}
