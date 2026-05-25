import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('sb-access-token', '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set('sb-refresh-token', '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set('itu-user-id', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

