/**
 * Bundle sidecar entrypoints for the production image.
 * Keeps node_modules external so the runner can use `pnpm install --prod`
 * without shipping tsx/esbuild/supabase Go binaries that fail Trivy.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'sidecar-dist')

const entries = [
  'scripts/socket-server.ts',
  'scripts/lcr-sync-worker.ts',
  'scripts/provider-sync-cron.ts',
  'scripts/system-plans-availability-worker.ts',
  'scripts/system-plans-duplicate-merge-worker.ts',
]

function resolveEsbuildBin() {
  const candidates = [
    path.join(root, 'node_modules', '.bin', 'esbuild'),
    path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
    if (existsSync(c + '.cmd')) return c + '.cmd'
    if (existsSync(c + '.exe')) return c + '.exe'
  }
  return null
}

mkdirSync(outDir, { recursive: true })

const esbuildBin = resolveEsbuildBin()
if (!esbuildBin) {
  console.error('esbuild binary not found (install deps first; comes via tsx)')
  process.exit(1)
}

for (const entry of entries) {
  const base = path.basename(entry, '.ts')
  const outfile = path.join(outDir, `${base}.js`)
  const args = [
    path.join(root, entry),
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--packages=external',
    `--alias:@=${root}`,
    `--outfile=${outfile}`,
  ]
  console.log(`bundling ${entry} -> ${path.relative(root, outfile)}`)
  const res = spawnSync(esbuildBin, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) {
    console.error(`esbuild failed for ${entry}`)
    process.exit(res.status || 1)
  }
}

console.log('sidecar-dist bundle complete')
