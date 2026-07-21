import { NormalizedSupplierRow } from '../types';

export interface PlatformLookups {
  providerTxIdMap: Map<string, any>;
  providerRefMap: Map<string, any>;
  distributorRefMap: Map<string, any>;
  rechargeOrderIdMap: Map<string, any>;
  paymentRefMap: Map<string, any>;
  phoneAmountCountryMap: Map<string, any>;
  phoneAmountDateMap: Map<string, any>;
  phoneAmountWindowMap: Map<string, any[]>;
  
  // Relations mapped by transaction_id
  paymentEventMap: Map<string, any[]>;
  refundMap: Map<string, any[]>;
  attemptMap: Map<string, any>;        // by distributor_ref
  transactionMap: Map<string, any>;    // by id
  providerNameMap: Map<string, string>; // name/code/id -> canonical adapter key
}

export class MatchingEngine {
  /**
   * Scans normalized rows for min/max timestamps and queries matching platform database tables.
   */
  async buildLookupMaps(rows: NormalizedSupplierRow[]): Promise<PlatformLookups> {
    const lookups: PlatformLookups = {
      providerTxIdMap: new Map(),
      providerRefMap: new Map(),
      distributorRefMap: new Map(),
      rechargeOrderIdMap: new Map(),
      paymentRefMap: new Map(),
      phoneAmountCountryMap: new Map(),
      phoneAmountDateMap: new Map(),
      phoneAmountWindowMap: new Map(),
      paymentEventMap: new Map(),
      refundMap: new Map(),
      attemptMap: new Map(),
      transactionMap: new Map(),
      providerNameMap: new Map(),
    };

    if (rows.length === 0) return lookups;

    // 1. Calculate safe date range bounds
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const r of rows) {
      const t = new Date(r.transactionDate).getTime();
      if (isNaN(t)) continue;
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }

    if (minTime === Infinity) {
      minTime = Date.now();
      maxTime = Date.now();
    }

    // Add 1-day safety margin on both bounds
    const startDate = new Date(minTime - 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(maxTime + 24 * 60 * 60 * 1000).toISOString();

    // 2. Fetch platform records in bounded pages (never unbounded single-shot)
    const { fetchPostgrestPages } = await import('@/lib/db/postgrest-paginate')
    const dateFilter = `created_at=gte.${encodeURIComponent(startDate)}&created_at=lte.${encodeURIComponent(endDate)}`
    const [transactions, attempts, payments, refunds, providers] = await Promise.all([
      fetchPostgrestPages<any>({
        pathWithQuery: `transactions?${dateFilter}&select=id,user_id,type,amount,currency,status,metadata,created_at,profiles(name,email,phone),recharge_orders(id,product_name,sku_code,plan_id,provider,operator_name,status,phone_number,send_amount,send_currency,receive_amount,receive_currency,provider_ref,metadata,payment_status)`,
        pageSize: 500,
        maxRows: 20_000,
      }),
      fetchPostgrestPages<any>({
        pathWithQuery: `lcr_v2_recharge_attempts?${dateFilter}&select=id,distributor_ref,internal_plan_id,phone_number,send_amount,currency,status,routing_decision,attempts,selected_provider_id,provider_adapter,provider_ref,created_at`,
        pageSize: 500,
        maxRows: 20_000,
      }),
      fetchPostgrestPages<any>({
        pathWithQuery: `payment_events?${dateFilter}&select=id,transaction_id,provider,provider_payment_id,status,amount,currency`,
        pageSize: 500,
        maxRows: 20_000,
      }),
      fetchPostgrestPages<any>({
        pathWithQuery: `refunds?${dateFilter}&select=id,transaction_id,amount,currency,status,provider_ref`,
        pageSize: 500,
        maxRows: 20_000,
      }),
      fetchPostgrestPages<any>({
        pathWithQuery: `lcr_providers?select=id,code,name,adapter_key`,
        pageSize: 200,
        maxRows: 2_000,
      }),
    ]) as [any[], any[], any[], any[], any[]]

    // 3. Build relations lookup tables
    for (const attempt of attempts) {
      if (attempt.distributor_ref) {
        lookups.attemptMap.set(attempt.distributor_ref, attempt);
      }
    }

    for (const payment of payments) {
      if (payment.transaction_id) {
        const list = lookups.paymentEventMap.get(payment.transaction_id) || [];
        list.push(payment);
        lookups.paymentEventMap.set(payment.transaction_id, list);
        
        if (payment.provider_payment_id) {
          lookups.paymentRefMap.set(payment.provider_payment_id, payment);
        }
      }
    }

    for (const refund of refunds) {
      if (refund.transaction_id) {
        const list = lookups.refundMap.get(refund.transaction_id) || [];
        list.push(refund);
        lookups.refundMap.set(refund.transaction_id, list);
      }
    }

    for (const p of providers) {
      if (p.adapter_key) {
        const canonical = p.adapter_key.toLowerCase();
        if (p.id) {
          lookups.providerNameMap.set(p.id.toLowerCase(), canonical);
          lookups.providerNameMap.set(p.id, canonical);
        }
        if (p.code) {
          lookups.providerNameMap.set(p.code.toLowerCase(), canonical);
          lookups.providerNameMap.set(p.code, canonical);
        }
        if (p.name) {
          lookups.providerNameMap.set(p.name.toLowerCase(), canonical);
          lookups.providerNameMap.set(p.name, canonical);
        }
        lookups.providerNameMap.set(canonical, canonical);
      }
    }

    // 4. Index transaction records to build O(1) matching maps
    for (const tx of transactions) {
      lookups.transactionMap.set(tx.id, tx);
      const ro = tx.recharge_orders?.[0] ?? null;

      // Match Priority 1: Provider Transaction ID (provider_ref in recharge_orders or attempts)
      if (ro && ro.provider_ref) {
        lookups.providerTxIdMap.set(ro.provider_ref, tx);
      }

      // Match Priority 2: Provider Reference (attempts)
      const distRefs = [ro?.id, tx.id, tx.metadata?.distributor_ref, tx.external_ref].filter(Boolean) as string[];
      let attempt = null;
      for (const ref of distRefs) {
        attempt = lookups.attemptMap.get(ref);
        if (attempt) break;
      }
      if (attempt && attempt.provider_ref) {
        lookups.providerRefMap.set(attempt.provider_ref, tx);
      }

      // Match Priority 3: External Reference / distributor_ref
      for (const ref of distRefs) {
        lookups.distributorRefMap.set(ref, tx);
      }

      // Match Priority 4: Recharge Order ID
      if (ro && ro.id) {
        lookups.rechargeOrderIdMap.set(ro.id, tx);
      }

      if (ro) {
        const normPhone = (ro.phone_number || '').replace(/\D/g, '');
        const amountStr = Number(ro.send_amount || tx.amount).toFixed(2);
        
        // Match Priority 6: Mobile + Amount + Country
        const countryKey = `${normPhone}_${amountStr}_${(ro.metadata?.country_iso || 'XX').toUpperCase()}`;
        lookups.phoneAmountCountryMap.set(countryKey, tx);

        // Match Priority 7: Mobile + Amount + Date (YYYY-MM-DD)
        const txDate = tx.created_at.slice(0, 10);
        const dateKey = `${normPhone}_${amountStr}_${txDate}`;
        lookups.phoneAmountDateMap.set(dateKey, tx);

        // Match Priority 8: Mobile + Amount (For window calculations)
        const winKey = `${normPhone}_${amountStr}`;
        const winList = lookups.phoneAmountWindowMap.get(winKey) || [];
        winList.push(tx);
        lookups.phoneAmountWindowMap.set(winKey, winList);
      }
    }

    return lookups;
  }
}
