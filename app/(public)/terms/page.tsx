'use client'

import React from 'react'
import { useCMSStore } from '@/lib/cms-store'

export default function TermsPage() {
  const { content } = useCMSStore()
  const terms = content.termsPage

  // Filter active sections and sort by display order
  const activeSections = (terms?.sections ?? [])
    .filter((sec) => sec.isActive)
    .sort((a, b) => a.order - b.order)

  if (!terms) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-white">
        <p className="text-muted-foreground">Loading Terms & Conditions...</p>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-white text-neutral-800 font-sans">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">

        {/* Header */}
        <div className="space-y-4 text-center md:text-left border-b border-neutral-100 pb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1d2d5b]">
            {terms.title}
          </h1>
          {terms.subtitle && (
            <p className="text-neutral-400 text-sm md:text-base">
              {terms.subtitle}
            </p>
          )}
          {terms.introText && (
            <p className="text-neutral-600 leading-relaxed text-[15px] pt-2">
              {terms.introText}
            </p>
          )}
        </div>

        {/* List of Points */}
        <div className="mt-10 space-y-10">
          {activeSections.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              No terms points published yet.
            </div>
          ) : (
            activeSections.map((sec, idx) => (
              <div
                key={sec.id}
                className="space-y-3 border-b border-neutral-500 pb-8 last:border-b-0 last:pb-0"
              >
                {/* Numbered Header */}
                <h2 className="text-xl font-bold text-[#1d2d5b] flex items-baseline gap-2">
                  <span className="text-neutral-400 font-medium text-lg">{idx + 1}.</span>
                  <span>{sec.title}</span>
                </h2>

                {/* Description content */}
                <div
                  className="max-w-none text-[15px] leading-relaxed text-neutral-700 pl-6
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ul]:my-4
                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_ol]:my-4
                    [&_li]:text-neutral-700
                    [&_strong]:text-neutral-900 [&_strong]:font-bold"
                  dangerouslySetInnerHTML={{ __html: sec.content }}
                />
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
