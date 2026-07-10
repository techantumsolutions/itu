'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CalendarDays, ChevronDown, Search, X, RotateCcw } from 'lucide-react'
import type { ReportFilters, DateRangePreset, ReportDefinition } from '@/lib/reports/types'
import { DATE_RANGE_PRESETS, resolveDateRange, formatDateRange, getDefaultDateRange } from '@/lib/reports/date-range'
import { cn } from '@/lib/utils'

interface ReportFiltersBarProps {
  filters:    ReportFilters
  definition: ReportDefinition
  onChange:   (filters: ReportFilters) => void
  loading?:   boolean
}

const ALL_SENTINEL = '__all__'

// ─── Filter Constants ────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: ALL_SENTINEL, label: 'All Providers' },
  { value: 'dtone',      label: 'DTOne' },
  { value: 'ding',       label: 'Ding Connect' },
  { value: 'valuetopup', label: 'ValueTopup' },
]

const CURRENCIES = [
  { value: ALL_SENTINEL, label: 'All Currencies' },
  { value: 'EUR',        label: 'Euro (EUR)' },
  { value: 'USD',        label: 'US Dollar (USD)' },
  { value: 'GBP',        label: 'British Pound (GBP)' },
  { value: 'INR',        label: 'Indian Rupee (INR)' },
]

const STATUSES = [
  { value: ALL_SENTINEL, label: 'All Statuses' },
  { value: 'completed',  label: 'Completed' },
  { value: 'pending',    label: 'Pending' },
  { value: 'failed',     label: 'Failed' },
  { value: 'error',      label: 'Error' },
  { value: 'timeout',    label: 'Timeout' },
]

const RECHARGE_TYPES = [
  { value: ALL_SENTINEL, label: 'All Recharge Types' },
  { value: 'topup',      label: 'Topup' },
  { value: 'pin',        label: 'PIN' },
  { value: 'data',       label: 'Data' },
  { value: 'bundle',     label: 'Bundle' },
]

const BILLING_TYPES = [
  { value: ALL_SENTINEL, label: 'All Billing Types' },
  { value: 'prepaid',    label: 'Prepaid' },
  { value: 'postpaid',   label: 'Postpaid' },
]

const PAYMENT_STATUSES = [
  { value: ALL_SENTINEL, label: 'All Payment Statuses' },
  { value: 'paid',       label: 'Paid' },
  { value: 'unpaid',     label: 'Unpaid' },
  { value: 'refunded',   label: 'Refunded' },
]

const GATEWAYS = [
  { value: ALL_SENTINEL, label: 'All Gateways' },
  { value: 'stripe',     label: 'Stripe' },
  { value: 'razorpay',   label: 'Razorpay' },
  { value: 'wallet',     label: 'Wallet' },
]

const FALLBACK_COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'IN', label: 'India' },
  { value: 'MX', label: 'Mexico' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'ES', label: 'Spain' },
]

export function ReportFiltersBar({
  filters,
  definition,
  onChange,
  loading,
}: ReportFiltersBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [dateOpen, setDateOpen]   = useState(false)
  const [customFrom, setCustomFrom] = useState(filters.dateRange?.from ?? '')
  const [customTo, setCustomTo]     = useState(filters.dateRange?.to ?? '')
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>(FALLBACK_COUNTRIES)

  // Load full country list for filter dropdowns
  useEffect(() => {
    const needsCountries =
      definition.supportedFilters?.some((f) =>
        f === 'country' || f === 'originCountry' || f === 'destinationCountry'
      ) ?? false
    if (!needsCountries) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/countries', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json() as {
          countries?: Array<{ code?: string; name?: string; iso3?: string }>
        }
        const opts = (data.countries ?? [])
          .map((c) => ({
            value: String(c.code ?? '').toUpperCase().trim(),
            label: String(c.name ?? c.code ?? '').trim(),
          }))
          .filter((c) => c.value.length === 2 && c.label)
          .sort((a, b) => a.label.localeCompare(b.label))
        if (!cancelled && opts.length > 0) setCountryOptions(opts)
      } catch {
        // keep fallback list
      }
    })()
    return () => { cancelled = true }
  }, [definition.supportedFilters])

  // Sync custom input dates with filter dates
  useEffect(() => {
    if (filters.dateRange?.preset === 'custom') {
      setCustomFrom(filters.dateRange.from)
      setCustomTo(filters.dateRange.to)
    }
  }, [filters.dateRange])

  // Sync state to URL Query Parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    
    // Set active filters to URL
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'dateRange') {
        params.set('preset', filters.dateRange.preset ?? 'last_30_days')
        if (filters.dateRange.preset === 'custom') {
          params.set('from', filters.dateRange.from)
          params.set('to', filters.dateRange.to)
        } else {
          params.delete('from')
          params.delete('to')
        }
      } else if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      } else {
        params.delete(key)
      }
    }
    
    const newQuery = params.toString()
    const currentQuery = window.location.search.replace(/^\?/, '')
    
    if (newQuery !== currentQuery) {
      router.replace(`?${newQuery}`, { scroll: false })
    }
  }, [filters, router])

  // Helper to determine if a filter field is supported by the active report
  const isSupported = (field: string) => {
    return definition.supportedFilters?.includes(field) ?? false
  }

  // Update specific filter property and trigger reload
  const handleUpdate = (updatedFields: Partial<ReportFilters>) => {
    onChange({
      ...filters,
      ...updatedFields,
    })
  }

  // Datepreset selection
  const handlePreset = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      handleUpdate({ dateRange: { ...filters.dateRange, preset: 'custom' } })
      return
    }
    const range = resolveDateRange(preset)
    handleUpdate({ dateRange: range })
    setDateOpen(false)
  }

  // Custom date selection apply
  const handleCustomApply = () => {
    if (!customFrom || !customTo) return
    const range = resolveDateRange('custom', customFrom, customTo)
    handleUpdate({ dateRange: range })
    setDateOpen(false)
  }

  // Reset all filters to defaults
  const handleReset = () => {
    const defaultRange = getDefaultDateRange()
    const resetFilters: ReportFilters = {
      dateRange: defaultRange,
    }
    // Set default filters from definition if any
    if (definition.defaultFilters) {
      Object.assign(resetFilters, definition.defaultFilters)
    }
    onChange(resetFilters)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Grid */}
      <div className="flex flex-wrap items-end gap-3.5">
        
        {/* Date Range Picker (Supported by default on all reports) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date Range
          </Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 h-9 text-sm font-normal justify-start min-w-[200px]"
              >
                <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                <span className="truncate">{formatDateRange(filters.dateRange)}</span>
                <ChevronDown className="size-3.5 ml-auto text-muted-foreground shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0 shadow-lg z-50">
              <div className="p-2 space-y-0.5 max-h-[220px] overflow-y-auto">
                {DATE_RANGE_PRESETS.filter((p) => p.value !== 'custom').map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handlePreset(preset.value)}
                    className={cn(
                      'w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors',
                      filters.dateRange?.preset === preset.value
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'hover:bg-muted/60 text-foreground',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-border/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Range</p>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <Button size="sm" className="w-full h-8 text-xs" onClick={handleCustomApply}>
                  Apply Custom Range
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Provider */}
        {isSupported('provider') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Provider</Label>
            <Select
              value={filters.provider ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ provider: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[150px]">
                <SelectValue placeholder="All Providers" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Country */}
        {isSupported('country') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Country</Label>
            <Select
              value={filters.country ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ country: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[150px]">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Countries</SelectItem>
                {countryOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Origin Country */}
        {isSupported('originCountry') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Origin Country</Label>
            <Select
              value={filters.originCountry ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ originCountry: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[160px]">
                <SelectValue placeholder="All Origin Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Origin Countries</SelectItem>
                {countryOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Destination Country */}
        {isSupported('destinationCountry') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dest Country</Label>
            <Select
              value={filters.destinationCountry ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ destinationCountry: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[160px]">
                <SelectValue placeholder="All Dest Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Dest Countries</SelectItem>
                {countryOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Currency */}
        {isSupported('currency') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</Label>
            <Select
              value={filters.currency ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ currency: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[150px]">
                <SelectValue placeholder="All Currencies" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Transaction Status */}
        {isSupported('status') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select
              value={filters.status ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ status: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Recharge Type */}
        {isSupported('rechargeType') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recharge Type</Label>
            <Select
              value={filters.rechargeType ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ rechargeType: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[160px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                {RECHARGE_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Billing Type */}
        {isSupported('billingType') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Billing Type</Label>
            <Select
              value={filters.billingType ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ billingType: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[150px]">
                <SelectValue placeholder="All Billing Types" />
              </SelectTrigger>
              <SelectContent>
                {BILLING_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Payment Status */}
        {isSupported('paymentStatus') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Status</Label>
            <Select
              value={filters.paymentStatus ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ paymentStatus: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[160px]">
                <SelectValue placeholder="All Payment Statuses" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUSES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Gateway */}
        {isSupported('gateway') && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gateway</Label>
            <Select
              value={filters.gateway ?? ALL_SENTINEL}
              onValueChange={(v) => handleUpdate({ gateway: v === ALL_SENTINEL ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm w-[140px]">
                <SelectValue placeholder="All Gateways" />
              </SelectTrigger>
              <SelectContent>
                {GATEWAYS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Network (Text Input) */}
        {isSupported('network') && (
          <div className="flex flex-col gap-1.5 w-[150px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Network</Label>
            <Input
              placeholder="e.g. Vodafone"
              value={filters.network ?? ''}
              onChange={(e) => handleUpdate({ network: e.target.value || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Operator (Text Input) */}
        {isSupported('operator') && (
          <div className="flex flex-col gap-1.5 w-[150px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Operator</Label>
            <Input
              placeholder="e.g. Orange"
              value={filters.operator ?? ''}
              onChange={(e) => handleUpdate({ operator: e.target.value || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Customer (Text Input) */}
        {isSupported('customer') && (
          <div className="flex flex-col gap-1.5 w-[160px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</Label>
            <Input
              placeholder="Email or Phone"
              value={filters.customer ?? ''}
              onChange={(e) => handleUpdate({ customer: e.target.value || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Admin User (Text Input) */}
        {isSupported('adminUser') && (
          <div className="flex flex-col gap-1.5 w-[160px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin User</Label>
            <Input
              placeholder="Admin Email"
              value={filters.adminUser ?? ''}
              onChange={(e) => handleUpdate({ adminUser: e.target.value || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Amount Range (Numeric Min/Max Inputs) */}
        {isSupported('minAmount') && (
          <div className="flex flex-col gap-1.5 w-[110px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Min Amount</Label>
            <Input
              type="number"
              placeholder="Min (€)"
              value={filters.minAmount ?? ''}
              onChange={(e) => handleUpdate({ minAmount: e.target.value ? Number(e.target.value) : undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {isSupported('maxAmount') && (
          <div className="flex flex-col gap-1.5 w-[110px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Max Amount</Label>
            <Input
              type="number"
              placeholder="Max (€)"
              value={filters.maxAmount ?? ''}
              onChange={(e) => handleUpdate({ maxAmount: e.target.value ? Number(e.target.value) : undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Search Field */}
        {isSupported('search') && (
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px] max-w-[320px]">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder={
                  definition.id === 'transactions'
                    ? 'Txn ID, phone, provider, operator…'
                    : definition.id === 'customer'
                      ? 'Email, name, phone, role…'
                      : definition.id === 'provider'
                        ? 'Provider name or code…'
                        : definition.id === 'destination_network'
                          ? 'Operator, country…'
                          : 'Search report details…'
                }
                value={filters.search ?? ''}
                onChange={(e) => handleUpdate({ search: e.target.value || undefined })}
                className="pl-8 pr-8 h-9 text-sm"
              />
              {filters.search && (
                <button
                  onClick={() => handleUpdate({ search: undefined })}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reset Filters button */}
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={loading}
          className="h-9 gap-2 font-semibold text-xs border-dashed border-muted-foreground/30 hover:border-primary/50 text-muted-foreground hover:text-primary hover:bg-primary/5"
        >
          <RotateCcw className="size-3.5" />
          Reset Filters
        </Button>

      </div>
    </div>
  )
}
