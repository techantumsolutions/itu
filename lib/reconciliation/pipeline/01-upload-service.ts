import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { supabaseRest } from '../../db/supabase-rest';

export interface UploadResult {
  fileHash: string;
  fileUrl: string;
  runVersion: number;
}

export class UploadService {
  /**
   * Computes SHA256 hash of a string.
   */
  static computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Processes the uploaded file, verifies duplicate SHA256 hashes,
   * saves the file locally, and calculates the next run version.
   */
  async processUpload(params: {
    supplier: string;
    billingPeriod: string;
    billingType: string;
    fileName: string;
    fileContent: string;
  }): Promise<UploadResult> {
    const { supplier, billingPeriod, billingType, fileName, fileContent } = params;
    
    // 1. Calculate SHA256 Hash
    const fileHash = UploadService.computeHash(fileContent);

    // 2. Query duplicate file hash in database
    const checkHashRes = await supabaseRest(
      `reconciliation_reports?file_hash=eq.${fileHash}&select=id`
    );
    if (checkHashRes.ok) {
      const existingReport = await checkHashRes.json();
      if (existingReport && existingReport.length > 0) {
        throw new Error(`Duplicate file detected. This file has already been uploaded.`);
      }
    }

    // 3. Resolve next run version for this supplier + period + type combination
    let runVersion = 1;
    const checkVersionRes = await supabaseRest(
      `reconciliation_reports?provider=eq.${supplier}&billing_period=eq.${billingPeriod}&billing_type=eq.${billingType}&select=run_version&order=run_version.desc&limit=1`
    );
    if (checkVersionRes.ok) {
      const records = await checkVersionRes.json();
      if (records && records.length > 0) {
        const lastVersion = records[0]?.run_version ?? 0;
        runVersion = lastVersion + 1;
      }
    }

    // 4. Save file to local storage directory for audit records
    const storageDir = join(process.cwd(), 'storage', 'reconciliation');
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true });
    }
    const safeFileName = `${supplier}_${billingPeriod}_${billingType}_v${runVersion}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = join(storageDir, safeFileName);
    writeFileSync(filePath, fileContent, 'utf8');

    return {
      fileHash,
      fileUrl: `/storage/reconciliation/${safeFileName}`,
      runVersion,
    };
  }
}
