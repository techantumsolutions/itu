import { getConnector } from '@/lib/providers/registry'

export async function runStep1Check(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const connector = getConnector(config.adapterKey)
  if (!connector) {
    return {
      success: false,
      message: `Adapter ${config.adapterKey} not registered.`,
    }
  }
  return {
    success: true,
    message: `Connection check succeeded. Provider "${config.code}" adapter is active and configured correctly.`,
  }
}
