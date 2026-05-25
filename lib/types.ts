// User & Authentication Types
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  /** App-wide role; `super_admin` is owner / full access. */
  role: 'user' | 'reseller' | 'admin' | 'super_admin'
  phone?: string
  countryCode?: string
  rewardPoints: number
  createdAt: string
  /**
   * When `role === 'admin'`, map of feature flags. `null` = legacy full admin (all features).
   * Ignored for `super_admin`.
   */
  adminPermissions?: Record<string, boolean> | null
  /** Same as `role` for admin kinds; optional mirror for APIs. */
  appRole?: string
}

// Wallet & Transaction Types
export interface Wallet {
  id: string
  userId: string
  balance: number
  currency: string
  lastUpdated: string
}

export interface Transaction {
  id: string
  userId: string
  type: 'topup' | 'recharge' | 'refund' | 'commission' | 'points_earned' | 'points_redeemed'
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  description: string
  createdAt: string
  rewardPoints?: number
  metadata?: {
    phoneNumber?: string
    carrier?: string
    carrierName?: string
    country?: string
    countryName?: string
    orderId?: string
    productName?: string
    skuCode?: string
    providerRef?: string
  }
}

// DingConnect API Types
export interface DingCountry {
  CountryIso: string
  CountryName: string
  InternationalDialingInformation: {
    Prefix: string
    MinimumLength: number
    MaximumLength: number
  }[]
  RegionCodes: string[]
}

export interface DingProvider {
  ProviderCode: string
  CountryIso: string
  Name: string
  ShortName: string
  ValidationRegex: string
  LogoUrl?: string
  RegionCode?: string
}

export interface DingProduct {
  SkuCode: string
  ProviderCode: string
  LocalizationKey: string
  Maximum: {
    SendValue: number
    SendCurrencyIso: string
    ReceiveValue: number
    ReceiveCurrencyIso: string
  }
  Minimum: {
    SendValue: number
    SendCurrencyIso: string
    ReceiveValue: number
    ReceiveCurrencyIso: string
  }
  CommissionRate: number
  ProcessingMode: 'Instant' | 'Batch'
  RedemptionMechanism: string
  Benefits: {
    Type: string
    Value?: number
    Unit?: string
    AdditionalInformation?: string
  }[]
  ValidityPeriodIso?: string
  UatNumber?: string
  DefaultDisplayText: string
  RegionCode?: string
}

export interface DingPromotion {
  PromotionId: string
  SkuCode: string
  StartDateUtc: string
  EndDateUtc: string
  Title: string
  Description: string
}

// App-level types (transformed from API)
export interface Country {
  code: string
  name: string
  flag: string
  dialCode: string
  dialingInfo: {
    prefix: string
    minLength: number
    maxLength: number
  }[]
}

export interface Carrier {
  id: string
  code: string
  name: string
  shortName: string
  logo?: string
  countryCode: string
  validationRegex?: string
  regionCode?: string
}

export interface Product {
  id: string
  skuCode: string
  carrierCode: string
  name: string
  displayText: string
  type: 'data' | 'voice' | 'combo' | 'international'
  // Pricing
  minSendAmount: number
  maxSendAmount: number
  sendCurrency: string
  minReceiveAmount: number
  maxReceiveAmount: number
  receiveCurrency: string
  // Details
  commissionRate: number
  processingMode: 'Instant' | 'Batch'
  benefits: {
    type: string
    value?: number
    unit?: string
    info?: string
  }[]
  validity?: string
  isPromo?: boolean
  promoTitle?: string
  promoEndDate?: string
}

// Order Types
export interface RechargeOrder {
  id: string
  userId?: string
  phoneNumber: string
  countryCode: string
  carrierCode: string
  carrierName: string
  skuCode: string
  productName: string
  sendAmount: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  serviceFee: number
  totalAmount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  providerRef?: string
  distributorRef?: string
  errorCode?: string
  createdAt: string
  completedAt?: string
  rewardPointsEarned?: number
}

// Recurring Recharge
export interface RecurringRecharge {
  id: string
  userId: string
  phoneNumber: string
  countryCode: string
  carrierCode: string
  skuCode: string
  amount: number
  currency: string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'custom'
  customIntervalDays?: number
  nextRunDate: string
  isActive: boolean
  paymentMethodId: string
  createdAt: string
}

// Complaint/Ticket
export interface Ticket {
  id: string
  userId: string
  transactionId: string
  subject: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  adminResponse?: string
}

// Analytics Types
export interface SalesAnalytics {
  date: string
  revenue: number
  orders: number
  previousYearRevenue?: number
}

export interface TopProduct {
  id: string
  name: string
  price: number
  sold: number
  image?: string
}

// Dashboard Stats
export interface DashboardStats {
  totalRevenue: number
  totalOrders: number
  revenueChange: number
  ordersChange: number
  monthlyRevenue: number
  yearlyRevenue: number
  monthlyChange: number
  yearlyChange: number
}

// API Provider Config (Admin)
export interface APIProviderConfig {
  id: string
  name: string
  baseUrl: string
  isActive: boolean
  priority: number
  supportedCountries: string[]
  credentials: {
    apiKey?: string
    clientId?: string
    clientSecret?: string
  }
}

// Service Fee Config
export interface ServiceFeeConfig {
  id: string
  countryCode: string
  minAmount: number
  maxAmount: number
  feeType: 'fixed' | 'percentage'
  feeValue: number
  currency: string
}

// Reward Points Config
export interface RewardConfig {
  pointsPerEuro: number
  minRedemptionPoints: number
  pointsValidityDays: number
  countryCode?: string
}

// Transaction Limit Config
export interface TransactionLimitConfig {
  maxPerNumberPerDay: number
  cooldownDays: number
  maxPerMonth: number
  currency: string
}
