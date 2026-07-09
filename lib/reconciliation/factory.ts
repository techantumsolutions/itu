// Factory class to instantiate supplier billing parsers
import { ISupplierParser } from './parsers/base';
import { DTOneParser } from './parsers/dtone';
import { DingParser } from './parsers/ding';
import { ValueTopupParser } from './parsers/valuetopup';

export class SupplierParserFactory {
  /**
   * Instantiates a parser based on the supplier code.
   * @param supplierCode Code defined in RECONCILIATION_CONFIG (e.g. 'dtone', 'ding', 'valuetopup')
   */
  static getParser(supplierCode: string): ISupplierParser {
    const code = supplierCode.trim().toLowerCase();
    
    switch (code) {
      case 'dtone':
        return new DTOneParser();
      case 'ding':
        return new DingParser();
      case 'valuetopup':
        return new ValueTopupParser();
      default:
        throw new Error(`Unsupported supplier: "${supplierCode}". No parser configured.`);
    }
  }
}
