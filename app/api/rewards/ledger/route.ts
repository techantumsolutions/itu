import { NextResponse } from 'next/server'

/** Client reward grants are issued server-side after verified checkout — never via public API. */
export async function POST() {
  return NextResponse.json(
    { error: 'Reward grants are handled internally after verified payments.' },
    { status: 403 },
  )
}
