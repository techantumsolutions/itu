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


export function TopupTab() {
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
</>
  )
}
