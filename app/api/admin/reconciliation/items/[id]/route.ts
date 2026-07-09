import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/auth/require-admin-feature';
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request';
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
    return NextResponse.json({ error: 'Missing item ID' }, { status: 400 });
  }

  try {
    const res = await supabaseRest(`reconciliation_items?id=eq.${id}&limit=1`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch reconciliation item' }, { status: 500 });
    }
    const items = await res.json();
    const item = items?.[0] ?? null;

    if (!item) {
      return NextResponse.json({ error: 'Reconciliation item not found' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Failed to get item detail:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminPermission(request, 'reconciliation.edit');
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing item ID' }, { status: 400 });
  }

  const adminCtx = await getAdminFromAccessCookie(request);
  const adminName = adminCtx?.user?.name || 'Admin';

  try {
    const body = await request.json();
    const { reconciliation_status, status, notes, refund_status, recommendations } = body;

    const payload: Record<string, any> = {};
    if (reconciliation_status !== undefined) payload.reconciliation_status = reconciliation_status;
    if (status !== undefined) payload.status = status;
    if (notes !== undefined) payload.notes = notes;
    if (refund_status !== undefined) payload.refund_status = refund_status;
    if (recommendations !== undefined) payload.recommendations = recommendations;
    
    payload.updated_at = new Date().toISOString();

    const res = await supabaseRest(`reconciliation_items?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=representation',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update reconciliation item' }, { status: 500 });
    }

    const updated = await res.json();
    const updatedItem = updated?.[0] ?? null;

    await logAdminActivity({
      action: 'Override Reconciliation Item',
      pageName: 'Reconciliation',
      details: { id, status: status || reconciliation_status, adminName },
    });

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('Failed to patch reconciliation item:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
