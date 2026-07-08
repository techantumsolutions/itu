import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/auth/require-admin-feature';
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request';
import { ReconciliationOrchestrator } from '@/lib/reconciliation/pipeline/orchestrator';
import { logAdminActivity } from '@/lib/auth/audit';

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'reconciliation.edit');
  if (denied) return denied;

  const adminCtx = await getAdminFromAccessCookie(request);
  const userId = adminCtx?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized profile session' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { supplier, billingPeriod, billingType, fileName, fileContent } = body;

    if (!supplier || !billingPeriod || !billingType || !fileName || !fileContent) {
      return NextResponse.json({ error: 'Missing required upload parameters' }, { status: 400 });
    }

    const orchestrator = new ReconciliationOrchestrator();
    const result = await orchestrator.run({
      supplier,
      billingPeriod,
      billingType,
      fileName,
      fileContent,
      uploadedBy: userId,
    });

    await logAdminActivity({
      action: 'Run Reconciliation Billing File',
      pageName: 'Reconciliation',
      details: { supplier, billingPeriod, billingType, fileName, reportId: result.reportId },
    });

    return NextResponse.json({
      success: true,
      reportId: result.reportId,
      metrics: result.metrics,
    });
  } catch (error) {
    console.error('Failed to run reconciliation upload:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process file' },
      { status: 500 }
    );
  }
}
