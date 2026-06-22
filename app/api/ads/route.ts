import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const placement = searchParams.get('placement')
  const page = searchParams.get('page')
  const country = searchParams.get('country') // inferred or passed by client

  if (!placement) {
    return NextResponse.json({ error: 'Missing placement parameter' }, { status: 400 })
  }

  try {
    const query = new URLSearchParams()
    query.set('placement_key', `eq.${placement}`)
    query.set('is_active', 'eq.true')
    query.set('select', '*,campaign:ads_campaigns!inner(*)')
    query.set('ads_campaigns.is_active', 'eq.true')

    const res = await supabaseRest(`ads_creatives?${query.toString()}`)
    
    if (!res.ok) {
      console.error('Failed to fetch ads', await res.text())
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }

    const data: any[] = await res.json()
    
    const now = new Date()

    // Filter by dates and targets
    const validAds = data.filter((ad) => {
      const camp = ad.campaign
      if (!camp) return false
      
      const start = new Date(camp.start_date)
      const end = new Date(camp.end_date)
      if (now < start || now > end) return false

      // Page matching
      if (camp.target_pages && camp.target_pages.length > 0 && page) {
        if (!camp.target_pages.includes(page)) return false
      }

      return true
    })

    if (validAds.length === 0) {
      return NextResponse.json({ ad: null })
    }

    // Sort validAds: Country Specific first, then Global
    validAds.sort((a, b) => {
      const aTargets = a.campaign.target_countries
      const bTargets = b.campaign.target_countries

      const aIsSpecific = aTargets && aTargets.length > 0 && country && aTargets.includes(country)
      const bIsSpecific = bTargets && bTargets.length > 0 && country && bTargets.includes(country)

      if (aIsSpecific && !bIsSpecific) return -1
      if (!aIsSpecific && bIsSpecific) return 1
      return 0
    })

    // Now filter out ads that don't match country
    const matchingAds = validAds.filter((ad) => {
      const targets = ad.campaign.target_countries
      if (!targets || targets.length === 0) return true // Global
      if (country && targets.includes(country)) return true // Specific Match
      return false // Target mismatch
    })

    if (matchingAds.length === 0) {
      return NextResponse.json({ ad: null })
    }

    const bestAd = matchingAds[0]
    delete bestAd.campaign 

    return NextResponse.json({ ad: bestAd })

  } catch (err: any) {
    console.error('Ads API Error:', err.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { creative_id, event_type } = body
    
    if (!creative_id || !event_type) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const ipHash = Buffer.from(ip).toString('base64').substring(0, 16)

    const payload = {
      creative_id,
      event_type,
      ip_hash: ipHash
    }

    const res = await supabaseRest('ads_analytics', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      console.error('Failed to log analytics', await res.text())
      return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Ads Analytics API Error:', err.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
