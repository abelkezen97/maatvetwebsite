"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T, index?: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyTitle,
  emptyDescription,
  onRowClick,
}: DataTableProps<T>) {
  const { t, translateBusinessText } = useLanguage();

  const defaultEmptyTitle = emptyTitle ? translateBusinessText(emptyTitle) : t("noRecordsFound");
  const defaultEmptyDesc = emptyDescription ? translateBusinessText(emptyDescription) : "";

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
        <h4 className="text-base font-bold text-slate-800">{defaultEmptyTitle}</h4>
        {defaultEmptyDesc && <p className="text-sm text-slate-500 mt-1">{defaultEmptyDesc}</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-sm">
      <div className="overflow-x-auto touch-pan-x" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full text-start border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 backdrop-blur-xs">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-5 md:px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 sticky top-0 bg-slate-50/90 backdrop-blur-xs z-10 text-start ${col.className || ""}`}
                >
                  {translateBusinessText(col.header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, idx) => (
              <tr
                key={keyExtractor(row, idx)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors duration-150 min-h-[52px] ${
                  onRowClick ? "cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/60" : "hover:bg-slate-50/40"
                }`}
              >
                {columns.map((col, colIdx) => {
                  const content =
                    typeof col.accessor === "function"
                      ? col.accessor(row)
                      : (row[col.accessor] as React.ReactNode);
                  return (
                    <td
                      key={colIdx}
                      className={`px-5 md:px-6 py-4 text-xs md:text-sm text-slate-700 font-medium align-middle text-start ${col.className || ""}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
