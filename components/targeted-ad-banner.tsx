'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLocalePreferencesStore } from '@/lib/stores'
import { X } from 'lucide-react'

type PublicAd = {
  id: string
  title: string
  image_url: string | null
  link_url: string | null
}

export function TargetedAdBanner() {
  const regionCode = useLocalePreferencesStore((s) => s.regionCode)
  const [ads, setAds] = useState<PublicAd[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [failedAdIds, setFailedAdIds] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  const adCandidates = useMemo(() => {
    return ads.filter((x) => x.image_url?.trim()).map((candidate) => ({ ad: candidate }))
  }, [ads])

  const ad = useMemo(
    () => adCandidates.find((candidate) => !failedAdIds.includes(candidate.ad.id)) ?? null,
    [adCandidates, failedAdIds],
  )

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    void fetch(`/api/ads?country=${encodeURIComponent(regionCode)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setAds(Array.isArray(data?.ads) ? data.ads : []))
      .catch(() => setAds([]))
  }, [regionCode])

  useEffect(() => {
    if (!ad) {
      setOpen(false)
      return
    }
    const key = `ad-modal-dismissed:${ad.ad.id}`
    const dismissed = window.sessionStorage.getItem(key) === '1'
    if (dismissed) {
      setOpen(false)
      return
    }
    const t = window.setTimeout(() => setOpen(true), 400)
    return () => window.clearTimeout(t)
  }, [ad?.ad.id])

  const closeModal = () => {
    if (!ad) return
    window.sessionStorage.setItem(`ad-modal-dismissed:${ad.ad.id}`, '1')
    setOpen(false)
  }

  useEffect(() => {
    setFailedAdIds([])
  }, [adCandidates])

  if (!isHydrated || !ad || !open) return null

  const href = ad.ad.link_url?.trim() || '/recharge'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close advertisement"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={closeModal}
      />
      <aside className="relative z-[1] w-full max-w-[min(100%,540px)]">
        <button
          type="button"
          className="absolute right-2 top-2 z-[3] flex size-10 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-black/10 transition hover:bg-neutral-100 sm:right-3 sm:top-3"
          onClick={closeModal}
          aria-label="Close"
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <Link
          href={href}
          className="group relative block overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
          onClick={closeModal}
        >
          <span className="sr-only">{ad.ad.title}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-provided arbitrary URLs */}
          <img
            src={ad.ad.image_url ?? ''}
            alt=""
            className="max-h-[min(85vh,720px)] w-full object-contain bg-neutral-950"
            loading="eager"
            decoding="async"
            onError={() => {
              setFailedAdIds((prev) => (prev.includes(ad.ad.id) ? prev : [...prev, ad.ad.id]))
            }}
          />
        </Link>
      </aside>
    </div>
  )
}
