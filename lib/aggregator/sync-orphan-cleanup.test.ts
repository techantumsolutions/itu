import { aggCloseStaleSyncRuns, aggCloseRunningSyncLogsForProvider } from '@/lib/aggregator/repository'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

import { supabaseRest } from '@/lib/db/supabase-rest'

const mockRest = supabaseRest as jest.MockedFunction<typeof supabaseRest>

describe('sync orphan cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('closes stale running sync_runs except the current run', async () => {
    mockRest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('sync_runs?') && !init?.method) {
        return {
          ok: true,
          json: async () => [{ id: 'old-run' }, { id: 'current-run' }],
        } as Response
      }
      if (path.includes('sync_runs?id=eq.old-run')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    await aggCloseStaleSyncRuns('DING', 'current-run')

    const patchCalls = mockRest.mock.calls.filter(
      ([path, init]) => path.includes('sync_runs?id=eq.old-run') && init?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    const body = JSON.parse(String(patchCalls[0]?.[1]?.body))
    expect(body.status).toBe('failed')
  })

  it('closes orphaned RUNNING sync_logs for provider', async () => {
    mockRest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('sync_logs?') && !init?.method) {
        return {
          ok: true,
          json: async () => [{ id: 'log-1', metadata: { syncRunId: 'old' } }],
        } as Response
      }
      if (path.includes('sync_logs?id=eq.log-1')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    await aggCloseRunningSyncLogsForProvider('provider-1', 'new-run')

    const patchCalls = mockRest.mock.calls.filter(
      ([path, init]) => path.includes('sync_logs?id=eq.log-1') && init?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    const body = JSON.parse(String(patchCalls[0]?.[1]?.body))
    expect(body.status).toBe('FAILED')
  })
})
