"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, UserPlus, X } from "lucide-react";
import { Customer } from "@/types";

/**
 * One-page entry forms (receipts, quotations) in a ledger-style layout:
 * labelled rows on the left, a lines table, totals on the right and a
 * fixed action bar. Shared pieces live here.
 */

export const fieldInput =
  "w-full h-10 px-3 bg-white border border-slate-300 rounded-md text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";

/** True on tablet and desktop widths (768px and up); lines show as a table there, as cards below. */
export function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/** A read-only value shown in a form row (not an input). */
export function StaticValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div className={`h-10 flex items-center text-sm ${muted ? "text-slate-500" : "text-slate-900 font-medium"}`}>{children}</div>;
}

/** A form row: label on the left (desktop), field on the right. */
export function FieldRow({
  label,
  required,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-1.5 md:gap-6 items-start">
      <label htmlFor={htmlFor} className={`text-sm md:pt-2.5 ${required ? "text-rose-600" : "text-slate-600"}`}>
        {label}
        {required && "*"}
      </label>
      <div className="min-w-0">
        {children}
        {hint && <div className="text-xs text-slate-500 mt-1.5">{hint}</div>}
      </div>
    </div>
  );
}

/** Searchable customer select, Zoho style. */
export function CustomerCombobox({
  customers,
  selectedId,
  onPick,
  onClear,
  onNew,
  money,
  disabled,
  autoFocus,
}: {
  customers: Customer[];
  selectedId: string;
  onPick: (c: Customer) => void;
  onClear?: () => void;
  onNew?: () => void;
  money: (n: number) => string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = customers.find((c) => c.id === selectedId);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = q
      ? customers.filter((c) => c.company.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q) || (c.address || "").toLowerCase().includes(q))
      : customers;
    return all.slice(0, 50);
  }, [customers, query]);

  const pick = (c: Customer) => {
    onPick(c);
    setOpen(false);
    setQuery("");
  };

  if (selected && !open) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 bg-white border border-slate-300 rounded-md text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex-1 min-w-0 text-left truncate text-slate-900 disabled:cursor-default"
        >
          {selected.company}
          {selected.name && <span className="text-slate-500"> · {selected.name}</span>}
        </button>
        {!disabled && onClear && (
          <button type="button" onClick={onClear} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Clear customer">
            <X className="w-4 h-4" />
          </button>
        )}
        {!disabled && <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        placeholder="Select or type to search a customer"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, list.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (list[active]) pick(list[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${fieldInput} pl-9`}
      />
      {open && (
        <div className="wiz-in absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-72 overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">No customer matches.</div>
          ) : (
            list.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${i === active ? "bg-accent text-white" : "text-slate-900"}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm truncate">{c.company}</span>
                  {(c.name || c.address) && (
                    <span className={`block text-xs truncate ${i === active ? "text-white/80" : "text-slate-500"}`}>{[c.name, c.address].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                {(c.pendingBillwiseAmount || 0) > 0 && (
                  <span className={`text-xs shrink-0 ${i === active ? "text-white/90" : "text-rose-700"}`}>{money(c.pendingBillwiseAmount || 0)}</span>
                )}
              </button>
            ))
          )}
          {onNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onNew();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-accent border-t border-slate-100 hover:bg-accent-light sticky bottom-0 bg-white"
            >
              <UserPlus className="w-4 h-4" /> New customer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Small account line under the customer: what they owe, open, cheques. */
export function CustomerBalanceStrip({ items }: { items: { label: string; value: string; tone?: "bad" | "warn" | "ok" }[] }) {
  return (
    <div className="wiz-in mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {items.map((it) => (
        <span key={it.label} className="text-slate-500">
          {it.label}{" "}
          <span className={`font-semibold ${it.tone === "bad" ? "text-rose-700" : it.tone === "warn" ? "text-amber-700" : it.tone === "ok" ? "text-emerald-700" : "text-slate-800"}`}>
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Fixed action bar at the bottom of an entry form. */
export function FormActionBar({
  saveLabel,
  saving,
  disabled,
  cancelHref,
  hint,
  total,
}: {
  saveLabel: string;
  saving: boolean;
  disabled: boolean;
  cancelHref: string;
  hint?: string | null;
  total?: string;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mt-8 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
      <button
        type="submit"
        disabled={disabled || saving}
        className="h-10 px-5 text-sm font-semibold text-white bg-accent hover:bg-accent-hover rounded-md shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      <a href={cancelHref} className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition">
        Cancel
      </a>
      {hint && <span className="hidden sm:inline text-xs text-slate-500">{hint}</span>}
      {total && <span className="ml-auto text-sm text-slate-500">Total <span className="font-semibold text-slate-900 text-base">{total}</span></span>}
    </div>
  );
}
