import React from "react";
import { AlertCircle } from "lucide-react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "info" | "success";
}

export function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  type = "info"
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      iconBg: "bg-rose-50 text-rose-600",
      btnBg: "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500",
    },
    info: {
      iconBg: "bg-primary-light text-primary",
      btnBg: "bg-primary hover:bg-primary-hover text-white focus:ring-primary",
    },
    success: {
      iconBg: "bg-emerald-50 text-emerald-600",
      btnBg: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
    }
  };

  const selected = typeStyles[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in duration-200">
        <div className="flex items-start space-x-4">
          <div className={`p-3 rounded-full ${selected.iconBg} flex-shrink-0`}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 leading-tight">{title}</h3>
            <p className="text-sm text-slate-500 mt-2">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 text-sm font-bold min-h-[44px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-3 text-sm font-bold min-h-[44px] rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 cursor-pointer ${selected.btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
