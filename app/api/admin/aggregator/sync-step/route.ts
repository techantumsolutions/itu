import { NextResponse } from 'next/server'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { runPipelineStage } from '@/lib/aggregator/pipeline/stage-executor'

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { step, providerId } = body

    if (!step || !providerId) {
      return NextResponse.json({ error: 'Missing step or providerId' }, { status: 400 })
    }

    const result = await runPipelineStage(step, providerId)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[sync-step] Error executing step:', error)
    return NextResponse.json({ error: error.message || 'Execution failed' }, { status: 500 })
  }
}
