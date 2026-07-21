import fs from 'fs'

let logic = fs.readFileSync('app/admin/cms/_logic-snippet.txt', 'utf8')
logic = logic.replace(
  /const fileToDataUrl[\s\S]*?const handleUpload = async \(file: File \| undefined, onDone: \(url: string\) => void\) => \{\r?\n    if \(!file\) return\r?\n    const dataUrl = await fileToDataUrl\(file\)\r?\n    if \(dataUrl\) onDone\(dataUrl\)\r?\n  \}/,
  `const handleUpload = async (file: File | undefined, onDone: (url: string) => void) => {
    await handleCmsUpload(file, onDone)
  }`,
)

const page = `'use client'

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

${logic}

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
`

fs.writeFileSync('app/admin/cms/page.tsx', page)
console.log('wrote page', page.split('\n').length, 'lines')
