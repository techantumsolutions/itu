import { UploadService } from './01-upload-service';
import { ParserEngine } from './02-parser-engine';
import { ValidationEngine } from './03-validation-engine';
import { MatchingEngine } from './04-matching-engine';
import { VerificationEngine, VerificationResult } from './05-verification-engine';
import { FinancialEngine } from './06-financial-engine';
import { ClassificationEngine } from './07-classification-engine';
import { RecommendationEngine } from './08-recommendation-engine';
import { DbWriter } from '../db-writer';
import { ReconciliationHealthMetrics, ReconciliationState } from '../types';

export class ReconciliationOrchestrator {
  private uploadService = new UploadService();
  private parserEngine = new ParserEngine();
  private validationEngine = new ValidationEngine();
  private matchingEngine = new MatchingEngine();
  private verificationEngine = new VerificationEngine();
  private financialEngine = new FinancialEngine();
  private classificationEngine = new ClassificationEngine();
  private recommendationEngine = new RecommendationEngine();
  private dbWriter = new DbWriter();

  /**
   * Executes the entire reconciliation processing pipeline.
   */
  async run(params: {
    supplier: string;
    billingPeriod: string;
    periodStart: string;
    periodEnd: string;
    billingType: string;
    fileName: string;
    fileContent: string;
    uploadedBy: string;
  }): Promise<{ reportId: string; metrics: ReconciliationHealthMetrics }> {
    const startTime = Date.now();
    const {
      supplier,
      billingPeriod,
      periodStart,
      periodEnd,
      billingType,
      fileName,
      fileContent,
      uploadedBy,
    } = params;

    // 1. Process Upload (Deduplication check & save file)
    const uploadResult = await this.uploadService.processUpload({
      supplier,
      billingPeriod,
      billingType,
      fileName,
      fileContent
    });

    // 2. Parse billing rows into unified structure
    const parsedRows = this.parserEngine.parse({
      supplier,
      fileContent,
      fileName
    });

    if (parsedRows.length === 0) {
      throw new Error('Billing file is empty or headers could not be matched.');
    }

    // 3. File Row validation
    const { validRows, errors } = this.validationEngine.validate(parsedRows);

    // 4. Load platform range snapshots in memory
    const lookups = await this.matchingEngine.buildLookupMaps(validRows);

    // 5. Verification & Audit Loop
    const results: VerificationResult[] = [];
    const states: ReconciliationState[] = [];

    let clearCount = 0;
    let pendingCount = 0;
    let unclearCount = 0;
    let matchedCount = 0;
    let confidenceSum = 0;
    let statusMatchSum = 0;
    let costMatchSum = 0;

    for (const row of validRows) {
      // 5.1 Matching & Timeline Audit
      const vResult = this.verificationEngine.verifyRow(row, lookups);

      // 5.2 Financial Variance Math
      this.financialEngine.calculateItemFinance(vResult);

      // 5.3 Categorize State
      const state = this.classificationEngine.classifyItem(vResult);

      // 5.4 Generate Actions Recommendation
      this.recommendationEngine.generateRecommendation(vResult);

      results.push(vResult);
      states.push(state);

      // Track health metrics
      if (vResult.matchedTx) {
        matchedCount++;
        confidenceSum += vResult.confidenceScore;
        if (vResult.details.comparison.status_match) statusMatchSum++;
        if (vResult.details.comparison.amount_match) costMatchSum++;
      }

      if (state === 'CLEAR') clearCount++;
      else if (state === 'PENDING') pendingCount++;
      else unclearCount++;
    }

    // 6. Aggregate Financial Summaries
    const summary = this.financialEngine.compileSummary(results);

    // 7. Calculate Health KPIs
    const totalCount = parsedRows.length || 1;
    const processingTimeMs = Date.now() - startTime;

    const metrics: ReconciliationHealthMetrics = {
      match_rate: Number(((matchedCount / totalCount) * 100).toFixed(2)),
      auto_match_percent: Number((((clearCount + pendingCount) / totalCount) * 100).toFixed(2)),
      manual_review_percent: Number(((unclearCount / totalCount) * 100).toFixed(2)),
      average_confidence: matchedCount > 0 ? Number((confidenceSum / matchedCount).toFixed(2)) : 0,
      processing_time_ms: processingTimeMs,
      supplier_accuracy: matchedCount > 0 ? Number((statusMatchSum / matchedCount).toFixed(2)) : 100,
      settlement_accuracy: matchedCount > 0 ? Number((costMatchSum / matchedCount).toFixed(2)) : 100,
    };

    // 8. Bulk Write Report & Reconciled Items
    const reportId = await this.dbWriter.writeReport({
      supplier,
      billingPeriod,
      periodStart,
      periodEnd,
      billingType,
      fileHash: uploadResult.fileHash,
      fileName,
      fileUrl: uploadResult.fileUrl,
      uploadedBy,
      runVersion: uploadResult.runVersion,
      summary,
      errors,
      metrics,
      results,
      states,
    });

    return {
      reportId,
      metrics,
    };
  }
}
