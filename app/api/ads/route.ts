import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const country = (url.searchParams.get('country') ?? '').trim().toUpperCase()
  const now = new Date().toISOString()
  const res = await supabaseRest(
    `ads?status=eq.active&select=id,title,placement,target_countries,image_url,link_url,starts_at,ends_at,metadata&order=updated_at.desc`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ ads: [] })
  const rows = ((await res.json()) as any[]).filter((ad) => {
    const countries = Array.isArray(ad.target_countries) ? ad.target_countries : []
    const inCountry = !country || countries.length === 0 || countries.includes(country)
    const started = !ad.starts_at || String(ad.starts_at) <= now
    const notEnded = !ad.ends_at || String(ad.ends_at) >= now
    return inCountry && started && notEnded
  })
  return NextResponse.json({ ads: rows })
}
