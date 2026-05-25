'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import Link from 'next/link'

export default function CMSPage() {
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
    markClean
  } = useCMSStore()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editingFAQ, setEditingFAQ] = useState<FAQItem | null>(null)
  const [newFAQ, setNewFAQ] = useState({ question: '', answer: '' })
  const [editingCountry, setEditingCountry] = useState<PopularCountry | null>(null)
  const [newCountry, setNewCountry] = useState({ code: '', name: '', flag: '', dialCode: '' })
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

  const handleSave = async () => {
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
    <div className="space-y-6 p-4 sm:p-5 lg:p-6">
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
              <Button variant="outline" className="gap-2">
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
          <Button onClick={handleSave} disabled={saveStatus === 'saving'} className="gap-2">
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
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
          You have unsaved changes. Click &quot;Save Changes&quot; to publish your updates.
        </div>
      )}

      <Tabs defaultValue="hero" className="space-y-6">
        <TabsList className="flex w-full flex-wrap gap-1 lg:inline-flex lg:max-w-full">
          <TabsTrigger value="hero" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Hero</span>
          </TabsTrigger>
          <TabsTrigger value="operators" className="gap-2">
            <GalleryHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Operators</span>
          </TabsTrigger>
          <TabsTrigger value="section3" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Section 3</span>
          </TabsTrigger>
          <TabsTrigger value="how" className="gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">How it works</span>
          </TabsTrigger>
          <TabsTrigger value="topup" className="gap-2">
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Top-up Card</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">FAQ</span>
          </TabsTrigger>
          <TabsTrigger value="countries" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Countries</span>
          </TabsTrigger>
          <TabsTrigger value="countriesGrid" className="gap-2">
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Countries Grid</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="gap-2">
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">App Promo</span>
          </TabsTrigger>
          <TabsTrigger value="footer" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Footer</span>
          </TabsTrigger>
        </TabsList>

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
              <div className="grid gap-4 md:grid-cols-2">
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
                  <Label htmlFor="hero-accent">Accent line color (hex)</Label>
                  <Input
                    id="hero-accent"
                    value={content.hero.accentLineColor}
                    onChange={(e) => updateHero({ accentLineColor: e.target.value })}
                    placeholder="#f15a2b or leave empty for default"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-section-bg">Hero section background (hex)</Label>
                <Input
                  id="hero-section-bg"
                  value={content.hero.sectionBgColor}
                  onChange={(e) => updateHero({ sectionBgColor: e.target.value })}
                  placeholder="Empty = default navy token"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-card-helper">Card helper text</Label>
                <Input
                  id="hero-card-helper"
                  value={content.hero.cardHelperText}
                  onChange={(e) => updateHero({ cardHelperText: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-store-title">App Store / Google Play — title (above badges)</Label>
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
                      type="file"
                      accept="image/*"
                      className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ heroAppStoreBadgeImage: url }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => updateHero({ heroAppStoreBadgeImage: '' })}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Google Play badge image (hero)</Label>
                  <p className="text-xs text-muted-foreground">Optional. Empty uses the built-in black badge.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ heroGooglePlayBadgeImage: url }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => updateHero({ heroGooglePlayBadgeImage: '' })}>
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Globe / background image</Label>
                  <p className="text-xs text-muted-foreground">Upload only. Clear to restore the default globe asset.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ backgroundImage: url }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => updateHero({ backgroundImage: '' })}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phones image</Label>
                  <p className="text-xs text-muted-foreground">Right-side hero artwork. Clear for default.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                      onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateHero({ phonesImage: url }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => updateHero({ phonesImage: '' })}>
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Auth pages left image (Login / Register)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload the left-side image shown on <code>/login</code> and <code>/register</code>. Clear to restore the default.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="cursor-pointer rounded-full border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                    onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAuthPages({ leftImage: url }))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => updateAuthPages({ leftImage: '' })}>
                    Clear
                  </Button>
                </div>
                {content.authPages.leftImage ? (
                  <div className="mt-3 h-32 overflow-hidden rounded-3xl border">
                    <img src={content.authPages.leftImage} alt="Auth pages left image preview" className="size-full object-cover" />
                  </div>
                ) : null}
              </div>

              {(content.hero.backgroundImage || content.hero.overlayGradient) && (
                <div className="relative h-40 overflow-hidden rounded-3xl border">
                  {content.hero.backgroundImage ? (
                    <img src={content.hero.backgroundImage} alt="Hero preview" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      Default globe (no upload)
                    </div>
                  )}
                  <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${content.hero.overlayGradient}`} />
                </div>
              )}

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

              <div className="flex items-center justify-between rounded-full border border-border/80 bg-muted/20 px-4 py-3">
                <div className="space-y-0.5 pr-4">
                  <Label>Show &quot;Welcome back&quot; for logged-in users</Label>
                  <p className="text-xs text-muted-foreground">Personalize the greeting when users are logged in</p>
                </div>
                <Switch
                  className="data-[state=checked]:bg-primary shrink-0"
                  checked={content.hero.showWelcomeBack}
                  onCheckedChange={(checked) => updateHero({ showWelcomeBack: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operators" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Section 2 — Operators slider</CardTitle>
                  <CardDescription>
                    Logos scroll on the home page (navy strip under hero + framed strip next to the phone). Title and
                    body are kept for accessibility/SEO (sr-only on the site). Upload PNG/SVG/WebP per row; clearing an
                    upload uses the default bundled logo for that slot when available.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  className="shrink-0 gap-2"
                  onClick={() =>
                    addOperatorSliderItem({ imageSrc: '', alt: 'Operator', isActive: true })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add logo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Preview</TableHead>
                    <TableHead>Alt text</TableHead>
                    <TableHead className="w-40">Upload</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.operatorsSlider.items
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40">
                            {row.imageSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.imageSrc} alt="" className="max-h-10 max-w-[5.5rem] object-contain" />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No image</span>
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
                              type="file"
                              accept="image/*"
                              className="text-xs"
                              onChange={(e) =>
                                void handleUpload(e.target.files?.[0], (url) =>
                                  updateOperatorSliderItem(row.id, { imageSrc: url }),
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateOperatorSliderItem(row.id, { imageSrc: '' })}
                            >
                              Clear upload
                            </Button>
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="section3" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Section 3 — Mission &amp; features</CardTitle>
                  <CardDescription>
                    Centered headline, supporting paragraph, and three columns with uploadable icons. Each title has an
                    accent segment (brand colour) and a neutral segment.
                  </CardDescription>
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
            </CardHeader>
            <CardContent className="space-y-6">
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
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.sectionThree.features
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                            {row.iconImageSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.iconImageSrc} alt="" className="max-h-14 max-w-14 object-contain" />
                            ) : (
                              <span className="text-[9px] text-muted-foreground">Default</span>
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
                              type="file"
                              accept="image/*"
                              className="text-xs"
                              onChange={(e) =>
                                void handleUpload(e.target.files?.[0], (url) =>
                                  updateSectionThreeFeature(row.id, { iconImageSrc: url }),
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateSectionThreeFeature(row.id, { iconImageSrc: '' })}
                            >
                              Clear upload
                            </Button>
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="how" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>How it works</CardTitle>
                  <CardDescription>
                    The light-blue section showing 5 steps. Update the title/subtitle and upload an image per step.
                  </CardDescription>
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
            </CardHeader>
            <CardContent className="space-y-6">
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
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.howItWorks.steps
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded border bg-muted/40">
                            {row.imageSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.imageSrc} alt="" className="max-h-10 max-w-[5.5rem] object-contain" />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No image</span>
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
                              type="file"
                              accept="image/*"
                              className="text-xs"
                              onChange={(e) =>
                                void handleUpload(e.target.files?.[0], (url) =>
                                  updateHowItWorksStep(row.id, { imageSrc: url }),
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateHowItWorksStep(row.id, { imageSrc: '' })}
                            >
                              Clear upload
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.isActive}
                            onCheckedChange={(checked) => updateHowItWorksStep(row.id, { isActive: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
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

        {/* FAQ Section */}
        <TabsContent value="faq" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>FAQ Section</CardTitle>
                  <CardDescription>Manage frequently asked questions</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
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
                    <TableHead className="w-20">Active</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
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
                      <TableCell>
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={(checked) => updateFAQItem(item.id, { isActive: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setEditingFAQ(item)}>
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

        {/* Popular Countries */}
        <TabsContent value="countries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Popular Countries</CardTitle>
                  <CardDescription>Manage featured destination countries</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
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
                    <TableHead className="w-20">Active</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
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
                      <TableCell>
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
        </TabsContent>

        <TabsContent value="countriesGrid" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Countries Grid (landing)</CardTitle>
                  <CardDescription>
                    Matches the “Where can you send mobile top-ups?” section. Upload flags and control the CTA label.
                    Operator counts on the site come from the live providers API per country code.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  className="shrink-0 gap-2"
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
            </CardHeader>
            <CardContent className="space-y-6">
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
                    <TableHead className="w-28">Flag</TableHead>
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead>Country name</TableHead>
                    <TableHead className="w-24">Popular</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.countriesGrid.items
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-10 w-14 items-center justify-center overflow-hidden rounded border bg-muted/40">
                              {row.flagImageSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={row.flagImageSrc} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Upload</span>
                              )}
                            </div>
                            <Input
                              type="file"
                              accept="image/*"
                              className="max-w-[11rem] text-xs"
                              onChange={(e) =>
                                void handleUpload(e.target.files?.[0], (url) =>
                                  updateCountriesGridItem(row.id, { flagImageSrc: url }),
                                )
                              }
                            />
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* App Promo */}
        <TabsContent value="app" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Download app (landing)</CardTitle>
              <CardDescription>
                Last section on the home page: heading, orange accent line, body copy, store links, and the phone
                graphic on the right. Leave the main image empty to use a simple built-in placeholder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Label htmlFor="app-image">Phone / hero graphic (right column)</Label>
                <Input
                  id="app-image"
                  value={content.appPromo.sectionImage || ''}
                  onChange={(e) => updateAppPromo({ sectionImage: e.target.value })}
                  placeholder="https://... or upload"
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ sectionImage: url }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="app-badge-apple">App Store badge image (optional)</Label>
                  <Input
                    id="app-badge-apple"
                    value={content.appPromo.appStoreBadgeImage ?? ''}
                    onChange={(e) => updateAppPromo({ appStoreBadgeImage: e.target.value })}
                    placeholder="Uses built-in black badge if empty"
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ appStoreBadgeImage: url }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="app-badge-google">Google Play badge image (optional)</Label>
                  <Input
                    id="app-badge-google"
                    value={content.appPromo.googlePlayBadgeImage ?? ''}
                    onChange={(e) => updateAppPromo({ googlePlayBadgeImage: e.target.value })}
                    placeholder="Uses built-in black badge if empty"
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      void handleUpload(e.target.files?.[0], (url) => updateAppPromo({ googlePlayBadgeImage: url }))
                    }
                  />
                </div>
              </div>

              {(content.appPromo.sectionImage ||
                content.appPromo.appStoreBadgeImage ||
                content.appPromo.googlePlayBadgeImage) && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {content.appPromo.sectionImage ? (
                    <div className="relative h-36 overflow-hidden rounded-lg border">
                      <img
                        src={content.appPromo.sectionImage}
                        alt="Phone graphic preview"
                        className="h-full w-full object-contain bg-muted/30"
                      />
                    </div>
                  ) : null}
                  {content.appPromo.appStoreBadgeImage ? (
                    <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-2">
                      <img src={content.appPromo.appStoreBadgeImage} alt="App Store badge preview" className="max-h-full object-contain" />
                    </div>
                  ) : null}
                  {content.appPromo.googlePlayBadgeImage ? (
                    <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-2">
                      <img src={content.appPromo.googlePlayBadgeImage} alt="Google Play badge preview" className="max-h-full object-contain" />
                    </div>
                  ) : null}
                </div>
              )}

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

        {/* Typography tab removed — site is locked to Aeonik */}
      </Tabs>
    </div>
  )
}
