/** Recharge orchestration — plan_mappings as authoritative provider source for LCR + recharge. */
export { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'
export {
  resolveProvidersForPlanId,
  resolveProvidersForSystemPlan,
  resolveProvidersForInternalPlan,
  type SystemPlanProviderRow,
} from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'
export {
  validateOrchestrationParity,
  loadCompatibilityOverlay,
  type OrchestrationParityReport,
} from '@/lib/recharge-orchestration/mapping-parity-validator'
export {
  loadAuthoritativeCandidateBundle,
  shouldUseAuthoritativeDiscovery,
} from '@/lib/recharge-orchestration/authoritative-candidate-loader'
export { mirrorPlanMappingsToInternalCache } from '@/lib/recharge-orchestration/mirror-internal-plan-mapping-cache'
export {
  assertAuthoritativeProviderForRecharge,
  ORPHAN_RUNTIME_PROVIDER,
} from '@/lib/recharge-orchestration/validate-orchestration-provider'
export {
  buildRechargeProviderExecutionContext,
  buildRechargeProviderExecutionContextFromAuthoritative,
  type RechargeProviderExecutionContext,
} from '@/lib/recharge-orchestration/provider-execution-context'
export {
  orchestrationRoutingLogFields,
  type RechargeRoutingSource,
} from '@/lib/recharge-orchestration/routing-log-fields'
