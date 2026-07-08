import { SupplierParserFactory } from '../factory';
import { NormalizedSupplierRow } from '../types';

export class ParserEngine {
  /**
   * Delegates parsing to the corresponding supplier parser instance.
   */
  parse(params: {
    supplier: string;
    fileContent: string;
    fileName?: string;
  }): NormalizedSupplierRow[] {
    const { supplier, fileContent, fileName } = params;
    const parser = SupplierParserFactory.getParser(supplier);
    return parser.parse(fileContent, fileName);
  }
}
