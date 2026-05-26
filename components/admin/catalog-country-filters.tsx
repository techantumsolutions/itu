'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CatalogCountryOption = { iso3: string; planCount?: number }

type CatalogCountryFiltersProps = {
  country: string
  onCountryChange: (value: string) => void
  operatorRef?: string
  onOperatorRefChange?: (value: string) => void
  countries?: CatalogCountryOption[]
  showOperator?: boolean
  idPrefix?: string
}

export function CatalogCountryFilters({
  country,
  onCountryChange,
  operatorRef = '',
  onOperatorRefChange,
  countries = [],
  showOperator = false,
  idPrefix = 'catalog',
}: CatalogCountryFiltersProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="grid min-w-0 w-full gap-2 sm:max-w-sm sm:flex-1">
        <Label htmlFor={`${idPrefix}-country`}>Country (ISO3 or ISO2)</Label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            id={`${idPrefix}-country`}
            placeholder="e.g. IND or IN"
            value={country}
            onChange={(e) => onCountryChange(e.target.value.toUpperCase())}
            className="min-w-0 flex-1 font-mono uppercase"
          />
          {countries.length > 0 ? (
            <Select
              value={country || '__all__'}
              onValueChange={(v) => onCountryChange(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-full shrink-0 sm:w-[130px]">
                <SelectValue placeholder="Pick" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.iso3} value={c.iso3}>
                    {c.iso3}
                    {c.planCount != null ? ` (${c.planCount})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">India is ISO3 <code className="text-xs">IND</code> (not IN).</p>
      </div>

      {showOperator && onOperatorRefChange ? (
        <div className="grid min-w-0 w-full gap-2 sm:max-w-sm sm:flex-1">
          <Label htmlFor={`${idPrefix}-operator`}>Operator ref</Label>
          <Input
            id={`${idPrefix}-operator`}
            placeholder="e.g. dtone:123"
            value={operatorRef}
            onChange={(e) => onOperatorRefChange(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
      ) : null}
    </div>
  )
}
