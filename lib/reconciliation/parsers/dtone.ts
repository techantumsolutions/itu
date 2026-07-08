// DTOne Billing File Parser
import { ISupplierParser } from './base';
import { NormalizedSupplierRow } from '../types';
import { RECONCILIATION_CONFIG } from '../config';
import { parseCsv, resolveColumnIndex } from './csv-helper';

export class DTOneParser implements ISupplierParser {
  parse(content: string, filename?: string): NormalizedSupplierRow[] {
    const lines = parseCsv(content);
    if (lines.length < 2) return [];

    const headers = lines[0];
    const dataRows = lines.slice(1);

    const idxTxId = resolveColumnIndex(headers, ['transactionid', 'dtoneid', 'txid', 'transaction_id', 'id']);
    const idxProvRef = resolveColumnIndex(headers, ['providerreference', 'providerref', 'reference', 'ref', 'operatorreference']);
    const idxExtRef = resolveColumnIndex(headers, ['externalid', 'externalreference', 'distributorreference', 'distributorref', 'external_ref', 'distributor_ref', 'clientreference', 'partner_ref']);
    const idxMobile = resolveColumnIndex(headers, ['mobile', 'phonenumber', 'phone', 'msisdn', 'number', 'recipient']);
    const idxOperator = resolveColumnIndex(headers, ['operator', 'carrier', 'network']);
    const idxCountry = resolveColumnIndex(headers, ['country', 'countrycode', 'country_code', 'destination_country']);
    const idxCustAmt = resolveColumnIndex(headers, ['facevalue', 'face_value', 'customeramount', 'retailprice', 'value', 'amount']);
    const idxCost = resolveColumnIndex(headers, ['wholesaleamount', 'wholesale_amount', 'wholesale', 'wholesaleprice', 'suppliercost', 'cost', 'price']);
    const idxCurrency = resolveColumnIndex(headers, ['settlementcurrency', 'settlement_currency', 'settlementcur', 'billedcurrency', 'currency', 'currencycode']);
    const idxDate = resolveColumnIndex(headers, ['rechargedate', 'transactiondate', 'timestamp', 'createdat', 'time', 'datetime', 'date']);
    const idxStatus = resolveColumnIndex(headers, ['status', 'state', 'result']);

    const config = RECONCILIATION_CONFIG.suppliers.dtone;
    const rows: NormalizedSupplierRow[] = [];

    for (let r = 0; r < dataRows.length; r++) {
      const cells = dataRows[r];
      if (cells.length < Math.max(idxTxId, idxMobile, idxCost) + 1) continue;

      const rawTxId = idxTxId !== -1 ? cells[idxTxId] : '';
      const rawProvRef = idxProvRef !== -1 ? cells[idxProvRef] : null;
      const rawExtRef = idxExtRef !== -1 ? cells[idxExtRef] : null;
      const rawMobile = idxMobile !== -1 ? cells[idxMobile] : '';
      const rawOperator = idxOperator !== -1 ? cells[idxOperator] : 'Unknown';
      const rawCountry = idxCountry !== -1 ? cells[idxCountry] : 'XX';
      const rawCustAmt = idxCustAmt !== -1 ? parseFloat(cells[idxCustAmt]) : 0;
      const rawCost = idxCost !== -1 ? parseFloat(cells[idxCost]) : 0;
      
      // Determine billing currency (avoiding Face Currency if Wholesale/Settlement currency can be resolved)
      let resolvedCurrency = 'EUR'; // Default to EUR for DTOne if not resolvable
      let finalIdxCurrency = idxCurrency;
      if (finalIdxCurrency !== -1 && headers[finalIdxCurrency].toLowerCase().includes('face')) {
        const otherCurrencyIdx = headers.findIndex((h, i) => i !== finalIdxCurrency && h.toLowerCase().includes('currency') && !h.toLowerCase().includes('face'));
        if (otherCurrencyIdx !== -1) {
          finalIdxCurrency = otherCurrencyIdx;
        } else {
          finalIdxCurrency = -1;
        }
      }
      
      if (finalIdxCurrency !== -1) {
        resolvedCurrency = cells[finalIdxCurrency];
      } else {
        const costHeader = idxCost !== -1 ? headers[idxCost].toUpperCase() : '';
        if (costHeader.includes('EUR')) resolvedCurrency = 'EUR';
        else if (costHeader.includes('USD')) resolvedCurrency = 'USD';
        else if (costHeader.includes('GBP')) resolvedCurrency = 'GBP';
      }

      const rawCurrency = resolvedCurrency;
      const rawDate = idxDate !== -1 ? cells[idxDate] : new Date().toISOString();
      const rawStatus = idxStatus !== -1 ? cells[idxStatus] : '';

      // Normalize mobile to digits only
      const normalizedMobile = rawMobile.replace(/\D/g, '');

      // Standardize status via mapping
      const standardStatus = config.statusMapping[rawStatus] || 
        config.statusMapping[rawStatus.toUpperCase()] || 
        'completed';

      // Build raw row metadata map
      const rawObj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        rawObj[h] = cells[i] ?? null;
      });

      rows.push({
        supplier: 'dtone',
        supplierTransactionId: rawTxId,
        providerReference: rawProvRef || null,
        externalReference: rawExtRef || null,
        mobile: normalizedMobile,
        operator: rawOperator,
        country: rawCountry,
        customerAmount: isNaN(rawCustAmt) ? 0 : rawCustAmt,
        supplierCost: isNaN(rawCost) ? 0 : rawCost,
        currency: rawCurrency.toUpperCase(),
        transactionDate: rawDate,
        status: standardStatus,
        raw: rawObj,
      });
    }

    return rows;
  }
}
