// @ts-nocheck
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Image as ImageIcon, Plus, Pencil, Trash2, GripVertical, Eye, ExternalLink,
  GalleryHorizontal, Sparkles, ListChecks, Map, LifeBuoy, Shield, FileText,
} from 'lucide-react'
import { RichTextEditor } from '@/components/admin/rich-text-editor'
import Link from 'next/link'
import { FooterLinksEditor } from '@/components/admin/cms/footer-links-editor'
import { useCmsEditor } from '@/app/admin/cms/hooks/cms-editor-context'


export function HeroTab() {
  const {
    content,
    handleUpload,
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
    updateHelpPage,
    updateCareersPage,
    updateContactPage,
    updateAboutPage,
    updatePrivacyPage,
    updateTermsPage,
    editingFAQ,
    setEditingFAQ,
    newFAQ,
    setNewFAQ,
    editingHelpFAQ,
    setEditingHelpFAQ,
    newHelpFAQ,
    setNewHelpFAQ,
    editingCountry,
    setEditingCountry,
    newCountry,
    setNewCountry,
    editingPrivacyItem,
    setEditingPrivacyItem,
    newPrivacy,
    setNewPrivacy,
    isAddPrivacyOpen,
    setIsAddPrivacyOpen,
    editingTermsItem,
    setEditingTermsItem,
    newTerms,
    setNewTerms,
    isAddTermsOpen,
    setIsAddTermsOpen,
    addPrivacyItem,
    savePrivacyItem,
    deletePrivacyItem,
    addTermsItem,
    saveTermsItem,
    deleteTermsItem,
  } = useCmsEditor()

  return (
<>
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
                    placeholder="#E96C32 or empty for default"
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
                              <DialogContent className="max-w-lg">
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
</>
  )
}
