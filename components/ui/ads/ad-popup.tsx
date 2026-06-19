import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { AdCreative } from './ad-manager'

interface AdPopupProps {
  ad: AdCreative
  onTrack: (event: 'impression' | 'click' | 'dismiss') => void
}

export function AdPopup({ ad, onTrack }: AdPopupProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasShown, setHasShown] = useState(false)

  useEffect(() => {
    // Check if we've already shown this popup in this session
    const storageKey = `ad_dismissed_${ad.id}`
    if (sessionStorage.getItem(storageKey)) {
      return
    }

    const delay = (ad.display_delay_seconds || 0) * 1000
    
    const showTimer = setTimeout(() => {
      setIsOpen(true)
      setHasShown(true)
      onTrack('impression')
      
      // Auto close if duration is set
      if (ad.display_duration_seconds) {
        setTimeout(() => {
          handleDismiss()
        }, ad.display_duration_seconds * 1000)
      }
    }, delay)

    return () => clearTimeout(showTimer)
  }, [ad, onTrack])

  const handleDismiss = () => {
    setIsOpen(false)
    sessionStorage.setItem(`ad_dismissed_${ad.id}`, 'true')
    onTrack('dismiss')
  }

  const handleClick = () => {
    onTrack('click')
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative max-w-lg w-full bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 z-10 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="cursor-pointer" onClick={handleClick}>
          {ad.media_url.endsWith('.mp4') || ad.media_url.endsWith('.webm') ? (
            <video src={ad.media_url} autoPlay muted loop playsInline className="w-full h-auto object-cover max-h-[60vh]" />
          ) : (
            <img src={ad.media_url} alt={ad.title || 'Ad'} className="w-full h-auto object-cover max-h-[60vh]" />
          )}
        </div>
        
        {(ad.title || ad.description) && (
          <div className="p-5 text-center cursor-pointer" onClick={handleClick}>
            {ad.title && <h3 className="text-xl font-bold text-gray-900 mb-2">{ad.title}</h3>}
            {ad.description && <p className="text-gray-600">{ad.description}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
