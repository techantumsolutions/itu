import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

import { supabaseRest } from '@/lib/db/supabase-rest'

const mockedSupabase = supabaseRest as jest.MockedFunction<typeof supabaseRest>

describe('resolveSystemPlanFromInternalPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resolves by system_plans.id directly', async () => {
    mockedSupabase.mockImplementation(async (path: string) => {
      if (path.includes('system_plans?id=eq.sys-1')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'sys-1',
              internal_plan_id: 'int-1',
              status: 'ACTIVE',
              system_plan_name: 'Plan A',
            },
          ],
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const link = await resolveSystemPlanFromInternalPlan('sys-1')
    expect(link).toEqual({
      systemPlanId: 'sys-1',
      internalPlanId: 'int-1',
      systemPlanStatus: 'ACTIVE',
      systemPlanName: 'Plan A',
    })
  })

  it('resolves by internal_plans.id via internal_plan_id column', async () => {
    mockedSupabase.mockImplementation(async (path: string) => {
      if (path.includes('system_plans?id=eq.int-1')) {
        return { ok: true, json: async () => [] } as Response
      }
      if (path.includes('internal_plan_id=eq.int-1')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'sys-2',
              internal_plan_id: 'int-1',
              status: 'ACTIVE',
              system_plan_name: 'Plan B',
            },
          ],
        } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const link = await resolveSystemPlanFromInternalPlan('int-1')
    expect(link?.systemPlanId).toBe('sys-2')
    expect(link?.internalPlanId).toBe('int-1')
  })
})
