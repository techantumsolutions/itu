'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AdCreative } from './ad-manager'

interface AdScrollProps {
  ad: AdCreative
  onTrack: (event: 'impression' | 'click' | 'dismiss') => void
  className?: string
}

function dismissStorageKey(adId: string) {
  return `ad_dismissed_${adId}`
}

export function AdScroll({ ad, onTrack, className = '' }: AdScrollProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const hasTrackedImpression = useRef(false)
  const onTrackRef = useRef(onTrack)
  onTrackRef.current = onTrack

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(dismissStorageKey(ad.id))) {
      setDismissed(true)
    }
  }, [ad.id])

  useEffect(() => {
    if (dismissed) {
      setIsVisible(false)
      return
    }

    const handleScroll = () => {
      const scrollThreshold = document.documentElement.scrollHeight * 0.3
      if (window.scrollY > scrollThreshold) {
        setIsVisible(true)
        if (!hasTrackedImpression.current) {
          hasTrackedImpression.current = true
          onTrackRef.current('impression')
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => window.removeEventListener('scroll', handleScroll)
  }, [dismissed])

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDismissed(true)
    setIsVisible(false)
    try {
      sessionStorage.setItem(dismissStorageKey(ad.id), 'true')
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    onTrack('dismiss')
  }

  const handleClick = () => {
    onTrack('click')
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank')
    }
  }

  if (dismissed || !isVisible) return null

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 max-w-sm w-full bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100 animate-in slide-in-from-bottom-5 duration-500 ${className}`}
    >
      <button
        type="button"
        aria-label="Dismiss ad"
        onClick={handleDismiss}
        className="absolute top-2 right-2 z-10 p-1 bg-white/80 hover:bg-white text-gray-800 rounded-full transition-colors shadow-sm"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center cursor-pointer" onClick={handleClick}>
        <div className="w-1/3 aspect-square shrink-0 bg-gray-100">
          <img src={ad.media_url} alt={ad.title || 'Ad'} className="w-full h-full object-cover" />
        </div>
        <div className="p-4 w-2/3">
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 mb-1 block">
            Sponsored
          </span>
          {ad.title && (
            <h4 className="font-semibold text-gray-900 leading-tight mb-1 line-clamp-2">{ad.title}</h4>
          )}
          {ad.description && (
            <p className="text-xs text-gray-500 line-clamp-2">{ad.description}</p>
          )}
        </div>
      </div>
    </div>
  )
}
