'use client'

import { createContext, useContext, type ReactNode } from 'react'

/** Loose editor bag — preserves page behavior while enabling tab extraction. */
export type CmsEditorContextValue = Record<string, any>

const CmsEditorContext = createContext<CmsEditorContextValue | null>(null)

export function CmsEditorProvider({
  value,
  children,
}: {
  value: CmsEditorContextValue
  children: ReactNode
}) {
  return <CmsEditorContext.Provider value={value}>{children}</CmsEditorContext.Provider>
}

export function useCmsEditor(): CmsEditorContextValue {
  const ctx = useContext(CmsEditorContext)
  if (!ctx) throw new Error('useCmsEditor must be used within CmsEditorProvider')
  return ctx
}
