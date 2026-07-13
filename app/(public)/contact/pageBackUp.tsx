'use client'

import { useState } from 'react'
import { MapPin, Phone, Mail, CheckCircle, Loader2 } from 'lucide-react'
import { useCMSStore } from '@/lib/cms-store'

export default function ContactPage() {
  const { content } = useCMSStore()

  // Local form states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // CMS configuration fallbacks
  const c = content?.contactPage || {
    heroTitle: 'Recharge Mobile Phones Anywhere\nIn The World',
    heroSubtitle: '',
    heroBgImage: '',
    addressTitle: 'Address Line',
    addressLine1: 'ITU GmbH',
    addressLine2: 'Friedrichstraße 123, 10117 Berlin',
    addressLine3: 'Germany',
    phoneTitle: 'Phone Number',
    phoneLine1: '+49 30 1234 5678',
    phoneLine2: '+49 89 5678 5432',
    emailTitle: 'Mail Address',
    emailLine1: 'www.support@itu.com',
    emailLine2: 'www.info@itu.com',
    formTitle: 'Book An Appointment',
    formButtonText: 'SEND A MESSAGE',
    mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d155452.3789069389!2d13.259929283733005!3d52.506970146039535!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47a84e373f035901%3A0x42120465b5e3b70!2sBerlin%2C%20Germany!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin',
  }

  const heroBg = c.heroBgImage || '/contact/herobanner.png'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !subject) {
      setSubmitError('Please fill in all required fields.')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    setSubmitSuccess(false)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          subject,
          phone,
          message,
        }),
      })

      if (res.ok) {
        setSubmitSuccess(true)
        setName('')
        setEmail('')
        setSubject('')
        setPhone('')
        setMessage('')
      } else {
        const data = await res.json()
        setSubmitError(data.error || 'Failed to submit message.')
      }
    } catch (err) {
      setSubmitError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen ">

      {/* 1. Hero Section */}
      <section
        className="relative flex items-center justify-center min-h-[90vh] bg-cover bg-center bg-no-repeat pt-32 pb-20 text-white"
        style={{
          backgroundImage: `url(${heroBg})`,
        }}
      >
        {/* <div className="absolute inset-0 bg-gradient-to-b from-blue-950/70 via-slate-900/60 to-neutral-50/40" /> */}

        <div className="relative z-10 max-w-5xl px-6 text-center space-y-2">
          <h1 className="text-2xl md:text-4xl  font-bold tracking-tight leading-tight whitespace-pre-line text-white">
            {c.heroTitle}
          </h1>
          {c.heroSubtitle && (
            <p className="text-md md:text-2xl text-blue-200 font-light max-w-2xl mx-auto leading-relaxed">
              {c.heroSubtitle}
            </p>
          )}
        </div>
      </section>

      {/* 2. Contact Cards Section */}
      <section className="py-10 max-w-6xl mx-auto w-full px-4">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Address */}
          <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-neutral-100 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] transition-all duration-300 min-h-[220px]">
            <div className="flex items-center justify-center size-14 mb-5">
              <img src="/contact/location.png" alt="Location" className="size-full object-contain" />
            </div>
            <h3 className="text-lg font-bold text-[#1e3a8a] mb-2">{c.addressTitle}</h3>
            <p className="text-sm text-neutral-500 leading-relaxed font-medium">{c.addressLine1}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{c.addressLine2}</p>
            <p className="text-xs text-neutral-400">{c.addressLine3}</p>
          </div>

          {/* Card 2: Phone */}
          <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-neutral-100 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] transition-all duration-300 min-h-[220px]">
            <div className="flex items-center justify-center size-14 mb-5">
              <img src="/contact/phone.png" alt="Phone" className="size-full object-contain" />
            </div>
            <h3 className="text-lg font-bold text-[#1e3a8a] mb-2">{c.phoneTitle}</h3>
            <p className="text-sm text-neutral-500 leading-relaxed font-medium">{c.phoneLine1}</p>
            {c.phoneLine2 && (
              <p className="text-sm text-neutral-500 leading-relaxed font-medium mt-0.5">{c.phoneLine2}</p>
            )}
          </div>

          {/* Card 3: Email */}
          <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-neutral-100 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] transition-all duration-300 min-h-[220px]">
            <div className="flex items-center justify-center size-14 mb-5">
              <img src="/contact/email.png" alt="Email" className="size-full object-contain" />
            </div>
            <h3 className="text-lg font-bold text-[#1e3a8a] mb-2">{c.emailTitle}</h3>
            <p className="text-sm text-neutral-500 leading-relaxed font-medium">{c.emailLine1}</p>
            {c.emailLine2 && (
              <p className="text-sm text-neutral-500 leading-relaxed font-medium mt-0.5">{c.emailLine2}</p>
            )}
          </div>
        </div>
      </section>

      {/* 3. Form & Map Section */}
      <section className="max-w-6xl mx-auto w-full px-4  py-10">
        <div className="bg-white border border-neutral-100/80 rounded-3xl p-6 sm:p-8 md:p-10 shadow-[0_15px_50px_-15px_rgba(0,0,0,0.03)]">
          <div className="grid gap-10 md:grid-cols-2 items-stretch">

            {/* Map column */}
            <div className="w-full min-h-[350px] md:min-h-full rounded-2xl overflow-hidden border border-neutral-100 relative bg-neutral-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
              {c.mapEmbedUrl ? (
                <iframe
                  title="Office Location Map"
                  src={c.mapEmbedUrl}
                  className="absolute inset-0 size-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
                  Map configuration is missing.
                </div>
              )}
            </div>

            {/* Form column */}
            <div className="flex flex-col justify-center space-y-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-[#1e3a8a] tracking-tight">
                  {c.formTitle}
                </h2>
              </div>

              {submitSuccess ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 border border-green-100 bg-green-50/50 rounded-2xl text-center space-y-3">
                  <CheckCircle className="size-12 text-green-500" />
                  <h3 className="text-lg font-bold text-green-800">Thank You!</h3>
                  <p className="text-sm text-green-700 max-w-sm">
                    Your appointment request has been submitted successfully. A representative will contact you shortly.
                  </p>
                  <button
                    onClick={() => setSubmitSuccess(false)}
                    className="mt-2 text-xs font-semibold text-[#1e3a8a] underline hover:text-blue-800"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {submitError && (
                    <div className="p-3.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-100 rounded-xl">
                      {submitError}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Name */}
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your Name"
                        className="w-full px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-sm text-neutral-800 border border-transparent focus:border-blue-500/30 rounded-xl outline-none transition-all placeholder:text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                    </div>
                    {/* Email */}
                    <div className="space-y-1">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email Address"
                        className="w-full px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-sm text-neutral-800 border border-transparent focus:border-blue-500/30 rounded-xl outline-none transition-all placeholder:text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Subject */}
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Enter Subject"
                        className="w-full px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-sm text-neutral-800 border border-transparent focus:border-blue-500/30 rounded-xl outline-none transition-all placeholder:text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                    </div>
                    {/* Phone */}
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter Phone"
                        className="w-full px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-sm text-neutral-800 border border-transparent focus:border-blue-500/30 rounded-xl outline-none transition-all placeholder:text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-1">
                    <textarea
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Write a Message"
                      className="w-full px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white text-sm text-neutral-800 border border-transparent focus:border-blue-500/30 rounded-xl outline-none transition-all placeholder:text-neutral-400 resize-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-[#1e3a8a] hover:bg-[#1b347d] text-white text-xs font-bold tracking-wider rounded-xl transition-all shadow-md shadow-blue-900/10 hover:shadow-lg disabled:opacity-75 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="size-4 animate-spin text-white/80" />}
                    {c.formButtonText.toUpperCase()}
                  </button>
                </form>
              )}
            </div>

          </div>
        </div>
      </section>

    </div>
  )
}
