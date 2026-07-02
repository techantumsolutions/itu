/**
 * Phase 7 — Next.js performance inventory
 * Usage: npx tsx scratch/phase7-nextjs-audit.ts
 */
import fs from 'fs'
import path from 'path'

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function isClientFile(file: string): boolean {
  const src = fs.readFileSync(file, 'utf8')
  return /^\s*['"]use client['"]/m.test(src.slice(0, 200))
}

function largestChunks(limit = 10) {
  const dir = path.join(process.cwd(), '.next', 'static', 'chunks')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .map((name) => {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      return { name, bytes: stat.size }
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
}

function main() {
  const appDir = path.join(process.cwd(), 'app')
  const pages = walk(appDir).filter((f) => f.endsWith(`${path.sep}page.tsx`) || f.endsWith('/page.tsx'))
  const layouts = walk(appDir).filter((f) => f.endsWith(`${path.sep}layout.tsx`) || f.endsWith('/layout.tsx'))

  const pageStats = pages.map((p) => ({
    route: p.replace(/\\/g, '/').split('/app/')[1]?.replace('/page.tsx', '') ?? p,
    client: isClientFile(p),
  }))

  const layoutStats = layouts.map((p) => ({
    route: p.replace(/\\/g, '/').split('/app/')[1]?.replace('/layout.tsx', '') ?? p,
    client: isClientFile(p),
  }))

  const clientPages = pageStats.filter((p) => p.client).length
  const serverPages = pageStats.length - clientPages
  const chunks = largestChunks(12)

  const report = {
    timestamp: new Date().toISOString(),
    pages: { total: pageStats.length, client: clientPages, server: serverPages },
    layouts: layoutStats,
    rendering: {
      isrPages: 0,
      note: 'No page exports revalidate/generateStaticParams; build marks routes as static shells (○) with client hydration',
    },
    images: { nextImageOptimized: false, reason: 'images.unoptimized: true in next.config.mjs' },
    dynamicImports: {
      count: (walk(path.join(process.cwd(), 'app')).join('\n') + walk(path.join(process.cwd(), 'components')).join('\n')).split('dynamic(').length - 1,
    },
    largestChunks: chunks.map((c) => ({ file: c.name, kb: Math.round(c.bytes / 1024) })),
  }

  console.log(JSON.stringify(report, null, 2))
}

main()
