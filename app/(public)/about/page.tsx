'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCMSStore } from '@/lib/cms-store'
import { OperatorsMarquee } from '@/components/operators-marquee'

export default function AboutPage() {
  const { content } = useCMSStore()

  // Fallback defaults matching mockup design and images
  const c = content?.aboutPage || {
    heroTitle: 'Connecting Families Across Borders Through\nInstant Mobile Recharge',
    heroSubtitle: 'From Germany to over 180+ countries, ITU makes it simple, secure, and instant to recharge mobile phones worldwide through trusted telecom partners.',
    heroBgImage: '',
    whoWeAreTitle: 'Who we are',
    whoWeArePara1: 'ITU is a global digital platform that enables customers to instantly recharge prepaid mobile phones across the world.',
    whoWeArePara2: "Whether you're supporting family, helping friends stay connected, or sending airtime internationally, ITU provides a fast, secure, and reliable experience backed by trusted telecom operators worldwide.",
    whoWeArePara3: 'Built in Germany and serving customers globally, we focus on making international mobile recharge effortless.',
    whoWeAreImage: '',
    pill1Title: 'Fast',
    pill1Desc: 'Instant top-ups in seconds',
    pill1Icon: '',
    pill2Title: 'Secure',
    pill2Desc: 'Safe and encrypted transactions',
    pill2Icon: '',
    pill3Title: 'Global',
    pill3Desc: '180+ countries worldwide',
    pill3Icon: '',
    pill4Title: 'Reliable',
    pill4Desc: 'Trusted by millions everyday',
    pill4Icon: '',
    stat1Count: '180',
    stat1Label: 'COUNTRIES',
    stat2Count: '700+',
    stat2Label: 'MOBILE OPERATORS',
    stat3Icon: '',
    stat3Label: '24/7 SUPPORT',
    networkTitle: 'Our Global network',
    networkSubtitle: 'PARTNERING WITH TRUSTED TELECOM OPERATORS ACROSS THE GLOBE',
    networkDesc: 'Delivering seamless international mobile recharge services through a reliable network of leading telecom operators across Germany, India, USA, UK, Canada, Nigeria, Brazil, Philippines, Mexico, Australia, and major regions including the Middle East, Africa, Asia, Europe, and South America.',
    operatorsTitle: 'Trusted by leading telecom operators',
    operatorLogo1: '',
    operatorLogo2: '',
    operatorLogo3: '',
    operatorLogo4: '',
    operatorLogo5: '',
    operatorLogo6: '',
    teamTitle: 'What Our Team Says',
    teamSubtitle: 'Hear from the people who make our company great',
    teamQuotes: [
      {
        id: 'team-1',
        name: 'Tosin',
        role: 'Senior Product Manager',
        quote: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cursus nibh mauris, nec turpis orci lectus maecenas. Suspendisse sed magna eget nibh in turpis. Consequat duis diam lacus arcu. Fauclbus venenatis felis id augue sit cursus pellentesque enim arcu.',
        image: ''
      },
      {
        id: 'team-2',
        name: 'Tosin',
        role: 'Senior Product Manager',
        quote: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cursus nibh mauris, nec turpis orci lectus maecenas. Suspendisse sed magna eget nibh in turpis. Consequat duis diam lacus arcu. Fauclbus venenatis felis id augue sit cursus pellentesque enim arcu.',
        image: ''
      }
    ],
    appStoreImage: '',
    googlePlayImage: '',
    promoTitle: 'Download the ITU App',
    promoSubtitle: 'Top-up wherever, whenever',
    promoDesc: 'Recharge anytime, anywhere with just a few taps.',
  }

  const heroBg = c.heroBgImage || '/about/herobanner.png'
  const sectionTwoImage = c.whoWeAreImage || '/about/sectionTwoLeft.png'

  // Team Quote Carousel State
  const [carouselIndex, setCarouselIndex] = useState(0)
  const quotes = c.teamQuotes && c.teamQuotes.length > 0 ? c.teamQuotes : [
    {
      id: 'team-1',
      name: 'Tosin',
      role: 'Senior Product Manager',
      quote: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cursus nibh mauris, nec turpis orci lectus maecenas. Suspendisse sed magna eget nibh in turpis. Consequat duis diam lacus arcu. Fauclbus venenatis felis id augue sit cursus pellentesque enim arcu.',
      image: ''
    }
  ]

  const handleNextQuote = () => {
    setCarouselIndex((prev) => (prev + 1) % quotes.length)
  }

  const handlePrevQuote = () => {
    setCarouselIndex((prev) => (prev - 1 + quotes.length) % quotes.length)
  }

  // Calculate items to show: up to 2 items
  const activeQuote1 = quotes[carouselIndex]
  const activeQuote2 = quotes[(carouselIndex + 1) % quotes.length]

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* SECTION 1: Hero Section */}
      <section
        className="relative flex items-center justify-center min-h-[90vh] bg-cover bg-center bg-no-repeat pt-32 pb-20 text-white"
        style={{ backgroundImage: `url(${heroBg})` }}
      >
        <div className="absolute inset-0 bg-blue-950/70 via-slate-900/60 to-neutral-900/10" />

        <div className="relative z-10 max-w-5xl px-6 text-center space-y-4">
          <h1 className="text-3xl font-bold tracking-tight leading-tight whitespace-pre-line text-white">
            {c.heroTitle}
          </h1>
          {c.heroSubtitle && (
            <p className="text-sm  text-blue-200 font-light max-w-2xl mx-auto leading-relaxed">
              {c.heroSubtitle}
            </p>
          )}
        </div>
      </section>

      {/* SECTION 2: Who We Are Section */}
      <section className="py-10 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">

            {/* Left side illustration image */}
            <div className="flex justify-center">
              <div className="relative max-w-md w-full">
                <img
                  src={sectionTwoImage}
                  alt="Who We Are Left Graphic"
                  className="w-full h-auto object-contain rounded-3xl"
                />
              </div>
            </div>

            {/* Right side content */}
            <div className="space-y-6">
              <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
                {c.whoWeAreTitle}
              </h2>

              <div className="space-y-4 text-sm text-neutral-500 leading-relaxed font-light">
                <p>{c.whoWeArePara1}</p>
                <p>{c.whoWeArePara2}</p>
                <p>{c.whoWeArePara3}</p>
              </div>

              {/* 4 circular feature pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">

                {/* Pill 1 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center size-14 rounded-full bg-[#d8ddf1] mb-3 p-2">
                    <img
                      src={c.pill1Icon || '/about/One.png'}
                      alt={c.pill1Title}
                      className="size-full object-contain"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">{c.pill1Title}</h4>
                  <p className="text-[10px] text-neutral-400 mt-1 leading-snug">{c.pill1Desc}</p>
                </div>

                {/* Pill 2 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center size-14 rounded-full bg-[#d8ddf1] mb-3 p-2">
                    <img
                      src={c.pill2Icon || '/about/Two.png'}
                      alt={c.pill2Title}
                      className="size-full object-contain h-[28px]"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">{c.pill2Title}</h4>
                  <p className="text-[10px] text-neutral-400 mt-1 leading-snug">{c.pill2Desc}</p>
                </div>

                {/* Pill 3 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center size-14 rounded-full bg-[#d8ddf1] mb-3 p-2">
                    <img
                      src={c.pill3Icon || '/about/Three.png'}
                      alt={c.pill3Title}
                      className="size-full object-contain"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">{c.pill3Title}</h4>
                  <p className="text-[10px] text-neutral-400 mt-1 leading-snug">{c.pill3Desc}</p>
                </div>

                {/* Pill 4 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center size-14 rounded-full bg-[#d8ddf1] mb-3 p-2">
                    <img
                      src={c.pill4Icon || '/about/Four.png'}
                      alt={c.pill4Title}
                      className="size-full object-contain"
                    />
                  </div>
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">{c.pill4Title}</h4>
                  <p className="text-[10px] text-neutral-400 mt-1 leading-snug">{c.pill4Desc}</p>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 3: Stats Section */}
      <section className="py-10 bg-[#f2f9ff] border-t border-b border-neutral-100/70">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 items-center divide-y md:divide-y-0 md:divide-x divide-[#rgb(201, 206, 211)] text-center py-4">

            {/* Metric 1 */}
            <div className="py-4 md:py-0">
              <span className="block text-4xl md:text-5xl font-bold text-red-500 tracking-tight">
                {c.stat1Count}
              </span>
              <span className="block text-xs font-bold tracking-wider text-neutral-500 mt-2 uppercase">
                {c.stat1Label}
              </span>
            </div>

            {/* Metric 2 */}
            <div className="py-4 md:py-0">
              <span className="block text-4xl md:text-5xl font-bold text-red-500 tracking-tight">
                {c.stat2Count}
              </span>
              <span className="block text-xs font-bold tracking-wider text-neutral-500 mt-2 uppercase">
                {c.stat2Label}
              </span>
            </div>

            {/* Metric 3 */}
            <div className="py-4 md:py-0 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center size-10 rounded-full mb-1 text-red-500">
                <img
                  src={c.stat3Icon || '/about/Icon.png'}
                  alt="Support Icon"
                  className="size-7 object-contain"
                />
              </div>
              <span className="block text-xs font-bold tracking-wider text-neutral-500 uppercase">
                {c.stat3Label}
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 4: Our Global Network Section */}
      <section className="py-10 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-3">
          <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {c.networkTitle}
          </h2>
          <span className="inline-block text-xs font-bold tracking-wider text-orange-500 uppercase">
            {c.networkSubtitle}
          </span>
          <p className="max-w-3xl mx-auto text-xs text-neutral-400 leading-relaxed font-light pt-1">
            {c.networkDesc}
          </p>
        </div>
      </section>

      {/* SECTION 5: Leading Telecom Operators Section */}
      <section className="py-10 bg-[#fff]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center ">
            <h3 className="text-2xl font-bold text-neutral-800 tracking-tight">
              {c.operatorsTitle}
            </h3>
          </div>

          <OperatorsMarquee
            logos={[
              { src: c.operatorLogo1 || '/about/logo1.png', alt: 'AT&T' },
              { src: c.operatorLogo2 || '/about/logo2.png', alt: 'CelcomDigi' },
              { src: c.operatorLogo3 || '/about/logo3.png', alt: 'Verizon' },
              { src: c.operatorLogo4 || '/about/logo4.png', alt: 'Airtel' },
              { src: c.operatorLogo5 || '/about/logo5.png', alt: 'Swisscom' },
              { src: c.operatorLogo6 || '/about/logo6.png', alt: 'Safaricom' },
            ]}
            variant="light"
            durationSec={32}
            className="!bg-transparent !border-0 [&_img]:grayscale [&_img]:opacity-80 hover:[&_img]:opacity-100 transition-all [&_img]:transition-all [&_img]:duration-300"
          />
        </div>
      </section>

      {/* SECTION 6: What Our Team Says Section */}
      <section className="py-10 bg-[#f0f4ff]">
        <div className="max-w-6xl mx-auto px-6">

          {/* Header */}
          <div className="text-center space-y-1.5 mb-10">
            <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
              {c.teamTitle}
            </h2>
            <p className="text-xs text-neutral-500 font-light">
              {c.teamSubtitle}
            </p>
          </div>

          {/* Slider Container */}
          <div className="relative flex items-center justify-between">

            {/* Prev Button */}
            {quotes.length > 1 && (
              <button
                onClick={handlePrevQuote}
                className="absolute left-[-20px] z-10 flex items-center justify-center size-10 rounded-full border bg-white shadow hover:bg-neutral-50/80 active:scale-95 transition-all text-neutral-500"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}

            {/* Slider cards wrapper */}
            <div className="grid gap-6 md:grid-cols-2 w-full px-6">

              {/* Card 1 */}
              {activeQuote1 && (
                <div className="bg-white border border-neutral-100/70 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row items-stretch">
                  <div className="sm:w-2/5 min-h-[160px] sm:min-h-full bg-neutral-100 relative">
                    <img
                      src={activeQuote1.image || '/about/team1.png'}
                      alt={activeQuote1.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                  </div>
                  <div className="sm:w-3/5 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-neutral-900 leading-tight">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      </h4>
                      <p className="text-xs text-neutral-500 leading-relaxed font-light">
                        {activeQuote1.quote}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e3a8a]">{activeQuote1.name}</span>
                      <span className="block text-[10px] text-neutral-400 mt-0.5">{activeQuote1.role}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 2 (Displays quote 2 on desktop or another copy) */}
              {activeQuote2 && (
                <div className="hidden md:flex bg-white border border-neutral-100/70 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.02)] flex-col sm:flex-row items-stretch">
                  <div className="sm:w-2/5 min-h-[160px] sm:min-h-full bg-neutral-100 relative">
                    <img
                      src={activeQuote2.image || '/about/team1.png'}
                      alt={activeQuote2.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                  </div>
                  <div className="sm:w-3/5 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-neutral-900 leading-tight">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      </h4>
                      <p className="text-xs text-neutral-500 leading-relaxed font-light">
                        {activeQuote2.quote}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#1e3a8a]">{activeQuote2.name}</span>
                      <span className="block text-[10px] text-neutral-400 mt-0.5">{activeQuote2.role}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Next Button */}
            {quotes.length > 1 && (
              <button
                onClick={handleNextQuote}
                className="absolute right-[-20px] z-10 flex items-center justify-center size-10 rounded-full border bg-white shadow hover:bg-neutral-50/80 active:scale-95 transition-all text-neutral-500"
              >
                <ChevronRight className="size-5" />
              </button>
            )}

          </div>

        </div>
      </section>

      {/* SECTION 7: App Download Banner Section (Mockup bottom) */}
      <section className="py-10 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
              {c.promoTitle || 'Download the ITU App'}
            </h2>
            <span className="block text-sm font-bold text-orange-500">
              {c.promoSubtitle || 'Top-up wherever, whenever'}
            </span>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto pt-1 font-light">
              {c.promoDesc || 'Recharge anytime, anywhere with just a few taps.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <a
              href="#"
              className="inline-block transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <img
                src={c.appStoreImage || '/about/Frame 427319059.png'}
                alt="Download on App Store"
                className="h-10 object-contain"
              />
            </a>
            <a
              href="#"
              className="inline-block transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <img
                src={c.googlePlayImage || '/about/Frame 327.png'}
                alt="Get it on Google Play"
                className="h-10 object-contain"
              />
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
