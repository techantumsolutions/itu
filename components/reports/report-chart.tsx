'use client'

import React, { useMemo, useState, useRef } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, Download, HelpCircle } from 'lucide-react'
import type { ChartSeries, ChartType } from '@/lib/reports/types'
import { cn } from '@/lib/utils'

// Premium color palette for charts
const PALETTE = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
]

interface ReportChartProps {
  series:   ChartSeries[]
  type?:    ChartType
  height?:  number
  currency?: string
  title?:   string
}

function formatTickValue(value: number, currency?: string): string {
  if (currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      notation: 'compact', maximumFractionDigits: 1,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(value)
}

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border/60 rounded-lg shadow-xl p-3 text-sm min-w-[140px] z-50">
      {label && <p className="text-xs text-muted-foreground font-medium mb-2 border-b border-border/40 pb-1.5">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: entry.color || entry.fill }} />
            <span className="text-muted-foreground text-xs">{entry.name}</span>
          </span>
          <span className="font-semibold tabular-nums">
            {formatTickValue(Number(entry.value), currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Heatmap SVG Component ───────────────────────────────────────────────────

interface HeatmapProps {
  series: ChartSeries[]
  height: number
  currency?: string
}

function HeatmapChart({ series, height, currency }: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 1. Gather all unique X axis labels and Y axis rows
  const xLabels = useMemo(() => {
    const labels = new Set<string>()
    for (const s of series) {
      for (const pt of s.data) {
        if (pt.label) labels.add(pt.label)
      }
    }
    return Array.from(labels).sort()
  }, [series])

  const yLabels = useMemo(() => {
    return series.map((s) => ({ id: s.id, name: s.name }))
  }, [series])

  // 2. Find absolute max value for color scaling
  const maxValue = useMemo(() => {
    let max = 1
    for (const s of series) {
      for (const pt of s.data) {
        if (pt.value > max) max = pt.value
      }
    }
    return max
  }, [series])

  // 3. Build data grid map
  const grid = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of series) {
      for (const pt of s.data) {
        map.set(`${s.id}::${pt.label}`, pt.value)
      }
    }
    return map
  }, [series])

  const cellHeight = Math.max(30, Math.min(60, (height - 60) / Math.max(1, yLabels.length)))

  return (
    <div ref={containerRef} className="w-full overflow-x-auto select-none" style={{ height }}>
      <div className="min-w-[650px] h-full flex flex-col justify-between py-2">
        {/* Rows */}
        <div className="flex-1 flex flex-col gap-1">
          {yLabels.map((y, yIdx) => (
            <div key={y.id} className="flex items-center gap-2 h-full" style={{ height: cellHeight }}>
              {/* Row Label */}
              <div className="w-24 text-xs font-semibold text-muted-foreground truncate text-right shrink-0 pr-2">
                {y.name}
              </div>
              {/* Cells */}
              <div className="flex-1 flex gap-1 h-full">
                {xLabels.map((x) => {
                  const val = grid.get(`${y.id}::${x}`) ?? 0
                  const ratio = maxValue > 0 ? val / maxValue : 0
                  const color = PALETTE[yIdx % PALETTE.length]

                  return (
                    <TooltipProvider key={x}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex-1 h-full rounded transition-all hover:scale-[1.03] cursor-pointer border border-border/10"
                            style={{
                              backgroundColor: color,
                              opacity: val > 0 ? Math.max(0.12, ratio) : 0.04,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <p className="font-bold">{y.name}</p>
                          <p className="text-muted-foreground">{x}</p>
                          <p className="font-semibold mt-1">{formatTickValue(val, currency)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* X Axis Labels */}
        <div className="flex items-center gap-2 mt-2 shrink-0">
          <div className="w-24 shrink-0" />
          <div className="flex-1 flex justify-between text-[10px] font-bold text-muted-foreground/60 px-1">
            {xLabels.map((x, idx) => {
              // Throttle X labels to avoid overlapping on wide spans
              const interval = Math.ceil(xLabels.length / 10)
              if (idx % interval !== 0 && idx !== xLabels.length - 1) {
                return <span key={x} className="flex-1 text-center opacity-0">{x}</span>
              }
              return (
                <span key={x} className="flex-1 text-center truncate px-0.5">
                  {x}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Chart Wrapper ───────────────────────────────────────────────────────

export function ReportChart({
  series,
  type,
  height = 340,
  currency,
  title,
}: ReportChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Resolve chart type and title dynamically from the series configuration if not explicitly provided
  const resolvedType = type || series[0]?.type || 'bar'
  const resolvedTitle = title || series[0]?.name || `${resolvedType.replace('-', ' ')} Chart`

  // 1. Merge labels for multi-series charts
  const merged = useMemo(() => {
    const labelMap = new Map<string, Record<string, number>>()
    for (const s of series) {
      for (const point of s.data) {
        const existing = labelMap.get(point.label) ?? {}
        existing[s.id] = point.value
        labelMap.set(point.label, existing)
      }
    }
    return Array.from(labelMap.entries()).map(([label, values]) => ({ label, ...values }))
  }, [series])

  if (!series || series.length === 0) {
    return (
      <div className="flex items-center justify-center border border-dashed rounded-lg h-64 text-sm text-muted-foreground/75">
        No chart metrics available.
      </div>
    )
  }

  // 2. Download SVG as PNG
  const handleDownloadPng = () => {
    const container = chartRef.current
    const svgEl = container?.querySelector('svg')
    if (!svgEl) return

    // Clone SVG to modify font properties for cleaner canvas rendering
    const clonedSvg = svgEl.cloneNode(true) as SVGElement
    clonedSvg.setAttribute('style', 'font-family: sans-serif; font-size: 11px;')

    const svgString = new XMLSerializer().serializeToString(clonedSvg)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const URL = window.URL || window.webkitURL || window
    const blobURL = URL.createObjectURL(svgBlob)

    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2 // Print-resolution multiplier
      canvas.width = svgEl.clientWidth * scale
      canvas.height = svgEl.clientHeight * scale
      
      const context = canvas.getContext('2d')
      if (context) {
        context.scale(scale, scale)
        // Background fill depending on theme class
        const isDark = document.documentElement.classList.contains('dark')
        context.fillStyle = isDark ? '#090d16' : '#ffffff'
        context.fillRect(0, 0, svgEl.clientWidth, svgEl.clientHeight)
        context.drawImage(image, 0, 0, svgEl.clientWidth, svgEl.clientHeight)
      }

      const pngURL = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.href = pngURL
      downloadLink.download = `${resolvedTitle.toLowerCase().replace(/\s+/g, '_')}.png`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
      URL.revokeObjectURL(blobURL)
    }
    image.src = blobURL
  }

  // Toggle Fullscreen state
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Pie / Donut
  if (resolvedType === 'pie' || resolvedType === 'donut') {
    const firstSeries = series[0]
    const totalValue  = firstSeries.data.reduce((s, d) => s + d.value, 0)
    const pieContent = (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={firstSeries.data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={resolvedType === 'donut' ? 95 : 115}
            innerRadius={resolvedType === 'donut' ? 60 : 0}
            paddingAngle={2}
            strokeWidth={0}
            isAnimationActive={true}
            animationDuration={600}
          >
            {firstSeries.data.map((entry, i) => (
              <Cell key={i} fill={entry.color ?? PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <RechartsTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]
              const pct  = totalValue > 0 ? ((Number(item.value) / totalValue) * 100).toFixed(1) : '0'
              return (
                <div className="bg-popover border border-border/60 rounded-lg shadow-xl p-3 text-sm z-50">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-muted-foreground text-xs">{formatTickValue(Number(item.value), currency)} ({pct}%)</p>
                </div>
              )
            }}
          />
          <Legend
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    )

    return renderLayout(pieContent)
  }

  // Heatmap Custom Component
  if (resolvedType === 'heatmap') {
    return renderLayout(
      <HeatmapChart series={series} height={isFullscreen ? 500 : height} currency={currency} />
    )
  }

  // Stacked Bar, Standard Bar, Area, and Line charts using Recharts
  const ChartComponent = resolvedType === 'line' ? LineChart : resolvedType === 'area' ? AreaChart : BarChart

  const baseChartContent = (
    <ResponsiveContainer width="100%" height="100%">
      <ChartComponent data={merged} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatTickValue(v, currency)}
          width={50}
        />
        <RechartsTooltip
          content={<CustomTooltip currency={currency} />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.15 }}
        />
        {series.length > 1 && (
          <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
        )}
        {series.map((s, i) => {
          const color = s.color ?? PALETTE[i % PALETTE.length]
          
          if (resolvedType === 'area') {
            return (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                fill={color}
                stroke={color}
                fillOpacity={0.12}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={true}
                animationDuration={600}
              />
            )
          }
          if (resolvedType === 'line') {
            return (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={color}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                isAnimationActive={true}
                animationDuration={600}
              />
            )
          }

          // Bar / Stacked Bar
          return (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              fill={color}
              stackId={resolvedType === 'stacked-bar' ? 'stack' : undefined}
              radius={resolvedType === 'stacked-bar' ? undefined : [3, 3, 0, 0]}
              maxBarSize={35}
              isAnimationActive={true}
              animationDuration={600}
            />
          )
        })}
      </ChartComponent>
    </ResponsiveContainer>
  )

  return renderLayout(baseChartContent)

  // Layout wrapper to inject Toolbar triggers and handle Fullscreen overlays
  function renderLayout(chartContent: React.ReactNode) {
    const layout = (
      <div
        ref={chartRef}
        className={cn(
          "w-full bg-card rounded-lg flex flex-col justify-between border border-border/10",
          isFullscreen 
            ? "fixed inset-0 z-50 p-6 bg-card" 
            : "p-4"
        )}
        style={isFullscreen ? { height: '100vh', width: '100vw' } : { height }}
      >
        {/* Toolbar Header */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {resolvedTitle}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Download PNG (Disabled for custom heatmaps as it uses pure HTML grids, enabled for SVG charts) */}
            {resolvedType !== 'heatmap' && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleDownloadPng}
                title="Download PNG"
              >
                <Download className="size-3.5" />
              </Button>
            )}

            {/* Toggle Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* Chart Content Area */}
        <div className="flex-1 min-h-0 w-full relative">
          {chartContent}
        </div>
      </div>
    )

    return layout
  }
}
export default ReportChart
