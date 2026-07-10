'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileText, FileSpreadsheet, FileJson, Printer, Loader2 } from 'lucide-react'
import { runExport } from '@/lib/reports/export-service'
import type { ReportColumn, ReportRow, ReportFilters, ReportSort, ExportFormat, SummaryCard } from '@/lib/reports/types'
import { toast } from 'sonner'

interface ReportExportButtonProps {
  rows:          ReportRow[]
  columns:       ReportColumn[]
  filters:       ReportFilters
  sort?:         ReportSort
  reportName:    string
  summaryCards?: SummaryCard[]
}

const FORMAT_OPTIONS: { format: ExportFormat; label: string; icon: React.ElementType; description: string }[] = [
  { format: 'csv',  label: 'CSV',   icon: FileText,        description: 'Comma-separated, Excel-compatible' },
  { format: 'xlsx', label: 'Excel', icon: FileSpreadsheet, description: 'XLSX with auto-widths and styling' },
  { format: 'json', label: 'JSON',  icon: FileJson,        description: 'Raw JSON for API / integrations' },
  { format: 'pdf',  label: 'Print / PDF', icon: Printer,   description: 'Browser print dialog' },
]

export function ReportExportButton({
  rows,
  columns,
  filters,
  sort,
  reportName,
  summaryCards,
}: ReportExportButtonProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  async function handleExport(format: ExportFormat) {
    if (rows.length === 0) {
      toast.warning('No data to export. Run the report first.')
      return
    }
    setExporting(format)
    try {
      runExport(rows, columns, {
        format,
        fileName: `${reportName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
        filters,
        sort,
        reportName,
        generatedBy: 'Admin User',
        summaryCards,
      })
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (err) {
      toast.error('Export failed. Please try again.')
      console.error('[ReportExport]', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9 font-semibold" disabled={!!exporting}>
          {exporting
            ? <Loader2 className="size-4 animate-spin" />
            : <Download className="size-4" />
          }
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMAT_OPTIONS.map(({ format, label, icon: Icon, description }) => (
          <DropdownMenuItem
            key={format}
            onClick={() => handleExport(format)}
            className="gap-3 cursor-pointer group focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground group-focus:text-accent-foreground group-data-[highlighted]:text-accent-foreground">
                {label}
              </span>
              <span className="text-xs text-muted-foreground group-focus:text-accent-foreground/90 group-data-[highlighted]:text-accent-foreground/90">
                {description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
