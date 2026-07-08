import { NormalizedSupplierRow, ReconciliationValidationErrors } from '../types';
import { RECONCILIATION_CONFIG } from '../config';

export class ValidationEngine {
  /**
   * Performs data validation and structures any issues into explicit error categories.
   */
  validate(rows: NormalizedSupplierRow[]): {
    validRows: NormalizedSupplierRow[];
    errors: ReconciliationValidationErrors;
  } {
    const validRows: NormalizedSupplierRow[] = [];
    
    const errors: ReconciliationValidationErrors = {
      file_errors: [],
      missing_columns: [],
      invalid_dates: [],
      invalid_currencies: [],
      duplicate_rows: [],
      unsupported_providers: [],
      invalid_mobiles: []
    };

    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();

    // Pre-scan to find duplicates within the file itself
    for (const row of rows) {
      const txId = row.supplierTransactionId?.trim();
      if (!txId) continue;
      if (seenIds.has(txId)) {
        duplicateIds.add(txId);
      }
      seenIds.add(txId);
    }

    const validSuppliers = new Set(Object.keys(RECONCILIATION_CONFIG.suppliers));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let rowValid = true;
      const rowNum = i + 2; // account for header line offset

      // 1. Duplicate Row Check
      if (row.supplierTransactionId && duplicateIds.has(row.supplierTransactionId)) {
        errors.duplicate_rows.push(`Row ${rowNum}: Duplicate Transaction ID "${row.supplierTransactionId}" found inside billing file.`);
        // Note: duplicates are marked as invalid to avoid multi-matching but are kept/reconciled under DUPLICATE_SUPPLIER_ROW status.
      }

      // 2. Critical Columns completeness check
      if (!row.supplierTransactionId) {
        errors.missing_columns.push(`Row ${rowNum}: Missing critical column "Transaction ID".`);
        rowValid = false;
      }
      if (!row.mobile) {
        errors.missing_columns.push(`Row ${rowNum}: Missing critical column "Mobile Number".`);
        rowValid = false;
      }
      if (row.supplierCost === undefined || row.supplierCost === null) {
        errors.missing_columns.push(`Row ${rowNum}: Missing critical column "Cost".`);
        rowValid = false;
      }

      // 3. Phone normalisation check
      if (row.mobile && (row.mobile.length < 8 || row.mobile.length > 15)) {
        errors.invalid_mobiles.push(`Row ${rowNum}: Mobile "${row.mobile}" fails MSISDN length validation.`);
        rowValid = false;
      }

      // 4. Date formatting check
      const dateTest = new Date(row.transactionDate);
      if (isNaN(dateTest.getTime())) {
        errors.invalid_dates.push(`Row ${rowNum}: Date string "${row.transactionDate}" is invalid.`);
        rowValid = false;
      }

      // 5. Currency Check
      if (!row.currency || row.currency.length !== 3) {
        errors.invalid_currencies.push(`Row ${rowNum}: Currency code "${row.currency}" is invalid.`);
        rowValid = false;
      }

      // 6. Provider Code Validation
      if (!validSuppliers.has(row.supplier.toLowerCase())) {
        errors.unsupported_providers.push(`Row ${rowNum}: Supplier code "${row.supplier}" is not configured in reconciliation system.`);
        rowValid = false;
      }

      if (rowValid) {
        validRows.push(row);
      }
    }

    return {
      validRows,
      errors
    };
  }
}
