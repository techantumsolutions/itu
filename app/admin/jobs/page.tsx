'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  Briefcase,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Download,
  Loader2,
  FileText,
  Building,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  FileUp,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

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
  is_active: boolean
  created_at: string
  about_role?: string | null
}

interface Application {
  id: string
  job_id: string
  name: string
  email: string
  phone: string | null
  cover_letter: string | null
  resume_url: string | null
  status: string
  created_at: string
  careers_jobs: {
    title: string
    department: string
  } | null
}

function PointsEditor({
  label,
  points,
  onChange,
  placeholder = 'Add a new point',
  layout = 'list',
}: {
  label: string
  points: string[]
  onChange: (newPoints: string[]) => void
  placeholder?: string
  layout?: 'list' | 'pills'
}) {
  const [newValue, setNewValue] = useState('')

  const handleAdd = () => {
    if (!newValue.trim()) return
    onChange([...points, newValue.trim()])
    setNewValue('')
  }

  return (
    <div className="space-y-2 border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 shadow-xs">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-neutral-800 uppercase tracking-wide">{label}</Label>
      </div>
      <div className="flex gap-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={placeholder}
          className="text-xs bg-white h-9 rounded-xl border-neutral-200/80"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <Button
          type="button"
          onClick={handleAdd}
          className="bg-purple-900 hover:bg-purple-950 text-white font-bold text-xs px-4 h-9 rounded-xl shrink-0"
        >
          Add
        </Button>
      </div>
      {points.length > 0 && (
        layout === 'pills' ? (
          <div className="flex flex-wrap gap-2 mt-2 max-h-[140px] overflow-y-auto pr-1">
            {points.map((point, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-800 border border-purple-100 rounded-full px-3 py-1 text-xs font-semibold select-none"
              >
                <span>{point}</span>
                <button
                  type="button"
                  onClick={() => onChange(points.filter((_, i) => i !== idx))}
                  className="text-purple-600 hover:text-purple-950 focus:outline-none transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
            {points.map((point, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-xl border border-neutral-100 text-xs text-neutral-700 shadow-2xs"
              >
                <span className="truncate">{point}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10 shrink-0 rounded-lg"
                  onClick={() => {
                    onChange(points.filter((_, i) => i !== idx))
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

export default function AdminJobsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  // Auth gate
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      toast.error('Admins only')
      router.replace('/account')
    }
  }, [user, router])

  // Data states
  const [jobs, setJobs] = useState<Job[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingApps, setLoadingApps] = useState(true)

  // Filters
  const [jobsSearch, setJobsSearch] = useState('')
  const [appsSearch, setAppsSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('all')

  // Job Modal form state
  const [jobModalOpen, setJobModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDepartment, setFormDepartment] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formLocations, setFormLocations] = useState('') // comma separated
  const [formExperience, setFormExperience] = useState('')
  const [formType, setFormType] = useState('Full-Time')
  const [formBudget, setFormBudget] = useState('')
  const [formAboutRole, setFormAboutRole] = useState('')
  const [formResponsibilities, setFormResponsibilities] = useState<string[]>([''])
  const [formSkills, setFormSkills] = useState<string[]>([''])
  const [formOptionalSkills, setFormOptionalSkills] = useState<string[]>([''])
  const [formWhatWeOffer, setFormWhatWeOffer] = useState<string[]>([''])
  const [formJdUrl, setFormJdUrl] = useState<string | null>(null)
  const [formIsActive, setFormIsActive] = useState(true)

  // Application Modal state
  const [appModalOpen, setAppModalOpen] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  // Load jobs
  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const res = await fetch('/api/admin/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const data = await res.json()
      setJobs(data.jobs || [])
    } catch (e) {
      toast.error('Could not load jobs')
    } finally {
      setLoadingJobs(false)
    }
  }, [])

  // Load applications
  const fetchApplications = useCallback(async () => {
    setLoadingApps(true)
    try {
      const res = await fetch('/api/admin/applications')
      if (!res.ok) throw new Error('Failed to fetch applications')
      const data = await res.json()
      setApplications(data.applications || [])
    } catch (e) {
      toast.error('Could not load applications')
    } finally {
      setLoadingApps(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      void fetchJobs()
      void fetchApplications()
    }
  }, [user, fetchJobs, fetchApplications])

  // Open Modal for Create Job
  const handleOpenCreateJob = () => {
    setEditingJob(null)
    setFormTitle('')
    setFormDepartment('')
    setFormDescription('')
    setFormLocations('')
    setFormExperience('')
    setFormType('Full-Time')
    setFormBudget('')
    setFormAboutRole('')
    setFormResponsibilities([''])
    setFormSkills([''])
    setFormOptionalSkills([''])
    setFormWhatWeOffer([''])
    setFormJdUrl(null)
    setFormIsActive(true)
    setJobModalOpen(true)
  }

  // Open Modal for Edit Job
  const handleOpenEditJob = (job: Job) => {
    setEditingJob(job)
    setFormTitle(job.title)
    setFormDepartment(job.department)
    setFormDescription(job.description)
    setFormLocations(job.locations.join(', '))
    setFormExperience(job.experience)
    setFormType(job.type || 'Full-Time')
    setFormBudget(job.budget)
    setFormAboutRole(job.about_role || '')
    setFormResponsibilities(job.responsibilities && job.responsibilities.length > 0 ? job.responsibilities : [''])
    setFormSkills(job.skills && job.skills.length > 0 ? job.skills : [''])
    setFormOptionalSkills(job.optional_skills && job.optional_skills.length > 0 ? job.optional_skills : [''])
    setFormWhatWeOffer(job.what_we_offer && job.what_we_offer.length > 0 ? job.what_we_offer : [''])
    setFormJdUrl(job.jd_url)
    setFormIsActive(job.is_active)
    setJobModalOpen(true)
  }

  // Handle JD File Upload
  const handleJdUpload = async (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormJdUrl(reader.result)
        toast.success('JD file uploaded successfully')
      }
    }
    reader.onerror = () => {
      toast.error('Failed to read JD file')
    }
    reader.readAsDataURL(file)
  }

  // Save Job (Insert / Update)
  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formTitle.trim() || !formDepartment.trim() || !formDescription.trim()) {
      toast.error('Please fill in title, department, and description')
      return
    }

    const payload = {
      title: formTitle.trim(),
      department: formDepartment.trim(),
      description: formDescription.trim(),
      locations: formLocations.split(',').map((l) => l.trim()).filter(Boolean),
      experience: formExperience.trim(),
      type: formType,
      budget: formBudget.trim(),
      about_role: formAboutRole.trim(),
      responsibilities: formResponsibilities.map((l) => l.trim()).filter(Boolean),
      skills: formSkills.map((l) => l.trim()).filter(Boolean),
      optional_skills: formOptionalSkills.map((l) => l.trim()).filter(Boolean),
      what_we_offer: formWhatWeOffer.map((l) => l.trim()).filter(Boolean),
      jd_url: formJdUrl,
      is_active: formIsActive,
    }

    try {
      const url = editingJob ? `/api/admin/jobs?id=${editingJob.id}` : '/api/admin/jobs'
      const method = editingJob ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Save failed')

      toast.success(editingJob ? 'Job updated' : 'Job created')
      setJobModalOpen(false)
      void fetchJobs()
    } catch (err) {
      toast.error('Failed to save job')
    }
  }

  // Toggle Job Active Status
  const handleToggleActive = async (job: Job) => {
    try {
      const res = await fetch(`/api/admin/jobs?id=${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !job.is_active }),
      })
      if (!res.ok) throw new Error()
      toast.success(job.is_active ? 'Job deactivated' : 'Job activated')
      void fetchJobs()
    } catch (e) {
      toast.error('Failed to update job status')
    }
  }

  // Delete Job
  const handleDeleteJob = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job? All associated applications will be deleted.')) return

    try {
      const res = await fetch(`/api/admin/jobs?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Job deleted successfully')
      void fetchJobs()
      void fetchApplications() // sync deleted FK applications
    } catch (e) {
      toast.error('Failed to delete job')
    }
  }

  // Update Application Status
  const handleUpdateAppStatus = async (appId: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/applications?id=${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Application marked as ${status}`)
      void fetchApplications()
      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp((prev) => (prev ? { ...prev, status } : null))
      }
    } catch (e) {
      toast.error('Failed to update application status')
    }
  }

  // Filters calculation
  const filteredJobs = jobs.filter((j) => {
    const q = jobsSearch.toLowerCase()
    return (
      j.title.toLowerCase().includes(q) ||
      j.department.toLowerCase().includes(q) ||
      j.locations.some((l) => l.toLowerCase().includes(q))
    )
  })

  const filteredApps = applications.filter((a) => {
    const q = appsSearch.toLowerCase()
    const matchesQuery =
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.careers_jobs?.title || '').toLowerCase().includes(q)
    const matchesJob = jobFilter === 'all' || a.job_id === jobFilter

    return matchesQuery && matchesJob
  })

  if (!user) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Jobs & Careers Management</h1>
        <p className="text-muted-foreground">Manage open positions and track job applications received.</p>
      </div>

      <Tabs defaultValue="jobs" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="jobs" className="gap-2">
            <Briefcase className="h-4 w-4" />
            <span>Job Openings</span>
          </TabsTrigger>
          <TabsTrigger value="apps" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Applications</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Job Openings */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={jobsSearch}
                onChange={(e) => setJobsSearch(e.target.value)}
                placeholder="Search jobs by title, department, location…"
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreateJob} className="sm:shrink-0 gap-2">
              <Plus className="size-4" />
              Add Job Opening
            </Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
            {loadingJobs ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-muted-foreground">
                No job openings found. Click &quot;Add Job Opening&quot; to list your first vacancy.
              </div>
            ) : (
              <Table className="table-fixed w-full min-w-[900px]">
                <TableHeader className="bg-neutral-50/75 border-b border-neutral-200/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px] font-semibold text-neutral-900 px-4 py-3.5">Title</TableHead>
                    <TableHead className="w-[150px] font-semibold text-neutral-900 px-4 py-3.5">Department</TableHead>
                    <TableHead className="w-[180px] font-semibold text-neutral-900 px-4 py-3.5">Locations</TableHead>
                    <TableHead className="w-[120px] font-semibold text-neutral-900 px-4 py-3.5">Type</TableHead>
                    <TableHead className="w-[100px] font-semibold text-neutral-900 px-4 py-3.5">Status</TableHead>
                    <TableHead className="w-[150px] font-semibold text-neutral-900 px-4 py-3.5">Created</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold text-neutral-900 px-4 py-3.5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} className="group hover:bg-neutral-50/50 transition-colors">
                      <TableCell className="px-4 py-4 truncate font-medium text-neutral-900">
                        {job.title}
                        {job.jd_url && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            <FileText className="h-3 w-3" /> JD
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-sm text-neutral-500">{job.department}</TableCell>
                      <TableCell className="px-4 py-4 text-sm text-neutral-500 truncate">
                        {job.locations.join(', ')}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-sm text-neutral-500">{job.type}</TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={job.is_active}
                            onCheckedChange={() => void handleToggleActive(job)}
                          />
                          <span className={`text-xs font-semibold ${job.is_active ? 'text-green-600' : 'text-neutral-500'}`}>
                            {job.is_active ? 'Active' : 'Draft'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-sm text-neutral-500">
                        {format(new Date(job.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-xl h-8 w-8 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                            onClick={() => handleOpenEditJob(job)}
                          >
                            <Pencil className="size-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-xl h-8 w-8 text-destructive hover:bg-destructive/10 transition-all"
                            onClick={() => void handleDeleteJob(job.id)}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Applications */}
        <TabsContent value="apps" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={appsSearch}
                onChange={(e) => setAppsSearch(e.target.value)}
                placeholder="Search candidate name, email, job title…"
                className="pl-9"
              />
            </div>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Filter by Job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Openings</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-elevated-sm">
            {loadingApps ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-muted-foreground">
                No applications received yet.
              </div>
            ) : (
              <Table className="table-fixed w-full min-w-[900px]">
                <TableHeader className="bg-neutral-50/75 border-b border-neutral-200/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[180px] font-semibold text-neutral-900 px-4 py-3.5">Candidate</TableHead>
                    <TableHead className="w-[200px] font-semibold text-neutral-900 px-4 py-3.5">Job Applied</TableHead>
                    <TableHead className="w-[120px] font-semibold text-neutral-900 px-4 py-3.5">Status</TableHead>
                    <TableHead className="w-[150px] font-semibold text-neutral-900 px-4 py-3.5">Applied Date</TableHead>
                    <TableHead className="w-[120px] font-semibold text-neutral-900 px-4 py-3.5">Resume</TableHead>
                    <TableHead className="w-[100px] text-right font-semibold text-neutral-900 px-4 py-3.5">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApps.map((app) => (
                    <TableRow key={app.id} className="group hover:bg-neutral-50/50 transition-colors">
                      <TableCell className="px-4 py-4">
                        <div className="font-medium text-neutral-900">{app.name}</div>
                        <div className="text-xs text-neutral-500 truncate">{app.email}</div>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="text-sm text-neutral-900 font-medium truncate">{app.careers_jobs?.title || 'Unknown Job'}</div>
                        <div className="text-xs text-neutral-500">{app.careers_jobs?.department || '—'}</div>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${app.status === 'accepted'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : app.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : app.status === 'reviewed'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                        >
                          {app.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-sm text-neutral-500">
                        {format(new Date(app.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        {app.resume_url ? (
                          <a
                            href={app.resume_url}
                            download={`Resume_${app.name.replace(/\s+/g, '_')}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" /> Resume
                          </a>
                        ) : (
                          <span className="text-xs text-neutral-400">None</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl h-8 w-8 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                          onClick={() => {
                            setSelectedApp(app)
                            setAppModalOpen(true)
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Sheet Sidebar: Create or Edit Job Opening */}
      <Sheet open={jobModalOpen} onOpenChange={setJobModalOpen}>
        <SheetContent className="sm:max-w-2xl md:max-w-3xl w-full h-full overflow-y-auto flex flex-col p-6 border-l shadow-2xl">
          <SheetHeader className="border-b pb-4 mb-2">
            <SheetTitle>{editingJob ? 'Edit Job Opening' : 'Create Job Opening'}</SheetTitle>
            <SheetDescription>
              Configure the vacancy parameters and requirements side-by-side.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveJob} className="space-y-5 py-2 flex-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="title" className="text-xs font-bold text-neutral-700">Job Title *</Label>
                <Input
                  id="title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Technical Writer"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="department" className="text-xs font-bold text-neutral-700">Department *</Label>
                <Input
                  id="department"
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  placeholder="e.g. Product"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="type" className="text-xs font-bold text-neutral-700">Job Type *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger id="type" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-Time">Full-Time</SelectItem>
                    <SelectItem value="Part-Time">Part-Time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="experience" className="text-xs font-bold text-neutral-700">Experience Level *</Label>
                <Input
                  id="experience"
                  value={formExperience}
                  onChange={(e) => setFormExperience(e.target.value)}
                  placeholder="e.g. 3-5 Years"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="postingStatus" className="text-xs font-bold text-neutral-700">Posting Status *</Label>
                <Select
                  value={formIsActive ? 'active' : 'draft'}
                  onValueChange={(val) => setFormIsActive(val === 'active')}
                >
                  <SelectTrigger id="postingStatus" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Visible Publicly)</SelectItem>
                    <SelectItem value="draft">Draft (Hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="budget" className="text-xs font-bold text-neutral-700">Budget Range (optional)</Label>
                <Input
                  id="budget"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  placeholder="e.g. ₹6L - ₹10L"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs font-bold text-neutral-700">Short Card Description *</Label>
              <Textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Briefly state what this role entails. Shown on job listing cards."
                rows={2}
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="aboutRole" className="text-xs font-bold text-neutral-700">Full "About the Role" *</Label>
              <Textarea
                id="aboutRole"
                value={formAboutRole}
                onChange={(e) => setFormAboutRole(e.target.value)}
                placeholder="Provide a comprehensive introduction to the role, responsibilities, culture, and team structure."
                rows={4}
                required
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-1">
              <PointsEditor
                label="Role Requirements (Required Skills) *"
                points={formSkills}
                onChange={setFormSkills}
                placeholder="e.g. Strong knowledge of Node.js & NestJS"
                layout="pills"
              />
              <PointsEditor
                label="Key Responsibilities *"
                points={formResponsibilities}
                onChange={setFormResponsibilities}
                placeholder="e.g. Collaborate with cross-functional teams"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-1">
              <PointsEditor
                label="Optional Skills"
                points={formOptionalSkills}
                onChange={setFormOptionalSkills}
                placeholder="e.g. Experience with AWS / Docker"
                layout="pills"
              />
              <PointsEditor
                label="What We Offer"
                points={formWhatWeOffer}
                onChange={setFormWhatWeOffer}
                placeholder="e.g. Competitive Salary & Health Perks"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="locations" className="text-xs font-bold text-neutral-700">Job Locations (Comma separated) *</Label>
                <Input
                  id="locations"
                  value={formLocations}
                  onChange={(e) => setFormLocations(e.target.value)}
                  placeholder="e.g. Bangalore, Remote"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-neutral-700">JD Document (PDF/Doc/Text)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="cursor-pointer text-xs"
                    onChange={(e) => void handleJdUpload(e.target.files?.[0])}
                  />
                  {formJdUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive shrink-0"
                      onClick={() => setFormJdUrl(null)}
                      title="Clear JD"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background pb-2">
              <Button type="button" variant="outline" onClick={() => setJobModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-purple-900 hover:bg-purple-950 text-white font-bold px-6">
                Save Job Opening
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Dialog: View Candidate Application Details */}
      <Dialog open={appModalOpen} onOpenChange={setAppModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          {selectedApp && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle>Job Application Details</DialogTitle>
                    <DialogDescription>
                      Review candidate submission for the role: <strong>{selectedApp.careers_jobs?.title || 'Unknown'}</strong>
                    </DialogDescription>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${selectedApp.status === 'accepted'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : selectedApp.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : selectedApp.status === 'reviewed'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                  >
                    {selectedApp.status}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-3">
                <div className="grid gap-4 border-b pb-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Candidate Name</Label>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">{selectedApp.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Email Address</Label>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">{selectedApp.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Phone Number</Label>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">{selectedApp.phone || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Applied Date</Label>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                      {format(new Date(selectedApp.created_at), 'MMMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Cover Letter</Label>
                  <div className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 rounded-xl border p-4 max-h-[200px] overflow-y-auto leading-relaxed">
                    {selectedApp.cover_letter || 'Candidate did not submit a cover letter.'}
                  </div>
                </div>

                {selectedApp.resume_url && (
                  <div className="flex items-center justify-between border-t pt-3 bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs font-semibold text-blue-900">Resume Attached</p>
                        <p className="text-[10px] text-blue-500">Base64 Encoded Document</p>
                      </div>
                    </div>
                    <a
                      href={selectedApp.resume_url}
                      download={`Resume_${selectedApp.name.replace(/\s+/g, '_')}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Resume
                    </a>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Application Status Actions</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-blue-200 text-blue-700 bg-blue-50/20 hover:bg-blue-50/80 gap-1.5"
                      onClick={() => void handleUpdateAppStatus(selectedApp.id, 'reviewed')}
                    >
                      Mark Reviewed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-green-200 text-green-700 bg-green-50/20 hover:bg-green-50/80 gap-1.5"
                      onClick={() => void handleUpdateAppStatus(selectedApp.id, 'accepted')}
                    >
                      Accept Candidate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-rose-200 text-rose-700 bg-rose-50/20 hover:bg-rose-50/80 gap-1.5"
                      onClick={() => void handleUpdateAppStatus(selectedApp.id, 'rejected')}
                    >
                      Reject Candidate
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2 border-t">
                <Button onClick={() => setAppModalOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
