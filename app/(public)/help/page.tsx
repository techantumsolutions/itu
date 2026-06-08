'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { LifeBuoy, Mail, MessageSquareText, PhoneCall, Search } from 'lucide-react'
import { useCMSStore } from '@/lib/cms-store'

const iconMap: Record<string, React.ElementType> = {
  phone: PhoneCall,
  mail: Mail,
  message: MessageSquareText,
  lifebuoy: LifeBuoy,
}

export default function HelpPage() {
  const { content } = useCMSStore()
  const help = content.helpPage

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">{help.title}</h1>
          <p className="mt-2 text-sm text-neutral-400 md:text-base">{help.subtitle}</p>
        </div>

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl bg-white px-4 py-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)] ring-1 ring-black/5 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#eef8ff] ring-1 ring-black/5">
              <Search className="size-5 text-neutral-500" />
            </div>
            <Input
              placeholder={help.searchPlaceholder}
              className="h-11 rounded-xl border-neutral-200/80 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-[var(--hero-cta-orange)]/25"
            />
            <Button className="h-11 rounded-xl bg-[var(--hero-cta-orange)] px-6 font-semibold text-white hover:brightness-105">
              Search
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Tip: try “receipt”, “wrong number”, “payment”, or “voucher”.</p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {help.quickLinks.map((c) => {
            const Icon = iconMap[c.icon] || LifeBuoy
            return (
              <Card key={c.id} className="rounded-2xl border-neutral-200/80 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)]">
                <CardHeader className="space-y-2">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    <Icon className="size-5 text-[var(--hero-cta-orange)]" />
                  </div>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-neutral-600">{c.body}</p>
                  <Button variant="outline" className="h-11 w-full rounded-xl" asChild>
                    <Link href={c.actionHref}>{c.actionLabel}</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 rounded-2xl bg-[#eef8ff] p-5 shadow-sm ring-1 ring-black/5 md:p-7">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <LifeBuoy className="size-5 text-[var(--hero-cta-orange)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-neutral-900">{help.faqTitle}</h2>
              <p className="mt-1 text-sm text-neutral-500">{help.faqSubtitle}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-2 shadow-[0_14px_40px_-28px_rgba(15,23,42,0.35)] ring-1 ring-black/5">
            <Accordion type="single" collapsible>
              {help.faqs.filter(f => f.isActive).sort((a,b) => a.order - b.order).map((f) => (
                <AccordionItem key={f.id} value={f.id} className="border-b border-neutral-200/70 last:border-b-0">
                  <AccordionTrigger className="px-3 text-left text-sm font-semibold text-neutral-900 hover:no-underline">
                    {f.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 text-sm text-neutral-600">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-neutral-600">{help.footerText}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 rounded-xl" asChild>
                <Link href="/topup">Go to Top-up</Link>
              </Button>
              <Button className="h-11 rounded-xl bg-[var(--hero-cta-orange)] px-6 font-semibold text-white hover:brightness-105" asChild>
                <Link href="/account/tickets">Open a ticket</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
