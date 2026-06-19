'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AdBanner } from './ad-banner'
import { AdPopup } from './ad-popup'
import { AdScroll } from './ad-scroll'
import { AdVideo } from './ad-video'

export type AdFormat = 'banner' | 'video' | 'popup' | 'scroll_sticky'

export interface AdCreative {
  id: string
  format: AdFormat
  placement_key: string
  media_url: string
  destination_url?: string
  title?: string
  description?: string
  display_delay_seconds?: number
  display_duration_seconds?: number
}

interface AdManagerProps {
  placement: string
  page?: string
  country?: string // Could be passed from a global store if logged in
  className?: string
}

export function AdManager({ placement, page, country, className }: AdManagerProps) {
  const [ad, setAd] = useState<AdCreative | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    async function fetchAd() {
      try {
        const query = new URLSearchParams({ placement })
        const resolvedPage = page || pathname
        if (resolvedPage) query.set('page', resolvedPage)
        if (country) query.set('country', country)

        const res = await fetch(`/api/ads?${query.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setAd(data.ad)
        }
      } catch (err) {
        console.error('Failed to fetch ad:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAd()
  }, [placement, page, country])

  if (loading || !ad) return null

  const trackEvent = async (eventType: 'impression' | 'click' | 'dismiss') => {
    try {
      await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creative_id: ad.id, event_type: eventType })
      })
    } catch (err) {
      console.error('Failed to track ad event:', err)
    }
  }

  // Render the appropriate ad format component
  switch (ad.format) {
    case 'banner':
      return <AdBanner ad={ad} onTrack={trackEvent} className={className} />
    case 'video':
      return <AdVideo ad={ad} onTrack={trackEvent} className={className} />
    case 'popup':
      return <AdPopup ad={ad} onTrack={trackEvent} />
    case 'scroll_sticky':
      return <AdScroll ad={ad} onTrack={trackEvent} className={className} />
    default:
      return null
  }
}
