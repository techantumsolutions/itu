import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/auth/require-admin-feature';
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request';
import { ReconciliationOrchestrator } from '@/lib/reconciliation/pipeline/orchestrator';
import { validateReconciliationPeriodRange } from '@/lib/reconciliation/billing-period';
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
    const { supplier, periodStart, periodEnd, billingType, fileName, fileContent } = body;

    // Backward compatible: accept legacy billingPeriod (YYYY-MM) if dates omitted
    let resolvedStart = periodStart as string | undefined;
    let resolvedEnd = periodEnd as string | undefined;
    if ((!resolvedStart || !resolvedEnd) && typeof body.billingPeriod === 'string') {
      const bp = body.billingPeriod.trim();
      if (/^\d{4}-\d{2}$/.test(bp)) {
        const [y, m] = bp.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        resolvedStart = `${bp}-01`;
        resolvedEnd = `${bp}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    if (!supplier || !billingType || !fileName || !fileContent) {
      return NextResponse.json({ error: 'Missing required upload parameters' }, { status: 400 });
    }

    const periodCheck = validateReconciliationPeriodRange({
      periodStart: resolvedStart,
      periodEnd: resolvedEnd,
    });
    if (!periodCheck.ok) {
      return NextResponse.json({ error: periodCheck.error }, { status: 400 });
    }

    const orchestrator = new ReconciliationOrchestrator();
    const result = await orchestrator.run({
      supplier,
      billingPeriod: periodCheck.billingPeriodLabel,
      periodStart: periodCheck.range.periodStart,
      periodEnd: periodCheck.range.periodEnd,
      billingType,
      fileName,
      fileContent,
      uploadedBy: userId,
    });

    await logAdminActivity({
      action: 'Run Reconciliation Billing File',
      pageName: 'Reconciliation',
      details: {
        supplier,
        billingPeriod: periodCheck.billingPeriodLabel,
        periodStart: periodCheck.range.periodStart,
        periodEnd: periodCheck.range.periodEnd,
        billingType,
        fileName,
        reportId: result.reportId,
      },
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
