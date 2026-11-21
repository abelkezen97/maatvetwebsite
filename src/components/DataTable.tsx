"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { EmptyState } from "@/components/EmptyState";

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
      <EmptyState title={defaultEmptyTitle} description={defaultEmptyDesc || undefined} />
    );
  }

  const render = (col: Column<T>, row: T) =>
    typeof col.accessor === "function" ? col.accessor(row) : (row[col.accessor] as React.ReactNode);
  const isActions = (c: Column<T>) => /^actions?$/i.test(c.header.trim()) || c.header.trim() === "";
  const [first, ...others] = columns.filter((c) => !isActions(c));
  const actionCol = columns.find(isActions);

  return (
    <>
    {/* Phones: one card per row, easy to read and tap */}
    <div className="space-y-3 md:hidden">
      {data.map((row, idx) => (
        <div
          key={keyExtractor(row, idx)}
          onClick={() => onRowClick && onRowClick(row)}
          className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ${onRowClick ? "cursor-pointer active:bg-slate-50" : ""}`}
        >
          {first && <div className="mb-3 text-sm font-bold text-slate-900">{render(first, row)}</div>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {others.map((col, i) => (
              <div key={i} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{translateBusinessText(col.header)}</dt>
                <dd className="mt-0.5 break-words text-start text-sm font-medium text-slate-700 [&>*]:!items-start [&>*]:!justify-start [&>*]:!text-start">{render(col, row)}</dd>
              </div>
            ))}
          </dl>
          {actionCol && (
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
              {render(actionCol, row)}
            </div>
          )}
        </div>
      ))}
    </div>

    <div className="hidden overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-sm md:block">
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
    </>
  );
}
