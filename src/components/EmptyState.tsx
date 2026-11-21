import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Smaller, borderless version for use inside tables and cards. */
  compact?: boolean;
}

export function EmptyState({ title, description, action, icon, compact }: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center justify-center px-4 py-10 text-center"
          : "flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center"
      }
    >
      <div className="mb-3 rounded-2xl bg-slate-100 p-3.5 text-slate-400">{icon ?? <Inbox className="h-7 w-7 stroke-[1.5]" />}</div>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
