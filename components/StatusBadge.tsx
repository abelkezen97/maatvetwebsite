"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";

type StatusType = 
  | "In Stock" 
  | "Low Stock" 
  | "Out of Stock" 
  | "Approved" 
  | "Pending" 
  | "Rejected"
  | "Paid"
  | "Credit"
  | "Cancelled"
  | "Active"
  | "Inactive"
  | string;

interface StatusBadgeProps {
  status: StatusType;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { translateBusinessText } = useLanguage();
  let badgeStyles = "";

  switch (status) {
    case "In Stock":
    case "Approved":
    case "Paid":
    case "Active":
      badgeStyles = "bg-emerald-50 text-emerald-700 border-emerald-200";
      break;
    case "Low Stock":
    case "Pending":
    case "Credit":
      badgeStyles = "bg-amber-50 text-amber-700 border-amber-200";
      break;
    case "Out of Stock":
    case "Rejected":
    case "Cancelled":
    case "Inactive":
      badgeStyles = "bg-rose-50 text-rose-700 border-rose-200";
      break;
    default:
      badgeStyles = "bg-slate-50 text-slate-700 border-slate-200";
  }

  const translated = translateBusinessText(status);

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles}`}>
      <span className="w-1.5 h-1.5 me-1.5 rounded-full bg-current opacity-75 shrink-0" />
      {translated}
    </span>
  );
}
