import type { ProviderAdapterKey, ProviderConnector } from '@/lib/providers/types'
import { dtoneConnector } from '@/lib/providers/dtone-connector'
import { valuetopupConnector } from '@/lib/providers/valuetopup-connector'
import { dingConnector } from '@/lib/providers/ding-connector'

const connectors: Record<ProviderAdapterKey, ProviderConnector> = {
  dtone: dtoneConnector,
  valuetopup: valuetopupConnector,
  ding: dingConnector,
  reloadly: {
    adapterKey: 'reloadly',
    async fetchRawPlans(_config, _options) {
      throw new Error('reloadly connector not implemented')
    },
    async normalizePlans() {
      throw new Error('reloadly connector not implemented')
    },
  },
  custom: {
    adapterKey: 'custom',
    async fetchRawPlans(_config, _options) {
      throw new Error('custom connector not implemented')
    },
    async normalizePlans() {
      throw new Error('custom connector not implemented')
    },
  },
}

export function getConnector(adapterKey: ProviderAdapterKey): ProviderConnector {
  const c = connectors[adapterKey]
  if (!c) throw new Error(`Unknown provider adapter: ${adapterKey}`)
  return c
}

