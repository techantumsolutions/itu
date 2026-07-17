/**
 * Phase 3D validation: layout gate (host), image sizes, cold start, volume writes, BullMQ flow.
 *
 * Usage: node scripts/docker-phase3d-validate.mjs
 * Requires Docker Desktop + .env with REDIS_URL, SUPABASE_*, CRON_SECRET (for enqueue API if used).
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { randomUUID } from 'crypto'

const ROOT = process.cwd()
const WEB_IMAGE = process.env.WEB_IMAGE_TAG || 'itu-web:phase3d'
const SIDECAR_IMAGE = process.env.SIDECAR_IMAGE_TAG || 'itu-sidecar:phase3c'
const NET = 'itu-phase3d-val'

function loadDotEnv() {
  const p = resolve(ROOT, '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts })
}

function must(cond, msg) {
  if (!cond) {
    console.error(`FAIL  ${msg}`)
    process.exit(1)
  }
  console.log(`PASS  ${msg}`)
}

function sleep(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

function dockerReachableUrl(url) {
  if (!url) return url
  return url
    .replace(/127\.0\.0\.1/g, 'host.docker.internal')
    .replace(/localhost/g, 'host.docker.internal')
}

function verifyHostStandaloneLayout() {
  must(existsSync(join(ROOT, '.next/standalone/server.js')), 'host: .next/standalone/server.js')
  must(existsSync(join(ROOT, '.next/standalone/node_modules')), 'host: traced node_modules')
  must(existsSync(join(ROOT, '.next/static')), 'host: .next/static')
  must(existsSync(join(ROOT, 'public')), 'host: public/')
}

function imageBytes(tag) {
  const r = run('docker', ['image', 'inspect', tag, '--format', '{{.Size}}'])
  if (r.status !== 0) return null
  return Number(String(r.stdout).trim())
}

function fmtMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildWeb() {
  const args = [
    'build',
    '-f',
    'Dockerfile',
    '-t',
    WEB_IMAGE,
    '--build-arg',
    `NEXT_PUBLIC_APP_URL=${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`,
    '--build-arg',
    `NEXT_PUBLIC_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://host.docker.internal:54421'}`,
    '--build-arg',
    `NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''}`,
    '--build-arg',
    `NEXT_PUBLIC_RECAPTCHA_ENABLED=${process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED || 'false'}`,
    '.',
  ]
  console.log('\n=== Building web standalone image ===\n')
  const t0 = Date.now()
  const r = run('docker', args, { stdio: 'inherit' })
  const ms = Date.now() - t0
  must(r.status === 0, `web docker build (${(ms / 1000).toFixed(1)}s)`)
  return ms
}

function buildSidecar() {
  console.log('\n=== Building sidecar image ===\n')
  const t0 = Date.now()
  const r = run(
    'docker',
    ['build', '-f', 'Dockerfile.sidecar', '-t', SIDECAR_IMAGE, '.'],
    { stdio: 'inherit' },
  )
  must(r.status === 0, `sidecar docker build (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

function ensureNetwork() {
  run('docker', ['network', 'create', NET], { stdio: 'ignore' })
}

function rm(name) {
  run('docker', ['rm', '-f', name], { stdio: 'ignore' })
}

function verifyImageLayout() {
  const r = run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    WEB_IMAGE,
    '-c',
    'test -f /app/server.js && test -d /app/node_modules && test -d /app/.next/static && test -d /app/public && echo OK',
  ])
  must(r.status === 0 && String(r.stdout).includes('OK'), 'image layout: server.js + node_modules + .next/static + public')
}

function coldStartHealth() {
  ensureNetwork()
  rm('itu-p3d-redis')
  rm('itu-p3d-web')
  run('docker', [
    'run',
    '-d',
    '--name',
    'itu-p3d-redis',
    '--network',
    NET,
    'redis:7-alpine',
  ])
  sleep(2000)

  const supabaseUrl = dockerReachableUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  const t0 = Date.now()
  const start = run('docker', [
    'run',
    '-d',
    '--name',
    'itu-p3d-web',
    '--network',
    NET,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    'NODE_ENV=production',
    '-e',
    'HOSTNAME=0.0.0.0',
    '-e',
    'PORT=3000',
    '-e',
    `REDIS_URL=redis://itu-p3d-redis:6379`,
    '-e',
    `SUPABASE_URL=${supabaseUrl || ''}`,
    '-e',
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    '-e',
    `OTP_SESSION_SECRET=${process.env.OTP_SESSION_SECRET || 'phase3d-validation-secret'}`,
    WEB_IMAGE,
  ])
  must(start.status === 0, 'web container start')

  let ok = false
  let elapsed = 0
  for (let i = 0; i < 60; i++) {
    sleep(1000)
    const h = run('docker', [
      'exec',
      'itu-p3d-web',
      'wget',
      '-qO-',
      'http://127.0.0.1:3000/api/health',
    ])
    if (h.status === 0 && String(h.stdout).includes('"ok":true')) {
      ok = true
      elapsed = Date.now() - t0
      break
    }
  }
  must(ok, `cold start → GET /api/health 200 in ${elapsed}ms`)
  console.log(`INFO  cold_start_ms=${elapsed}`)
  return elapsed
}

function verifyVolumeWrites() {
  const volUploads = 'itu-p3d-vol-uploads'
  const volRecon = 'itu-p3d-vol-recon'
  const volData = 'itu-p3d-vol-data'
  for (const v of [volUploads, volRecon, volData]) {
    run('docker', ['volume', 'rm', '-f', v], { stdio: 'ignore' })
    run('docker', ['volume', 'create', v], { stdio: 'ignore' })
  }
  rm('itu-p3d-voltest')

  const marker = randomUUID()
  const script = [
    'set -e',
    `echo ${marker} > /app/public/uploads/phase3d.txt`,
    `echo ${marker} > /app/storage/reconciliation/phase3d.txt`,
    `echo ${marker} > /app/data/phase3d.txt`,
    'id -u',
    'test "$(id -u)" = "1001"',
    'cat /app/public/uploads/phase3d.txt',
    'cat /app/storage/reconciliation/phase3d.txt',
    'cat /app/data/phase3d.txt',
  ].join(' && ')

  // Entrypoint chowns volume mounts, then su-exec to nextjs (uid 1001) for the write probe.
  const r2 = run('docker', [
    'run',
    '--rm',
    '--name',
    'itu-p3d-voltest',
    '-v',
    `${volUploads}:/app/public/uploads`,
    '-v',
    `${volRecon}:/app/storage/reconciliation`,
    '-v',
    `${volData}:/app/data`,
    WEB_IMAGE,
    'sh',
    '-c',
    script,
  ])
  const out = `${r2.stdout || ''}${r2.stderr || ''}`
  must(
    r2.status === 0 && out.includes(marker) && out.includes('1001'),
    'volume writes as uid 1001 (uploads/recon/data)',
  )
}

async function bullmqFlow() {
  const redisUrl = 'redis://itu-p3d-redis:6379'
  const supabaseUrl = dockerReachableUrl(process.env.SUPABASE_URL)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  must(!!supabaseUrl && !!serviceKey, 'SUPABASE_* for BullMQ flow')

  rm('itu-p3d-worker')
  const worker = run('docker', [
    'run',
    '-d',
    '--name',
    'itu-p3d-worker',
    '--network',
    NET,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    `REDIS_URL=${redisUrl}`,
    '-e',
    `SUPABASE_URL=${supabaseUrl}`,
    '-e',
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    '-e',
    'NODE_ENV=development',
    SIDECAR_IMAGE,
    'npm',
    'run',
    'lcr:worker',
  ])
  must(worker.status === 0, 'BullMQ worker container start')
  sleep(8000)
  let logs = `${run('docker', ['logs', 'itu-p3d-worker']).stdout || ''}`
  must(/\[lcr-sync-worker\] starting/i.test(logs), 'worker ready before enqueue')

  // Enqueue a job from a one-shot sidecar node process using bullmq
  const jobId = `phase3d-${randomUUID().slice(0, 8)}`
  const enqueueJs = `
const { Queue } = require('bullmq');
(async () => {
  const q = new Queue('provider-sync', { connection: { url: process.env.REDIS_URL } });
  const job = await q.add('provider-full-sync', { providerId: 'phase3d-nonexistent-provider' }, { jobId: '${jobId}', removeOnComplete: 100, removeOnFail: 100 });
  console.log('ENQUEUED', job.id);
  await q.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
`
  const enc = run('docker', [
    'run',
    '--rm',
    '--network',
    NET,
    '-e',
    `REDIS_URL=${redisUrl}`,
    '--entrypoint',
    'node',
    SIDECAR_IMAGE,
    '-e',
    enqueueJs,
  ])
  must(enc.status === 0 && String(enc.stdout).includes('ENQUEUED'), 'enqueue provider-sync job')

  let completed = false
  for (let i = 0; i < 30; i++) {
    sleep(2000)
    logs = `${run('docker', ['logs', 'itu-p3d-worker']).stdout || ''}\n${run('docker', ['logs', 'itu-p3d-worker']).stderr || ''}`
    // Job may fail (unknown provider) but must be consumed — look for completed or failed with job id
    if (
      /\[lcr-sync-worker\] (completed|failed)/i.test(logs) ||
      logs.includes(jobId)
    ) {
      completed = true
      break
    }
  }
  rm('itu-p3d-worker')
  must(completed, 'worker consumed job (completed or failed after processing)')
}

function cleanup() {
  for (const n of [
    'itu-p3d-web',
    'itu-p3d-redis',
    'itu-p3d-worker',
    'itu-p3d-voltest',
  ]) {
    rm(n)
  }
}

async function main() {
  loadDotEnv()
  must(run('docker', ['version']).status === 0, 'Docker available')

  verifyHostStandaloneLayout()

  const buildMs = buildWeb()
  buildSidecar()

  const webSize = imageBytes(WEB_IMAGE)
  const sideSize = imageBytes(SIDECAR_IMAGE)
  must(webSize != null && sideSize != null, 'image sizes readable')
  console.log(`INFO  web_image_size=${fmtMb(webSize)} (${webSize})`)
  console.log(`INFO  sidecar_image_size=${fmtMb(sideSize)} (${sideSize})`)
  console.log(`INFO  total_app_images=${fmtMb(webSize + sideSize)}`)
  console.log(`INFO  web_build_ms=${buildMs}`)

  verifyImageLayout()
  const coldMs = coldStartHealth()
  verifyVolumeWrites()
  await bullmqFlow()

  cleanup()
  console.log('\n=== Phase 3D validation summary ===')
  console.log(`web_size_mb=${(webSize / (1024 * 1024)).toFixed(1)}`)
  console.log(`sidecar_size_mb=${(sideSize / (1024 * 1024)).toFixed(1)}`)
  console.log(`cold_start_ms=${coldMs}`)
  console.log(`web_build_ms=${buildMs}`)
  console.log('OK\n')
}

main().catch((e) => {
  console.error(e)
  cleanup()
  process.exit(1)
})
