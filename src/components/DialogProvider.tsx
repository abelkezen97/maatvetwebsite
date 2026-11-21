"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Modal } from "@/components/Modal";

type Tone = "danger" | "info" | "success";

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}
export interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** When true the answer must not be empty. */
  required?: boolean;
  multiline?: boolean;
}
type ToastKind = "error" | "success" | "info";

interface DialogApi {
  /** Resolves true when confirmed. */
  confirm: (o: ConfirmOptions | string) => Promise<boolean>;
  /** Resolves the typed text, or null when cancelled. */
  prompt: (o: PromptOptions | string) => Promise<string | null>;
  /** Small non-blocking message in the corner (replaces alert()). */
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialog must be used inside <DialogProvider>");
  return c;
}

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

const TONE_UI: Record<Tone, { icon: React.ReactNode; btn: string }> = {
  danger: { icon: <span className="rounded-full bg-rose-50 p-2.5 text-rose-600"><AlertTriangle className="h-5 w-5" /></span>, btn: "bg-rose-600 hover:bg-rose-700" },
  info: { icon: <span className="rounded-full bg-sky-50 p-2.5 text-sky-600"><Info className="h-5 w-5" /></span>, btn: "bg-primary hover:bg-primary-hover" },
  success: { icon: <span className="rounded-full bg-emerald-50 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span>, btn: "bg-emerald-600 hover:bg-emerald-700" },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const idRef = useRef(0);

  const confirm = useCallback(
    (o: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: "confirm", opts: typeof o === "string" ? { message: o } : o, resolve });
      }),
    []
  );
  const prompt = useCallback(
    (o: PromptOptions | string) =>
      new Promise<string | null>((resolve) => {
        const opts = typeof o === "string" ? { message: o } : o;
        setText(opts.defaultValue ?? "");
        setPending({ kind: "prompt", opts, resolve });
      }),
    []
  );
  const toast = useCallback((message: string, kind: ToastKind = "error") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo(() => ({ confirm, prompt, toast }), [confirm, prompt, toast]);

  const finish = (ok: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(ok);
    else pending.resolve(ok ? text.trim() : null);
    setPending(null);
  };

  const opts = pending?.opts;
  const tone: Tone = opts?.tone ?? "info";
  const isPrompt = pending?.kind === "prompt";
  const p = isPrompt ? (pending!.opts as PromptOptions) : null;
  const blocked = !!p?.required && !text.trim();

  return (
    <Ctx.Provider value={api}>
      {children}

      <Modal
        open={!!pending}
        onClose={() => finish(false)}
        size="sm"
        hideClose
        footer={
          <>
            <button type="button" onClick={() => finish(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {opts?.cancelText ?? "Cancel"}
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => finish(true)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40 ${TONE_UI[tone].btn}`}
            >
              {opts?.confirmText ?? (isPrompt ? "Save" : "Confirm")}
            </button>
          </>
        }
      >
        {pending && (
          <div className="flex gap-3">
            <div className="shrink-0">{TONE_UI[tone].icon}</div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900">{opts?.title ?? (isPrompt ? "Add a note" : "Are you sure?")}</h3>
              <div className="mt-1 whitespace-pre-line leading-relaxed">{opts?.message}</div>
              {p && (
                <div className="mt-3">
                  {p.label && <label className="mb-1 block text-xs font-semibold text-slate-500">{p.label}</label>}
                  {p.multiline === false ? (
                    <input
                      data-autofocus
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !blocked && finish(true)}
                      placeholder={p.placeholder}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  ) : (
                    <textarea
                      data-autofocus
                      rows={3}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={p.placeholder ?? (p.required ? "Required" : "Optional")}
                      className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[110] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 animate-in slide-in-from-bottom-2 fade-in ${
              t.kind === "error" ? "bg-rose-600 text-white ring-rose-700" : t.kind === "success" ? "bg-emerald-600 text-white ring-emerald-700" : "bg-slate-900 text-white ring-slate-700"
            }`}
          >
            {t.kind === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
