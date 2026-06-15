import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { getLcrEngineSettings, isRoutingEngineSchemaReady, upsertLcrEngineSettings } from '@/lib/routing/repository'
import type { FallbackStrategy, RoutingStrategy } from '@/lib/routing/types'
import { logAdminActivity } from '@/lib/auth/audit'

const DEFAULTS = {
  enabled: true,
  routingStrategy: 'LEAST_COST' as RoutingStrategy,
  fallbackStrategy: 'NEXT_PROVIDER' as FallbackStrategy,
  autoFailover: true,
  retryEnabled: true,
  retryAttempts: 2,
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const schemaReady = await isRoutingEngineSchemaReady()
  if (!schemaReady) {
    return NextResponse.json({ schemaReady: false, settings: DEFAULTS })
  }

  const settings = await getLcrEngineSettings()
  return NextResponse.json({
    schemaReady: true,
    settings: settings ?? DEFAULTS,
  })
}

export async function PUT(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const updated = await upsertLcrEngineSettings({
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
    routingStrategy: body.routingStrategy,
    fallbackStrategy: body.fallbackStrategy,
    autoFailover: body.autoFailover !== undefined ? Boolean(body.autoFailover) : undefined,
    retryEnabled: body.retryEnabled !== undefined ? Boolean(body.retryEnabled) : undefined,
    retryAttempts:
      typeof body.retryAttempts === 'number' ? Math.min(10, Math.max(0, body.retryAttempts)) : undefined,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Failed to save settings. Run routing_engine_schema.sql first.' }, { status: 503 })
  }

  await logAdminActivity({
    action: 'Update LCR Settings',
    pageName: 'Routing',
    details: {
      enabled: body.enabled,
      routingStrategy: body.routingStrategy,
      fallbackStrategy: body.fallbackStrategy,
      autoFailover: body.autoFailover,
      retryEnabled: body.retryEnabled,
      retryAttempts: body.retryAttempts,
    },
  })

  return NextResponse.json({ schemaReady: true, settings: updated })
}
