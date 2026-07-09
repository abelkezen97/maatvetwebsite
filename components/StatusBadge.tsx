import React from "react";

type StatusType = 
  | "In Stock" 
  | "Low Stock" 
  | "Out of Stock" 
  | "Approved" 
  | "Pending" 
  | "Rejected";

interface StatusBadgeProps {
  status: StatusType;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let badgeStyles = "";

  switch (status) {
    case "In Stock":
    case "Approved":
      badgeStyles = "bg-emerald-50 text-emerald-700 border-emerald-200";
      break;
    case "Low Stock":
    case "Pending":
      badgeStyles = "bg-amber-50 text-amber-700 border-amber-200";
      break;
    case "Out of Stock":
    case "Rejected":
      badgeStyles = "bg-rose-50 text-rose-700 border-rose-200";
      break;
    default:
      badgeStyles = "bg-slate-50 text-slate-700 border-slate-200";
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles}`}>
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current opacity-75" />
      {status}
    </span>
  );
}
