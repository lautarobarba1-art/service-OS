"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState } from "react";

type DataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyMessage: string;
  searchPlaceholder: string;
};

export function DataTable<TData>({ columns, data, emptyMessage, searchPlaceholder }: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("");
  // TanStack Table exposes closures intentionally; React Compiler skips this hook safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  return (
    <div className="data-table-wrap">
      <div className="table-tools">
        <input
          aria-label="Filtrar tabla"
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={globalFilter}
        />
        <span>{table.getFilteredRowModel().rows.length} registros</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>
            )) : (
              <tr><td className="empty-table" colSpan={columns.length}>{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 ? (
        <div className="pagination">
          <button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Anterior</button>
          <span>Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</span>
          <button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Siguiente</button>
        </div>
      ) : null}
    </div>
  );
}
