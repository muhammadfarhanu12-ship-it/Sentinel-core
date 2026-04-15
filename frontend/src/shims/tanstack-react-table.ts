import * as React from 'react';

export type SortingState = Array<{ id: string; desc: boolean }>;

export type ColumnDef<TData, TValue = unknown> = {
  id?: string;
  accessorKey?: keyof TData | string;
  header?: React.ReactNode | ((ctx: any) => React.ReactNode);
  cell?: (ctx: { row: Row<TData> }) => React.ReactNode;
};

export function flexRender(comp: any, ctx: any) {
  if (typeof comp === 'function') return comp(ctx);
  return comp ?? null;
}

export function getCoreRowModel() {
  return () => true;
}
export function getPaginationRowModel() {
  return () => true;
}
export function getSortedRowModel() {
  return () => true;
}
export function getFilteredRowModel() {
  return () => true;
}

export type Row<TData> = {
  id: string;
  original: TData;
  getValue: (key: string) => unknown;
  getVisibleCells: () => Array<Cell<TData>>;
};

export type Cell<TData> = {
  id: string;
  column: Column<TData>;
  getContext: () => any;
};

export type Column<TData> = {
  id: string;
  columnDef: ColumnDef<TData, any>;
  getCanSort: () => boolean;
  getIsSorted: () => false | 'asc' | 'desc';
  getToggleSortingHandler: () => (() => void) | undefined;
};

type Header<TData> = {
  id: string;
  isPlaceholder: boolean;
  column: Column<TData>;
  getContext: () => any;
};

type HeaderGroup<TData> = {
  id: string;
  headers: Array<Header<TData>>;
};

export function useReactTable<TData>(opts: {
  data: TData[];
  columns: Array<ColumnDef<TData, any>>;
  // Additional options used by the UI (no-op in this lightweight shim)
  getCoreRowModel?: any;
  getPaginationRowModel?: any;
  getSortedRowModel?: any;
  getFilteredRowModel?: any;
  onSortingChange?: (s: SortingState) => void;
  onGlobalFilterChange?: (s: string) => void;
  state?: { sorting?: SortingState; globalFilter?: string };
}) {
  const pageSize = 10;
  const [pageIndex, setPageIndex] = React.useState(0);

  const sorting = opts.state?.sorting || [];
  const globalFilter = opts.state?.globalFilter?.toString()?.toLowerCase() || '';

  const columns: Array<Column<TData>> = opts.columns.map((c, i) => {
    const id = (c.id || (typeof c.accessorKey === 'string' ? c.accessorKey : String(c.accessorKey)) || `col_${i}`) as string;
    return {
      id,
      columnDef: c,
      getCanSort: () => true,
      getIsSorted: () => {
        const s = sorting.find((x) => x.id === id);
        if (!s) return false;
        return s.desc ? 'desc' : 'asc';
      },
      getToggleSortingHandler: () => () => {
        const current = sorting.find((x) => x.id === id);
        const next: SortingState = current
          ? [{ id, desc: !current.desc }]
          : [{ id, desc: false }];
        opts.onSortingChange?.(next);
      },
    };
  });

  const getValue = (row: any, accessorKey?: string | keyof TData) => {
    if (!accessorKey) return undefined;
    return (row as any)[accessorKey as any];
  };

  let rows = opts.data.map((d, idx) => {
    const row: Row<TData> = {
      id: String((d as any)?.id ?? idx),
      original: d,
      getValue: (key: string) => getValue(d as any, key),
      getVisibleCells: () =>
        columns.map((col) => ({
          id: `${row.id}_${col.id}`,
          column: col,
          getContext: () => ({ row, column: col }),
        })),
    };
    return row;
  });

  if (globalFilter) {
    rows = rows.filter((r) => ((JSON.stringify(r.original)?.toLowerCase() || '').includes(globalFilter)));
  }

  if (sorting.length) {
    const s = sorting[0];
    rows = [...rows].sort((a, b) => {
      const av = a.getValue(s.id);
      const bv = b.getValue(s.id);
      if (av == null && bv == null) return 0;
      if (av == null) return s.desc ? 1 : -1;
      if (bv == null) return s.desc ? -1 : 1;
      const as = String(av);
      const bs = String(bv);
      return s.desc ? bs.localeCompare(as) : as.localeCompare(bs);
    });
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

  const headerGroups: Array<HeaderGroup<TData>> = [
    {
      id: 'hg_0',
      headers: columns.map((col) => ({
        id: `h_${col.id}`,
        isPlaceholder: false,
        column: col,
        getContext: () => ({ column: col }),
      })),
    },
  ];

  return {
    getHeaderGroups: () => headerGroups,
    getRowModel: () => ({ rows: pageRows }),
    previousPage: () => setPageIndex((p: number) => Math.max(0, p - 1)),
    nextPage: () => setPageIndex((p: number) => Math.min(pageCount - 1, p + 1)),
    getCanPreviousPage: () => pageIndex > 0,
    getCanNextPage: () => pageIndex < pageCount - 1,
  };
}
