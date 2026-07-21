/**
 * Bundle sidecar entrypoints for the production image.
 * Keeps node_modules external so the runner can use `pnpm install --prod`
 * without shipping tsx/esbuild/supabase Go binaries that fail Trivy.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
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

const require = createRequire(path.join(root, 'package.json'))
let esbuild
try {
  esbuild = require('esbuild')
} catch (err) {
  console.error('esbuild package not found — run pnpm install (esbuild is a devDependency)')
  console.error(err)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

for (const entry of entries) {
  const base = path.basename(entry, '.ts')
  const outfile = path.join(outDir, `${base}.js`)
  console.log(`bundling ${entry} -> ${path.relative(root, outfile)}`)
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    packages: 'external',
    alias: {
      '@': root,
    },
    logLevel: 'info',
  })
}

console.log('sidecar-dist bundle complete')
