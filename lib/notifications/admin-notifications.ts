import { supabaseRest } from '@/lib/db/supabase-rest'

export type NotificationType =
  | 'user_registration'
  | 'admin_password_set'
  | 'admin_account_frozen'
  | 'recharge_failed_after_payment'
  | 'support_ticket_raised'

export async function createAdminNotification(params: {
  title: string
  message: string
  type: NotificationType
  details?: Record<string, any>
}) {
  try {
    const res = await supabaseRest('admin_notifications', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        message: params.message,
        type: params.type,
        details: params.details || {},
        is_read: false,
        created_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('Failed to create admin notification:', text)
    }
  } catch (err) {
    console.error('Error creating admin notification:', err)
  }
}
