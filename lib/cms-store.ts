'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// CMS Content Types
export interface HeroContent {
  title: string
  subtitle: string
  /** Globe / hero background — upload (data URL) or leave empty for default asset */
  backgroundImage: string
  /** Right-column phones artwork — upload or empty for default asset */
  phonesImage: string
  /** Tailwind gradient utility classes (e.g. from-[#0b1b3d]/80 via-...) */
  overlayGradient: string
  /** Hex background for hero section; empty uses site CSS token */
  sectionBgColor: string
  /** Hex for the accent second line in the title; empty uses site CTA orange token */
  accentLineColor: string
  ctaText: string
  showWelcomeBack: boolean
  /** Subcopy under the card title inside the hero form card */
  cardHelperText: string
  /** Full line above app store buttons; empty uses “Click here to Download {logo} Mobile App” */
  appDownloadLine: string
  /** Title above the App Store / Google Play row in the hero */
  storeBadgesTitle: string
  /** Hero-only App Store badge image (data URL or path); empty uses built-in badge when store is shown */
  heroAppStoreBadgeImage: string
  /** Hero-only Google Play badge image */
  heroGooglePlayBadgeImage: string
}

export interface TypographyFamilies {
  h1: string
  h2: string
  h3: string
  h4: string
  h5: string
  p: string
}

export interface TypographyContent {
  /** Full stylesheet URL, e.g. https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap */
  googleFontsStylesheetUrl: string
  /** Logical family name for the uploaded font (used in font-family) */
  customFontFamilyName: string
  /** Data URL from uploaded .woff2 / .woff / .ttf */
  customFontDataUrl: string
  families: TypographyFamilies
}

export interface ServiceToggleContent {
  label: string
  showVouchers: boolean
  vouchersLabel: string
  topupLabel: string
}

export interface TopupCardContent {
  title: string
  placeholder: string
  buttonText: string
  buttonColor: string
  sectionImage: string
}

export interface AppPromoContent {
  /** Main heading, e.g. "Download the ITU App" */
  title: string
  /** Orange accent line under the title */
  accentSubtitle: string
  /** Supporting body line (dark grey) */
  subtitle: string
  /** Right column: phone preview + decorative art (upload or URL) */
  sectionImage: string
  /** Optional custom App Store badge image; falls back to built-in black badge */
  appStoreBadgeImage: string
  /** Optional custom Google Play badge image */
  googlePlayBadgeImage: string
  showAppStore: boolean
  showGooglePlay: boolean
  appStoreUrl: string
  googlePlayUrl: string
  /** Tailwind gradient stops, e.g. from-[#e8edf4] to-[#eef3f9] */
  backgroundGradient: string
}

export interface FAQItem {
  id: string
  question: string
  answer: string
  order: number
  isActive: boolean
}

export interface FAQSectionContent {
  title: string
  /** Intro paragraph under the title (centered on landing) */
  subtitle: string
  sectionImage: string
  items: FAQItem[]
}

export interface CountriesSectionContent {
  sectionImage: string
}

export interface PopularCountry {
  code: string
  name: string
  flag: string
  dialCode: string
  order: number
  isActive: boolean
}

export interface FooterContent {
  /** Intro paragraph under the logo */
  brandTagline: string
  companyLinks: { label: string; href: string }[]
  legalLinks: { label: string; href: string }[]
  helpLinks: { label: string; href: string }[]
  socialLinks: {
    facebook: string
    twitter: string
    instagram: string
    youtube: string
    linkedin: string
  }
  trustBadgeText: string
  backgroundImage: string
  /** Main footer panel (light grey). Hex, e.g. #e4e4e4 */
  mainBackgroundColor: string
  /** Bottom copyright bar */
  subFooterBackgroundColor: string
  /** Use {{brand}} and {{year}} tokens */
  copyrightTemplate: string
}

export interface HeaderContent {
  logoText: string
  backgroundColor: string
  navItems: { label: string; href: string; hasDropdown?: boolean; badge?: string }[]
  showLanguageSelector: boolean
  languages: { code: string; name: string; flag: string }[]
}

export interface AuthPagesContent {
  /** Left-side illustration on /login and /register (data URL upload or site path). */
  leftImage: string
}

export interface TrustSectionContent {
  items: { icon: string; title: string; description: string }[]
}

export interface OperatorSliderLogo {
  id: string
  /** Data URL from CMS upload, or site path e.g. /landing/operators/airtel.svg */
  imageSrc: string
  alt: string
  order: number
  isActive: boolean
}

/** Home section 2 — copy + infinite operator logo strip (no arrows) */
export interface OperatorsSliderContent {
  sectionTitle: string
  sectionBody: string
  /** Seconds for one full marquee cycle */
  marqueeDurationSec: number
  items: OperatorSliderLogo[]
}

export interface SectionThreeFeature {
  id: string
  /** Feature icon — upload (data URL) or site path under /public */
  iconImageSrc: string
  /** First part of the title (brand accent colour) */
  titleAccent: string
  /** Remainder of the title (neutral) */
  titleRest: string
  order: number
  isActive: boolean
}

/** Home section 3 — centered mission headline + three feature columns */
export interface SectionThreeContent {
  headlineLine1: string
  headlineLine2: string
  description: string
  /** Hex for feature title accent segments; empty uses site brand red */
  titleAccentColor: string
  features: SectionThreeFeature[]
}

export interface HowItWorksStep {
  id: string
  imageSrc: string
  titleLine1: string
  titleLine2: string
  order: number
  isActive: boolean
}

/** Home next section — “How it Work” steps (CMS images + titles) */
export interface HowItWorksContent {
  title: string
  subtitle: string
  steps: HowItWorksStep[]
}

export interface SiteContent {
  header: HeaderContent
  hero: HeroContent
  authPages: AuthPagesContent
  typography: TypographyContent
  operatorsSlider: OperatorsSliderContent
  sectionThree: SectionThreeContent
  howItWorks: HowItWorksContent
  countriesGrid: CountriesGridContent
  serviceToggle: ServiceToggleContent
  topupCard: TopupCardContent
  appPromo: AppPromoContent
  faq: FAQSectionContent
  countriesSection: CountriesSectionContent
  popularCountries: PopularCountry[]
  trustSection: TrustSectionContent
  footer: FooterContent
}

export interface CountriesGridItem {
  id: string
  countryCode: string
  countryName: string
  /** Upload (data URL) or site path under /public */
  flagImageSrc: string
  isPopular: boolean
  order: number
  isActive: boolean
}

export interface CountriesGridContent {
  title: string
  subtitle: string
  ctaLabel: string
  items: CountriesGridItem[]
}

// Default content
const defaultContent: SiteContent = {
  header: {
    logoText: 'ITU',
    backgroundColor: '#003d5b',
    navItems: [
      { label: 'Send top-up', href: '/', hasDropdown: true },
      { label: 'Vouchers', href: '/vouchers', badge: 'New' },
      { label: 'Help', href: '/help' },
    ],
    showLanguageSelector: true,
    languages: [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
    ],
  },
  hero: {
    title: 'Instant International Top-Up\nanytime anywhere',
    subtitle: 'Fast, Secure, and Hassle-free.',
    backgroundImage: '',
    phonesImage: '',
    overlayGradient: 'from-[var(--hero-navy)]/80 via-[var(--hero-navy)]/35 to-[var(--hero-navy)]/90',
    sectionBgColor: '',
    accentLineColor: '',
    ctaText: 'Start top-up',
    showWelcomeBack: true,
    cardHelperText: 'Enter the phone number you want to recharge',
    appDownloadLine: '',
    storeBadgesTitle: '',
    heroAppStoreBadgeImage: '',
    heroGooglePlayBadgeImage: '',
  },
  authPages: {
    leftImage: '',
  },
  typography: {
    googleFontsStylesheetUrl: '',
    customFontFamilyName: 'CMSUploadedFont',
    customFontDataUrl: '',
    families: {
      h1: '',
      h2: '',
      h3: '',
      h4: '',
      h5: '',
      p: '',
    },
  },
  operatorsSlider: {
    sectionTitle: 'Instantly recharge phones in 160+ countries',
    sectionBody:
      'Choose a destination, pick an operator plan, and pay securely—we route your top-up in real time so friends and family stay connected without delays.',
    marqueeDurationSec: 42,
    items: [
      { id: 'op-att', alt: 'AT&T', imageSrc: '/landing/operators/att.svg', order: 1, isActive: true },
      { id: 'op-swisscom', alt: 'Swisscom', imageSrc: '/landing/operators/swisscom.svg', order: 2, isActive: true },
      { id: 'op-safaricom', alt: 'Safaricom', imageSrc: '/landing/operators/safaricom.svg', order: 3, isActive: true },
      { id: 'op-verizon', alt: 'Verizon', imageSrc: '/landing/operators/verizon.svg', order: 4, isActive: true },
      { id: 'op-airtel', alt: 'Airtel', imageSrc: '/landing/operators/airtel.svg', order: 5, isActive: true },
      { id: 'op-vodafone', alt: 'Vodafone', imageSrc: '/landing/operators/vodafone.svg', order: 6, isActive: true },
      { id: 'op-celcomdigi', alt: 'CelcomDigi', imageSrc: '/landing/operators/celcomdigi.svg', order: 7, isActive: true },
    ],
  },
  sectionThree: {
    headlineLine1: 'Recharge instantly across 160+ countries.',
    headlineLine2: 'Sign up for free and keep your loved ones always connected.',
    description:
      'We built ITU to bridge distances and bring people closer, no matter where they are in the world. For families living apart, for parents waiting to hear their child\'s voice, and for every moment that matters — a simple top-up can make all the difference. That\'s why we do what we do: to keep connections alive, effortless, and meaningful.',
    titleAccentColor: '',
    features: [
      {
        id: 's3-f1',
        iconImageSrc: '/landing/section3/icon-recharge.svg',
        titleAccent: 'Quick',
        titleRest: 'Easy Recharge',
        order: 1,
        isActive: true,
      },
      {
        id: 's3-f2',
        iconImageSrc: '/landing/section3/icon-secure.svg',
        titleAccent: '100%',
        titleRest: 'Secure Payments',
        order: 2,
        isActive: true,
      },
      {
        id: 's3-f3',
        iconImageSrc: '/landing/section3/icon-support.svg',
        titleAccent: '24/7',
        titleRest: 'Support',
        order: 3,
        isActive: true,
      },
    ],
  },
  howItWorks: {
    title: 'How it Work',
    subtitle:
      'A quick step-by-step flow to recharge any number internationally. Upload your own screens for each step in the CMS.',
    steps: [
      {
        id: 'hiw-1',
        imageSrc: '',
        titleLine1: 'Create Your',
        titleLine2: 'ITU Account',
        order: 1,
        isActive: true,
      },
      {
        id: 'hiw-2',
        imageSrc: '',
        titleLine1: 'Choose Mobile',
        titleLine2: 'Top Up Service',
        order: 2,
        isActive: true,
      },
      {
        id: 'hiw-3',
        imageSrc: '',
        titleLine1: 'Choose Country &',
        titleLine2: 'Input Phone Number',
        order: 3,
        isActive: true,
      },
      {
        id: 'hiw-4',
        imageSrc: '',
        titleLine1: 'Select the Amount',
        titleLine2: 'you Want to Top Up',
        order: 4,
        isActive: true,
      },
      {
        id: 'hiw-5',
        imageSrc: '',
        titleLine1: 'Make Payment',
        titleLine2: '& You’re all Done!',
        order: 5,
        isActive: true,
      },
    ],
  },
  countriesGrid: {
    title: 'Where can you send mobile top-ups?',
    subtitle: 'Send recharge to mobile numbers across 150+ countries worldwide — instantly and securely.',
    ctaLabel: 'Recharge Now',
    items: [
      { id: 'cg-jm', countryCode: 'JM', countryName: 'Jamaica', flagImageSrc: '', isPopular: false, order: 1, isActive: true },
      { id: 'cg-ng', countryCode: 'NG', countryName: 'Nigeria', flagImageSrc: '', isPopular: false, order: 2, isActive: true },
      { id: 'cg-ht', countryCode: 'HT', countryName: 'Haiti', flagImageSrc: '', isPopular: true, order: 3, isActive: true },
      { id: 'cg-in', countryCode: 'IN', countryName: 'India', flagImageSrc: '', isPopular: false, order: 4, isActive: true },
      { id: 'cg-gh', countryCode: 'GH', countryName: 'Ghana', flagImageSrc: '', isPopular: false, order: 5, isActive: true },
      { id: 'cg-ke', countryCode: 'KE', countryName: 'Kenya', flagImageSrc: '', isPopular: false, order: 6, isActive: true },
      { id: 'cg-mx', countryCode: 'MX', countryName: 'Mexico', flagImageSrc: '', isPopular: false, order: 7, isActive: true },
      { id: 'cg-ph', countryCode: 'PH', countryName: 'Philippines', flagImageSrc: '', isPopular: false, order: 8, isActive: true },
    ],
  },
  serviceToggle: {
    label: 'Services to send on ITU',
    showVouchers: true,
    vouchersLabel: 'Vouchers',
    topupLabel: 'Top-up',
  },
  topupCard: {
    title: 'Send Top-Up',
    placeholder: 'Enter mobile number',
    buttonText: 'Top-up now',
    buttonColor: '#E30613',
    sectionImage: '',
  },
  appPromo: {
    title: 'Download the ITU App',
    accentSubtitle: 'Top-up wherever, whenever',
    subtitle: 'Recharge anytime, anywhere with just a few taps.',
    sectionImage: '',
    appStoreBadgeImage: '',
    googlePlayBadgeImage: '',
    showAppStore: true,
    showGooglePlay: true,
    appStoreUrl: '#',
    googlePlayUrl: '#',
    backgroundGradient: 'from-[#e4ecf4] via-[#eef3f8] to-[#f2f6fb]',
  },
  faq: {
    title: 'FAQ',
    subtitle:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    sectionImage: '',
    items: [
      { id: '1', question: 'What is ITU?', answer: 'ITU is a leading international mobile top-up platform that allows you to send airtime and data to mobile phones in over 150 countries instantly.', order: 1, isActive: true },
      { id: '2', question: 'What is an international top-up?', answer: 'An international top-up is a way to add credit or data to a mobile phone in another country.', order: 2, isActive: true },
      { id: '3', question: 'Can I send mobile recharges from abroad?', answer: 'Yes! You can send mobile recharges from anywhere in the world.', order: 3, isActive: true },
      { id: '4', question: 'How to send a top-up online?', answer: 'Simply enter the phone number, select country and operator, choose an amount, and complete payment.', order: 4, isActive: true },
      { id: '5', question: 'Can I also send data?', answer: 'Yes! Many operators offer data bundles that you can send.', order: 5, isActive: true },
      { id: '6', question: 'Can I pay with my credit card?', answer: 'Yes, we accept all major credit and debit cards including Visa, Mastercard, and American Express.', order: 6, isActive: true },
    ],
  },
  countriesSection: {
    sectionImage: '',
  },
  popularCountries: [
    { code: 'IN', name: 'India', flag: '🇮🇳', dialCode: '+91', order: 1, isActive: true },
    { code: 'NG', name: 'Nigeria', flag: '🇳🇬', dialCode: '+234', order: 2, isActive: true },
    { code: 'PH', name: 'Philippines', flag: '🇵🇭', dialCode: '+63', order: 3, isActive: true },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽', dialCode: '+52', order: 4, isActive: true },
    { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', dialCode: '+880', order: 5, isActive: true },
    { code: 'PK', name: 'Pakistan', flag: '🇵🇰', dialCode: '+92', order: 6, isActive: true },
  ],
  trustSection: {
    items: [
      { icon: 'shield', title: 'Secure payments', description: '256-bit SSL encryption' },
      { icon: 'zap', title: 'Instant delivery', description: '99% delivered in 30 seconds' },
      { icon: 'globe', title: '150+ countries', description: '600+ operators worldwide' },
    ],
  },
  footer: {
    brandTagline:
      'Instantly recharge mobile numbers worldwide with a fast and secure experience. Stay connected with your loved ones anytime, anywhere.',
    companyLinks: [
      { label: 'About us', href: '/about' },
      { label: 'Press', href: '/press' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact us', href: '/contact' },
    ],
    legalLinks: [
      { label: 'Privacy notice', href: '/privacy' },
      { label: 'Terms & conditions', href: '/terms' },
      { label: 'Cookies', href: '/cookies' },
    ],
    helpLinks: [
      { label: 'Help', href: '/help' },
      { label: 'Support center', href: '/support' },
    ],
    socialLinks: {
      facebook: '#',
      twitter: '#',
      instagram: '#',
      youtube: '#',
      linkedin: '#',
    },
    trustBadgeText: 'Protected by Trustwave. Secure 128-bit SSL Encrypted.',
    backgroundImage: '',
    mainBackgroundColor: '#e4e4e4',
    subFooterBackgroundColor: '#d0d0d0',
    copyrightTemplate: '© {{brand}} {{year}}. All rights reserved.',
  },
}

interface CMSStore {
  content: SiteContent
  isDirty: boolean
  hasHydrated: boolean
  setHasHydrated: (hydrated: boolean) => void
  setContent: (content: Partial<SiteContent> | SiteContent, opts?: { markDirty?: boolean }) => void
  updateHero: (hero: Partial<HeroContent>) => void
  updateAuthPages: (auth: Partial<AuthPagesContent>) => void
  updateServiceToggle: (toggle: Partial<ServiceToggleContent>) => void
  updateTopupCard: (card: Partial<TopupCardContent>) => void
  updateAppPromo: (promo: Partial<AppPromoContent>) => void
  updateFAQ: (faq: Partial<FAQSectionContent>) => void
  updateCountriesSection: (section: Partial<CountriesSectionContent>) => void
  addFAQItem: (item: Omit<FAQItem, 'id' | 'order'>) => void
  updateFAQItem: (id: string, item: Partial<FAQItem>) => void
  deleteFAQItem: (id: string) => void
  updatePopularCountries: (countries: PopularCountry[]) => void
  updateHeader: (header: Partial<HeaderContent>) => void
  updateFooter: (footer: Partial<FooterContent>) => void
  updateTrustSection: (trust: Partial<TrustSectionContent>) => void
  updateTypography: (typography: Partial<TypographyContent>) => void
  updateOperatorsSlider: (section: Partial<OperatorsSliderContent>) => void
  updateOperatorSliderItem: (id: string, item: Partial<OperatorSliderLogo>) => void
  addOperatorSliderItem: (item: Omit<OperatorSliderLogo, 'id' | 'order'>) => void
  deleteOperatorSliderItem: (id: string) => void
  updateSectionThree: (section: Partial<SectionThreeContent>) => void
  updateSectionThreeFeature: (id: string, item: Partial<SectionThreeFeature>) => void
  addSectionThreeFeature: (item: Omit<SectionThreeFeature, 'id' | 'order'>) => void
  deleteSectionThreeFeature: (id: string) => void
  updateHowItWorks: (section: Partial<HowItWorksContent>) => void
  updateHowItWorksStep: (id: string, item: Partial<HowItWorksStep>) => void
  addHowItWorksStep: (item: Omit<HowItWorksStep, 'id' | 'order'>) => void
  deleteHowItWorksStep: (id: string) => void
  updateCountriesGrid: (section: Partial<CountriesGridContent>) => void
  updateCountriesGridItem: (id: string, item: Partial<CountriesGridItem>) => void
  addCountriesGridItem: (item: Omit<CountriesGridItem, 'id' | 'order'>) => void
  deleteCountriesGridItem: (id: string) => void
  resetToDefault: () => void
  markClean: () => void
}

function mergeSiteContent(partial: Partial<SiteContent> | undefined): SiteContent {
  const p = partial ?? {}
  return {
    ...defaultContent,
    ...p,
    header: { ...defaultContent.header, ...p.header },
    hero: { ...defaultContent.hero, ...p.hero },
    authPages: { ...defaultContent.authPages, ...p.authPages },
    typography: {
      ...defaultContent.typography,
      ...p.typography,
      families: {
        ...defaultContent.typography.families,
        ...p.typography?.families,
      },
    },
    serviceToggle: { ...defaultContent.serviceToggle, ...p.serviceToggle },
    topupCard: { ...defaultContent.topupCard, ...p.topupCard },
    appPromo: { ...defaultContent.appPromo, ...p.appPromo },
    faq: {
      ...defaultContent.faq,
      ...p.faq,
      items: p.faq?.items ?? defaultContent.faq.items,
    },
    countriesSection: { ...defaultContent.countriesSection, ...p.countriesSection },
    popularCountries: p.popularCountries ?? defaultContent.popularCountries,
    trustSection: {
      ...defaultContent.trustSection,
      ...p.trustSection,
      items: p.trustSection?.items ?? defaultContent.trustSection.items,
    },
    operatorsSlider: {
      ...defaultContent.operatorsSlider,
      ...p.operatorsSlider,
      items: p.operatorsSlider?.items ?? defaultContent.operatorsSlider.items,
    },
    sectionThree: {
      ...defaultContent.sectionThree,
      ...p.sectionThree,
      features: p.sectionThree?.features ?? defaultContent.sectionThree.features,
    },
    howItWorks: {
      ...defaultContent.howItWorks,
      ...p.howItWorks,
      steps: p.howItWorks?.steps ?? defaultContent.howItWorks.steps,
    },
    countriesGrid: {
      ...defaultContent.countriesGrid,
      ...p.countriesGrid,
      items: (p.countriesGrid?.items ?? defaultContent.countriesGrid.items).map((item) => {
        const { operatorsCount: _legacy, ...rest } = item as CountriesGridItem & { operatorsCount?: number }
        return rest
      }),
    },
    footer: {
      ...defaultContent.footer,
      ...p.footer,
      socialLinks: {
        ...defaultContent.footer.socialLinks,
        ...(p.footer?.socialLinks ?? {}),
      },
      companyLinks: p.footer?.companyLinks ?? defaultContent.footer.companyLinks,
      legalLinks: p.footer?.legalLinks ?? defaultContent.footer.legalLinks,
      helpLinks: p.footer?.helpLinks ?? defaultContent.footer.helpLinks,
    },
  }
}

export const useCMSStore = create<CMSStore>()(
  persist(
    (set, get) => ({
      content: defaultContent,
      isDirty: false,
      hasHydrated: false,
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      setContent: (content, opts) =>
        set(() => ({
          content: mergeSiteContent(content as Partial<SiteContent>),
          isDirty: opts?.markDirty ?? false,
        })),

      updateHero: (hero) =>
        set((state) => ({
          content: { ...state.content, hero: { ...state.content.hero, ...hero } },
          isDirty: true,
        })),

      updateAuthPages: (auth) =>
        set((state) => ({
          content: { ...state.content, authPages: { ...state.content.authPages, ...auth } },
          isDirty: true,
        })),

      updateServiceToggle: (toggle) =>
        set((state) => ({
          content: { ...state.content, serviceToggle: { ...state.content.serviceToggle, ...toggle } },
          isDirty: true,
        })),

      updateTopupCard: (card) =>
        set((state) => ({
          content: { ...state.content, topupCard: { ...state.content.topupCard, ...card } },
          isDirty: true,
        })),

      updateAppPromo: (promo) =>
        set((state) => ({
          content: { ...state.content, appPromo: { ...state.content.appPromo, ...promo } },
          isDirty: true,
        })),

      updateFAQ: (faq) =>
        set((state) => ({
          content: { ...state.content, faq: { ...state.content.faq, ...faq } },
          isDirty: true,
        })),

      updateCountriesSection: (section) =>
        set((state) => ({
          content: {
            ...state.content,
            countriesSection: { ...state.content.countriesSection, ...section },
          },
          isDirty: true,
        })),

      addFAQItem: (item) =>
        set((state) => {
          const newId = `faq-${Date.now()}`
          const maxOrder = Math.max(...state.content.faq.items.map((i) => i.order), 0)
          return {
            content: {
              ...state.content,
              faq: {
                ...state.content.faq,
                items: [...state.content.faq.items, { ...item, id: newId, order: maxOrder + 1 }],
              },
            },
            isDirty: true,
          }
        }),

      updateFAQItem: (id, item) =>
        set((state) => ({
          content: {
            ...state.content,
            faq: {
              ...state.content.faq,
              items: state.content.faq.items.map((i) => (i.id === id ? { ...i, ...item } : i)),
            },
          },
          isDirty: true,
        })),

      deleteFAQItem: (id) =>
        set((state) => ({
          content: {
            ...state.content,
            faq: {
              ...state.content.faq,
              items: state.content.faq.items.filter((i) => i.id !== id),
            },
          },
          isDirty: true,
        })),

      updatePopularCountries: (countries) =>
        set((state) => ({
          content: { ...state.content, popularCountries: countries },
          isDirty: true,
        })),

      updateHeader: (header) =>
        set((state) => ({
          content: { ...state.content, header: { ...state.content.header, ...header } },
          isDirty: true,
        })),

      updateFooter: (footer) =>
        set((state) => ({
          content: {
            ...state.content,
            footer: {
              ...state.content.footer,
              ...footer,
              socialLinks: footer.socialLinks
                ? { ...state.content.footer.socialLinks, ...footer.socialLinks }
                : state.content.footer.socialLinks,
            },
          },
          isDirty: true,
        })),

      updateTrustSection: (trust) =>
        set((state) => ({
          content: { ...state.content, trustSection: { ...state.content.trustSection, ...trust } },
          isDirty: true,
        })),

      updateTypography: (typography) =>
        set((state) => ({
          content: {
            ...state.content,
            typography: {
              ...state.content.typography,
              ...typography,
              families: {
                ...state.content.typography.families,
                ...(typography.families ?? {}),
              },
            },
          },
          isDirty: true,
        })),

      updateOperatorsSlider: (section) =>
        set((state) => ({
          content: {
            ...state.content,
            operatorsSlider: {
              ...state.content.operatorsSlider,
              ...section,
              items: section.items ?? state.content.operatorsSlider.items,
            },
          },
          isDirty: true,
        })),

      updateOperatorSliderItem: (id, item) =>
        set((state) => ({
          content: {
            ...state.content,
            operatorsSlider: {
              ...state.content.operatorsSlider,
              items: state.content.operatorsSlider.items.map((x) =>
                x.id === id ? { ...x, ...item } : x,
              ),
            },
          },
          isDirty: true,
        })),

      addOperatorSliderItem: (item) =>
        set((state) => {
          const newId = `op-${Date.now()}`
          const maxOrder = Math.max(...state.content.operatorsSlider.items.map((i) => i.order), 0)
          return {
            content: {
              ...state.content,
              operatorsSlider: {
                ...state.content.operatorsSlider,
                items: [
                  ...state.content.operatorsSlider.items,
                  { ...item, id: newId, order: maxOrder + 1 },
                ],
              },
            },
            isDirty: true,
          }
        }),

      deleteOperatorSliderItem: (id) =>
        set((state) => ({
          content: {
            ...state.content,
            operatorsSlider: {
              ...state.content.operatorsSlider,
              items: state.content.operatorsSlider.items.filter((x) => x.id !== id),
            },
          },
          isDirty: true,
        })),

      updateSectionThree: (section) =>
        set((state) => ({
          content: {
            ...state.content,
            sectionThree: {
              ...state.content.sectionThree,
              ...section,
              features: section.features ?? state.content.sectionThree.features,
            },
          },
          isDirty: true,
        })),

      updateSectionThreeFeature: (id, item) =>
        set((state) => ({
          content: {
            ...state.content,
            sectionThree: {
              ...state.content.sectionThree,
              features: state.content.sectionThree.features.map((x) =>
                x.id === id ? { ...x, ...item } : x,
              ),
            },
          },
          isDirty: true,
        })),

      addSectionThreeFeature: (item) =>
        set((state) => {
          const newId = `s3-${Date.now()}`
          const maxOrder = Math.max(...state.content.sectionThree.features.map((i) => i.order), 0)
          return {
            content: {
              ...state.content,
              sectionThree: {
                ...state.content.sectionThree,
                features: [
                  ...state.content.sectionThree.features,
                  { ...item, id: newId, order: maxOrder + 1 },
                ],
              },
            },
            isDirty: true,
          }
        }),

      deleteSectionThreeFeature: (id) =>
        set((state) => ({
          content: {
            ...state.content,
            sectionThree: {
              ...state.content.sectionThree,
              features: state.content.sectionThree.features.filter((x) => x.id !== id),
            },
          },
          isDirty: true,
        })),

      updateHowItWorks: (section) =>
        set((state) => ({
          content: {
            ...state.content,
            howItWorks: {
              ...state.content.howItWorks,
              ...section,
              steps: section.steps ?? state.content.howItWorks.steps,
            },
          },
          isDirty: true,
        })),

      updateHowItWorksStep: (id, item) =>
        set((state) => ({
          content: {
            ...state.content,
            howItWorks: {
              ...state.content.howItWorks,
              steps: state.content.howItWorks.steps.map((x) => (x.id === id ? { ...x, ...item } : x)),
            },
          },
          isDirty: true,
        })),

      addHowItWorksStep: (item) =>
        set((state) => {
          const newId = `hiw-${Date.now()}`
          const maxOrder = Math.max(...state.content.howItWorks.steps.map((i) => i.order), 0)
          return {
            content: {
              ...state.content,
              howItWorks: {
                ...state.content.howItWorks,
                steps: [...state.content.howItWorks.steps, { ...item, id: newId, order: maxOrder + 1 }],
              },
            },
            isDirty: true,
          }
        }),

      deleteHowItWorksStep: (id) =>
        set((state) => ({
          content: {
            ...state.content,
            howItWorks: {
              ...state.content.howItWorks,
              steps: state.content.howItWorks.steps.filter((x) => x.id !== id),
            },
          },
          isDirty: true,
        })),

      updateCountriesGrid: (section) =>
        set((state) => ({
          content: {
            ...state.content,
            countriesGrid: {
              ...state.content.countriesGrid,
              ...section,
              items: section.items ?? state.content.countriesGrid.items,
            },
          },
          isDirty: true,
        })),

      updateCountriesGridItem: (id, item) =>
        set((state) => ({
          content: {
            ...state.content,
            countriesGrid: {
              ...state.content.countriesGrid,
              items: state.content.countriesGrid.items.map((x) => (x.id === id ? { ...x, ...item } : x)),
            },
          },
          isDirty: true,
        })),

      addCountriesGridItem: (item) =>
        set((state) => {
          const newId = `cg-${Date.now()}`
          const maxOrder = Math.max(...state.content.countriesGrid.items.map((i) => i.order), 0)
          return {
            content: {
              ...state.content,
              countriesGrid: {
                ...state.content.countriesGrid,
                items: [...state.content.countriesGrid.items, { ...item, id: newId, order: maxOrder + 1 }],
              },
            },
            isDirty: true,
          }
        }),

      deleteCountriesGridItem: (id) =>
        set((state) => ({
          content: {
            ...state.content,
            countriesGrid: {
              ...state.content.countriesGrid,
              items: state.content.countriesGrid.items.filter((x) => x.id !== id),
            },
          },
          isDirty: true,
        })),

      resetToDefault: () => set({ content: defaultContent, isDirty: true }),

      markClean: () => set({ isDirty: false }),
    }),
    {
      name: 'itu-cms-storage',
      // Critical: do NOT persist CMS content in browser storage.
      // The DB is the source of truth; persisting content causes different browsers to diverge.
      partialize: () => ({}),
      onRehydrateStorage: () => (state, error) => {
        if (error) return
        state?.markClean?.()
        state?.setHasHydrated?.(true)
      },
      merge: (persisted, current) => {
        // With partialize() returning {}, persisted contains no content; keep current defaults.
        return current
      },
    }
  )
)
