import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

export type TableColumn<T> = {
  key: string;
  title: string;
  render: (item: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  emptyTitle: string;
  emptyMessage: string;
};

type DataTableColumnProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchKey?: keyof T & string;
  emptyTitle?: string;
  emptyMessage?: string;
};

type CompatibleDataTableProps<T> = DataTableProps<T> | DataTableColumnProps<T>;

type TableRow<T> = {
  original: T;
  getValue: (key: string) => unknown;
};

function getRecordValue<T>(item: T, key: string) {
  return (item as Record<string, unknown>)[key];
}

function getColumnKey<T>(column: ColumnDef<T, unknown>, index: number) {
  if ('id' in column && column.id) return String(column.id);
  if ('accessorKey' in column && column.accessorKey) return String(column.accessorKey);
  return String(index);
}

function getColumnHeader<T>(column: ColumnDef<T, unknown>, index: number) {
  if (typeof column.header === 'string') return column.header;
  return getColumnKey(column, index);
}

function renderColumnCell<T>(column: ColumnDef<T, unknown>, item: T) {
  const row: TableRow<T> = {
    original: item,
    getValue: (key: string) => getRecordValue(item, key),
  };

  if (typeof column.cell === 'function') {
    return column.cell({ row } as never) as ReactNode;
  }

  if ('accessorKey' in column && column.accessorKey) {
    return getRecordValue(item, String(column.accessorKey)) as ReactNode;
  }

  return null;
}

export default function DataTable<T>(props: CompatibleDataTableProps<T>) {
  if ('data' in props) {
    return <ColumnDataTable {...props} />;
  }

  const { columns, rows, emptyTitle, emptyMessage } = props;

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="admin-table__empty" colSpan={columns.length}>
                <strong>{emptyTitle}</strong>
                <span>{emptyMessage}</span>
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ColumnDataTable<T>({
  columns,
  data,
  searchKey,
  emptyTitle = 'No records found',
  emptyMessage = 'Try adjusting your search or filters.',
}: DataTableColumnProps<T>) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!searchKey || !needle) return data;
    return data.filter((item) => String(getRecordValue(item, searchKey) ?? '').toLowerCase().includes(needle));
  }, [data, query, searchKey]);

  return (
    <div className="space-y-4">
      {searchKey ? (
        <input
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-white/20"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${searchKey}`}
          value={query}
        />
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={getColumnKey(column, index)}>{getColumnHeader(column, index)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="admin-table__empty" colSpan={columns.length}>
                  <strong>{emptyTitle}</strong>
                  <span>{emptyMessage}</span>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, columnIndex) => (
                    <td key={getColumnKey(column, columnIndex)}>
                      {renderColumnCell(column, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DataTable };
