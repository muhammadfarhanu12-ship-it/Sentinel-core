type AdminPaginationProps = {
  page: number;
  pageSize: number;
  itemCount: number;
  onPageChange: (page: number) => void;
};

export function AdminPagination({ page, pageSize, itemCount, onPageChange }: AdminPaginationProps) {
  const hasPrevious = page > 1;
  const hasNext = itemCount >= pageSize;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4 text-sm text-slate-400">
      <div>Page {page}</div>
      <div className="flex gap-2">
        <button
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
