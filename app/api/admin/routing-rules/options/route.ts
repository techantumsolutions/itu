import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import {
  fetchRoutingCountries,
  fetchRoutingOperators,
  fetchRoutingProductTypes,
  fetchRoutingProviders,
} from '@/lib/routing/cascade-options'
import { ROUTING_RULE_NAME_OPTIONS } from '@/lib/routing/rule-form-options'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const country = (searchParams.get('country') ?? '').trim().toUpperCase()
  const operatorId = (searchParams.get('operatorId') ?? '').trim()
  const productType = (searchParams.get('productType') ?? '').trim().toLowerCase()

  if (country && operatorId && productType) {
    const providers = await fetchRoutingProviders(country, operatorId, productType)
    return NextResponse.json({ providers })
  }

  if (country && operatorId) {
    const [productTypes, providers] = await Promise.all([
      fetchRoutingProductTypes(country, operatorId),
      fetchRoutingProviders(country, operatorId),
    ])
    return NextResponse.json({ productTypes, providers })
  }

  if (country) {
    const operators = await fetchRoutingOperators(country)
    return NextResponse.json({ operators })
  }

  const countries = await fetchRoutingCountries()
  return NextResponse.json({
    ruleNames: ROUTING_RULE_NAME_OPTIONS,
    countries,
  })
}
