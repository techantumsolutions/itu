import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/auth/require-admin-feature';
import { supabaseRest } from '@/lib/db/supabase-rest';
import { logAdminActivity } from '@/lib/auth/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'reconciliation.view');
  if (denied) return denied;

  try {
    // 1. Fetch reconciliation reports list
    const reportsRes = await supabaseRest(
      'reconciliation_reports?select=id,provider,period_start,period_end,status,totals,uploaded_by,file_name,billing_period,billing_type,run_version,settlement_status,created_at,updated_at&order=created_at.desc',
      { cache: 'no-store' }
    );
    if (!reportsRes.ok) {
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }
    const reports = await reportsRes.json();

    // 2. Fetch recharges list joined with transactions metadata
    const rechargesRes = await supabaseRest(
      'recharge_orders?select=id,transaction_id,provider,provider_ref,status,phone_number,send_amount,send_currency,receive_amount,receive_currency,metadata,created_at,transactions(amount,currency,status)&order=created_at.desc&limit=100',
      { cache: 'no-store' }
    );
    let recharges = [];
    if (rechargesRes.ok) {
      const dbRecharges = await rechargesRes.json();

      // Fetch reconciliation items to cross-reference billed amounts and recon status
      const itemsRes = await supabaseRest(
        'reconciliation_items?select=id,transaction_id,amount,currency,reconciliation_status,status,supplier_tx_id,supplier_ref,mobile,provider_cost,difference_amount,refund_amount,reconciliation_details,recommendations,notes,refund_status,confidence_score,matched_by,created_at',
        { cache: 'no-store' }
      );
      const items = itemsRes.ok ? await itemsRes.json() : [];
      const itemMap = new Map();
      for (const item of items) {
        if (item.transaction_id && !itemMap.has(item.transaction_id)) {
          itemMap.set(item.transaction_id, item);
        }
      }

      recharges = dbRecharges.map((ro: any) => {
        const matchedItem = ro.transaction_id ? itemMap.get(ro.transaction_id) : null;
        const tx = Array.isArray(ro.transactions) ? ro.transactions[0] : ro.transactions;
        
        // Final clearance rule: matched & successful means CLEAR; otherwise UNCLEAR (or if no bill, UNCLEAR/pending upload)
        const isClear = matchedItem && matchedItem.reconciliation_status === 'CLEAR';

        const metaCost = ro.metadata && typeof ro.metadata === 'object' ? (ro.metadata as any).provider_cost : null;
        const metaCurrency = ro.metadata && typeof ro.metadata === 'object' ? (ro.metadata as any).provider_cost_currency : null;
        
        const providerCost = ro.receive_amount !== null && ro.receive_amount !== undefined ? ro.receive_amount : (metaCost !== null ? parseFloat(metaCost) : null);
        const providerCurrency = ro.receive_currency || metaCurrency || 'EUR';

        return {
          id: ro.id,
          transaction_id: ro.transaction_id,
          provider: ro.provider || 'N/A',
          created_at: ro.created_at,
          recharge_status: ro.status,
          payment_status: tx ? tx.status : 'pending',
          destination_phone: ro.phone_number,
          user_amount: tx ? tx.amount : 0,
          user_currency: tx ? tx.currency : 'USD',
          provider_cost: providerCost,
          provider_currency: providerCurrency,
          billed_amount: matchedItem ? matchedItem.amount : null,
          billed_currency: matchedItem ? matchedItem.currency : null,
          recon_status: isClear ? 'CLEAR' : 'UNCLEAR',
          status_code: matchedItem ? matchedItem.status : 'MISSING_BILL',
          recon_item: matchedItem || null,
        };
      });
    }

    await logAdminActivity({
      action: 'View Reconciliation Dashboard',
      pageName: 'Reconciliation',
    });

    return NextResponse.json({ reports, recharges });
  } catch (error) {
    console.error('Failed to load reconciliation dashboard data:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
