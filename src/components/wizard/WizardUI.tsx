"use client";

import React from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LucideIcon, Pencil } from "lucide-react";

/**
 * Building blocks shared by the invoice and receipt wizards: the step bar,
 * the animated step panel, selectable tiles, review sections, customer
 * avatars and the floating action bar.
 */

export interface WizardStep {
  label: string;
  icon: LucideIcon;
}

export function WizardStepper({
  steps,
  step,
  maxStep,
  onGo,
}: {
  steps: WizardStep[];
  step: number;
  maxStep: number;
  onGo: (i: number) => void;
}) {
  const pct = (step / Math.max(1, steps.length - 1)) * 100;
  const Current = steps[step]?.icon;
  return (
    <nav aria-label="Steps" className="mb-6 md:mb-8">
      {/* Phone: compact */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {Current && (
              <span className="w-8 h-8 rounded-lg bg-primary text-white grid place-items-center">
                <Current className="w-4 h-4" />
              </span>
            )}
            {steps[step]?.label}
          </div>
          <span className="text-xs text-slate-500">
            Step {step + 1} of {steps.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-primary transition-all duration-500" style={{ width: `${Math.max(8, pct)}%` }} />
        </div>
      </div>

      {/* Tablet and up: full */}
      <ol className="hidden md:flex items-center">
        {steps.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = i <= maxStep;
          const Icon = s.icon;
          return (
            <li key={s.label} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onGo(i)}
                aria-current={current ? "step" : undefined}
                className={`group flex items-center gap-3 rounded-xl px-2 py-1.5 transition ${reachable && !current ? "hover:bg-white cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`relative w-11 h-11 rounded-xl grid place-items-center transition-all duration-300 ${
                    current
                      ? "bg-primary text-white shadow-lg shadow-primary/25 scale-105"
                      : done
                        ? "bg-accent text-white"
                        : "bg-white text-slate-400 border border-slate-200"
                  }`}
                >
                  {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </span>
                <span className="text-left">
                  <span className="block text-[11px] uppercase tracking-wide text-slate-400">Step {i + 1}</span>
                  <span className={`block text-sm ${current ? "font-semibold text-slate-900" : done ? "font-medium text-slate-700" : "text-slate-400"}`}>{s.label}</span>
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className="flex-1 mx-3 h-1 rounded-full bg-slate-200 overflow-hidden">
                  <span className={`block h-full bg-accent transition-all duration-500 ${i < step ? "w-full" : "w-0"}`} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepPanel({
  stepKey,
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  stepKey: string | number;
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section key={stepKey} className="wiz-in bg-white border border-slate-200/80 rounded-2xl shadow-sm shadow-slate-200/60">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 md:px-8 pt-5 md:pt-7 pb-4 md:pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <span className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-xl bg-accent-light text-accent grid place-items-center">
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-5 md:px-8 py-5 md:py-7">{children}</div>
    </section>
  );
}

export function ChoiceTile({
  selected,
  disabled,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  title: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={`relative w-full text-left rounded-xl border-2 p-4 transition-all duration-200 ${
        disabled
          ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
          : selected
            ? "border-accent bg-accent-light/60 shadow-md shadow-accent/10"
            : "border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
      }`}
    >
      {selected && <CheckCircle2 className="wiz-pop absolute top-3 right-3 w-5 h-5 text-accent" />}
      <span
        className={`w-10 h-10 rounded-lg grid place-items-center mb-3 transition ${
          disabled ? "bg-slate-100" : selected ? "bg-accent text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className={`block text-sm font-semibold ${disabled ? "" : "text-slate-900"}`}>{title}</span>
      {hint && <span className={`block text-xs mt-0.5 ${disabled ? "" : "text-slate-500"}`}>{hint}</span>}
    </button>
  );
}

export function ReviewSection({
  icon: Icon,
  title,
  onEdit,
  children,
  delay = 0,
}: {
  icon: LucideIcon;
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <section className="wiz-in bg-white border border-slate-200/80 rounded-2xl shadow-sm shadow-slate-200/60 p-5 md:p-7" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 grid place-items-center">
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        </div>
        {onEdit && (
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:bg-accent-light rounded-lg px-2.5 py-1.5 transition">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const AVATAR_TONES = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-violet-100 text-violet-800", "bg-teal-100 text-teal-800"];

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const words = (name || "?").replace(/[^A-Za-z0-9؀-ۿ ]/g, " ").trim().split(/\s+/);
  const initials = ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
  let h = 0;
  for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[h % AVATAR_TONES.length];
  const dim = size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  return <span className={`${dim} ${tone} shrink-0 rounded-xl grid place-items-center font-semibold`}>{initials}</span>;
}

export function WizardBar({
  step,
  onBack,
  cancelHref,
  summaryLabel,
  summaryValue,
  next,
}: {
  step: number;
  onBack: () => void;
  cancelHref: string;
  summaryLabel?: string;
  summaryValue?: string;
  next: { label: string; disabled: boolean; onClick?: () => void; submit?: boolean; tone?: "primary" | "accent"; hint?: string | null };
}) {
  return (
    <div className="sticky bottom-3 z-20 mt-6">
      <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl shadow-slate-900/10 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        {step === 0 ? (
          <a href={cancelHref} className="text-sm font-semibold text-slate-500 hover:text-slate-900 px-2 py-2">
            Cancel
          </a>
        ) : (
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg px-3 py-2.5 transition">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back</span>
          </button>
        )}
        <div className="flex items-center gap-3 md:gap-5 min-w-0">
          {summaryValue && (
            <div className="text-right min-w-0">
              {summaryLabel && <div className="text-xs text-slate-500 truncate">{summaryLabel}</div>}
              <div key={summaryValue} className="wiz-in text-base md:text-lg font-semibold text-slate-900 whitespace-nowrap">
                {summaryValue}
              </div>
            </div>
          )}
          <button
            type={next.submit ? "submit" : "button"}
            disabled={next.disabled}
            onClick={next.onClick}
            title={next.hint || undefined}
            className={`group flex items-center gap-2 px-5 md:px-6 py-3 min-h-[48px] text-sm font-semibold text-white rounded-xl shadow-lg transition disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed ${
              next.tone === "accent" ? "bg-accent hover:bg-accent-hover shadow-accent/25" : "bg-primary hover:bg-primary-hover shadow-primary/25"
            }`}
          >
            {next.label}
            {!next.submit && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
            {next.submit && <CheckCircle2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {next.hint && next.disabled && <p className="text-xs text-rose-700 text-right mt-2 px-2">{next.hint}</p>}
    </div>
  );
}
