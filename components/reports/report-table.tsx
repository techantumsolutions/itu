'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getGroupedRowModel,
  flexRender,
} from '@tanstack/react-table'
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
  RowSelectionState,
  GroupingState,
} from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Eye,
  FolderOpen,
  Layers,
  ListFilter,
  RotateCcw,
} from 'lucide-react'
import type {
  ReportColumn,
  ReportRow,
  ReportPagination,
  ReportSort,
} from '@/lib/reports/types'
import { runExport } from '@/lib/reports/export-service'
import { cn } from '@/lib/utils'
const ALL_SENTINEL = '__ALL__'

interface ReportTableProps {
  columns:    ReportColumn[]
  rows:       ReportRow[]
  pagination: ReportPagination
  sort?:      ReportSort
  onSortChange: (sort: ReportSort) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  loading?:   boolean
}

// Helper formatting functions
function formatCellValue(value: unknown, type?: string, currencyCode = 'EUR'): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60">—</span>

  switch (type) {
    case 'currency': {
      const num = Number(value)
      if (isNaN(num)) return String(value)
      return (
        <span className="font-mono tabular-nums font-semibold">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(num)}
        </span>
      )
    }
    case 'percent': {
      const num = Number(value)
      if (isNaN(num)) return String(value)
      return <span className="font-mono tabular-nums">{num.toFixed(1)}%</span>
    }
    case 'date': {
      const date = new Date(String(value))
      if (isNaN(date.getTime())) return String(value)
      return date.toLocaleDateString()
    }
    case 'datetime': {
      const date = new Date(String(value))
      if (isNaN(date.getTime())) return String(value)
      return (
        <span className="text-xs truncate block" title={date.toLocaleString()}>
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    }
    case 'badge': {
      const val = String(value)
      const st = val.toLowerCase()
      const isSuccess = ['completed', 'success', 'active', 'paid', 'yes', 'run_billing_type_expected'].includes(st)
      const isDanger  = ['failed', 'error', 'timeout', 'unpaid', 'no', 'inactive'].includes(st)
      const isWarn    = ['pending', 'processing', 'refunded', 'hold'].includes(st)

      return (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0',
            isSuccess && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
            isDanger  && 'bg-rose-500/10 text-rose-600 border-rose-500/20',
            isWarn    && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
            !isSuccess && !isDanger && !isWarn && 'bg-muted text-muted-foreground border-border',
          )}
        >
          {val}
        </span>
      )
    }
    case 'number': {
      const num = Number(value)
      if (isNaN(num)) return String(value)
      return <span className="font-mono tabular-nums">{new Intl.NumberFormat('en-US').format(num)}</span>
    }
    default:
      return String(value)
  }
}

export function ReportTable({
  columns,
  rows,
  pagination,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  loading,
}: ReportTableProps) {
  // ── States ─────────────────────────────────────────────────────────────────
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [grouping, setGrouping] = useState<GroupingState>([])

  // Reset local interactive state on report type changes
  useEffect(() => {
    setRowSelection({})
    setGrouping([])
  }, [columns])

  // Sync sorting from props
  const sorting = useMemo<SortingState>(() => {
    if (!sort) return []
    return [{ id: sort.column, desc: sort.direction === 'desc' }]
  }, [sort])

  const handleSortingChange = (updater: any) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    if (next.length > 0) {
      onSortChange({
        column: next[0].id,
        direction: next[0].desc ? 'desc' : 'asc',
      })
    }
  }

  // ── Compile TanStack Columns Definition ─────────────────────────────────────
  const tableColumns = useMemo<ColumnDef<ReportRow>[]>(() => {
    const cols: ColumnDef<ReportRow>[] = []

    // 1. Selection column
    cols.push({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    })

    // 2. Data columns
    columns.forEach((col) => {
      cols.push({
        id: col.key,
        accessorKey: col.key,
        header: ({ column }) => {
          const isSorted = column.getIsSorted()
          if (col.sortable === false) {
            return <span className="text-xs font-semibold">{col.header}</span>
          }
          return (
            <button
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="flex items-center gap-1 hover:text-foreground text-xs font-semibold select-none focus:outline-none transition-colors"
            >
              {col.header}
              {isSorted === 'asc' && <ArrowUpDown className="size-3 text-primary" />}
              {isSorted === 'desc' && <ArrowUpDown className="size-3 text-primary rotate-180" />}
              {!isSorted && <ChevronsUpDown className="size-3 opacity-40" />}
            </button>
          )
        },
        cell: ({ row, getValue }) => {
          const val = getValue()
          if (col.render) {
            return col.render(val, row.original)
          }
          return formatCellValue(val, col.type, col.currency)
        },
        enableSorting: col.sortable !== false,
      })
    })

    return cols
  }, [columns])

  // ── Initialize TanStack Table ──────────────────────────────────────────────
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      grouping,
    },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    manualSorting: true,
    manualPagination: true,
  })

  // ── Selected rows export dispatcher ─────────────────────────────────────────
  const selectedOriginalRows = useMemo(() => {
    return table.getSelectedRowModel().rows.map((r) => r.original)
  }, [rowSelection, rows])

  const handleExportSelected = (format: 'csv' | 'xlsx' | 'json') => {
    if (selectedOriginalRows.length === 0) return
    runExport(selectedOriginalRows, columns, {
      format,
      fileName: `selected_rows_${Date.now()}`,
    })
  }

  // Row limits calculation for pagination label
  const startRow = (pagination.page - 1) * pagination.pageSize + 1
  const endRow   = Math.min(pagination.page * pagination.pageSize, pagination.total)

  return (
    <div className="space-y-4">
      {/* ── Table Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-3 rounded-lg border border-border/40">
        <div className="flex items-center gap-3">
          {/* Grouping configuration option */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
            <Layers className="size-3.5 shrink-0" />
            <span>Group By:</span>
            <Select
              value={grouping[0] || ALL_SENTINEL}
              onValueChange={(v) => setGrouping(v === ALL_SENTINEL ? [] : [v])}
            >
              <SelectTrigger className="h-7 text-xs py-0 px-2 min-w-[120px]">
                <SelectValue placeholder="No Grouping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>No Grouping</SelectItem>
                {columns.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.header}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected rows count indicator */}
          {selectedOriginalRows.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-left-2 duration-200">
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold border border-primary/20">
                {selectedOriginalRows.length} Selected
              </span>
              
              {/* Selected rows export menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                    <Download className="size-3" />
                    Export Selected
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => handleExportSelected('csv')}>Export to CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportSelected('xlsx')}>Export to Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportSelected('json')}>Export to JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear checked rows */}
              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setRowSelection({})}>
                <RotateCcw className="size-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Dynamic column toggles menu */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-2 text-xs font-semibold">
                <Eye className="size-3.5" />
                Columns
                <ChevronDown className="size-3 text-muted-foreground ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-40 max-h-[300px] overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const headerTitle = columns.find(c => c.key === column.id)?.header || column.id
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize text-xs font-medium"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {headerTitle}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Table Grid ───────────────────────────────────────────────────────── */}
      <div className="relative border border-border/40 bg-card rounded-lg shadow-xs overflow-hidden">
        
        {/* Scroll Container for sticky headers */}
        <div className="overflow-x-auto overflow-y-auto max-h-[580px] w-full">
          <table className="w-full border-collapse border-spacing-0 relative">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-30 shadow-[0_1px_0_0_hsl(var(--border))]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/40 hover:bg-transparent">
                  {headerGroup.headers.map((header, idx) => {
                    const isSelectionCol = header.id === 'select'
                    const isFirstDataCol = idx === 1

                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'h-10 px-4 text-left align-middle text-[11px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/65',
                          isSelectionCol && 'sticky left-0 bg-muted/95 z-40 w-12 border-r border-border/40 shadow-[2px_0_4px_rgba(0,0,0,0.03)]',
                          isFirstDataCol && 'sticky left-12 bg-muted/95 z-40 border-r border-border/30 shadow-[2px_0_4px_rgba(0,0,0,0.03)] font-extrabold',
                        )}
                        style={isFirstDataCol ? { minWidth: '150px' } : undefined}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                // ── Loading Skeletons State ──
                Array.from({ length: 8 }).map((_, rIdx) => (
                  <tr key={rIdx} className="h-12 hover:bg-transparent">
                    {columns.map((_, cIdx) => (
                      <td key={cIdx} className="px-4 py-2">
                        <div className="h-4 bg-muted/40 animate-pulse rounded w-4/5" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                // ── Empty State ──
                <tr>
                  <td colSpan={columns.length + 1} className="h-44 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FolderOpen className="size-8 text-muted-foreground/50 animate-bounce duration-1000" />
                      <p className="text-sm font-semibold text-muted-foreground">No reports matching filters found.</p>
                      <p className="text-xs text-muted-foreground/60">Try updating your filters or date range.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                // ── Data Rows ──
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'h-11 hover:bg-muted/30 transition-colors',
                      row.getIsSelected() && 'bg-primary/5 hover:bg-primary/10',
                    )}
                  >
                    {row.getVisibleCells().map((cell, idx) => {
                      const isSelectionCol = cell.column.id === 'select'
                      const isFirstDataCol = idx === 1

                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'px-4 py-2.5 text-xs text-foreground font-medium max-w-[280px] truncate',
                            isSelectionCol && 'sticky left-0 bg-card z-20 border-r border-border/40 shadow-[2px_0_4px_rgba(0,0,0,0.03)]',
                            isFirstDataCol && 'sticky left-12 bg-card z-20 border-r border-border/30 shadow-[2px_0_4px_rgba(0,0,0,0.03)] font-bold text-foreground',
                          )}
                          style={isFirstDataCol ? { minWidth: '150px' } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination Footer ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-2 border-t border-border/10">
        <div className="text-xs text-muted-foreground font-semibold">
          {rows.length > 0 ? (
            <span>Showing {startRow} - {endRow} of {pagination.total} entries</span>
          ) : (
            <span>Showing 0 - 0 of 0 entries</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Row limit switcher */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
            <span>Show</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 text-xs py-0 px-2 w-[70px]">
                <SelectValue placeholder={String(pagination.pageSize)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
            <span>entries</span>
          </div>

          {/* Page index selectors */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => onPageChange(1)}
              className="h-8 w-8 p-0"
              title="First Page"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => onPageChange(pagination.page - 1)}
              className="h-8 px-2.5 text-xs font-semibold"
            >
              Prev
            </Button>
            
            <div className="h-8 px-3 rounded-md border flex items-center justify-center font-bold text-xs bg-muted/40 min-w-8">
              {pagination.page}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize) || loading}
              onClick={() => onPageChange(pagination.page + 1)}
              className="h-8 px-2.5 text-xs font-semibold"
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize) || loading}
              onClick={() => onPageChange(Math.ceil(pagination.total / pagination.pageSize))}
              className="h-8 w-8 p-0"
              title="Last Page"
            >
              »
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default ReportTable
