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


export function PrivacyTab() {
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
</>
  )
}
