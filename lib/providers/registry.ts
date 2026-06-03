import type { ProviderAdapterKey, ProviderConnector } from '@/lib/providers/types'
import { genericConnector } from '@/lib/providers/generic-connector'

export function getConnector(adapterKey: ProviderAdapterKey): ProviderConnector {
  return {
    ...genericConnector,
    adapterKey
  }
}
