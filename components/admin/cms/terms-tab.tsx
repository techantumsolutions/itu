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


export function TermsTab() {
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
</>
  )
}
