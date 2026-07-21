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


export function FooterTab() {
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
</>
  )
}
