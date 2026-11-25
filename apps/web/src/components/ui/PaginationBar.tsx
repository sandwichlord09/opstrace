'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@opstrace/shared-types';

interface PaginationBarProps {
  meta: PaginationMeta;
  onPageChange: (nextPage: number) => void;
}

export function PaginationBar({ meta, onPageChange }: PaginationBarProps) {
  const totalPages = Math.max(1, meta.totalPages);

  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="text-xs text-slate-600">
        Page <span className="font-semibold text-slate-900">{meta.page}</span> of{' '}
        <span className="font-semibold text-slate-900">{totalPages}</span> ({meta.total}{' '}
        total)
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </button>
        <button
          type="button"
          disabled={meta.page >= totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
