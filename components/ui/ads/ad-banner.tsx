import React, { useEffect } from 'react'
import { AdCreative } from './ad-manager'

interface AdProps {
  ad: AdCreative
  onTrack: (event: 'impression' | 'click') => void
  className?: string
}

export function AdBanner({ ad, onTrack, className = '' }: AdProps) {
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
      className={`relative overflow-hidden rounded-lg cursor-pointer transition-transform hover:scale-[1.02] ${className}`}
      onClick={handleClick}
    >
      <img 
        src={ad.media_url} 
        alt={ad.title || 'Advertisement'} 
        className="w-full h-auto object-cover"
      />
      {/* Optional Overlay for Text */}
      {(ad.title || ad.description) && (
        <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
          {ad.title && <h4 className="font-bold text-lg">{ad.title}</h4>}
          {ad.description && <p className="text-sm opacity-90">{ad.description}</p>}
        </div>
      )}
      <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-black/40 text-white rounded backdrop-blur-sm">
        Ad
      </span>
    </div>
  )
}
