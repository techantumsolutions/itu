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


export function AboutTab() {
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
        size="sm"
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
        size="sm"
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
        size="sm"
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
        size="sm"
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
                        size="sm"
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
            size="sm"
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
                        size="sm"
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
                        size="sm"
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
</>
  )
}
