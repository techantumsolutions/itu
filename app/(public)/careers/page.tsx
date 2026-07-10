'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, MapPin, Clock, Briefcase, Loader2 } from 'lucide-react'
import { useCMSStore } from '@/lib/cms-store'

interface Job {
  id: string
  title: string
  department: string
  description: string
  locations: string[]
  experience: string
  type: string
  budget: string
  is_active: boolean
}

export default function CareersPage() {
  const { content, hasHydrated } = useCMSStore()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)

  // Fetch active jobs
  useEffect(() => {
    async function loadJobs() {
      try {
        const res = await fetch('/api/jobs')
        if (res.ok) {
          const data = await res.json()
          setJobs(data.jobs || [])
        }
      } catch (err) {
        console.error('Failed to load active jobs', err)
      } finally {
        setLoadingJobs(false)
      }
    }
    loadJobs()
  }, [])

  // Safely fallback to defaults if content/careersPage is not loaded yet
  const c = content?.careersPage || {
    heroTitle: 'Unlock Your Career At ITU',
    heroSubtitle: 'Grow With Us And Take Your Professional Life To The Next Level.',
    heroBgImage: '',
    perksTitle: 'Perks & Benefits',
    perksSubtitle: 'We take care of our people so they can take care of our clients.',
    perksList: [
      'Health & Wellness Benefits',
      'Performance Bonuses',
      'Certification Support',
      'International Exposure',
      'Flexible Work Arrangements',
      'Fast-Track Growth',
    ],
    lifeBeyondTitle: 'Life Beyond',
    lifeBeyondSubtitle: "From team building activities to hackathons, here's a glimpse of the memories we make together.",
    lifeBeyondImages: ['', '', '', '', ''],
    openPositionsTitle: 'Open Positions',
    openPositionsSubtitle: 'Find your next opportunity and help shape the future of collective data.',
  }

  const heroBg = c.heroBgImage || '/career/Banner.png'
  const collageImgs = [
    c.lifeBeyondImages[0] || '/career/one.png',
    c.lifeBeyondImages[1] || '/career/two.png',
    c.lifeBeyondImages[2] || '/career/three.png',
    c.lifeBeyondImages[3] || '/career/four.png',
    c.lifeBeyondImages[4] || '/career/five.png',
  ]

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* 1. Hero Section */}
      <section
        className="relative flex items-center justify-center min-h-[500px] bg-cover bg-center bg-no-repeat pt-36 pb-24 sm:pt-44 sm:pb-28 text-white"
        style={{ backgroundImage: `url(${heroBg})` }}
      >
        {/* Dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 max-w-7xl px-6 text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight select-none">
            {c.heroTitle}
          </h1>
          <p className="text-lg md:text-xl text-neutral-200 font-light max-w-2xl mx-auto leading-relaxed select-none">
            {c.heroSubtitle}
          </p>
        </div>
      </section>

      {/* 2. Perks & Benefits Section */}
      <section className="py-10 bg-neutral-50/50">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-[#273857]">{c.perksTitle}</h2>
            <p className="text-[#95949a] font-light max-w-xl mx-auto text-sm md:text-base leading-relaxed">
              {c.perksSubtitle}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {c.perksList.map((perk, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center p-6 bg-white border border-gray-400 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 text-center min-h-[90px]"
              >
                <span className="font-semibold text-[#172b84] text-sm md:text-base">{perk}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Life Beyond Section */}
      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-[#223253]">{c.lifeBeyondTitle}</h2>
            <p className="text-[#95949a] font-light max-w-xl mx-auto text-sm md:text-base leading-relaxed">
              {c.lifeBeyondSubtitle}
            </p>
          </div>

          {/* High-fidelity collage grid */}
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Top row - 3 columns */}
            <div className="grid gap-6 sm:grid-cols-3">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-sm group border"
                >
                  <img
                    src={collageImgs[idx]}
                    alt={`Life Beyond ${idx + 1}`}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              ))}
            </div>

            {/* Bottom row - 2 columns (wider left, narrower right) */}
            <div className="grid gap-6 md:grid-cols-12">
              <div className="md:col-span-7 relative aspect-[16/10] md:aspect-auto md:h-[300px] rounded-2xl overflow-hidden shadow-sm group border">
                <img
                  src={collageImgs[3]}
                  alt="Life Beyond 4"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="md:col-span-5 relative aspect-[16/10] md:aspect-auto md:h-[300px] rounded-2xl overflow-hidden shadow-sm group border">
                <img
                  src={collageImgs[4]}
                  alt="Life Beyond 5"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Open Positions Section */}
      <section className="py-10 bg-neutral-50/50 border-t border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-[#223253]">{c.openPositionsTitle}</h2>
            <p className="text-[#95949a] font-light max-w-xl mx-auto text-sm md:text-base leading-relaxed">
              {c.openPositionsSubtitle}
            </p>
          </div>

          <div className="max-w-6xl mx-auto space-y-6">
            {loadingJobs ? (
              <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                <Loader2 className="size-8 animate-spin text-neutral-400" />
                <p className="text-sm mt-3">Loading open positions...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 border border-dashed rounded-2xl bg-white p-8">
                We do not have any open positions at the moment. Please check back later!
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 bg-white border border-neutral-100/80 rounded-2xl shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_35px_-5px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 gap-3"
                >
                  <div className="space-y-3 flex-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-100">
                      {job.department}
                    </span>
                    <h3 className="text-xl font-bold text-neutral-900 hover:text-purple-900 transition-colors">
                      {job.title}
                    </h3>
                    <p className="text-xs text-neutral-500 leading-relaxed ">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-neutral-500 pt-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-neutral-400" />
                        <span>{job.locations.join(', ')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-neutral-400" />
                        <span>{job.experience}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4 text-neutral-400" />
                        <span>{job.type}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center md:self-center">
                    <Link
                      href={`/careers/${job.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-purple-900 hover:bg-purple-950 px-6 py-3 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all w-full md:w-auto hover:gap-3"
                    >
                      <span>View & Apply</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
