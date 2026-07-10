import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/auth/require-admin-feature';
import { supabaseRest } from '@/lib/db/supabase-rest';
import { logAdminActivity } from '@/lib/auth/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminPermission(request, 'reconciliation.view');
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing report ID' }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '50', 10)));
  const status = url.searchParams.get('status') || 'all'; // 'all' | 'CLEAR' | 'PENDING' | 'UNCLEAR'
  const search = url.searchParams.get('search') || '';

  try {
    // 1. Fetch Report Header
    const headerRes = await supabaseRest(`reconciliation_reports?id=eq.${id}&limit=1`, { cache: 'no-store' });
    if (headerRes.ok) {
      await logAdminActivity({
        action: 'View Reconciliation Report',
        pageName: 'Reconciliation',
        details: { id },
      });
    }
    if (!headerRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch report header' }, { status: 500 });
    }
    const headers = await headerRes.json();
    const report = headers?.[0] ?? null;

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // 2. Query Paginated Items matching filters
    let itemsQuery = `reconciliation_items?report_id=eq.${id}`;
    if (status && status !== 'all') {
      itemsQuery += `&reconciliation_status=eq.${encodeURIComponent(status)}`;
    }
    if (search) {
      itemsQuery += `&or=(supplier_tx_id.ilike.%25${encodeURIComponent(search)}%25,supplier_ref.ilike.%25${encodeURIComponent(search)}%25,mobile.ilike.%25${encodeURIComponent(search)}%25)`;
    }

    const itemsRes = await supabaseRest(
      `${itemsQuery}&select=*&order=created_at.desc&limit=${pageSize}&offset=${(page - 1) * pageSize}`,
      {
        cache: 'no-store',
        headers: {
          Prefer: 'count=exact',
        },
      }
    );

    if (!itemsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch report items' }, { status: 500 });
    }

    const items = await itemsRes.json();
    const rangeHeader = itemsRes.headers.get('Content-Range') || '';
    const total = parseInt(rangeHeader.split('/')?.[1] || String(items.length), 10);

    return NextResponse.json({
      report,
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Failed to get report detail:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * PATCH handles updating the report status or settlement status.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminPermission(request, 'reconciliation.edit');
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing report ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status, settlement_status, notes } = body;

    const payload: Record<string, any> = {};
    if (status !== undefined) payload.status = status;
    if (settlement_status !== undefined) payload.settlement_status = settlement_status;
    if (notes !== undefined) payload.notes = notes;

    const res = await supabaseRest(`reconciliation_reports?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=representation',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
    }

    await logAdminActivity({
      action: 'Update Reconciliation Report',
      pageName: 'Reconciliation',
      details: { id, status, settlement_status },
    });

    const updated = await res.json();
    return NextResponse.json({ success: true, report: updated?.[0] });
  } catch (error) {
    console.error('Failed to patch report:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
