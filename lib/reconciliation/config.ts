// Configuration and tolerance layer for the Reconciliation Module
import { ReconciliationItemStatus } from './types';

export interface SupplierConfig {
  supplierCode: string;
  name: string;
  supportedFileTypes: string[];
  // Mapping from supplier status strings to unified status: 'completed' | 'failed' | 'processing'
  statusMapping: Record<string, 'completed' | 'failed' | 'processing'>;
  currencyRules: {
    defaultPrecision: number;
    overrides: Record<string, number>;
  };
  matchingOverrides?: {
    timeWindowMinutes?: number;
    costTolerance?: number;
  };
}

export const RECONCILIATION_CONFIG = {
  globalTolerances: {
    amountDeltaLimit: 0.01,       // Allowed difference in amount (in currency units)
    timeWindowMinutes: 180,      // 3-hour match window for timestamp offsets (180 minutes)
    costToleranceLimit: 0.01,    // Provider cost mismatch threshold
  },
  
  confidenceScores: {
    PROVIDER_TX_ID: 100,
    PROVIDER_REF: 98,
    RECHARGE_ORDER_ID: 95,
    PAYMENT_REF: 92,
    MOBILE_AMOUNT_COUNTRY: 85,
    MOBILE_AMOUNT_DATE: 70,
    MOBILE_AMOUNT_WINDOW: 55,
  } as Record<string, number>,

  matchingPriorities: [
    'PROVIDER_TX_ID',
    'PROVIDER_REF',
    'EXTERNAL_REF',
    'RECHARGE_ORDER_ID',
    'PAYMENT_REF',
    'MOBILE_AMOUNT_COUNTRY',
    'MOBILE_AMOUNT_DATE',
    'MOBILE_AMOUNT_WINDOW'
  ] as const,

  suppliers: {
    dtone: {
      supplierCode: 'dtone',
      name: 'DTOne',
      supportedFileTypes: ['.csv', '.xlsx'],
      statusMapping: {
        'CONFIRMED': 'completed',
        'COMPLETED': 'completed',
        'SUCCESS': 'completed',
        'CANCELLED': 'failed',
        'FAILED': 'failed',
        'PENDING': 'processing',
        'PROCESSING': 'processing',
      },
      currencyRules: {
        defaultPrecision: 2,
        overrides: { JPY: 0, KRW: 0 },
      }
    },
    ding: {
      supplierCode: 'ding',
      name: 'Ding Connect',
      supportedFileTypes: ['.csv', '.xlsx'],
      statusMapping: {
        'Success': 'completed',
        'Completed': 'completed',
        'Failed': 'failed',
        'Error': 'failed',
        'Processing': 'processing',
        'Pending': 'processing',
      },
      currencyRules: {
        defaultPrecision: 2,
        overrides: { JPY: 0, KRW: 0 },
      }
    },
    valuetopup: {
      supplierCode: 'valuetopup',
      name: 'ValueTopup',
      supportedFileTypes: ['.csv', '.xlsx'],
      statusMapping: {
        '0': 'completed', // e.g. code 0 = Success
        'success': 'completed',
        'completed': 'completed',
        'failure': 'failed',
        'failed': 'failed',
        'pending': 'processing',
      },
      currencyRules: {
        defaultPrecision: 2,
        overrides: { JPY: 0, KRW: 0 },
      }
    }
  } as Record<string, SupplierConfig>
};

/** Helper to get precision for a given currency code. */
export function getCurrencyPrecision(currency: string, supplierCode: string): number {
  const norm = currency.toUpperCase();
  const config = RECONCILIATION_CONFIG.suppliers[supplierCode];
  if (!config) return 2;
  if (norm in config.currencyRules.overrides) {
    return config.currencyRules.overrides[norm];
  }
  return config.currencyRules.defaultPrecision;
}
