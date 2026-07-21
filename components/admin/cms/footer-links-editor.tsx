'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'

function FooterLinksEditor({
  title,
  links,
  onChange,
}: {
  title: string
  links: { label: string; href: string }[]
  onChange: (newLinks: { label: string; href: string }[]) => void
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 gap-2"
          data-perm="create"
          onClick={() => onChange([...links, { label: 'New Link', href: '/' }])}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <div className="space-y-3">
        {links.length === 0 && <p className="text-sm text-muted-foreground">No links added.</p>}
        {links.map((link, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={link.label}
              onChange={(e) => {
                const updated = [...links]
                updated[idx] = { ...link, label: e.target.value }
                onChange(updated)
              }}
              placeholder="Label"
              className="text-xs"
            />
            <Input
              value={link.href}
              onChange={(e) => {
                const updated = [...links]
                updated[idx] = { ...link, href: e.target.value }
                onChange(updated)
              }}
              placeholder="URL"
              className="text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive h-8 w-8"
              data-perm="delete"
              onClick={() => {
                const updated = links.filter((_, i) => i !== idx)
                onChange(updated)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

export { FooterLinksEditor }
