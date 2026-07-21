'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Settings,
  Save,
  RotateCcw,
  Eye,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileText,
} from 'lucide-react'
import { PrivacyFaqItem, TermsSectionItem } from '@/lib/cms-store'
import Link from 'next/link'
import { ModulePermissionShell } from '@/components/admin/module-permission-shell'
import { CmsEditorProvider } from '@/app/admin/cms/hooks/cms-editor-context'
import { handleCmsUpload } from '@/app/admin/cms/services/cms-upload'
import { HeroTab } from '@/components/admin/cms/hero-tab'
import { TopupTab } from '@/components/admin/cms/topup-tab'
import { HelpTab } from '@/components/admin/cms/help-tab'
import { FooterTab } from '@/components/admin/cms/footer-tab'
import { CareersTab } from '@/components/admin/cms/careers-tab'
import { ContactTab } from '@/components/admin/cms/contact-tab'
import { AboutTab } from '@/components/admin/cms/about-tab'
import { PrivacyTab } from '@/components/admin/cms/privacy-tab'
import { TermsTab } from '@/components/admin/cms/terms-tab'

﻿export default function CMSPage() {
  const tabsScrollRef = useRef<HTMLDivElement>(null)

  const scrollTabsLeft = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const scrollTabsRight = () => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

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
    markClean,
    updateHelpPage,
    updateCareersPage,
    updateContactPage,
    updateAboutPage,
    updatePrivacyPage,
    updateTermsPage
  } = useCMSStore()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editingFAQ, setEditingFAQ] = useState<FAQItem | null>(null)
  const [newFAQ, setNewFAQ] = useState({ question: '', answer: '' })
  const [editingHelpFAQ, setEditingHelpFAQ] = useState<FAQItem | null>(null)
  const [newHelpFAQ, setNewHelpFAQ] = useState({ question: '', answer: '' })
  const [editingCountry, setEditingCountry] = useState<PopularCountry | null>(null)
  const [newCountry, setNewCountry] = useState({ code: '', name: '', flag: '', dialCode: '' })
  const [editingPrivacyItem, setEditingPrivacyItem] = useState<PrivacyFaqItem | null>(null)
  const [newPrivacy, setNewPrivacy] = useState({ question: '', answer: '', order: 1 })
  const [isAddPrivacyOpen, setIsAddPrivacyOpen] = useState(false)
  const [editingTermsItem, setEditingTermsItem] = useState<TermsSectionItem | null>(null)
  const [newTerms, setNewTerms] = useState({ title: '', content: '', order: 0 })
  const [isAddTermsOpen, setIsAddTermsOpen] = useState(false)
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

  const handleUpload = async (file: File | undefined, onDone: (url: string) => void) => {
    await handleCmsUpload(file, onDone)
  }

  const addPrivacyItem = () => {
    const currentSections = content.privacyPage?.sections ?? []
    const newId = 'p-' + Date.now()
    const updatedSections = [
      ...currentSections,
      {
        id: newId,
        question: newPrivacy.question,
        answer: newPrivacy.answer,
        order: Number(newPrivacy.order) || (currentSections.length + 1),
        isActive: true,
      }
    ]
    updatePrivacyPage({ sections: updatedSections })
    setNewPrivacy({ question: '', answer: '', order: currentSections.length + 2 })
  }

  const savePrivacyItem = (updatedItem: PrivacyFaqItem) => {
    const currentSections = content.privacyPage?.sections ?? []
    const updatedSections = currentSections.map((sec) =>
      sec.id === updatedItem.id ? updatedItem : sec
    )
    updatePrivacyPage({ sections: updatedSections })
    setEditingPrivacyItem(null)
  }

  const deletePrivacyItem = (id: string) => {
    const currentSections = content.privacyPage?.sections ?? []
    const updatedSections = currentSections.filter((sec) => sec.id !== id)
    updatePrivacyPage({ sections: updatedSections })
  }

  const addTermsItem = () => {
    const currentSections = content.termsPage?.sections ?? []
    const newId = 't-' + Date.now()
    const newItem: TermsSectionItem = {
      id: newId,
      title: newTerms.title,
      content: newTerms.content,
      order: Number(newTerms.order) === 0 ? 0 : (Number(newTerms.order) || 0),
      isActive: true,
    }

    const otherItems = [...currentSections].sort((a, b) => a.order - b.order)
    const targetOrder = Math.max(0, newItem.order)
    const updatedSections: TermsSectionItem[] = []

    let inserted = false
    for (let i = 0; i < otherItems.length; i++) {
      if (i === targetOrder) {
        updatedSections.push(newItem)
        inserted = true
      }
      updatedSections.push(otherItems[i])
    }
    if (!inserted) {
      updatedSections.push(newItem)
    }

    const finalSections = updatedSections.map((item, index) => ({
      ...item,
      order: index
    }))

    updateTermsPage({ sections: finalSections })
    setNewTerms({ title: '', content: '', order: finalSections.length })
  }

  const saveTermsItem = (updatedItem: TermsSectionItem) => {
    const currentSections = content.termsPage?.sections ?? []

    const otherItems = currentSections
      .filter((sec) => sec.id !== updatedItem.id)
      .sort((a, b) => a.order - b.order)

    const targetOrder = Math.max(0, updatedItem.order)
    const updatedSections: TermsSectionItem[] = []

    let inserted = false
    for (let i = 0; i < otherItems.length; i++) {
      if (i === targetOrder) {
        updatedSections.push(updatedItem)
        inserted = true
      }
      updatedSections.push(otherItems[i])
    }
    if (!inserted) {
      updatedSections.push(updatedItem)
    }

    const finalSections = updatedSections.map((item, index) => ({
      ...item,
      order: index
    }))

    updateTermsPage({ sections: finalSections })
    setEditingTermsItem(null)
  }

  const deleteTermsItem = (id: string) => {
    const currentSections = content.termsPage?.sections ?? []
    const updatedSections = currentSections
      .filter((sec) => sec.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        ...item,
        order: index
      }))
    updateTermsPage({ sections: updatedSections })
  }

  const handleSave = async () => {
    // Validate team quotes card fields
    const quotesList = content.aboutPage?.teamQuotes ?? []
    const hasEmptyField = quotesList.some(
      (q) => !q.name.trim() || !q.role.trim() || !q.quote.trim()
    )
    if (hasEmptyField) {
      alert("Please fill in Name, Role/Title, and Quote Text for all team quote cards before saving.")
      return
    }

    // Validate operator slider items (must have imageSrc)
    const operatorItems = content.operatorsSlider?.items ?? []
    const missingLogo = operatorItems.some((op) => !op.imageSrc || !op.imageSrc.trim())
    if (missingLogo) {
      alert("Please upload a logo image for all operator items before saving.")
      return
    }

    // Validate Mission & Features Section
    const s3 = content.sectionThree
    if (!s3.headlineLine1?.trim() || !s3.description?.trim()) {
      alert("Please fill in Headline line 1 and Description in the Mission & Features section before saving.")
      return
    }
    const s3Features = s3.features ?? []
    for (const feat of s3Features) {
      if (!feat.iconImageSrc || !feat.iconImageSrc.trim()) {
        alert("Please upload an icon for all columns in the Mission & Features section before saving.")
        return
      }
      if (!feat.titleAccent?.trim() && !feat.titleRest?.trim()) {
        alert("Please fill in at least one title field for all columns in the Mission & Features section before saving.")
        return
      }
    }

    // Validate How it works Section
    const how = content.howItWorks
    if (!how.title?.trim()) {
      alert("Please fill in the Title in the How it works section before saving.")
      return
    }
    const howSteps = how.steps ?? []
    for (const step of howSteps) {
      if (!step.imageSrc || !step.imageSrc.trim()) {
        alert("Please upload an image for all steps in the How it works section before saving.")
        return
      }
      if (!step.titleLine1?.trim()) {
        alert("Please fill in Line 1 title for all steps in the How it works section before saving.")
        return
      }
    }

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


  const editorValue = {
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
  }

  return (
    <ModulePermissionShell module="cms" className="space-y-6 p-4 sm:p-5 lg:p-6">
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
              <Button variant="outline" className="gap-2" data-perm="edit">
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
          <Button onClick={handleSave} disabled={saveStatus === 'saving'} className="gap-2" data-perm="edit">
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
        <div className="bg-yellow-50  border border-yellow-200  rounded-lg p-3 text-sm text-yellow-800 ">
          You have unsaved changes. Click &quot;Save Changes&quot; to publish your updates.
        </div>
      )}

      <CmsEditorProvider value={editorValue}>
        <Tabs defaultValue="hero" className="space-y-6">
          <div className="relative flex items-center w-full border rounded-xl bg-neutral-50/50 p-1.5 shadow-sm">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute left-1 z-10 h-7 w-7 rounded-full bg-white shadow-sm border border-neutral-200/60 hover:bg-neutral-50 flex items-center justify-center shrink-0"
              onClick={scrollTabsLeft}
            >
              <ChevronLeft className="h-3.5 w-3.5 text-neutral-500" />
            </Button>

            <div
              ref={tabsScrollRef}
              className="w-full overflow-x-auto px-10 pb-0.5 scroll-smooth select-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <TabsList className="inline-flex w-max justify-start gap-1 bg-transparent p-0 border-0 shadow-none">
                <TabsTrigger value="hero" className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  <span>Hero</span>
                </TabsTrigger>
                <TabsTrigger value="help" className="gap-2">
                  <LifeBuoy className="h-4 w-4" />
                  <span>Help Page</span>
                </TabsTrigger>
                <TabsTrigger value="footer" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Footer</span>
                </TabsTrigger>
                <TabsTrigger value="careers" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>Careers Page</span>
                </TabsTrigger>
                <TabsTrigger value="about" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>About Page</span>
                </TabsTrigger>
                <TabsTrigger value="privacy" className="gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Privacy Policy</span>
                </TabsTrigger>
                <TabsTrigger value="terms" className="gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Terms & Conditions</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-1 z-10 h-7 w-7 rounded-full bg-white shadow-sm border border-neutral-200/60 hover:bg-neutral-50 flex items-center justify-center shrink-0"
              onClick={scrollTabsRight}
            >
              <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
            </Button>
          </div>

          <HeroTab />
          <TopupTab />
          <HelpTab />
          <FooterTab />
          <CareersTab />
          <ContactTab />
          <AboutTab />
          <PrivacyTab />
          <TermsTab />
        </Tabs>
      </CmsEditorProvider>
    </ModulePermissionShell>
  )
}
