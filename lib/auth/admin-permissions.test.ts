import { describe, expect, it } from '@jest/globals'
import {
  defaultLimitedAdminPermissions,
  migrateLegacyPermissions,
  hasAdminPermission,
} from '@/lib/auth/admin-permissions'

describe('admin permissions migration', () => {
  it('maps legacy providers to view only', () => {
    const migrated = migrateLegacyPermissions({ providers: true })
    expect(migrated['providers.view']).toBe(true)
    expect(migrated['providers.create']).toBe(false)
  })

  it('maps legacy providers_manage to mutation permissions', () => {
    const migrated = migrateLegacyPermissions({ providers: true, providers_manage: true })
    expect(migrated['providers.view']).toBe(true)
    expect(migrated['providers.create']).toBe(true)
    expect(migrated['providers.edit']).toBe(true)
    expect(migrated['providers.sync']).toBe(true)
    expect(migrated['providers.delete']).toBe(true)
  })

  it('maps legacy routing to split modules', () => {
    const migrated = migrateLegacyPermissions({ routing: true })
    expect(migrated['lcr.view']).toBe(true)
    expect(migrated['routing_rules.view']).toBe(true)
    expect(migrated['routing_logs.view']).toBe(true)
  })

  it('preserves new-format keys', () => {
    const migrated = migrateLegacyPermissions({
      'routing_logs.view': true,
      'routing_rules.view': false,
    })
    expect(migrated['routing_logs.view']).toBe(true)
    expect(migrated['routing_rules.view']).toBe(false)
  })

  it('defaults new limited admin to dashboard, providers view, settings, help', () => {
    const d = defaultLimitedAdminPermissions()
    expect(d['dashboard.view']).toBe(true)
    expect(d['providers.view']).toBe(true)
    expect(d['settings.view']).toBe(true)
    expect(d['help.view']).toBe(true)
    expect(d['plans.view']).toBe(false)
  })

  it('null permissions grants full access for legacy admins', () => {
    expect(
      hasAdminPermission({
        appRole: 'admin',
        adminPermissions: null,
        permission: 'plans.view',
      }),
    ).toBe(true)
  })

  it('super_admin always allowed', () => {
    expect(
      hasAdminPermission({
        appRole: 'super_admin',
        adminPermissions: {},
        permission: 'plans.view',
      }),
    ).toBe(true)
  })
})
