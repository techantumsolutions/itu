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


export function HelpTab() {
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
                                <DialogContent className="max-w-lg">
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
</>
  )
}
