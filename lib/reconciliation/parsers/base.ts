// Base supplier parser interface
import { NormalizedSupplierRow } from '../types';

export interface ISupplierParser {
  /**
   * Parse raw text (CSV) or buffer content into standard normalized rows.
   * @param content String content of the uploaded file
   * @param filename Optional filename to assist file type detection
   */
  parse(content: string, filename?: string): NormalizedSupplierRow[];
}
