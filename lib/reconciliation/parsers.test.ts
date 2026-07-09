import { parseCsv, resolveColumnIndex } from './parsers/csv-helper';
import { SupplierParserFactory } from './factory';
import { DTOneParser } from './parsers/dtone';
import { DingParser } from './parsers/ding';
import { ValueTopupParser } from './parsers/valuetopup';

describe('CSV Parser Helper', () => {
  it('should parse simple CSV rows', () => {
    const text = 'col1,col2,col3\nval1,val2,val3\nval4,val5,val6';
    const lines = parseCsv(text);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual(['col1', 'col2', 'col3']);
    expect(lines[1]).toEqual(['val1', 'val2', 'val3']);
  });

  it('should parse quoted fields with commas', () => {
    const text = 'col1,col2\n"val1, escaped",val2\nval3,"val4, escaped"';
    const lines = parseCsv(text);
    expect(lines).toHaveLength(3);
    expect(lines[1][0]).toBe('val1, escaped');
    expect(lines[2][1]).toBe('val4, escaped');
  });

  it('should resolve columns by index', () => {
    const headers = ['transaction_id', 'recipient_phone', 'cost_usd'];
    const idxTx = resolveColumnIndex(headers, ['txid', 'transaction_id']);
    const idxPhone = resolveColumnIndex(headers, ['phone', 'recipient_phone']);
    const idxNotFound = resolveColumnIndex(headers, ['nonexistent']);

    expect(idxTx).toBe(0);
    expect(idxPhone).toBe(1);
    expect(idxNotFound).toBe(-1);
  });
});

describe('Supplier Parser Factory', () => {
  it('should return DTOneParser for dtone', () => {
    const parser = SupplierParserFactory.getParser('dtone');
    expect(parser).toBeInstanceOf(DTOneParser);
  });

  it('should return DingParser for DING', () => {
    const parser = SupplierParserFactory.getParser('DING');
    expect(parser).toBeInstanceOf(DingParser);
  });

  it('should return ValueTopupParser for valuetopup', () => {
    const parser = SupplierParserFactory.getParser('valuetopup');
    expect(parser).toBeInstanceOf(ValueTopupParser);
  });

  it('should throw error for unsupported supplier', () => {
    expect(() => SupplierParserFactory.getParser('unknown')).toThrow();
  });
});

describe('DTOne Parser', () => {
  it('should normalize DTOne CSV structure', () => {
    const csv = 'Transaction ID,Reference,Mobile Number,Wholesale Price,Currency,Status\nDT-1002,Ref-ABC,+919876543210,10.50,USD,CONFIRMED';
    const parser = new DTOneParser();
    const rows = parser.parse(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      supplier: 'dtone',
      supplierTransactionId: 'DT-1002',
      providerReference: 'Ref-ABC',
      externalReference: null,
      mobile: '919876543210',
      operator: 'Unknown',
      country: 'XX',
      customerAmount: 0,
      supplierCost: 10.5,
      currency: 'USD',
      transactionDate: expect.any(String),
      status: 'completed',
      raw: {
        'Transaction ID': 'DT-1002',
        'Reference': 'Ref-ABC',
        'Mobile Number': '+919876543210',
        'Wholesale Price': '10.50',
        'Currency': 'USD',
        'Status': 'CONFIRMED',
      },
    });
  });
});

describe('Ding Parser', () => {
  it('should normalize Ding CSV structure', () => {
    const csv = 'Id,Reference,Mobile,Wholesale Price,Currency,Status\nDing-3001,D-Ref-123,+14155552671,5.00,EUR,Success';
    const parser = new DingParser();
    const rows = parser.parse(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      supplier: 'ding',
      supplierTransactionId: 'Ding-3001',
      providerReference: 'D-Ref-123',
      externalReference: null,
      mobile: '14155552671',
      operator: 'Unknown',
      country: 'XX',
      customerAmount: 0,
      supplierCost: 5.0,
      currency: 'EUR',
      transactionDate: expect.any(String),
      status: 'completed',
      raw: {
        'Id': 'Ding-3001',
        'Reference': 'D-Ref-123',
        'Mobile': '+14155552671',
        'Wholesale Price': '5.00',
        'Currency': 'EUR',
        'Status': 'Success',
      },
    });
  });
});

describe('ValueTopup Parser', () => {
  it('should normalize ValueTopup CSV structure', () => {
    const csv = 'txid,reference,mobile,cost,currency,status\nVT-992,VT-Ref,919876550000,12.00,USD,0';
    const parser = new ValueTopupParser();
    const rows = parser.parse(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      supplier: 'valuetopup',
      supplierTransactionId: 'VT-992',
      providerReference: 'VT-Ref',
      externalReference: null,
      mobile: '919876550000',
      operator: 'Unknown',
      country: 'XX',
      customerAmount: 0,
      supplierCost: 12.0,
      currency: 'USD',
      transactionDate: expect.any(String),
      status: 'completed',
      raw: {
        'txid': 'VT-992',
        'reference': 'VT-Ref',
        'mobile': '919876550000',
        'cost': '12.00',
        'currency': 'USD',
        'status': '0',
      },
    });
  });
});
