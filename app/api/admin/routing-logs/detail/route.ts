import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'
import {
  buildRoutingAuditDetailFromLogs,
  listRoutingLogsForTransaction,
} from '@/lib/routing/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const transactionId = url.searchParams.get('transactionId')

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
  }

  try {
    const attempt = await dbFindRechargeByDistributorRef(transactionId).catch(() => null)
    if (attempt) {
      return NextResponse.json({ attempt })
    }

    const logs = await listRoutingLogsForTransaction(transactionId)
    const audit = buildRoutingAuditDetailFromLogs(logs)
    if (!audit) {
      return NextResponse.json({ error: 'Routing details not found' }, { status: 404 })
    }

    return NextResponse.json({ attempt: audit })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
