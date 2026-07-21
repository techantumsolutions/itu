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


export function ContactTab() {
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
</>
  )
}
