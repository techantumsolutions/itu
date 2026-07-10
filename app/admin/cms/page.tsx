'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCMSStore, FAQItem, PopularCountry } from '@/lib/cms-store'
import {
  Image as ImageIcon,
  Smartphone,
  HelpCircle,
  Globe,
  Settings,
  Save,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Eye,
  ExternalLink,
  CheckCircle2,
  GalleryHorizontal,
  Sparkles,
  ListChecks,
  Map,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
} from 'lucide-react'
import { RichTextEditor } from '@/components/admin/rich-text-editor'
import { PrivacyFaqItem, TermsSectionItem } from '@/lib/cms-store'
import Link from 'next/link'
import { ModulePermissionShell } from '@/components/admin/module-permission-shell'

function FooterLinksEditor({
  title,
  links,
  onChange,
}: {
  title: string
  links: { label: string; href: string }[]
  onChange: (newLinks: { label: string; href: string }[]) => void
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-2"
          data-perm="create"
          onClick={() => onChange([...links, { label: 'New Link', href: '/' }])}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <div className="space-y-3">
        {links.length === 0 && <p className="text-sm text-muted-foreground">No links added.</p>}
        {links.map((link, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={link.label}
              onChange={(e) => {
                const updated = [...links]
                updated[idx] = { ...link, label: e.target.value }
                onChange(updated)
              }}
              placeholder="Label"
              className="text-xs"
            />
            <Input
              value={link.href}
              onChange={(e) => {
                const updated = [...links]
                updated[idx] = { ...link, href: e.target.value }
                onChange(updated)
              }}
              placeholder="URL"
              className="text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive h-8 w-8"
              data-perm="delete"
              onClick={() => {
                const updated = links.filter((_, i) => i !== idx)
                onChange(updated)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CMSPage() {
  const tabsScrollRef = useRef<HTMLDivElement>(null)

  const scrollTabsLeft = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const scrollTabsRight = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

  const {
    content,
    isDirty,
    hasHydrated,
    setContent,
    updateHero,
    updateAuthPages,
    updateTopupCard,
    updateAppPromo,
    updateFAQ,
    updateCountriesSection,
    addFAQItem,
    updateFAQItem,
    deleteFAQItem,
    updatePopularCountries,
    updateTrustSection,
    updateHeader,
    updateFooter,
    updateOperatorsSlider,
    updateOperatorSliderItem,
    addOperatorSliderItem,
    deleteOperatorSliderItem,
    updateHowItWorks,
    updateHowItWorksStep,
    addHowItWorksStep,
    deleteHowItWorksStep,
    updateSectionThree,
    updateSectionThreeFeature,
    addSectionThreeFeature,
    deleteSectionThreeFeature,
    updateCountriesGrid,
    updateCountriesGridItem,
    addCountriesGridItem,
    deleteCountriesGridItem,
    resetToDefault,
    markClean,
    updateHelpPage,
    updateCareersPage,
    updateContactPage,
    updateAboutPage,
    updatePrivacyPage,
    updateTermsPage
  } = useCMSStore()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editingFAQ, setEditingFAQ] = useState<FAQItem | null>(null)
  const [newFAQ, setNewFAQ] = useState({ question: '', answer: '' })
  const [editingHelpFAQ, setEditingHelpFAQ] = useState<FAQItem | null>(null)
  const [newHelpFAQ, setNewHelpFAQ] = useState({ question: '', answer: '' })
  const [editingCountry, setEditingCountry] = useState<PopularCountry | null>(null)
  const [newCountry, setNewCountry] = useState({ code: '', name: '', flag: '', dialCode: '' })
  const [editingPrivacyItem, setEditingPrivacyItem] = useState<PrivacyFaqItem | null>(null)
  const [newPrivacy, setNewPrivacy] = useState({ question: '', answer: '', order: 1 })
  const [isAddPrivacyOpen, setIsAddPrivacyOpen] = useState(false)
  const [editingTermsItem, setEditingTermsItem] = useState<TermsSectionItem | null>(null)
  const [newTerms, setNewTerms] = useState({ title: '', content: '', order: 0 })
  const [isAddTermsOpen, setIsAddTermsOpen] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(content))

  const contentSnapshot = useMemo(() => JSON.stringify(content), [content])
  const hasUnsavedChanges = isDirty || contentSnapshot !== savedSnapshot

  useEffect(() => {
    // Keep the saved snapshot aligned with persisted CMS content after hydration/clean state.
    if (!isDirty && saveStatus !== 'saving') {
      setSavedSnapshot(contentSnapshot)
    }
  }, [contentSnapshot, isDirty, saveStatus])

  useEffect(() => {
    // Load published CMS from DB on page open, so what you edit is what every browser will see.
    if (!hasHydrated) return
    let cancelled = false
    void fetch('/api/cms', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cms'))))
      .then((data: { content?: unknown }) => {
        if (cancelled) return
        if (data?.content && typeof data.content === 'object') {
          setContent(data.content as any, { markDirty: false })
          markClean()
          setSavedSnapshot(JSON.stringify(data.content))
        }
      })
      .catch(() => {
        // ignore: keep local persisted/default CMS
      })
    return () => {
      cancelled = true
    }
  }, [hasHydrated, markClean, setContent])

  const fileToDataUrl = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  const handleUpload = async (file: File | undefined, onDone: (url: string) => void) => {
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    if (dataUrl) onDone(dataUrl)
  }

  const addPrivacyItem = () => {
    const currentSections = content.privacyPage?.sections ?? []
    const newId = 'p-' + Date.now()
    const updatedSections = [
      ...currentSections,
      {
        id: newId,
        question: newPrivacy.question,
        answer: newPrivacy.answer,
        order: Number(newPrivacy.order) || (currentSections.length + 1),
        isActive: true,
      }
    ]
    updatePrivacyPage({ sections: updatedSections })
    setNewPrivacy({ question: '', answer: '', order: currentSections.length + 2 })
  }

  const savePrivacyItem = (updatedItem: PrivacyFaqItem) => {
    const currentSections = content.privacyPage?.sections ?? []
    const updatedSections = currentSections.map((sec) =>
      sec.id === updatedItem.id ? updatedItem : sec
    )
    updatePrivacyPage({ sections: updatedSections })
    setEditingPrivacyItem(null)
  }

  const deletePrivacyItem = (id: string) => {
    const currentSections = content.privacyPage?.sections ?? []
    const updatedSections = currentSections.filter((sec) => sec.id !== id)
    updatePrivacyPage({ sections: updatedSections })
  }

  const addTermsItem = () => {
    const currentSections = content.termsPage?.sections ?? []
    const newId = 't-' + Date.now()
    const newItem: TermsSectionItem = {
      id: newId,
      title: newTerms.title,
      content: newTerms.content,
      order: Number(newTerms.order) === 0 ? 0 : (Number(newTerms.order) || 0),
      isActive: true,
    }

    const otherItems = [...currentSections].sort((a, b) => a.order - b.order)
    const targetOrder = Math.max(0, newItem.order)
    const updatedSections: TermsSectionItem[] = []

    let inserted = false
    for (let i = 0; i < otherItems.length; i++) {
      if (i === targetOrder) {
        updatedSections.push(newItem)
        inserted = true
      }
      updatedSections.push(otherItems[i])
    }
    if (!inserted) {
      updatedSections.push(newItem)
    }

    const finalSections = updatedSections.map((item, index) => ({
      ...item,
      order: index
    }))

    updateTermsPage({ sections: finalSections })
    setNewTerms({ title: '', content: '', order: finalSections.length })
  }

  const saveTermsItem = (updatedItem: TermsSectionItem) => {
    const currentSections = content.termsPage?.sections ?? []

    const otherItems = currentSections
      .filter((sec) => sec.id !== updatedItem.id)
      .sort((a, b) => a.order - b.order)

    const targetOrder = Math.max(0, updatedItem.order)
    const updatedSections: TermsSectionItem[] = []

    let inserted = false
    for (let i = 0; i < otherItems.length; i++) {
      if (i === targetOrder) {
        updatedSections.push(updatedItem)
        inserted = true
      }
      updatedSections.push(otherItems[i])
    }
    if (!inserted) {
      updatedSections.push(updatedItem)
    }

    const finalSections = updatedSections.map((item, index) => ({
      ...item,
      order: index
    }))

    updateTermsPage({ sections: finalSections })
    setEditingTermsItem(null)
  }

  const deleteTermsItem = (id: string) => {
    const currentSections = content.termsPage?.sections ?? []
    const updatedSections = currentSections
      .filter((sec) => sec.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        ...item,
        order: index
      }))
    updateTermsPage({ sections: updatedSections })
  }

  const handleSave = async () => {
    // Validate team quotes card fields
    const quotesList = content.aboutPage?.teamQuotes ?? []
    const hasEmptyField = quotesList.some(
      (q) => !q.name.trim() || !q.role.trim() || !q.quote.trim()
    )
    if (hasEmptyField) {
      alert("Please fill in Name, Role/Title, and Quote Text for all team quote cards before saving.")
      return
    }

    // Validate operator slider items (must have imageSrc)
    const operatorItems = content.operatorsSlider?.items ?? []
    const missingLogo = operatorItems.some((op) => !op.imageSrc || !op.imageSrc.trim())
    if (missingLogo) {
      alert("Please upload a logo image for all operator items before saving.")
      return
    }

    // Validate Mission & Features Section
    const s3 = content.sectionThree
    if (!s3.headlineLine1?.trim() || !s3.description?.trim()) {
      alert("Please fill in Headline line 1 and Description in the Mission & Features section before saving.")
      return
    }
    const s3Features = s3.features ?? []
    for (const feat of s3Features) {
      if (!feat.iconImageSrc || !feat.iconImageSrc.trim()) {
        alert("Please upload an icon for all columns in the Mission & Features section before saving.")
        return
      }
      if (!feat.titleAccent?.trim() && !feat.titleRest?.trim()) {
        alert("Please fill in at least one title field for all columns in the Mission & Features section before saving.")
        return
      }
    }

    // Validate How it works Section
    const how = content.howItWorks
    if (!how.title?.trim()) {
      alert("Please fill in the Title in the How it works section before saving.")
      return
    }
    const howSteps = how.steps ?? []
    for (const step of howSteps) {
      if (!step.imageSrc || !step.imageSrc.trim()) {
        alert("Please upload an image for all steps in the How it works section before saving.")
        return
      }
      if (!step.titleLine1?.trim()) {
        alert("Please fill in Line 1 title for all steps in the How it works section before saving.")
        return
      }
    }

    setSaveStatus('saving')
    try {
      const res = await fetch('/api/cms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('save')
      markClean()
      setSavedSnapshot(contentSnapshot)
      setSaveStatus('saved')
      try {
        window.localStorage.setItem('itu-cms-last-good', contentSnapshot)
      } catch {
        // ignore
      }
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
      // keep isDirty=true so user can retry
    }
  }

  return (
    <ModulePermissionShell module="cms" className="space-y-6 p-4 sm:p-5 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Website CMS</h1>
          <p className="text-muted-foreground">Manage all website content, images, and sections</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/" target="_blank" className="gap-2">
              <Eye className="h-4 w-4" />
              Preview Site
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2" data-perm="edit">
                <RotateCcw className="h-4 w-4" />
                Reset to Default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all content?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all website content to default values. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetToDefault}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={handleSave} disabled={saveStatus === 'saving'} className="gap-2" data-perm="edit">
            {saveStatus === 'saving' ? (
              <>Saving...</>
            ) : saveStatus === 'saved' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div className="bg-yellow-50  border border-yellow-200  rounded-lg p-3 text-sm text-yellow-800 ">
          You have unsaved changes. Click &quot;Save Changes&quot; to publish your updates.
        </div>
      )}

      <Tabs defaultValue="hero" className="space-y-6">
        <div className="relative flex items-center w-full border rounded-xl bg-neutral-50/50 p-1.5 shadow-sm">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute left-1 z-10 h-7 w-7 rounded-full bg-white shadow-sm border border-neutral-200/60 hover:bg-neutral-50 flex items-center justify-center shrink-0"
            onClick={scrollTabsLeft}
          >
            <ChevronLeft className="h-3.5 w-3.5 text-neutral-500" />
          </Button>

          <div
            ref={tabsScrollRef}
            className="w-full overflow-x-auto px-10 pb-0.5 scroll-smooth select-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <TabsList className="inline-flex w-max justify-start gap-1 bg-transparent p-0 border-0 shadow-none">
              <TabsTrigger value="hero" className="gap-2">
                <ImageIcon className="h-4 w-4" />
                <span>Hero</span>
              </TabsTrigger>
              {/* <TabsTrigger value="topup" className="gap-2">
                <Smartphone className="h-4 w-4" />
                <span>Top-up Card</span>
              </TabsTrigger> */}
              {/* <TabsTrigger value="countries" className="gap-2">
                <Globe className="h-4 w-4" />
                <span>Popular Countries</span>
              </TabsTrigger> */}

              <TabsTrigger value="help" className="gap-2">
                <LifeBuoy className="h-4 w-4" />
                <span>Help Page</span>
              </TabsTrigger>
              <TabsTrigger value="footer" className="gap-2">
                <Settings className="h-4 w-4" />
                <span>Footer</span>
              </TabsTrigger>
              <TabsTrigger value="careers" className="gap-2">
                <Sparkles className="h-4 w-4" />
                <span>Careers Page</span>
              </TabsTrigger>
              <TabsTrigger value="contact" className="gap-2">
                <Map className="h-4 w-4" />
                <span>Contact Page</span>
              </TabsTrigger>
              <TabsTrigger value="about" className="gap-2">
                <Sparkles className="h-4 w-4" />
                <span>About Page</span>
              </TabsTrigger>
              <TabsTrigger value="privacy" className="gap-2">
                <Shield className="h-4 w-4" />
                <span>Privacy Policy</span>
              </TabsTrigger>
              <TabsTrigger value="terms" className="gap-2">
                <FileText className="h-4 w-4" />
                <span>Terms & Conditions</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-1 z-10 h-7 w-7 rounded-full bg-white shadow-sm border border-neutral-200/60 hover:bg-neutral-50 flex items-center justify-center shrink-0"
            onClick={scrollTabsRight}
          >
            <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
          </Button>
        </div>

        {/* Hero Section */}
        <TabsContent value="hero" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hero Section</CardTitle>
              <CardDescription>
                Edit all hero copy and visuals. Images are upload-only (stored in the browser for this demo CMS).
              </CardDescription>
            </CardHeader>
            <CardContent className="hero-cms-fields space-y-4 [&_input:not([type=file]):not([type=color])]:rounded-full [&_input:not([type=file]):not([type=color])]:h-10 [&_textarea]:rounded-3xl [&_textarea]:min-h-[2.75rem] [&_button]:rounded-full">
              {/* Hero Banner & Text */}
              <div className="space-y-6 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">Hero Banner Image & Text</h3>

                <div className="grid gap-6 md:grid-cols-2">


                  <div className="space-y-2">
                    <Label>Hero banner / background image</Label>
                    <p className="text-xs text-muted-foreground">Main background banner image. Clear to restore the default globe asset.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        key={content.hero.backgroundImage || 'empty-bg'}
                        type="file"
                        accept="image/*"
                        className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ backgroundImage: url }))}
                      />
                      {content.hero.backgroundImage && (
                        <Button type="button" variant="destructive" size="sm" data-perm="edit" onClick={() => updateHero({ backgroundImage: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {content.hero.sectionBgColor && (
                      <p className="text-xs font-medium text-amber-500">
                        Warning: This image is currently hidden on the website because a Section Background Color is set below. Clear the color to show this image.
                      </p>
                    )}
                    {(content.hero.backgroundImage || content.hero.overlayGradient) && (
                      <div className="relative mt-3 h-24 w-40 overflow-hidden rounded-lg border shadow-sm">
                        {content.hero.backgroundImage ? (
                          <img src={content.hero.backgroundImage} alt="Hero preview" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center bg-muted p-2 text-center text-[10px] leading-tight text-muted-foreground">
                            Default globe<br />(no upload)
                          </div>
                        )}
                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${content.hero.overlayGradient}`} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Image Upload</Label>
                    <p className="text-xs text-muted-foreground">Clear for default.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        key={content.hero.phonesImage || 'empty-phones'}
                        type="file"
                        accept="image/*"
                        className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ phonesImage: url }))}
                      />
                      {content.hero.phonesImage && (
                        <Button type="button" variant="destructive" size="sm" onClick={() => updateHero({ phonesImage: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {content.hero.phonesImage && (
                      <div className="relative mt-3 h-24 w-24 overflow-hidden rounded-lg border shadow-sm">
                        <img src={content.hero.phonesImage} alt="Phones preview" className="size-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 pt-4 border-t border-dashed">
                  <div className="space-y-2">
                    <Label htmlFor="hero-title">Hero Title</Label>
                    <Textarea
                      id="hero-title"
                      value={content.hero.title}
                      onChange={(e) => updateHero({ title: e.target.value })}
                      placeholder={'Line one\nLine two (accent)'}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Use a line break for the accent second line (when welcome back is off).</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hero-subtitle">Subtitle</Label>
                    <Input
                      id="hero-subtitle"
                      value={content.hero.subtitle}
                      onChange={(e) => updateHero({ subtitle: e.target.value })}
                      placeholder="Supporting line under the headline"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hero-accent">Second line color for hero title (optional) (hex code)</Label>
                  <Input
                    id="hero-accent"
                    value={content.hero.accentLineColor}
                    onChange={(e) => updateHero({ accentLineColor: e.target.value })}
                    placeholder="#f15a2b or empty for default"
                    className="max-w-[16rem]"
                  />
                  <p className="text-xs text-muted-foreground">Styles the second line of the title.</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    id="hero-show-welcome-back"
                    checked={content.hero.showWelcomeBack}
                    onCheckedChange={(checked) => updateHero({ showWelcomeBack: checked })}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="hero-show-welcome-back" className="text-sm font-medium">Show welcome back message</Label>
                    <p className="text-xs text-muted-foreground">Displays a personalized greeting to logged-in users instead of the hero title.</p>
                  </div>
                </div>
              </div>

              {/* Top-up Card Settings */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">Top-up Card Configuration</h3>
                <div className="space-y-2">
                  <Label htmlFor="hero-card-helper">Card helper text</Label>
                  <Input
                    id="hero-card-helper"
                    value={content.hero.cardHelperText}
                    onChange={(e) => updateHero({ cardHelperText: e.target.value })}
                    placeholder="e.g. Enter the phone number..."
                  />
                  <p className="text-xs text-muted-foreground">Text displayed inside the top-up card above the input.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hero-cta">Hero primary button</Label>
                    <Input
                      id="hero-cta"
                      value={content.hero.ctaText}
                      onChange={(e) => updateHero({ ctaText: e.target.value })}
                      placeholder="Start top-up"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hero-cta-url">Button URL</Label>
                    <Input
                      id="hero-cta-url"
                      value={content.hero.ctaUrl}
                      onChange={(e) => updateHero({ ctaUrl: e.target.value })}
                      placeholder="/topup or https://..."
                    />
                  </div>
                </div>
              </div>

              {/* App Download Badges */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">App Download Prompts</h3>
                <div className="space-y-2">
                  <Label htmlFor="hero-store-title">Title above badges</Label>
                  <Input
                    id="hero-store-title"
                    value={content.hero.storeBadgesTitle ?? ''}
                    onChange={(e) => updateHero({ storeBadgesTitle: e.target.value })}
                    placeholder="e.g. Click here to download the ITU app"
                  />
                  <p className="text-xs text-muted-foreground">
                    Links use URLs from the App tab. Toggle visibility there with “Show App Store / Google Play”.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>App Store badge image (hero)</Label>
                    <p className="text-xs text-muted-foreground">Optional. Empty uses the built-in black badge.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        key={content.hero.heroAppStoreBadgeImage || 'empty-appstore'}
                        type="file"
                        accept="image/*"
                        className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ heroAppStoreBadgeImage: url }))}
                      />
                      {content.hero.heroAppStoreBadgeImage && (
                        <Button type="button" variant="destructive" size="sm" onClick={() => updateHero({ heroAppStoreBadgeImage: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {content.hero.heroAppStoreBadgeImage && (
                      <div className="relative mt-3 h-12 w-36 overflow-hidden rounded-lg border bg-black shadow-sm flex items-center justify-center p-1">
                        <img src={content.hero.heroAppStoreBadgeImage} alt="App Store badge preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Google Play badge image (hero)</Label>
                    <p className="text-xs text-muted-foreground">Optional. Empty uses the built-in black badge.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        key={content.hero.heroGooglePlayBadgeImage || 'empty-googleplay'}
                        type="file"
                        accept="image/*"
                        className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ heroGooglePlayBadgeImage: url }))}
                      />
                      {content.hero.heroGooglePlayBadgeImage && (
                        <Button type="button" variant="destructive" size="sm" onClick={() => updateHero({ heroGooglePlayBadgeImage: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {content.hero.heroGooglePlayBadgeImage && (
                      <div className="relative mt-3 h-12 w-36 overflow-hidden rounded-lg border bg-black shadow-sm flex items-center justify-center p-1">
                        <img src={content.hero.heroGooglePlayBadgeImage} alt="Google Play badge preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Background Options */}
              {/* <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">Hero Image & Colors</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hero-section-bg">Hero section background color (hex)</Label>
                    <Input
                      id="hero-section-bg"
                      value={content.hero.sectionBgColor}
                      onChange={(e) => updateHero({ sectionBgColor: e.target.value })}
                      placeholder="Empty = default navy token"
                    />
                    <p className="text-xs text-muted-foreground">Overrides the banner image if provided.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="hero-gradient">Overlay gradient (Tailwind classes)</Label>
                    <Input
                      id="hero-gradient"
                      value={content.hero.overlayGradient}
                      onChange={(e) => updateHero({ overlayGradient: e.target.value })}
                      placeholder="from-[var(--hero-navy)]/80 via-..."
                    />
                    <p className="text-xs text-muted-foreground">Applied as bg-gradient-to-b over the background image.</p>
                  </div>
                </div>


              </div> */}

              {/* 5. Settings */}
              {/* <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">5. General Settings</h3>
                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 px-4 py-3">
                  <div className="space-y-0.5 pr-4">
                    <Label>Show &quot;Welcome back&quot; for logged-in users</Label>
                    <p className="text-xs text-muted-foreground">Personalize the greeting when users are logged in.</p>
                  </div>
                  <Switch
                    className="data-[state=checked]:bg-primary shrink-0"
                    checked={content.hero.showWelcomeBack}
                    onCheckedChange={(checked) => updateHero({ showWelcomeBack: checked })}
                  />
                </div>
              </div> */}

              {/* 6. Auth Pages */}
              {/* <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <h3 className="font-semibold tracking-tight border-b pb-2">6. Auth Pages Configuration</h3>
                <div className="space-y-2">
                  <Label>Auth pages left image (Login / Register)</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload the left-side image shown on <code>/login</code> and <code>/register</code>. Clear to restore the default.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      key={content.authPages.leftImage || 'empty-auth'}
                      type="file"
                      accept="image/*"
                      className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAuthPages({ leftImage: url }))}
                    />
                    {content.authPages.leftImage && (
                      <Button type="button" variant="destructive" size="sm" onClick={() => updateAuthPages({ leftImage: '' })}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {content.authPages.leftImage ? (
                    <div className="mt-3 h-32 overflow-hidden rounded-xl border">
                      <img src={content.authPages.leftImage} alt="Auth pages left image preview" className="size-full object-cover" />
                    </div>
                  ) : null}
                </div>
              </div> */}

              {/* Operators Section */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold tracking-tight">Operators Section</h3>
                    {/* <p className="text-sm text-muted-foreground mt-1">
                      Logos scroll on the home page (navy strip under hero + framed strip next to the phone). Title and
                      body are kept for accessibility/SEO (sr-only on the site). Upload PNG/SVG/WebP per row; clearing an
                      upload uses the default bundled logo for that slot when available.
                    </p> */}
                  </div>
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    data-perm="create"
                    onClick={() =>
                      addOperatorSliderItem({ imageSrc: '', alt: 'Operator', isActive: true })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add logo
                  </Button>
                </div>
                <div className="space-y-6 pt-2">
                  {/* <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="op-section-title">Section title (screen reader / SEO)</Label>
                      <Input
                        id="op-section-title"
                        value={content.operatorsSlider.sectionTitle}
                        onChange={(e) => updateOperatorsSlider({ sectionTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="op-marquee-dur">Marquee duration (seconds)</Label>
                      <Input
                        id="op-marquee-dur"
                        type="number"
                        min={12}
                        max={120}
                        value={content.operatorsSlider.marqueeDurationSec}
                        onChange={(e) =>
                          updateOperatorsSlider({
                            marqueeDurationSec: Math.max(12, Number(e.target.value) || 42),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="op-section-body">Section body (screen reader / SEO)</Label>
                    <Textarea
                      id="op-section-body"
                      rows={3}
                      value={content.operatorsSlider.sectionBody}
                      onChange={(e) => updateOperatorsSlider({ sectionBody: e.target.value })}
                    />
                  </div> */}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Preview</TableHead>
                        <TableHead>Alt text</TableHead>
                        <TableHead className="w-40" data-perm-col="edit">Upload</TableHead>
                        <TableHead className="w-24" data-perm-col="edit">Active</TableHead>
                        <TableHead className="w-24">Order</TableHead>
                        <TableHead className="w-16" data-perm-col="delete" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {content.operatorsSlider.items
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40 p-1">
                                {row.imageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={row.imageSrc} alt="" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[10px] text-muted-foreground text-center">No image</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.alt}
                                onChange={(e) => updateOperatorSliderItem(row.id, { alt: e.target.value })}
                                placeholder="Brand name"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Input
                                  key={row.imageSrc || 'empty-op'}
                                  type="file"
                                  accept="image/*"
                                  className="text-xs"
                                  onChange={(e) =>
                                    void handleUpload(e.target.files?.[0], (url) =>
                                      updateOperatorSliderItem(row.id, { imageSrc: url }),
                                    )
                                  }
                                />
                                {row.imageSrc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => updateOperatorSliderItem(row.id, { imageSrc: '' })}
                                  >
                                    Clear upload
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={row.isActive}
                                onCheckedChange={(checked) =>
                                  updateOperatorSliderItem(row.id, { isActive: checked })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs"
                                value={row.order}
                                onChange={(e) => updateOperatorSliderItem(row.id, { order: Number(e.target.value) || 0 })}
                                title="Position Order"
                              />
                            </TableCell>
                            <TableCell data-perm-col="delete">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                data-perm="delete"
                                onClick={() => deleteOperatorSliderItem(row.id)}
                                aria-label="Remove row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mission & Features Section */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold tracking-tight">Mission & Features Section</h3>
                    {/* <p className="text-sm text-muted-foreground mt-1">
                      Centered headline, supporting paragraph, and three columns with uploadable icons. Each title has an
                      accent segment (brand colour) and a neutral segment.
                    </p> */}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2"
                    onClick={() =>
                      addSectionThreeFeature({
                        iconImageSrc: '',
                        titleAccent: 'New',
                        titleRest: 'Feature',
                        isActive: true,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add column
                  </Button>
                </div>
                <div className="space-y-6 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="s3-h1">Headline — line 1</Label>
                    <Input
                      id="s3-h1"
                      value={content.sectionThree.headlineLine1}
                      onChange={(e) => updateSectionThree({ headlineLine1: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-h2">Headline — line 2</Label>
                    <Input
                      id="s3-h2"
                      value={content.sectionThree.headlineLine2}
                      onChange={(e) => updateSectionThree({ headlineLine2: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-desc">Description</Label>
                    <Textarea
                      id="s3-desc"
                      rows={5}
                      value={content.sectionThree.description}
                      onChange={(e) => updateSectionThree({ description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-accent">Title accent colour (hex)</Label>
                    <Input
                      id="s3-accent"
                      value={content.sectionThree.titleAccentColor}
                      onChange={(e) => updateSectionThree({ titleAccentColor: e.target.value })}
                      placeholder="Empty = site brand red"
                    />
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Icon</TableHead>
                        <TableHead>Accent text</TableHead>
                        <TableHead>Rest of title</TableHead>
                        <TableHead className="w-44">Upload</TableHead>
                        <TableHead className="w-24" data-perm-col="edit">Active</TableHead>
                        <TableHead className="w-24">Order</TableHead>
                        <TableHead className="w-16" data-perm-col="delete" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {content.sectionThree.features
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-1">
                                {row.iconImageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={row.iconImageSrc} alt="" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[9px] text-muted-foreground text-center">Default</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.titleAccent}
                                onChange={(e) =>
                                  updateSectionThreeFeature(row.id, { titleAccent: e.target.value })
                                }
                                placeholder="Quick"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.titleRest}
                                onChange={(e) =>
                                  updateSectionThreeFeature(row.id, { titleRest: e.target.value })
                                }
                                placeholder="Easy Recharge"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Input
                                  key={row.iconImageSrc || 'empty-feat'}
                                  type="file"
                                  accept="image/*"
                                  className="text-xs"
                                  onChange={(e) =>
                                    void handleUpload(e.target.files?.[0], (url) =>
                                      updateSectionThreeFeature(row.id, { iconImageSrc: url }),
                                    )
                                  }
                                />
                                {row.iconImageSrc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => updateSectionThreeFeature(row.id, { iconImageSrc: '' })}
                                  >
                                    Clear upload
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={row.isActive}
                                onCheckedChange={(checked) =>
                                  updateSectionThreeFeature(row.id, { isActive: checked })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs"
                                value={row.order}
                                onChange={(e) => updateSectionThreeFeature(row.id, { order: Number(e.target.value) || 0 })}
                                title="Position Order"
                              />
                            </TableCell>
                            <TableCell data-perm-col="delete">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                data-perm="delete"
                                onClick={() => deleteSectionThreeFeature(row.id)}
                                aria-label="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* How it Works Section */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold tracking-tight">How it works Section</h3>
                    {/* <p className="text-sm text-muted-foreground mt-1">
                      The light-blue section showing 5 steps. Update the title/subtitle and upload an image per step.
                    </p> */}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-2"
                    onClick={() =>
                      addHowItWorksStep({
                        imageSrc: '',
                        titleLine1: 'New step',
                        titleLine2: '',
                        isActive: true,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add step
                  </Button>
                </div>
                <div className="space-y-6 pt-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="how-title">Title</Label>
                      <Input
                        id="how-title"
                        value={content.howItWorks.title}
                        onChange={(e) => updateHowItWorks({ title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="how-subtitle">Subtitle</Label>
                      <Input
                        id="how-subtitle"
                        value={content.howItWorks.subtitle}
                        onChange={(e) => updateHowItWorks({ subtitle: e.target.value })}
                      />
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Preview</TableHead>
                        <TableHead>Line 1</TableHead>
                        <TableHead>Line 2</TableHead>
                        <TableHead className="w-44">Upload</TableHead>
                        <TableHead className="w-24" data-perm-col="edit">Active</TableHead>
                        <TableHead className="w-24">Order</TableHead>
                        <TableHead className="w-16" data-perm-col="delete" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {content.howItWorks.steps
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40 p-1">
                                {row.imageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={row.imageSrc} alt="" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[10px] text-muted-foreground text-center">No image</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.titleLine1}
                                onChange={(e) => updateHowItWorksStep(row.id, { titleLine1: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.titleLine2}
                                onChange={(e) => updateHowItWorksStep(row.id, { titleLine2: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Input
                                  key={row.imageSrc || 'empty-how'}
                                  type="file"
                                  accept="image/*"
                                  className="text-xs"
                                  onChange={(e) =>
                                    void handleUpload(e.target.files?.[0], (url) =>
                                      updateHowItWorksStep(row.id, { imageSrc: url }),
                                    )
                                  }
                                />
                                {row.imageSrc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => updateHowItWorksStep(row.id, { imageSrc: '' })}
                                  >
                                    Clear upload
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={row.isActive}
                                onCheckedChange={(checked) => updateHowItWorksStep(row.id, { isActive: checked })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs"
                                value={row.order}
                                onChange={(e) => updateHowItWorksStep(row.id, { order: Number(e.target.value) || 0 })}
                                title="Position Order"
                              />
                            </TableCell>
                            <TableCell data-perm-col="delete">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                data-perm="delete"
                                onClick={() => deleteHowItWorksStep(row.id)}
                                aria-label="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Countries Grid Section */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold tracking-tight">Countries Grid Section</h3>
                    {/* <p className="text-sm text-muted-foreground mt-1">
                      Matches the “Where can you send mobile top-ups?” section. Upload flags and control the CTA label.
                      Operator counts on the site come from the live providers API per country code.
                    </p> */}
                  </div>
                  <Button
                    type="button"
                    className="shrink-0 gap-2"
                    data-perm="create"
                    onClick={() =>
                      addCountriesGridItem({
                        countryCode: 'US',
                        countryName: 'United States',
                        flagImageSrc: '',
                        isPopular: false,
                        isActive: true,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add tile
                  </Button>
                </div>
                <div className="space-y-6 pt-2">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2 md:col-span-1">
                      <Label htmlFor="cg-title">Title</Label>
                      <Input
                        id="cg-title"
                        value={content.countriesGrid.title}
                        onChange={(e) => updateCountriesGrid({ title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="cg-subtitle">Subtitle</Label>
                      <Input
                        id="cg-subtitle"
                        value={content.countriesGrid.subtitle}
                        onChange={(e) => updateCountriesGrid({ subtitle: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cg-cta">CTA label</Label>
                    <Input
                      id="cg-cta"
                      value={content.countriesGrid.ctaLabel}
                      onChange={(e) => updateCountriesGrid({ ctaLabel: e.target.value })}
                      placeholder="Recharge Now"
                    />
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Preview</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Country name</TableHead>
                        <TableHead className="w-44">Upload</TableHead>
                        <TableHead className="w-24">Popular</TableHead>
                        <TableHead className="w-24" data-perm-col="edit">Active</TableHead>
                        <TableHead className="w-24">Order</TableHead>
                        <TableHead className="w-16" data-perm-col="delete" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {content.countriesGrid.items
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex h-10 w-14 items-center justify-center overflow-hidden rounded border bg-muted/40 p-1">
                                {row.flagImageSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={row.flagImageSrc} alt="" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[10px] text-muted-foreground text-center">No flag</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.countryCode}
                                onChange={(e) => updateCountriesGridItem(row.id, { countryCode: e.target.value.toUpperCase() })}
                                maxLength={2}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={row.countryName}
                                onChange={(e) => updateCountriesGridItem(row.id, { countryName: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Input
                                  key={row.flagImageSrc || 'empty-flag'}
                                  type="file"
                                  accept="image/*"
                                  className="text-xs"
                                  onChange={(e) =>
                                    void handleUpload(e.target.files?.[0], (url) =>
                                      updateCountriesGridItem(row.id, { flagImageSrc: url }),
                                    )
                                  }
                                />
                                {row.flagImageSrc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => updateCountriesGridItem(row.id, { flagImageSrc: '' })}
                                  >
                                    Clear upload
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={row.isPopular}
                                onCheckedChange={(checked) => updateCountriesGridItem(row.id, { isPopular: checked })}
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={row.isActive}
                                onCheckedChange={(checked) => updateCountriesGridItem(row.id, { isActive: checked })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-16 h-8 text-xs"
                                value={row.order}
                                onChange={(e) => updateCountriesGridItem(row.id, { order: Number(e.target.value) || 0 })}
                                title="Position Order"
                              />
                            </TableCell>
                            <TableCell data-perm-col="delete">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                data-perm="delete"
                                onClick={() => deleteCountriesGridItem(row.id)}
                                aria-label="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* App Promo Section */}
              <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold tracking-tight">App Promo Section</h3>
                    {/* <p className="text-sm text-muted-foreground mt-1">
                      Last section on the home page: heading, orange accent line, body copy, store links, and the phone
                      graphic on the right. Leave the main image empty to use a simple built-in placeholder.
                    </p> */}
                  </div>
                </div>
                <div className="space-y-6 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="app-title">Main heading</Label>
                    <Input
                      id="app-title"
                      value={content.appPromo.title}
                      onChange={(e) => updateAppPromo({ title: e.target.value })}
                      placeholder="Download the ITU App"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app-accent">Accent line (orange)</Label>
                    <Input
                      id="app-accent"
                      value={content.appPromo.accentSubtitle ?? ''}
                      onChange={(e) => updateAppPromo({ accentSubtitle: e.target.value })}
                      placeholder="Top-up wherever, whenever"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app-subtitle">Supporting text</Label>
                    <Input
                      id="app-subtitle"
                      value={content.appPromo.subtitle}
                      onChange={(e) => updateAppPromo({ subtitle: e.target.value })}
                      placeholder="Recharge anytime, anywhere with just a few taps."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="app-gradient">Background gradient (Tailwind classes)</Label>
                    <Input
                      id="app-gradient"
                      value={content.appPromo.backgroundGradient}
                      onChange={(e) => updateAppPromo({ backgroundGradient: e.target.value })}
                      placeholder="from-[#e4ecf4] via-[#eef3f8] to-[#f2f6fb]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Phone / hero graphic (right column)</Label>
                    <p className="text-xs text-muted-foreground">Clear to use a simple built-in placeholder.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        key={content.appPromo.sectionImage || 'empty-section-image'}
                        type="file"
                        accept="image/*"
                        className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ sectionImage: url }))}
                      />
                      {content.appPromo.sectionImage && (
                        <Button type="button" variant="destructive" size="sm" onClick={() => updateAppPromo({ sectionImage: '' })}>
                          Remove
                        </Button>
                      )}
                    </div>
                    {content.appPromo.sectionImage && (
                      <div className="relative mt-3 h-32 w-32 overflow-hidden rounded-lg border shadow-sm flex items-center justify-center p-2 bg-muted/20">
                        <img src={content.appPromo.sectionImage} alt="Phone graphic preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>App Store badge image (optional)</Label>
                      <p className="text-xs text-muted-foreground">Uses built-in black badge if empty</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          key={content.appPromo.appStoreBadgeImage || 'empty-appstore-promo'}
                          type="file"
                          accept="image/*"
                          className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                          onChange={(e) =>
                            void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ appStoreBadgeImage: url }))
                          }
                        />
                        {content.appPromo.appStoreBadgeImage && (
                          <Button type="button" variant="destructive" size="sm" onClick={() => updateAppPromo({ appStoreBadgeImage: '' })}>
                            Remove
                          </Button>
                        )}
                      </div>
                      {content.appPromo.appStoreBadgeImage && (
                        <div className="relative mt-3 h-12 w-36 overflow-hidden rounded-lg border bg-black shadow-sm flex items-center justify-center p-1">
                          <img src={content.appPromo.appStoreBadgeImage} alt="App Store badge preview" className="max-h-full max-w-full object-contain" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Google Play badge image (optional)</Label>
                      <p className="text-xs text-muted-foreground">Uses built-in black badge if empty</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          key={content.appPromo.googlePlayBadgeImage || 'empty-googleplay-promo'}
                          type="file"
                          accept="image/*"
                          className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                          onChange={(e) =>
                            void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ googlePlayBadgeImage: url }))
                          }
                        />
                        {content.appPromo.googlePlayBadgeImage && (
                          <Button type="button" variant="destructive" size="sm" onClick={() => updateAppPromo({ googlePlayBadgeImage: '' })}>
                            Remove
                          </Button>
                        )}
                      </div>
                      {content.appPromo.googlePlayBadgeImage && (
                        <div className="relative mt-3 h-12 w-36 overflow-hidden rounded-lg border bg-black shadow-sm flex items-center justify-center p-1">
                          <img src={content.appPromo.googlePlayBadgeImage} alt="Google Play badge preview" className="max-h-full max-w-full object-contain" />
                        </div>
                      )}
                    </div>
                  </div>



                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">Show App Store Button</p>
                        <p className="text-xs text-muted-foreground">iOS download link</p>
                      </div>
                      <Switch
                        checked={content.appPromo.showAppStore}
                        onCheckedChange={(checked) => updateAppPromo({ showAppStore: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">Show Google Play Button</p>
                        <p className="text-xs text-muted-foreground">Android download link</p>
                      </div>
                      <Switch
                        checked={content.appPromo.showGooglePlay}
                        onCheckedChange={(checked) => updateAppPromo({ showGooglePlay: checked })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="appstore-url">App Store URL</Label>
                      <Input
                        id="appstore-url"
                        value={content.appPromo.appStoreUrl}
                        onChange={(e) => updateAppPromo({ appStoreUrl: e.target.value })}
                        placeholder="https://apps.apple.com/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="playstore-url">Google Play URL</Label>
                      <Input
                        id="playstore-url"
                        value={content.appPromo.googlePlayUrl}
                        onChange={(e) => updateAppPromo({ googlePlayUrl: e.target.value })}
                        placeholder="https://play.google.com/..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* FAQ Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>FAQ Section</CardTitle>
                  <CardDescription>Manage frequently asked questions</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-perm="create">
                      <Plus className="h-4 w-4" />
                      Add FAQ
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New FAQ</DialogTitle>
                      <DialogDescription>Create a new frequently asked question</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Question</Label>
                        <Input
                          value={newFAQ.question}
                          onChange={(e) => setNewFAQ({ ...newFAQ, question: e.target.value })}
                          placeholder="What is your question?"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Answer</Label>
                        <Textarea
                          value={newFAQ.answer}
                          onChange={(e) => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                          placeholder="Provide a detailed answer..."
                          rows={4}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          if (newFAQ.question && newFAQ.answer) {
                            addFAQItem({ ...newFAQ, isActive: true })
                            setNewFAQ({ question: '', answer: '' })
                          }
                        }}
                      >
                        Add FAQ
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="faq-title">Section title</Label>
                <Input
                  id="faq-title"
                  value={content.faq.title}
                  onChange={(e) => updateFAQ({ title: e.target.value })}
                  placeholder="FAQ"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-subtitle">Section intro (subtitle)</Label>
                <Textarea
                  id="faq-subtitle"
                  value={content.faq.subtitle ?? ''}
                  onChange={(e) => updateFAQ({ subtitle: e.target.value })}
                  placeholder="Short paragraph shown under the title on the landing page."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="faq-image">Optional section image</Label>
                <Input
                  id="faq-image"
                  value={content.faq.sectionImage || ''}
                  onChange={(e) => updateFAQ({ sectionImage: e.target.value })}
                  placeholder="https://..."
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateFAQ({ sectionImage: url }))}
                />
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead className="w-20" data-perm-col="edit">Active</TableHead>
                    <TableHead className="w-24" data-perm-col="edit">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.faq.items
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.question}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.answer}</p>
                        </TableCell>
                        <TableCell data-perm-col="edit">
                          <Switch
                            checked={item.isActive}
                            onCheckedChange={(checked) => updateFAQItem(item.id, { isActive: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" data-perm="edit" onClick={() => setEditingFAQ(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit FAQ</DialogTitle>
                                </DialogHeader>
                                {editingFAQ && (
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Question</Label>
                                      <Input
                                        value={editingFAQ.question}
                                        onChange={(e) => setEditingFAQ({ ...editingFAQ, question: e.target.value })}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Answer</Label>
                                      <Textarea
                                        value={editingFAQ.answer}
                                        onChange={(e) => setEditingFAQ({ ...editingFAQ, answer: e.target.value })}
                                        rows={4}
                                      />
                                    </div>
                                  </div>
                                )}
                                <DialogFooter>
                                  <Button
                                    onClick={() => {
                                      if (editingFAQ) {
                                        updateFAQItem(editingFAQ.id, editingFAQ)
                                        setEditingFAQ(null)
                                      }
                                    }}
                                  >
                                    Save Changes
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this FAQ item.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteFAQItem(item.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top-up Card */}
        <TabsContent value="topup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top-up Card</CardTitle>
              <CardDescription>Configure the main action card overlay</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="card-title">Card Title</Label>
                <Input
                  id="card-title"
                  value={content.topupCard.title}
                  onChange={(e) => updateTopupCard({ title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-placeholder">Input Placeholder</Label>
                <Input
                  id="card-placeholder"
                  value={content.topupCard.placeholder}
                  onChange={(e) => updateTopupCard({ placeholder: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="topup-section-image">Section / decorative image (optional)</Label>
                <Input
                  id="topup-section-image"
                  value={content.topupCard.sectionImage || ''}
                  onChange={(e) => updateTopupCard({ sectionImage: e.target.value })}
                  placeholder="https://..."
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateTopupCard({ sectionImage: url }))}
                />
              </div>
              {content.topupCard.sectionImage ? (
                <div className="relative h-40 overflow-hidden rounded-xl border">
                  <img src={content.topupCard.sectionImage} alt="Top-up section preview" className="h-full w-full object-cover" />
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="card-button">Button Text</Label>
                  <Input
                    id="card-button"
                    value={content.topupCard.buttonText}
                    onChange={(e) => updateTopupCard({ buttonText: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-color">Button Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="card-color"
                      type="color"
                      value={content.topupCard.buttonColor}
                      onChange={(e) => updateTopupCard({ buttonColor: e.target.value })}
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={content.topupCard.buttonColor}
                      onChange={(e) => updateTopupCard({ buttonColor: e.target.value })}
                      placeholder="#00b67a"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-3">Preview:</p>
                <div className="max-w-sm mx-auto bg-card rounded-xl p-4 shadow-lg">
                  <p className="text-center font-semibold mb-3">{content.topupCard.title}</p>
                  <div className="flex items-center border rounded-lg overflow-hidden bg-muted/30 mb-3">
                    <span className="px-3 py-2 border-r">🇮🇳</span>
                    <span className="px-3 py-2 text-muted-foreground">{content.topupCard.placeholder}</span>
                  </div>
                  <button
                    className="w-full py-2.5 rounded-lg text-white font-medium"
                    style={{ backgroundColor: content.topupCard.buttonColor }}
                  >
                    {content.topupCard.buttonText}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>



        {/* Popular Countries */}
        {/* <TabsContent value="countries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Popular Countries</CardTitle>
                  <CardDescription>Manage featured destination countries</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2" data-perm="create">
                      <Plus className="h-4 w-4" />
                      Add Country
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Popular Country</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Country Code</Label>
                          <Input
                            value={newCountry.code}
                            onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value.toUpperCase() })}
                            placeholder="IN"
                            maxLength={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Flag Emoji</Label>
                          <Input
                            value={newCountry.flag}
                            onChange={(e) => setNewCountry({ ...newCountry, flag: e.target.value })}
                            placeholder="🇮🇳"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Country Name</Label>
                        <Input
                          value={newCountry.name}
                          onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                          placeholder="India"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dial Code</Label>
                        <Input
                          value={newCountry.dialCode}
                          onChange={(e) => setNewCountry({ ...newCountry, dialCode: e.target.value })}
                          placeholder="+91"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          if (newCountry.code && newCountry.name) {
                            const maxOrder = Math.max(...content.popularCountries.map(c => c.order), 0)
                            updatePopularCountries([
                              ...content.popularCountries,
                              { ...newCountry, order: maxOrder + 1, isActive: true }
                            ])
                            setNewCountry({ code: '', name: '', flag: '', dialCode: '' })
                          }
                        }}
                      >
                        Add Country
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="countries-image">Countries Section Image URL</Label>
                <Input
                  id="countries-image"
                  value={content.countriesSection?.sectionImage || ''}
                  onChange={(e) => updateCountriesSection({ sectionImage: e.target.value })}
                  placeholder="https://..."
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateCountriesSection({ sectionImage: url }))}
                />
              </div>

              {content.countriesSection?.sectionImage && (
                <div className="relative h-40 overflow-hidden rounded-lg border">
                  <img
                    src={content.countriesSection.sectionImage}
                    alt="Countries section preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Dial Code</TableHead>
                    <TableHead className="w-20" data-perm-col="edit">Active</TableHead>
                    <TableHead className="w-24" data-perm-col="edit">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.popularCountries
                    .sort((a, b) => a.order - b.order)
                    .map((country) => (
                      <TableRow key={country.code}>
                        <TableCell>
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{country.flag}</span>
                            <span>{country.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{country.code}</TableCell>
                        <TableCell>{country.dialCode}</TableCell>
                        <TableCell data-perm-col="edit">
                          <Switch
                            checked={country.isActive}
                            onCheckedChange={(checked) => {
                              const updated = content.popularCountries.map(c =>
                                c.code === country.code ? { ...c, isActive: checked } : c
                              )
                              updatePopularCountries(updated)
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              updatePopularCountries(
                                content.popularCountries.filter(c => c.code !== country.code)
                              )
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent> */}



        {/* Help Page */}
        <TabsContent value="help" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Help Page</CardTitle>
              <CardDescription>
                Manage the main Help page content including quick links and help-specific FAQs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Header</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={content.helpPage.title}
                      onChange={(e) => updateHelpPage({ title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtitle</Label>
                    <Input
                      value={content.helpPage.subtitle}
                      onChange={(e) => updateHelpPage({ subtitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Search Placeholder</Label>
                    <Input
                      value={content.helpPage.searchPlaceholder}
                      onChange={(e) => updateHelpPage({ searchPlaceholder: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-semibold">Quick Links</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  {content.helpPage.quickLinks.map((link, idx) => (
                    <div key={link.id} className="space-y-3 rounded-xl border bg-muted/20 p-4">
                      <div className="font-semibold text-sm capitalize">{link.icon} Link</div>
                      <div className="space-y-2">
                        <Label className="text-xs">Title</Label>
                        <Input
                          value={link.title}
                          onChange={(e) => {
                            const updated = [...content.helpPage.quickLinks]
                            updated[idx] = { ...link, title: e.target.value }
                            updateHelpPage({ quickLinks: updated })
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Body</Label>
                        <Input
                          value={link.body}
                          onChange={(e) => {
                            const updated = [...content.helpPage.quickLinks]
                            updated[idx] = { ...link, body: e.target.value }
                            updateHelpPage({ quickLinks: updated })
                          }}
                        />
                      </div>
                      <div className="grid gap-2 grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs">Button Label</Label>
                          <Input
                            value={link.actionLabel}
                            onChange={(e) => {
                              const updated = [...content.helpPage.quickLinks]
                              updated[idx] = { ...link, actionLabel: e.target.value }
                              updateHelpPage({ quickLinks: updated })
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Button URL</Label>
                          <Input
                            value={link.actionHref}
                            onChange={(e) => {
                              const updated = [...content.helpPage.quickLinks]
                              updated[idx] = { ...link, actionHref: e.target.value }
                              updateHelpPage({ quickLinks: updated })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Help FAQs</h3>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-2" data-perm="create">
                        <Plus className="h-4 w-4" />
                        Add FAQ
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New FAQ</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Question</Label>
                          <Input
                            value={newHelpFAQ.question}
                            onChange={(e) => setNewHelpFAQ({ ...newHelpFAQ, question: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Answer</Label>
                          <Textarea
                            value={newHelpFAQ.answer}
                            onChange={(e) => setNewHelpFAQ({ ...newHelpFAQ, answer: e.target.value })}
                            rows={4}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => {
                            if (newHelpFAQ.question && newHelpFAQ.answer) {
                              updateHelpPage({
                                faqs: [
                                  ...content.helpPage.faqs,
                                  {
                                    id: `hf-${Date.now()}`,
                                    question: newHelpFAQ.question,
                                    answer: newHelpFAQ.answer,
                                    order: content.helpPage.faqs.length,
                                    isActive: true,
                                  }
                                ]
                              })
                              setNewHelpFAQ({ question: '', answer: '' })
                            }
                          }}
                        >
                          Add FAQ
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>FAQ Section Title</Label>
                    <Input
                      value={content.helpPage.faqTitle}
                      onChange={(e) => updateHelpPage({ faqTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>FAQ Section Subtitle</Label>
                    <Input
                      value={content.helpPage.faqSubtitle}
                      onChange={(e) => updateHelpPage({ faqSubtitle: e.target.value })}
                    />
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-20" data-perm-col="edit">Active</TableHead>
                      <TableHead className="w-24" data-perm-col="edit">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {content.helpPage.faqs
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <p className="font-medium">{item.question}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">{item.answer}</p>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={item.isActive}
                              onCheckedChange={(checked) => {
                                const updated = content.helpPage.faqs.map(f => f.id === item.id ? { ...f, isActive: checked } : f)
                                updateHelpPage({ faqs: updated })
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => setEditingHelpFAQ(item)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Edit FAQ</DialogTitle>
                                  </DialogHeader>
                                  {editingHelpFAQ && (
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <Label>Question</Label>
                                        <Input
                                          value={editingHelpFAQ.question}
                                          onChange={(e) => setEditingHelpFAQ({ ...editingHelpFAQ, question: e.target.value })}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Answer</Label>
                                        <Textarea
                                          value={editingHelpFAQ.answer}
                                          onChange={(e) => setEditingHelpFAQ({ ...editingHelpFAQ, answer: e.target.value })}
                                          rows={4}
                                        />
                                      </div>
                                    </div>
                                  )}
                                  <DialogFooter>
                                    <Button
                                      onClick={() => {
                                        if (editingHelpFAQ) {
                                          const updated = content.helpPage.faqs.map(f => f.id === editingHelpFAQ.id ? editingHelpFAQ : f)
                                          updateHelpPage({ faqs: updated })
                                          setEditingHelpFAQ(null)
                                        }
                                      }}
                                    >
                                      Save
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  const updated = content.helpPage.faqs.filter(f => f.id !== item.id)
                                  updateHelpPage({ faqs: updated })
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                <div className="space-y-2 pt-4">
                  <Label>Footer Text</Label>
                  <Input
                    value={content.helpPage.footerText}
                    onChange={(e) => updateHelpPage({ footerText: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Footer */}
        <TabsContent value="footer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>
                Light four-column layout: brand intro + socials, Company, Legal (with payment marks), Help. Company /
                Legal / Help link lists use the defaults in code until a link editor is added.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Footer Logo (Optional)</Label>
                {content.footer.footerLogo && (
                  <div className="relative mt-2 h-16 w-32 overflow-hidden rounded border bg-muted/20 flex items-center justify-center p-2">
                    <img src={content.footer.footerLogo} alt="Footer logo preview" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <Input
                    type="file"
                    accept="image/*"
                    key={content.footer.footerLogo ? 'has-logo' : 'no-logo'}
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateFooter({ footerLogo: url }))}
                    className="flex-1"
                  />
                  {content.footer.footerLogo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateFooter({ footerLogo: '' })}
                      className="text-destructive shrink-0"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">If uploaded, overrides the default ITU logo mark.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand-tagline">Brand intro (under logo)</Label>
                <Textarea
                  id="brand-tagline"
                  value={content.footer.brandTagline}
                  onChange={(e) => updateFooter({ brandTagline: e.target.value })}
                  placeholder="Short paragraph about the product."
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="footer-main-bg">Main footer background (hex)</Label>
                  <Input
                    id="footer-main-bg"
                    value={content.footer.mainBackgroundColor ?? ''}
                    onChange={(e) => updateFooter({ mainBackgroundColor: e.target.value })}
                    placeholder="#e4e4e4"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="footer-sub-bg">Bottom bar background (hex)</Label>
                  <Input
                    id="footer-sub-bg"
                    value={content.footer.subFooterBackgroundColor ?? ''}
                    onChange={(e) => updateFooter({ subFooterBackgroundColor: e.target.value })}
                    placeholder="#d0d0d0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-copyright">Copyright line</Label>
                <Input
                  id="footer-copyright"
                  value={content.footer.copyrightTemplate ?? ''}
                  onChange={(e) => updateFooter({ copyrightTemplate: e.target.value })}
                  placeholder="© {{brand}} {{year}}. All rights reserved."
                />
                <p className="text-xs text-muted-foreground">
                  Use <code className="rounded bg-muted px-1">{'{{brand}}'}</code> and{' '}
                  <code className="rounded bg-muted px-1">{'{{year}}'}</code> for the site name and current year.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trust-badge">Trust badge text (optional / internal)</Label>
                <Input
                  id="trust-badge"
                  value={content.footer.trustBadgeText}
                  onChange={(e) => updateFooter({ trustBadgeText: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-bg-image">Optional footer background image</Label>
                <Input
                  id="footer-bg-image"
                  value={content.footer.backgroundImage || ''}
                  onChange={(e) => updateFooter({ backgroundImage: e.target.value })}
                  placeholder="https://..."
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateFooter({ backgroundImage: url }))}
                />
                <p className="text-xs text-muted-foreground">
                  When set, overlays the main footer background with a light wash so legibility is preserved.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <FooterLinksEditor
                  title="Company Links"
                  links={content.footer.companyLinks}
                  onChange={(links) => updateFooter({ companyLinks: links })}
                />
                <FooterLinksEditor
                  title="Legal Links"
                  links={content.footer.legalLinks}
                  onChange={(links) => updateFooter({ legalLinks: links })}
                />
                <FooterLinksEditor
                  title="Help Links"
                  links={content.footer.helpLinks}
                  onChange={(links) => updateFooter({ helpLinks: links })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Twitter / X URL</Label>
                  <Input
                    value={content.footer.socialLinks.twitter}
                    onChange={(e) =>
                      updateFooter({
                        socialLinks: { ...content.footer.socialLinks, twitter: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Facebook URL</Label>
                  <Input
                    value={content.footer.socialLinks.facebook}
                    onChange={(e) =>
                      updateFooter({
                        socialLinks: { ...content.footer.socialLinks, facebook: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>YouTube URL</Label>
                  <Input
                    value={content.footer.socialLinks.youtube ?? ''}
                    onChange={(e) =>
                      updateFooter({
                        socialLinks: { ...content.footer.socialLinks, youtube: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={content.footer.socialLinks.linkedin}
                    onChange={(e) =>
                      updateFooter({
                        socialLinks: { ...content.footer.socialLinks, linkedin: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Instagram URL (optional, not shown in current footer)</Label>
                  <Input
                    value={content.footer.socialLinks.instagram}
                    onChange={(e) =>
                      updateFooter({
                        socialLinks: { ...content.footer.socialLinks, instagram: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Careers Page Section */}
        <TabsContent value="careers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Careers Hero Section</CardTitle>
              <CardDescription>
                Configure the header title, subtitle, and main background banner for the Careers page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hero Title</Label>
                  <Input
                    value={content.careersPage?.heroTitle ?? ''}
                    onChange={(e) => updateCareersPage({ heroTitle: e.target.value })}
                    placeholder="Unlock Your Career At ITU"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hero Subtitle</Label>
                  <Input
                    value={content.careersPage?.heroSubtitle ?? ''}
                    onChange={(e) => updateCareersPage({ heroSubtitle: e.target.value })}
                    placeholder="Grow With Us And Take Your Professional Life To The Next Level."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hero Background Image</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a custom banner image. If empty, falls back to the default asset in <code>/public/career/Banner.png</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateCareersPage({ heroBgImage: url }))}
                  />
                  {content.careersPage?.heroBgImage && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => updateCareersPage({ heroBgImage: '' })}>
                      Remove / Use Fallback
                    </Button>
                  )}
                </div>
                <div className="relative mt-3 h-24 w-40 overflow-hidden rounded-lg border shadow-sm">
                  <img
                    src={content.careersPage?.heroBgImage || '/career/Banner.png'}
                    alt="Careers Hero Preview"
                    className="size-full object-cover"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Perks & Benefits Section</CardTitle>
              <CardDescription>
                Configure the section title, subtitle, and list of benefits cards (6 items).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Perks Section Title</Label>
                  <Input
                    value={content.careersPage?.perksTitle ?? ''}
                    onChange={(e) => updateCareersPage({ perksTitle: e.target.value })}
                    placeholder="Perks & Benefits"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Perks Section Subtitle</Label>
                  <Input
                    value={content.careersPage?.perksSubtitle ?? ''}
                    onChange={(e) => updateCareersPage({ perksSubtitle: e.target.value })}
                    placeholder="We take care of our people so they can take care of our clients."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Perk Cards List (Must contain 6 items)</Label>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const perksList = content.careersPage?.perksList ?? [];
                    return (
                      <div key={idx} className="space-y-1 rounded-xl border bg-muted/20 p-3">
                        <Label className="text-xs font-semibold">Perk Card #{idx + 1}</Label>
                        <Input
                          value={perksList[idx] ?? ''}
                          onChange={(e) => {
                            const copy = [...perksList];
                            copy[idx] = e.target.value;
                            updateCareersPage({ perksList: copy });
                          }}
                          placeholder={`Perk ${idx + 1}`}
                          className="text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Life Beyond Section</CardTitle>
              <CardDescription>
                Configure the section headers and upload the collage of 5 photos representing company life.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Life Beyond Title</Label>
                  <Input
                    value={content.careersPage?.lifeBeyondTitle ?? ''}
                    onChange={(e) => updateCareersPage({ lifeBeyondTitle: e.target.value })}
                    placeholder="Life Beyond"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Life Beyond Subtitle</Label>
                  <Input
                    value={content.careersPage?.lifeBeyondSubtitle ?? ''}
                    onChange={(e) => updateCareersPage({ lifeBeyondSubtitle: e.target.value })}
                    placeholder="From team building activities to hackathons, here's a glimpse of the memories we make together."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Collage Images (5 images)</Label>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4].map((idx) => {
                    const fallbackNames = ['one.png', 'two.png', 'three.png', 'four.png', 'five.png'];
                    const images = content.careersPage?.lifeBeyondImages ?? [];
                    const currentImg = images[idx] || `/career/${fallbackNames[idx]}`;
                    return (
                      <div key={idx} className="space-y-2 rounded-xl border bg-muted/20 p-4">
                        <Label className="text-xs font-semibold">Image #{idx + 1} (Fallback: {fallbackNames[idx]})</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          className="w-full text-xs"
                          onChange={(e) =>
                            void handleUpload(e.target.files?.[0], (url) => {
                              const copy = [...images];
                              copy[idx] = url;
                              updateCareersPage({ lifeBeyondImages: copy });
                            })
                          }
                        />
                        {images[idx] && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              const copy = [...images];
                              copy[idx] = '';
                              updateCareersPage({ lifeBeyondImages: copy });
                            }}
                          >
                            Use Fallback
                          </Button>
                        )}
                        <div className="relative h-20 w-full overflow-hidden rounded border bg-neutral-100 mt-1">
                          <img src={currentImg} alt={`Collage ${idx + 1}`} className="size-full object-cover" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Positions Headers</CardTitle>
              <CardDescription>
                Configure the title and subtitle that will stand above the job listings list.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Positions Title</Label>
                  <Input
                    value={content.careersPage?.openPositionsTitle ?? ''}
                    onChange={(e) => updateCareersPage({ openPositionsTitle: e.target.value })}
                    placeholder="Open Positions"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Positions Subtitle</Label>
                  <Input
                    value={content.careersPage?.openPositionsSubtitle ?? ''}
                    onChange={(e) => updateCareersPage({ openPositionsSubtitle: e.target.value })}
                    placeholder="Find your next opportunity and help shape the future of collective data."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact Hero Section</CardTitle>
              <CardDescription>
                Configure the header title, subtitle, and background banner image for the Contact page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hero Title</Label>
                  <Input
                    value={content.contactPage?.heroTitle ?? ''}
                    onChange={(e) => updateContactPage({ heroTitle: e.target.value })}
                    placeholder="Recharge Mobile Phones Anywhere In The World"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hero Subtitle (optional)</Label>
                  <Input
                    value={content.contactPage?.heroSubtitle ?? ''}
                    onChange={(e) => updateContactPage({ heroSubtitle: e.target.value })}
                    placeholder="Get in touch with us"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hero Background Image</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a custom banner image for the Contact page.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateContactPage({ heroBgImage: url }))}
                  />
                  {content.contactPage?.heroBgImage && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => updateContactPage({ heroBgImage: '' })}>
                      Remove
                    </Button>
                  )}
                </div>
                {content.contactPage?.heroBgImage && (
                  <div className="relative mt-3 h-24 w-40 overflow-hidden rounded-lg border shadow-sm">
                    <img
                      src={content.contactPage.heroBgImage}
                      alt="Contact Hero Preview"
                      className="size-full object-cover"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Information Cards</CardTitle>
              <CardDescription>
                Configure address details, phone numbers, and support email addresses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 border border-border/65 p-5 rounded-2xl bg-muted/10">
                <div className="space-y-2">
                  <Label className="font-bold text-xs">Address Card Title</Label>
                  <Input
                    value={content.contactPage?.addressTitle ?? ''}
                    onChange={(e) => updateContactPage({ addressTitle: e.target.value })}
                    placeholder="Address Line"
                  />
                  <Label className="text-xs text-muted-foreground">Line 1</Label>
                  <Input
                    value={content.contactPage?.addressLine1 ?? ''}
                    onChange={(e) => updateContactPage({ addressLine1: e.target.value })}
                    placeholder="ITU GmbH"
                  />
                  <Label className="text-xs text-muted-foreground">Line 2</Label>
                  <Input
                    value={content.contactPage?.addressLine2 ?? ''}
                    onChange={(e) => updateContactPage({ addressLine2: e.target.value })}
                    placeholder="Friedrichstraße 123, 10117 Berlin"
                  />
                  <Label className="text-xs text-muted-foreground">Line 3</Label>
                  <Input
                    value={content.contactPage?.addressLine3 ?? ''}
                    onChange={(e) => updateContactPage({ addressLine3: e.target.value })}
                    placeholder="Germany"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs">Phone Card Title</Label>
                  <Input
                    value={content.contactPage?.phoneTitle ?? ''}
                    onChange={(e) => updateContactPage({ phoneTitle: e.target.value })}
                    placeholder="Phone Number"
                  />
                  <Label className="text-xs text-muted-foreground">Phone Line 1</Label>
                  <Input
                    value={content.contactPage?.phoneLine1 ?? ''}
                    onChange={(e) => updateContactPage({ phoneLine1: e.target.value })}
                    placeholder="+49 30 1234 5678"
                  />
                  <Label className="text-xs text-muted-foreground">Phone Line 2</Label>
                  <Input
                    value={content.contactPage?.phoneLine2 ?? ''}
                    onChange={(e) => updateContactPage({ phoneLine2: e.target.value })}
                    placeholder="+49 89 5678 5432"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs">Email Card Title</Label>
                  <Input
                    value={content.contactPage?.emailTitle ?? ''}
                    onChange={(e) => updateContactPage({ emailTitle: e.target.value })}
                    placeholder="Mail Address"
                  />
                  <Label className="text-xs text-muted-foreground">Email Line 1</Label>
                  <Input
                    value={content.contactPage?.emailLine1 ?? ''}
                    onChange={(e) => updateContactPage({ emailLine1: e.target.value })}
                    placeholder="www.support@itu.com"
                  />
                  <Label className="text-xs text-muted-foreground">Email Line 2</Label>
                  <Input
                    value={content.contactPage?.emailLine2 ?? ''}
                    onChange={(e) => updateContactPage({ emailLine2: e.target.value })}
                    placeholder="www.info@itu.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appointment & Form Section</CardTitle>
              <CardDescription>
                Configure the appointment booking section details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Form Section Title</Label>
                  <Input
                    value={content.contactPage?.formTitle ?? ''}
                    onChange={(e) => updateContactPage({ formTitle: e.target.value })}
                    placeholder="Book An Appointment"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Submit Button Text</Label>
                  <Input
                    value={content.contactPage?.formButtonText ?? ''}
                    onChange={(e) => updateContactPage({ formButtonText: e.target.value })}
                    placeholder="SEND A MESSAGE"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Google Maps Embed URL</Label>
                <Input
                  value={content.contactPage?.mapEmbedUrl ?? ''}
                  onChange={(e) => updateContactPage({ mapEmbedUrl: e.target.value })}
                  placeholder="https://www.google.com/maps/embed?..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="space-y-4">
          {/* 1. Hero Section */}
          <Card>
            <CardHeader>
              <CardTitle>About Hero Section</CardTitle>
              <CardDescription>
                Configure the main header title, subtitle description, and background banner image.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hero Title</Label>
                  <Input
                    value={content.aboutPage?.heroTitle ?? ''}
                    onChange={(e) => updateAboutPage({ heroTitle: e.target.value })}
                    placeholder="Connecting Families Across Borders Through Instant Mobile Recharge"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hero Subtitle</Label>
                  <Textarea
                    value={content.aboutPage?.heroSubtitle ?? ''}
                    onChange={(e) => updateAboutPage({ heroSubtitle: e.target.value })}
                    placeholder="From Germany to over 180+ countries..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hero Background Image</Label>
                <p className="text-xs text-muted-foreground">
                  Upload a custom banner image. If empty, falls back to the default asset in <code>/about/herobanner.png</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="w-64 cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ heroBgImage: url }))}
                  />
                  {content.aboutPage?.heroBgImage && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => updateAboutPage({ heroBgImage: '' })}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="relative mt-3 h-24 w-40 overflow-hidden rounded-lg border shadow-sm">
                  <img
                    src={content.aboutPage?.heroBgImage || '/about/herobanner.png'}
                    alt="About Hero Preview"
                    className="size-full object-cover"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Who We Are Section */}
          <Card>
            <CardHeader>
              <CardTitle>Who We Are Section</CardTitle>
              <CardDescription>
                Configure the section title, descriptions, left side image, and 4 feature pills (Fast, Secure, Global, Reliable).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Section Title</Label>
                <Input
                  value={content.aboutPage?.whoWeAreTitle ?? ''}
                  onChange={(e) => updateAboutPage({ whoWeAreTitle: e.target.value })}
                  placeholder="Who we are"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Paragraph 1</Label>
                  <Textarea
                    value={content.aboutPage?.whoWeArePara1 ?? ''}
                    onChange={(e) => updateAboutPage({ whoWeArePara1: e.target.value })}
                    placeholder="ITU is a global digital platform..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Paragraph 2</Label>
                  <Textarea
                    value={content.aboutPage?.whoWeArePara2 ?? ''}
                    onChange={(e) => updateAboutPage({ whoWeArePara2: e.target.value })}
                    placeholder="Whether you're supporting family..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Paragraph 3</Label>
                  <Textarea
                    value={content.aboutPage?.whoWeArePara3 ?? ''}
                    onChange={(e) => updateAboutPage({ whoWeArePara3: e.target.value })}
                    placeholder="Built in Germany..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Who We Are Illustration Image (Left Side)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload custom image. Defaults to <code>/about/sectionTwoLeft.png</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="w-64 cursor-pointer text-sm"
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ whoWeAreImage: url }))}
                  />
                  {content.aboutPage?.whoWeAreImage && (
                    <Button type="button" variant="destructive" size="sm" onClick={() => updateAboutPage({ whoWeAreImage: '' })}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="relative mt-3 h-24 w-32 overflow-hidden rounded-lg border shadow-sm">
                  <img
                    src={content.aboutPage?.whoWeAreImage || '/about/sectionTwoLeft.png'}
                    alt="Who We Are Left Preview"
                    className="size-full object-cover"
                  />
                </div>
              </div>

              {/* 4 Pills Editors */}
              <div className="border border-border/70 p-4 rounded-xl space-y-4 bg-muted/10">
                <h4 className="font-bold text-sm text-[#1e3a8a]">Feature Pills (4 Items)</h4>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Pill 1 */}
                  <div className="space-y-2 border p-3 rounded-lg bg-white shadow-sm">
                    <Label className="font-semibold text-xs text-primary">Pill #1 (Fast)</Label>
                    <Input
                      value={content.aboutPage?.pill1Title ?? ''}
                      onChange={(e) => updateAboutPage({ pill1Title: e.target.value })}
                      placeholder="Fast"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={content.aboutPage?.pill1Desc ?? ''}
                      onChange={(e) => updateAboutPage({ pill1Desc: e.target.value })}
                      placeholder="Instant top-ups in seconds"
                      className="h-8 text-xs"
                    />
                    <Label className="text-xs text-muted-foreground mt-1">Icon Upload</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs h-8 py-1 flex-1"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ pill1Icon: url }))}
                      />
                      {content.aboutPage?.pill1Icon && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          className="h-8 text-[10px] px-2 shrink-0"
                          onClick={() => updateAboutPage({ pill1Icon: '' })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="relative mt-2 h-10 w-10 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                      <img
                        src={content.aboutPage?.pill1Icon || '/about/One.png'}
                        alt="Pill 1 Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Pill 2 */}
                  <div className="space-y-2 border p-3 rounded-lg bg-white shadow-sm">
                    <Label className="font-semibold text-xs text-primary">Pill #2 (Secure)</Label>
                    <Input
                      value={content.aboutPage?.pill2Title ?? ''}
                      onChange={(e) => updateAboutPage({ pill2Title: e.target.value })}
                      placeholder="Secure"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={content.aboutPage?.pill2Desc ?? ''}
                      onChange={(e) => updateAboutPage({ pill2Desc: e.target.value })}
                      placeholder="Safe and encrypted transactions"
                      className="h-8 text-xs"
                    />
                    <Label className="text-xs text-muted-foreground mt-1">Icon Upload</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs h-8 py-1 flex-1"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ pill2Icon: url }))}
                      />
                      {content.aboutPage?.pill2Icon && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          className="h-8 text-[10px] px-2 shrink-0"
                          onClick={() => updateAboutPage({ pill2Icon: '' })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="relative mt-2 h-10 w-10 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                      <img
                        src={content.aboutPage?.pill2Icon || '/about/Two.png'}
                        alt="Pill 2 Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Pill 3 */}
                  <div className="space-y-2 border p-3 rounded-lg bg-white shadow-sm">
                    <Label className="font-semibold text-xs text-primary">Pill #3 (Global)</Label>
                    <Input
                      value={content.aboutPage?.pill3Title ?? ''}
                      onChange={(e) => updateAboutPage({ pill3Title: e.target.value })}
                      placeholder="Global"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={content.aboutPage?.pill3Desc ?? ''}
                      onChange={(e) => updateAboutPage({ pill3Desc: e.target.value })}
                      placeholder="180+ countries worldwide"
                      className="h-8 text-xs"
                    />
                    <Label className="text-xs text-muted-foreground mt-1">Icon Upload</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs h-8 py-1 flex-1"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ pill3Icon: url }))}
                      />
                      {content.aboutPage?.pill3Icon && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          className="h-8 text-[10px] px-2 shrink-0"
                          onClick={() => updateAboutPage({ pill3Icon: '' })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="relative mt-2 h-10 w-10 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                      <img
                        src={content.aboutPage?.pill3Icon || '/about/Three.png'}
                        alt="Pill 3 Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Pill 4 */}
                  <div className="space-y-2 border p-3 rounded-lg bg-white shadow-sm">
                    <Label className="font-semibold text-xs text-primary">Pill #4 (Reliable)</Label>
                    <Input
                      value={content.aboutPage?.pill4Title ?? ''}
                      onChange={(e) => updateAboutPage({ pill4Title: e.target.value })}
                      placeholder="Reliable"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={content.aboutPage?.pill4Desc ?? ''}
                      onChange={(e) => updateAboutPage({ pill4Desc: e.target.value })}
                      placeholder="Trusted by millions everyday"
                      className="h-8 text-xs"
                    />
                    <Label className="text-xs text-muted-foreground mt-1">Icon Upload</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs h-8 py-1 flex-1"
                        onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ pill4Icon: url }))}
                      />
                      {content.aboutPage?.pill4Icon && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="xs"
                          className="h-8 text-[10px] px-2 shrink-0"
                          onClick={() => updateAboutPage({ pill4Icon: '' })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="relative mt-2 h-10 w-10 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                      <img
                        src={content.aboutPage?.pill4Icon || '/about/Four.png'}
                        alt="Pill 4 Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. Stats Section */}
          <Card>
            <CardHeader>
              <CardTitle>Stats Section (3 Columns)</CardTitle>
              <CardDescription>
                Configure metrics for countries, operator list count, and customer service channel details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 border p-4 rounded-xl bg-muted/10">
                <div className="space-y-2">
                  <Label>Stat 1 Value</Label>
                  <Input
                    value={content.aboutPage?.stat1Count ?? ''}
                    onChange={(e) => updateAboutPage({ stat1Count: e.target.value })}
                    placeholder="180"
                  />
                  <Label>Stat 1 Label</Label>
                  <Input
                    value={content.aboutPage?.stat1Label ?? ''}
                    onChange={(e) => updateAboutPage({ stat1Label: e.target.value })}
                    placeholder="COUNTRIES"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stat 2 Value</Label>
                  <Input
                    value={content.aboutPage?.stat2Count ?? ''}
                    onChange={(e) => updateAboutPage({ stat2Count: e.target.value })}
                    placeholder="700+"
                  />
                  <Label>Stat 2 Label</Label>
                  <Input
                    value={content.aboutPage?.stat2Label ?? ''}
                    onChange={(e) => updateAboutPage({ stat2Label: e.target.value })}
                    placeholder="MOBILE OPERATORS"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Stat 3 Custom Icon Uploader</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs py-1 h-8 flex-1"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ stat3Icon: url }))}
                    />
                    {content.aboutPage?.stat3Icon && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        className="h-8 text-[10px] px-2 shrink-0"
                        onClick={() => updateAboutPage({ stat3Icon: '' })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="relative mt-2 h-10 w-10 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                    <img
                      src={content.aboutPage?.stat3Icon || '/about/Icon.png'}
                      alt="Stat 3 Icon Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <Label>Stat 3 Label</Label>
                  <Input
                    value={content.aboutPage?.stat3Label ?? ''}
                    onChange={(e) => updateAboutPage({ stat3Label: e.target.value })}
                    placeholder="24/7 SUPPORT"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Global Network Section */}
          <Card>
            <CardHeader>
              <CardTitle>Global Network Section</CardTitle>
              <CardDescription>
                Configure the title headers and detailed description representing global network scope.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Network Header Title</Label>
                <Input
                  value={content.aboutPage?.networkTitle ?? ''}
                  onChange={(e) => updateAboutPage({ networkTitle: e.target.value })}
                  placeholder="Our Global network"
                />
              </div>
              <div className="space-y-2">
                <Label>Network Subtitle (Orange Subheader)</Label>
                <Input
                  value={content.aboutPage?.networkSubtitle ?? ''}
                  onChange={(e) => updateAboutPage({ networkSubtitle: e.target.value })}
                  placeholder="PARTNERING WITH TRUSTED TELECOM OPERATORS..."
                />
              </div>
              <div className="space-y-2">
                <Label>Network Description Text</Label>
                <Textarea
                  value={content.aboutPage?.networkDesc ?? ''}
                  onChange={(e) => updateAboutPage({ networkDesc: e.target.value })}
                  placeholder="Delivering seamless international mobile recharge..."
                />
              </div>
            </CardContent>
          </Card>

          {/* 5. Operators Section */}
          <Card>
            <CardHeader>
              <CardTitle>Operator Logos Section</CardTitle>
              <CardDescription>
                Configure section title and upload the 6 main partner logos shown in mockup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Section Title</Label>
                <Input
                  value={content.aboutPage?.operatorsTitle ?? ''}
                  onChange={(e) => updateAboutPage({ operatorsTitle: e.target.value })}
                  placeholder="Trusted by leading telecom operators"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6 border p-4 rounded-xl bg-muted/10">
                {[1, 2, 3, 4, 5, 6].map((num) => {
                  const key = `operatorLogo${num}` as keyof AboutPageContent;
                  const currentVal = (content.aboutPage ? content.aboutPage[key] : '') as string;
                  return (
                    <div key={num} className="space-y-2 border p-3 rounded bg-white shadow-sm">
                      <Label className="text-xs font-semibold">Logo #{num}</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs py-1 h-8"
                        onChange={(e) =>
                          void handleUpload(e.target.files?.[0], (url) => {
                            updateAboutPage({ [key]: url });
                          })
                        }
                      />
                      <div className="h-10 w-full overflow-hidden border rounded relative bg-neutral-50 flex items-center justify-center">
                        <img
                          src={currentVal || `/about/logo${num}.png`}
                          alt={`Logo ${num}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 6. Team Quotes Section */}
          <Card>
            <CardHeader>
              <CardTitle>What Our Team Says Section</CardTitle>
              <CardDescription>
                Configure section title, subtitle, and list of employee carousel cards.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Team Title</Label>
                  <Input
                    value={content.aboutPage?.teamTitle ?? ''}
                    onChange={(e) => updateAboutPage({ teamTitle: e.target.value })}
                    placeholder="What Our Team Says"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Team Subtitle</Label>
                  <Input
                    value={content.aboutPage?.teamSubtitle ?? ''}
                    onChange={(e) => updateAboutPage({ teamSubtitle: e.target.value })}
                    placeholder="Hear from the people who make our company great"
                  />
                </div>
              </div>

              {/* Team Cards Editor List */}
              <div className="space-y-4 border p-4 rounded-xl bg-muted/10">
                <div className="flex items-center justify-between">
                  <Label className="font-bold">Team Quote Cards ({content.aboutPage?.teamQuotes?.length ?? 0} items)</Label>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => {
                      const list = content.aboutPage?.teamQuotes ?? [];
                      updateAboutPage({
                        teamQuotes: [
                          ...list,
                          {
                            id: `team-${Date.now()}`,
                            name: '',
                            role: '',
                            quote: '',
                            image: '',
                          },
                        ],
                      });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Quote Card
                  </Button>
                </div>

                <div className="space-y-4">
                  {(content.aboutPage?.teamQuotes ?? []).map((card, idx) => (
                    <div key={card.id} className="border p-4 rounded-xl bg-white shadow-sm grid gap-4 sm:grid-cols-12 relative">
                      <div className="sm:col-span-3 space-y-2">
                        <Label className="text-xs">Photo Image</Label>
                        <div className="flex flex-col gap-2">
                          <Input
                            type="file"
                            accept="image/*"
                            className="text-xs"
                            onChange={(e) =>
                              void handleUpload(e.target.files?.[0], (url) => {
                                const list = [...(content.aboutPage?.teamQuotes ?? [])];
                                list[idx] = { ...card, image: url };
                                updateAboutPage({ teamQuotes: list });
                              })
                            }
                          />
                          {card.image && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="xs"
                              className="text-[10px] py-1 h-7"
                              onClick={() => {
                                const list = [...(content.aboutPage?.teamQuotes ?? [])];
                                list[idx] = { ...card, image: '' };
                                updateAboutPage({ teamQuotes: list });
                              }}
                            >
                              Remove Image
                            </Button>
                          )}
                        </div>
                        <div className="h-20 w-20 overflow-hidden rounded-full border relative mx-auto">
                          <img
                            src={card.image || '/about/team1.png'}
                            alt={card.name || 'Team Preview'}
                            className="size-full object-cover"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-8 space-y-2 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Name</Label>
                            <Input
                              value={card.name}
                              placeholder="Name (e.g. Tosin)"
                              onChange={(e) => {
                                const list = [...(content.aboutPage?.teamQuotes ?? [])];
                                list[idx] = { ...card, name: e.target.value };
                                updateAboutPage({ teamQuotes: list });
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Role / Title</Label>
                            <Input
                              value={card.role}
                              placeholder="Role / Title (e.g. Senior Product Manager)"
                              onChange={(e) => {
                                const list = [...(content.aboutPage?.teamQuotes ?? [])];
                                list[idx] = { ...card, role: e.target.value };
                                updateAboutPage({ teamQuotes: list });
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label>Quote Text</Label>
                            <span className="text-[10px] text-muted-foreground">
                              {card.quote.length}/200
                            </span>
                          </div>
                          <Textarea
                            value={card.quote}
                            maxLength={200}
                            placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit..."
                            onChange={(e) => {
                              const list = [...(content.aboutPage?.teamQuotes ?? [])];
                              list[idx] = { ...card, quote: e.target.value };
                              updateAboutPage({ teamQuotes: list });
                            }}
                            rows={3}
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-1 flex items-center justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive absolute top-2 right-2 sm:static"
                          onClick={() => {
                            const list = (content.aboutPage?.teamQuotes ?? []).filter((q) => q.id !== card.id);
                            updateAboutPage({ teamQuotes: list });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 7. App Promo Section */}
          <Card>
            <CardHeader>
              <CardTitle>App Promo Section</CardTitle>
              <CardDescription>
                Configure the download badges for App Store and Google Play.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Text fields */}
              <div className="grid gap-4 sm:grid-cols-3 border p-4 rounded-xl bg-muted/10">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Title</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {(content.aboutPage?.promoTitle ?? '').length}/50
                    </span>
                  </div>
                  <Input
                    value={content.aboutPage?.promoTitle ?? ''}
                    maxLength={50}
                    onChange={(e) => updateAboutPage({ promoTitle: e.target.value })}
                    placeholder="Download the ITU App"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Subtitle</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {(content.aboutPage?.promoSubtitle ?? '').length}/60
                    </span>
                  </div>
                  <Input
                    value={content.aboutPage?.promoSubtitle ?? ''}
                    maxLength={60}
                    onChange={(e) => updateAboutPage({ promoSubtitle: e.target.value })}
                    placeholder="Top-up wherever, whenever"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Description</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {(content.aboutPage?.promoDesc ?? '').length}/150
                    </span>
                  </div>
                  <Textarea
                    value={content.aboutPage?.promoDesc ?? ''}
                    maxLength={150}
                    onChange={(e) => updateAboutPage({ promoDesc: e.target.value })}
                    placeholder="Recharge anytime, anywhere with just a few taps."
                    rows={2}
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                {/* App Store Image */}
                <div className="space-y-2 border p-4 rounded-xl bg-white shadow-sm">
                  <Label>App Store Download Badge</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload App Store badge. Fallback is <code>/about/Frame 427319059.png</code>.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs h-8 py-1 flex-1"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ appStoreImage: url }))}
                    />
                    {content.aboutPage?.appStoreImage && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        className="h-8 text-[10px] px-2 shrink-0"
                        onClick={() => updateAboutPage({ appStoreImage: '' })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="relative mt-2 h-14 w-40 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                    <img
                      src={content.aboutPage?.appStoreImage || '/about/Frame 427319059.png'}
                      alt="App Store Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>

                {/* Google Play Image */}
                <div className="space-y-2 border p-4 rounded-xl bg-white shadow-sm">
                  <Label>Google Play Download Badge</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload Google Play badge. Fallback is <code>/about/Frame 327.png</code>.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs h-8 py-1 flex-1"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAboutPage({ googlePlayImage: url }))}
                    />
                    {content.aboutPage?.googlePlayImage && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="xs"
                        className="h-8 text-[10px] px-2 shrink-0"
                        onClick={() => updateAboutPage({ googlePlayImage: '' })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="relative mt-2 h-14 w-40 overflow-hidden rounded border bg-neutral-50 flex items-center justify-center p-1">
                    <img
                      src={content.aboutPage?.googlePlayImage || '/about/Frame 327.png'}
                      alt="Google Play Preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Policy Settings</CardTitle>
              <CardDescription>Configure the main title, subtitle, and intro text for the public privacy notice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="privacy-title">Page Title</Label>
                  <Input
                    id="privacy-title"
                    value={content.privacyPage?.title || ''}
                    onChange={(e) => updatePrivacyPage({ title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="privacy-subtitle">Page Subtitle</Label>
                  <Input
                    id="privacy-subtitle"
                    value={content.privacyPage?.subtitle || ''}
                    onChange={(e) => updatePrivacyPage({ subtitle: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="privacy-intro">Introductory Paragraph</Label>
                <Textarea
                  id="privacy-intro"
                  rows={4}
                  value={content.privacyPage?.introText || ''}
                  onChange={(e) => updatePrivacyPage({ introText: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Privacy Policy Sections</CardTitle>
                <CardDescription>Create the side tabs showing questions and rich text formatted answers.</CardDescription>
              </div>
              <Button onClick={() => setIsAddPrivacyOpen(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Section
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">Order</TableHead>
                      <TableHead>Question / Title</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!content.privacyPage?.sections || content.privacyPage.sections.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No sections added yet. Click "Add Section" to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...content.privacyPage.sections]
                        .sort((a, b) => a.order - b.order)
                        .map((sec) => (
                          <TableRow key={sec.id}>
                            <TableCell className="text-center font-medium">{sec.order}</TableCell>
                            <TableCell className="font-medium">{sec.question}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${sec.isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-neutral-50 text-neutral-600 border border-neutral-200'}`}>
                                {sec.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingPrivacyItem(sec)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => deletePrivacyItem(sec.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Add Dialog */}
          {isAddPrivacyOpen && (
            <Dialog open={isAddPrivacyOpen} onOpenChange={setIsAddPrivacyOpen}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Privacy Notice Section</DialogTitle>
                  <DialogDescription>Create a new question and rich-text formatted answer.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-privacy-question">Question / Title</Label>
                    <Input
                      id="add-privacy-question"
                      value={newPrivacy.question}
                      placeholder="e.g. What data does Ding collect?"
                      onChange={(e) => setNewPrivacy({ ...newPrivacy, question: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer (Rich Text)</Label>
                    <RichTextEditor
                      value={newPrivacy.answer}
                      onChange={(val) => setNewPrivacy({ ...newPrivacy, answer: val })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-privacy-order">Display Order</Label>
                    <Input
                      id="add-privacy-order"
                      type="number"
                      value={newPrivacy.order}
                      onChange={(e) => setNewPrivacy({ ...newPrivacy, order: Number(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddPrivacyOpen(false)}>Cancel</Button>
                  <Button onClick={() => {
                    addPrivacyItem()
                    setIsAddPrivacyOpen(false)
                  }}>Add Section</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Edit Dialog */}
          {editingPrivacyItem && (
            <Dialog open={!!editingPrivacyItem} onOpenChange={(open) => !open && setEditingPrivacyItem(null)}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Privacy Notice Section</DialogTitle>
                  <DialogDescription>Modify the question and the rich-text formatted answer.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-privacy-question">Question / Title</Label>
                    <Input
                      id="edit-privacy-question"
                      value={editingPrivacyItem.question}
                      onChange={(e) => setEditingPrivacyItem({ ...editingPrivacyItem, question: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer (Rich Text)</Label>
                    <RichTextEditor
                      value={editingPrivacyItem.answer}
                      onChange={(val) => setEditingPrivacyItem({ ...editingPrivacyItem, answer: val })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-privacy-order">Display Order</Label>
                      <Input
                        id="edit-privacy-order"
                        type="number"
                        value={editingPrivacyItem.order}
                        onChange={(e) => setEditingPrivacyItem({ ...editingPrivacyItem, order: Number(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Switch
                        id="edit-privacy-active"
                        checked={editingPrivacyItem.isActive}
                        onCheckedChange={(checked) => setEditingPrivacyItem({ ...editingPrivacyItem, isActive: checked })}
                      />
                      <Label htmlFor="edit-privacy-active">Active (Visible on public site)</Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingPrivacyItem(null)}>Cancel</Button>
                  <Button onClick={() => savePrivacyItem(editingPrivacyItem)}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        <TabsContent value="terms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions Settings</CardTitle>
              <CardDescription>Configure the main title, subtitle, and introductory paragraph for the Terms & Conditions page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="terms-title">Page Title</Label>
                  <Input
                    id="terms-title"
                    value={content.termsPage?.title || ''}
                    onChange={(e) => updateTermsPage({ title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="terms-subtitle">Page Subtitle</Label>
                  <Input
                    id="terms-subtitle"
                    value={content.termsPage?.subtitle || ''}
                    onChange={(e) => updateTermsPage({ subtitle: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms-intro">Introductory Paragraph</Label>
                <Textarea
                  id="terms-intro"
                  rows={4}
                  value={content.termsPage?.introText || ''}
                  onChange={(e) => updateTermsPage({ introText: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Terms & Conditions Sections (Points)</CardTitle>
                <CardDescription>Manage the sequential list of points that define the Terms & Conditions.</CardDescription>
              </div>
              <Button onClick={() => setIsAddTermsOpen(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Add Point
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">Order</TableHead>
                      <TableHead>Point Title</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!content.termsPage?.sections || content.termsPage.sections.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No terms points added yet. Click "Add Point" to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...content.termsPage.sections]
                        .sort((a, b) => a.order - b.order)
                        .map((sec) => (
                          <TableRow key={sec.id}>
                            <TableCell className="text-center font-medium">{sec.order}</TableCell>
                            <TableCell className="font-medium">{sec.title}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${sec.isActive ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-neutral-50 text-neutral-600 border border-neutral-200'}`}>
                                {sec.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingTermsItem(sec)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteTermsItem(sec.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Add Dialog */}
          {isAddTermsOpen && (
            <Dialog open={isAddTermsOpen} onOpenChange={setIsAddTermsOpen}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Terms Point</DialogTitle>
                  <DialogDescription>Create a new numbered point and rich-text formatted description.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-terms-title">Point Title</Label>
                    <Input
                      id="add-terms-title"
                      value={newTerms.title}
                      placeholder="e.g. Acceptance of Terms"
                      onChange={(e) => setNewTerms({ ...newTerms, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Point Content (Rich Text)</Label>
                    <RichTextEditor
                      value={newTerms.content}
                      onChange={(val) => setNewTerms({ ...newTerms, content: val })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-terms-order">Display Order</Label>
                    <Input
                      id="add-terms-order"
                      type="number"
                      min={0}
                      value={newTerms.order}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0)
                        setNewTerms({ ...newTerms, order: val })
                      }}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddTermsOpen(false)}>Cancel</Button>
                  <Button onClick={() => {
                    addTermsItem()
                    setIsAddTermsOpen(false)
                  }}>Add Point</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Edit Dialog */}
          {editingTermsItem && (
            <Dialog open={!!editingTermsItem} onOpenChange={(open) => !open && setEditingTermsItem(null)}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Terms Point</DialogTitle>
                  <DialogDescription>Modify the point title and rich-text formatted description.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-terms-title">Point Title</Label>
                    <Input
                      id="edit-terms-title"
                      value={editingTermsItem.title}
                      onChange={(e) => setEditingTermsItem({ ...editingTermsItem, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Point Content (Rich Text)</Label>
                    <RichTextEditor
                      value={editingTermsItem.content}
                      onChange={(val) => setEditingTermsItem({ ...editingTermsItem, content: val })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-terms-order">Display Order</Label>
                      <Input
                        id="edit-terms-order"
                        type="number"
                        min={0}
                        value={editingTermsItem.order}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0)
                          setEditingTermsItem({ ...editingTermsItem, order: val })
                        }}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <Switch
                        id="edit-terms-active"
                        checked={editingTermsItem.isActive}
                        onCheckedChange={(checked) => setEditingTermsItem({ ...editingTermsItem, isActive: checked })}
                      />
                      <Label htmlFor="edit-terms-active">Active (Visible on public site)</Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingTermsItem(null)}>Cancel</Button>
                  <Button onClick={() => saveTermsItem(editingTermsItem)}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* Typography tab removed — site is locked to Aeonik */}
      </Tabs>
    </ModulePermissionShell>
  )
}
