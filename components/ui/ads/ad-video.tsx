import React, { useEffect } from 'react'
import { AdCreative } from './ad-manager'

interface AdProps {
  ad: AdCreative
  onTrack: (event: 'impression' | 'click') => void
  className?: string
}

export function AdVideo({ ad, onTrack, className = '' }: AdProps) {
  useEffect(() => {
    onTrack('impression')
  }, [ad.id, onTrack])

  const handleClick = () => {
    onTrack('click')
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank')
    }
  }

  return (
    <div 
      className={`relative overflow-hidden rounded-lg cursor-pointer ${className}`}
      onClick={handleClick}
    >
      <video 
        src={ad.media_url} 
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-auto object-cover"
      />
      <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-black/40 text-white rounded backdrop-blur-sm z-10">
        Ad
      </span>
    </div>
  )
}
