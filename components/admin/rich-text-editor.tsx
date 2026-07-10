'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Bold, Italic, List, Palette, Code, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface RichTextEditorProps {
  value: string
  onChange: (val: string) => void
}

const COLOR_PRESETS = [
  { name: 'Black', value: '#111827' },
  { name: 'Dark Blue', value: '#1d2d5b' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Gray', value: '#4b5563' },
]

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isHtmlMode, setIsHtmlMode] = useState(false)
  const [internalHtml, setInternalHtml] = useState(value || '')

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
    setInternalHtml(value || '')
  }, [value])

  const executeCommand = (command: string, arg: string = '') => {
    if (typeof window === 'undefined') return
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    handleInput()
  }

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      setInternalHtml(html)
      onChange(html)
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInternalHtml(val)
    onChange(val)
  }

  return (
    <div className="w-full border rounded-md overflow-hidden bg-background flex flex-col min-h-[300px]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b bg-muted/30 p-1 gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {!isHtmlMode && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => executeCommand('bold')}
                title="Bold"
                className="h-8 w-8 p-0"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => executeCommand('italic')}
                title="Italic"
                className="h-8 w-8 p-0"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => executeCommand('insertUnorderedList')}
                title="Bullet List"
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="Text Color"
                    className="h-8 w-8 p-0"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2 flex flex-col gap-1" align="start">
                  <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Preset Colors</div>
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => executeCommand('foreColor', color.value)}
                      className="flex items-center gap-2 w-full text-left px-2 py-1 text-sm rounded hover:bg-muted"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-muted"
                        style={{ backgroundColor: color.value }}
                      />
                      <span>{color.name}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsHtmlMode(!isHtmlMode)}
          className="h-8 px-2 py-1 text-xs gap-1.5"
        >
          {isHtmlMode ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              <span>Visual</span>
            </>
          ) : (
            <>
              <Code className="h-3.5 w-3.5" />
              <span>HTML</span>
            </>
          )}
        </Button>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 relative flex flex-col">
        {isHtmlMode ? (
          <textarea
            value={internalHtml}
            onChange={handleTextareaChange}
            className="flex-1 w-full min-h-[250px] p-3 font-mono text-sm bg-background border-0 focus:ring-0 focus:outline-none resize-y"
            placeholder="Write raw HTML content..."
          />
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            onBlur={handleInput}
            className="flex-1 w-full min-h-[250px] p-3 focus:outline-none overflow-y-auto
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_ul]:space-y-1
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3 [&_ol]:space-y-1
              [&_strong]:font-bold
              [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:mt-6 [&_h1]:mb-3
              [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3
              [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2"
            style={{ minHeight: '250px' }}
          />
        )}
      </div>
    </div>
  )
}
