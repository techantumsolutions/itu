import { UploadService } from './pipeline/01-upload-service';
import { ValidationEngine } from './pipeline/03-validation-engine';
import { MatchingEngine } from './pipeline/04-matching-engine';
import { VerificationEngine } from './pipeline/05-verification-engine';
import { FinancialEngine } from './pipeline/06-financial-engine';
import { ClassificationEngine } from './pipeline/07-classification-engine';
import { RecommendationEngine } from './pipeline/08-recommendation-engine';
import { ReconciliationOrchestrator } from './pipeline/orchestrator';
import { supabaseRest } from '../db/supabase-rest';

// Mock Supabase client
jest.mock('../db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
  isSupabaseCatalogConfigured: () => true,
}));

describe('Upload Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should compute identical hash for identical files', () => {
    const hash1 = UploadService.computeHash('file content');
    const hash2 = UploadService.computeHash('file content');
    expect(hash1).toBe(hash2);
  });

  it('should detect duplicate uploads via database hashes', async () => {
    (supabaseRest as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'existing-report-id' }],
    });

    const service = new UploadService();
    await expect(
      service.processUpload({
        supplier: 'dtone',
        billingPeriod: '2026-07',
        billingType: 'Original',
        fileName: 'test.csv',
        fileContent: 'file content',
      })
    ).rejects.toThrow('Duplicate file detected.');
  });
});

describe('Validation Engine', () => {
  it('should detect duplicate transaction rows inside the file', () => {
    const engine = new ValidationEngine();
    const rows = [
      {
        supplier: 'dtone',
        supplierTransactionId: 'dup-1',
        providerReference: 'ref-1',
        externalReference: 'ext-1',
        mobile: '1234567890',
        operator: 'Operator A',
        country: 'US',
        customerAmount: 10,
        supplierCost: 8,
        currency: 'USD',
        transactionDate: '2026-07-08T10:00:00Z',
        status: 'completed',
        raw: {},
      },
      {
        supplier: 'dtone',
        supplierTransactionId: 'dup-1', // duplicate
        providerReference: 'ref-2',
        externalReference: 'ext-2',
        mobile: '1234567890',
        operator: 'Operator A',
        country: 'US',
        customerAmount: 10,
        supplierCost: 8,
        currency: 'USD',
        transactionDate: '2026-07-08T10:01:00Z',
        status: 'completed',
        raw: {},
      },
    ];

    const { errors } = engine.validate(rows);
    expect(errors.duplicate_rows).toHaveLength(2);
    expect(errors.duplicate_rows[0]).toContain('Duplicate Transaction ID "dup-1"');
  });

  it('should categorize invalid currencies and mobiles', () => {
    const engine = new ValidationEngine();
    const rows = [
      {
        supplier: 'dtone',
        supplierTransactionId: 'tx-1',
        providerReference: 'ref-1',
        externalReference: 'ext-1',
        mobile: '12', // too short
        operator: 'Operator A',
        country: 'US',
        customerAmount: 10,
        supplierCost: 8,
        currency: 'US Dollars', // invalid format
        transactionDate: '2026-07-08T10:00:00Z',
        status: 'completed',
        raw: {},
      },
    ];

    const { errors } = engine.validate(rows);
    expect(errors.invalid_mobiles).toHaveLength(1);
    expect(errors.invalid_currencies).toHaveLength(1);
  });
});

describe('Matching Engine', () => {
  it('should compile lookup maps from DB query outputs', async () => {
    (supabaseRest as jest.Mock).mockImplementation((path: string) => {
      if (path.startsWith('transactions')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 'tx-uuid-1',
              amount: '10.00',
              currency: 'USD',
              created_at: '2026-07-08T10:11:00Z',
              recharge_orders: [
                {
                  id: 'ro-uuid-1',
                  provider_ref: 'provider-ref-123',
                  send_amount: '8.00',
                  send_currency: 'USD',
                  phone_number: '1234567890',
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const engine = new MatchingEngine();
    const maps = await engine.buildLookupMaps([
      {
        supplier: 'dtone',
        supplierTransactionId: 'tx-1',
        providerReference: 'provider-ref-123',
        externalReference: 'ext-1',
        mobile: '1234567890',
        operator: 'Operator A',
        country: 'US',
        customerAmount: 10,
        supplierCost: 8.0,
        currency: 'USD',
        transactionDate: '2026-07-08T10:11:00Z',
        status: 'completed',
        raw: {},
      },
    ]);

    expect(maps.providerTxIdMap.has('provider-ref-123')).toBe(true);
    const matchedTx = maps.providerTxIdMap.get('provider-ref-123');
    expect(matchedTx.id).toBe('tx-uuid-1');
  });
});

describe('Verification & Financial & Classification Pipeline Stages', () => {
  const mockTx = {
    id: 'tx-uuid-1',
    amount: '10.00',
    currency: 'USD',
    created_at: '2026-07-08T10:11:00Z',
    recharge_orders: [
      {
        id: 'ro-uuid-1',
        provider: 'dtone',
        provider_ref: 'provider-ref-123',
        send_amount: '8.00',
        send_currency: 'USD',
        phone_number: '1234567890',
        status: 'completed',
        updated_at: '2026-07-08T10:12:00Z',
      },
    ],
  };

  let mockLookups: any;

  beforeEach(() => {
    mockLookups = {
      providerTxIdMap: new Map([['provider-ref-123', mockTx]]),
      providerRefMap: new Map(),
      distributorRefMap: new Map(),
      rechargeOrderIdMap: new Map(),
      paymentRefMap: new Map(),
      phoneAmountCountryMap: new Map(),
      phoneAmountDateMap: new Map(),
      phoneAmountWindowMap: new Map(),
      paymentEventMap: new Map([['tx-uuid-1', [{ status: 'completed', provider: 'stripe' }]]]),
      refundMap: new Map(),
      attemptMap: new Map(),
      transactionMap: new Map([['tx-uuid-1', mockTx]]),
    };
  });

  it('should run clear verification on exact matching rows', () => {
    const row = {
      supplier: 'dtone',
      supplierTransactionId: 'tx-1',
      providerReference: 'provider-ref-123',
      externalReference: 'ro-uuid-1',
      mobile: '1234567890',
      operator: 'Operator A',
      country: 'US',
      customerAmount: 10,
      supplierCost: 8.0, // expected wholesale matches send_amount
      currency: 'USD',
      transactionDate: '2026-07-08T10:11:00Z',
      status: 'completed',
      raw: {},
    };

    const verifier = new VerificationEngine();
    const result = verifier.verifyRow(row, mockLookups);
    expect(result.status).toBe('MATCHED');
    expect(result.confidenceScore).toBe(100);

    const finance = new FinancialEngine();
    finance.calculateItemFinance(result);
    expect(result.details.financial.supplier_cost_difference).toBe(0);

    const classifier = new ClassificationEngine();
    const state = classifier.classifyItem(result);
    expect(state).toBe('CLEAR');

    const recommender = new RecommendationEngine();
    recommender.generateRecommendation(result);
    expect(result.details.recommendations[0].action).toBe('none');
  });

  it('should flag cost mismatches and return UNCLEAR with cost discrepancies', () => {
    const row = {
      supplier: 'dtone',
      supplierTransactionId: 'tx-1',
      providerReference: 'provider-ref-123',
      externalReference: 'ro-uuid-1',
      mobile: '1234567890',
      operator: 'Operator A',
      country: 'US',
      customerAmount: 10,
      supplierCost: 9.5, // billed is $9.50 but platform expected $8.00
      currency: 'USD',
      transactionDate: '2026-07-08T10:11:00Z',
      status: 'completed',
      raw: {},
    };

    const verifier = new VerificationEngine();
    const result = verifier.verifyRow(row, mockLookups);
    expect(result.status).toBe('AMOUNT_MISMATCH');

    const finance = new FinancialEngine();
    finance.calculateItemFinance(result);
    // supplier overbilled delta = $8.00 (expected) - $9.50 (billed) = -$1.50
    expect(result.details.financial.supplier_cost_difference).toBe(-1.5);

    const classifier = new ClassificationEngine();
    const state = classifier.classifyItem(result);
    expect(state).toBe('UNCLEAR');

    const recommender = new RecommendationEngine();
    recommender.generateRecommendation(result);
    expect(result.details.recommendations[0].action).toBe('resolve');
    expect(result.details.recommendations[0].reason).toContain('Supplier overbilled');
  });
});
