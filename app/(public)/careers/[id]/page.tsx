'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  MapPin,
  Clock,
  Briefcase,
  DollarSign,
  FileText,
  Download,
  Loader2,
  CheckCircle,
  Check,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { countriesList, getFlagEmoji, isValidPhoneNumber } from '@/lib/country-codes'

interface Job {
  id: string
  title: string
  department: string
  description: string
  locations: string[]
  experience: string
  type: string
  budget: string
  responsibilities: string[]
  skills: string[]
  optional_skills: string[]
  what_we_offer: string[]
  jd_url: string | null
  about_role?: string | null
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)

  // Form states
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [openCountry, setOpenCountry] = useState(false)
  const [selectedCountryCode, setSelectedCountryCode] = useState('IN')
  const [selectedDialCode, setSelectedDialCode] = useState('91')
  const [formCoverLetter, setFormCoverLetter] = useState('')
  const [formResumeUrl, setFormResumeUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch job details
  useEffect(() => {
    async function loadJob() {
      try {
        const res = await fetch(`/api/jobs/${id}`)
        if (res.ok) {
          const data = await res.json()
          setJob(data.job)
        } else {
          toast.error('Job listing not found')
          router.replace('/careers')
        }
      } catch (err) {
        toast.error('Failed to load job details')
      } finally {
        setLoading(false)
      }
    }
    void loadJob()
  }, [id, router])

  // Process Resume Upload (convert to base64)
  const handleResumeUpload = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormResumeUrl(reader.result)
        toast.success('Resume file uploaded successfully')
      }
    }
    reader.onerror = () => {
      toast.error('Failed to read resume file')
    }
    reader.readAsDataURL(file)
  }

  // Handle Application Submit
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formName.trim() || !formEmail.trim()) {
      toast.error('Please enter name and email')
      return
    }

    if (!formResumeUrl) {
      toast.error('Please upload your resume')
      return
    }

    let formattedPhone: string | null = null
    if (formPhone.trim()) {
      const cleaned = formPhone.trim().replace(/\D/g, '')
      if (!isValidPhoneNumber(cleaned, selectedCountryCode)) {
        toast.error('Please enter a valid mobile number for the selected country')
        return
      }
      formattedPhone = `+${selectedDialCode}${cleaned}`
    }

    setSubmitting(true)

    const payload = {
      job_id: id,
      name: formName.trim(),
      email: formEmail.trim(),
      phone: formattedPhone,
      cover_letter: formCoverLetter.trim() || null,
      resume_url: formResumeUrl,
    }

    try {
      const res = await fetch('/api/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error()

      setSuccess(true)
      toast.success('Application submitted successfully!')
    } catch (err) {
      toast.error('Failed to submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-neutral-500 bg-white">
        <Loader2 className="size-8 animate-spin text-neutral-400" />
        <p className="text-sm mt-3">Loading job details...</p>
      </div>
    )
  }

  if (!job) return null

  return (
    <div className="min-h-screen bg-neutral-50/30 py-12">
      <div className="max-w-6xl mx-auto px-3 space-y-8">
        {/* Back Link */}
        <Link
          href="/careers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Open Positions</span>
        </Link>

        {/* Header Information Card */}
        <div className="px-6 py-4 md:px-8 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-neutral-100 pb-6">
            <div className="space-y-0">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-100">
                {job.department}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-950 mt-0">
                {job.title}
              </h1>
            </div>
            {job.jd_url && (
              <a
                href={job.jd_url}
                download={`Job_Description_${job.title.replace(/\s+/g, '_')}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 px-4 py-2.5 text-xs font-bold text-neutral-800 transition-all border"
              >
                <Download className="h-4 w-4" />
                <span>Download official JD</span>
              </a>
            )}
          </div>

          {/* Job Badges grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-neutral-50 border">
              <MapPin className="h-5 w-5 text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Locations</p>
                <p className="text-xs font-semibold text-neutral-800 truncate mt-0.5">{job.locations.join(', ')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-neutral-50 border">
              <Clock className="h-5 w-5 text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Experience</p>
                <p className="text-xs font-semibold text-neutral-800 truncate mt-0.5">{job.experience}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-neutral-50 border">
              <Briefcase className="h-5 w-5 text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Job Type</p>
                <p className="text-xs font-semibold text-neutral-800 truncate mt-0.5">{job.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-neutral-50 border">
              <DollarSign className="h-5 w-5 text-neutral-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Compensation</p>
                <p className="text-xs font-semibold text-neutral-800 truncate mt-0.5">{job.budget}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Job description & Lists grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {/* Left Column: Requirements & Info */}
          <div className="md:col-span-2 space-y-6">
            {/* Description */}
            <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2 border-b pb-2">
                <FileText className="h-5 w-5 text-purple-700" />
                <span>About the Role</span>
              </h2>
              <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                {job.about_role || job.description}
              </p>
            </div>

            {/* Responsibilities */}
            {job.responsibilities.length > 0 && (
              <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-neutral-900 border-b pb-2">Key Responsibilities</h2>
                <ul className="space-y-3 list-disc pl-5">
                  {job.responsibilities.map((item, idx) => (
                    <li key={idx} className="text-sm text-neutral-600 leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Required Skills */}
            {job.skills.length > 0 && (
              <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-neutral-900 border-b pb-2">Required Skills & Experience</h2>
                <div className="flex flex-wrap gap-2 pt-1">
                  {job.skills.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center bg-purple-50 text-purple-800 border border-purple-100 rounded-full px-3 py-1 text-xs font-semibold select-none"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Skills */}
            {job.optional_skills.length > 0 && (
              <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-neutral-900 border-b pb-2">Preferred / Optional Skills</h2>
                <div className="flex flex-wrap gap-2 pt-1">
                  {job.optional_skills.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center bg-neutral-50 text-neutral-700 border border-neutral-200/60 rounded-full px-3 py-1 text-xs font-semibold select-none"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* What we offer */}
            {job.what_we_offer.length > 0 && (
              <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-neutral-900 border-b pb-2">What We Offer</h2>
                <ul className="space-y-3 list-disc pl-5">
                  {job.what_we_offer.map((item, idx) => (
                    <li key={idx} className="text-sm text-neutral-600 leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right Column: Apply Form */}
          <div className="space-y-6">
            <div className="p-6 bg-white border border-neutral-100/80 rounded-3xl shadow-sm sticky top-6 space-y-6">
              {success ? (
                <div className="text-center py-8 space-y-4">
                  <div className="flex justify-center">
                    <CheckCircle className="h-14 w-14 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900">Application Submitted!</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Thank you for applying. Our recruiting team will review your application and contact you soon.
                  </p>
                  <Button
                    onClick={() => router.push('/careers')}
                    className="w-full mt-4"
                  >
                    View other jobs
                  </Button>
                </div>
              ) : (
                <>
                  <div className="border-b pb-3">
                    <h2 className="text-lg font-bold text-neutral-900">Apply for this Role</h2>
                    <p className="text-xs text-neutral-400 mt-1">Please fill out candidate information.</p>
                  </div>

                  <form onSubmit={handleApply} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="candName" className="text-xs font-bold text-neutral-700">Full Name *</Label>
                      <Input
                        id="candName"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="John Doe"
                        required
                        disabled={submitting}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="candEmail" className="text-xs font-bold text-neutral-700">Email Address *</Label>
                      <Input
                        id="candEmail"
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="john.doe@example.com"
                        required
                        disabled={submitting}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="candPhone" className="text-xs font-bold text-neutral-700">Phone Number (optional)</Label>
                      <div className="flex gap-2">
                        <Popover open={openCountry} onOpenChange={setOpenCountry}>
                          <PopoverTrigger asChild disabled={submitting}>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={openCountry}
                              className="flex h-10 items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 shrink-0 min-w-[110px] justify-between shadow-none"
                            >
                              <span className="truncate">
                                {selectedCountryCode ? `${getFlagEmoji(selectedCountryCode)} +${selectedDialCode}` : `+${selectedDialCode}`}
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search country or code..." />
                              <CommandList>
                                <CommandEmpty>No country found.</CommandEmpty>
                                <CommandGroup>
                                  {countriesList.map((c) => (
                                    <CommandItem
                                      key={c.code}
                                      value={`${c.name} ${c.code} ${c.dialCode}`}
                                      onSelect={() => {
                                        setSelectedDialCode(c.dialCode)
                                        setSelectedCountryCode(c.code)
                                        setOpenCountry(false)
                                      }}
                                      className="flex items-center justify-between py-2 cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-base">{c.flag}</span>
                                        <span className="font-medium text-neutral-900">{c.name}</span>
                                        <span className="text-neutral-400 font-normal">(+{c.dialCode})</span>
                                      </div>
                                      {selectedCountryCode === c.code && (
                                        <Check className="h-4 w-4 text-purple-600" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <Input
                          id="candPhone"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          placeholder="99999 99999"
                          disabled={submitting}
                          className="h-10 rounded-xl flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="candCover" className="text-xs font-bold text-neutral-700">Cover Letter (optional)</Label>
                      <Textarea
                        id="candCover"
                        value={formCoverLetter}
                        onChange={(e) => setFormCoverLetter(e.target.value)}
                        placeholder="Why are you a great fit for this job?"
                        rows={3}
                        disabled={submitting}
                      />
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs font-bold text-neutral-700">Upload Resume (PDF/Word/Text) *</Label>
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        className="cursor-pointer text-xs"
                        onChange={(e) => void handleResumeUpload(e.target.files?.[0])}
                        required
                        disabled={submitting}
                      />
                      {formResumeUrl && (
                        <p className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
                          ✓ Resume uploaded successfully
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-purple-900 hover:bg-purple-950 text-white font-bold h-11 rounded-xl transition-all"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <span>Submit Application</span>
                      )}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
