'use client'

import React, { useState } from 'react'
import { useCMSStore } from '@/lib/cms-store'

export default function PrivacyPage() {
  const { content } = useCMSStore()
  const privacy = content.privacyPage

  // Filter active sections and sort by order
  const activeSections = (privacy?.sections ?? [])
    .filter((sec) => sec.isActive)
    .sort((a, b) => a.order - b.order)

  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    return activeSections[0]?.id || ''
  })

  // Find the selected section
  const activeSection = activeSections.find((sec) => sec.id === activeSectionId) || activeSections[0]

  if (!privacy) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-white">
        <p className="text-muted-foreground">Loading Privacy Notice...</p>
      </div>
    )
  }

  return (
    <div className=" bg-white text-neutral-800 font-sans">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="grid gap-12 md:grid-cols-12">

          {/* Left Column: Sidebar Navigation */}
          <div className="md:col-span-4 lg:col-span-3 border-r border-neutral-100 pr-0 md:pr-8">
            <nav className="flex flex-col space-y-0 sticky top-24">
              {activeSections.map((sec) => {
                const isSelected = sec.id === (activeSection?.id || '')
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSectionId(sec.id)}
                    className={`w-full text-left py-4 border-b border-neutral-100 transition-all text-[15px] leading-snug cursor-pointer ${isSelected
                      ? 'text-[#1d2d5b] font-bold'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50/50'
                      }`}
                  >
                    {sec.question}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Right Column: Main Content Area */}
          <div className="md:col-span-8 lg:col-span-9 space-y-8 min-h-[500px]">
            {/* Page Header */}
            <div className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1d2d5b]">
                {privacy.title}
              </h1>
              {privacy.introText && (
                <p className="text-neutral-600 leading-relaxed text-[15px]">
                  {privacy.introText}
                </p>
              )}
            </div>

            {/* Selected Section Details */}
            {activeSection ? (
              <div className="pt-6 border-t border-neutral-100">
                <div
                  className="max-w-none text-[15px] leading-relaxed text-neutral-700 space-y-4
                    [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-[#1d2d5b] [&_h1]:mt-6 [&_h1]:mb-3
                    [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#1d2d5b] [&_h2]:mt-6 [&_h2]:mb-3
                    [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#1d2d5b] [&_h3]:mt-4 [&_h3]:mb-2
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ul]:my-4
                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_ol]:my-4
                    [&_li]:text-neutral-700
                    [&_strong]:text-neutral-900 [&_strong]:font-bold"
                  dangerouslySetInnerHTML={{ __html: activeSection.answer }}
                />
              </div>
            ) : (
              <div className="py-12 text-center text-neutral-400">
                No content available for this section.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
