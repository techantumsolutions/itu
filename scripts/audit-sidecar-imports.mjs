import fs from 'fs'
import path from 'path'

const root = process.cwd()
const entries = [
  'scripts/socket-server.ts',
  'scripts/lcr-sync-worker.ts',
  'scripts/provider-sync-cron.ts',
  'scripts/system-plans-availability-worker.ts',
  'scripts/system-plans-duplicate-merge-worker.ts',
]

const seen = new Set()
const queue = entries.map((e) => path.join(root, e))
const bad = []
const topRoots = new Set()

function tryFile(p) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  return null
}

function resolveImport(fromFile, spec) {
  if (spec.startsWith('@/')) {
    const base = path.join(root, spec.slice(2))
    return (
      tryFile(base) ||
      tryFile(base + '.ts') ||
      tryFile(base + '.tsx') ||
      tryFile(path.join(base, 'index.ts'))
    )
  }
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec)
    return (
      tryFile(base) ||
      tryFile(base + '.ts') ||
      tryFile(base + '.tsx') ||
      tryFile(path.join(base, 'index.ts'))
    )
  }
  return null
}

const importRe = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g

while (queue.length) {
  const file = queue.pop()
  if (!file || seen.has(file) || !fs.existsSync(file)) continue
  seen.add(file)

  const rel = path.relative(root, file).replace(/\\/g, '/')
  topRoots.add(rel.split('/')[0])

  if (
    rel.startsWith('app/') ||
    rel.startsWith('components/') ||
    rel.includes('/.next/') ||
    rel.startsWith('.next/')
  ) {
    bad.push({ file: rel, reason: 'forbidden-path' })
  }

  const text = fs.readFileSync(file, 'utf8')
  let m
  while ((m = importRe.exec(text))) {
    const spec = m[1]
    if (spec === 'next' || spec.startsWith('next/')) {
      bad.push({ file: rel, spec, reason: 'next-import' })
    }
    if (spec.startsWith('@/app') || spec.includes('/app/')) {
      bad.push({ file: rel, spec, reason: 'app-import' })
    }
    if (spec.startsWith('@/components') || spec.includes('/components/')) {
      bad.push({ file: rel, spec, reason: 'components-import' })
    }
    const resolved = resolveImport(file, spec)
    if (resolved) queue.push(resolved)
  }
}

console.log(
  JSON.stringify(
    {
      entryCount: entries.length,
      filesScanned: seen.size,
      topLevelRoots: [...topRoots].sort(),
      forbiddenFindings: bad,
      ok: bad.length === 0,
    },
    null,
    2,
  ),
)

process.exit(bad.length === 0 ? 0 : 1)
