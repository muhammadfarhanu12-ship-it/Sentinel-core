import type { ReactNode } from 'react';

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

export default function DataTable<T>({ columns, rows, emptyTitle, emptyMessage }: DataTableProps<T>) {
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
