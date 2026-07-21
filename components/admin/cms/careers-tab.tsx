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


export function CareersTab() {
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
</>
  )
}
