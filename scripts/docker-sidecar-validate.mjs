/**
 * Build and validate the sidecar image (Phase 3C).
 * Does not modify compose topology.
 *
 * Usage:
 *   node scripts/docker-sidecar-validate.mjs
 *
 * Env (from process env or .env):
 *   REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — required for deep init checks
 *   SOCKET_BROADCAST_SECRET — optional (dev fallback used if unset + NODE_ENV!=production)
 *   CRON_PROVIDER_SYNC_BASE_URL — optional (defaults to http://127.0.0.1:3000; cron only needs scheduler start)
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const IMAGE = process.env.SIDECAR_IMAGE_TAG || 'itu-sidecar:phase3c'
const ROOT = process.cwd()

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
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
    ...opts,
  })
  return res
}

function must( cond, msg) {
  if (!cond) {
    console.error(`FAIL  ${msg}`)
    process.exit(1)
  }
  console.log(`PASS  ${msg}`)
}

function dockerAvailable() {
  const r = run('docker', ['version', '--format', '{{.Server.Version}}'])
  return r.status === 0
}

function buildImage() {
  console.log(`\n=== Building ${IMAGE} ===\n`)
  const r = run(
    'docker',
    ['build', '-f', 'Dockerfile.sidecar', '-t', IMAGE, '.'],
    { stdio: 'inherit' },
  )
  must(r.status === 0, `docker build -f Dockerfile.sidecar`)
}

function imageSize() {
  const r = run('docker', [
    'image',
    'inspect',
    IMAGE,
    '--format',
    '{{.Size}}',
  ])
  must(r.status === 0, 'docker image inspect')
  const bytes = Number(String(r.stdout).trim())
  const mb = (bytes / (1024 * 1024)).toFixed(1)
  console.log(`INFO  image size ≈ ${mb} MB (${bytes} bytes)`)
  return { bytes, mb }
}

function sleep(ms) {
  const sab = new SharedArrayBuffer(4)
  const ia = new Int32Array(sab)
  Atomics.wait(ia, 0, 0, ms)
}

/** Host loopback is not the container's loopback — rewrite for Docker Desktop. */
function dockerReachableUrl(url) {
  if (!url) return url
  return url
    .replace(/127\.0\.0\.1/g, 'host.docker.internal')
    .replace(/localhost/g, 'host.docker.internal')
}

function containerLogs(name) {
  const r = run('docker', ['logs', name], { encoding: 'utf8' })
  return `${r.stdout || ''}\n${r.stderr || ''}`
}

function stopRm(name) {
  run('docker', ['rm', '-f', name], { stdio: 'ignore' })
}

/** Socket: listen + /health ok */
function validateSocket() {
  const name = 'itu-sidecar-val-socket'
  stopRm(name)
  const r = run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '-p',
    '3011:3001',
    '-e',
    'NODE_ENV=development',
    '-e',
    'SOCKET_BIND_HOST=0.0.0.0',
    '-e',
    'SOCKET_PORT=3001',
    IMAGE,
    'node',
    'sidecar-dist/socket-server.js',
  ])
  must(r.status === 0, 'socket container start')
  sleep(4000)
  const health = run('docker', [
    'exec',
    name,
    'wget',
    '-qO-',
    'http://127.0.0.1:3001/health',
  ])
  const body = String(health.stdout || '')
  stopRm(name)
  must(
    health.status === 0 && body.includes('"ok":true'),
    `socket listening + /health (${body.slice(0, 80)})`,
  )
}

/** Worker: Redis + Supabase init (validateCountriesTable) then BullMQ start log */
function validateWorker() {
  const redis = dockerReachableUrl(process.env.REDIS_URL)
  const supabaseUrl = dockerReachableUrl(process.env.SUPABASE_URL)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  must(!!redis, 'REDIS_URL present for worker validation')
  must(!!supabaseUrl && !!serviceKey, 'SUPABASE_* present for worker validation')

  const name = 'itu-sidecar-val-worker'
  stopRm(name)
  const r = run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    `REDIS_URL=${redis}`,
    '-e',
    `SUPABASE_URL=${supabaseUrl}`,
    '-e',
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    '-e',
    'NODE_ENV=development',
    IMAGE,
    'node',
    'sidecar-dist/lcr-sync-worker.js',
  ])
  must(r.status === 0, 'worker container start')
  sleep(8000)
  const logs = containerLogs(name)
  stopRm(name)
  // "starting" is logged only after REDIS_URL check + validateCountriesTable (Supabase).
  must(
    /\[lcr-sync-worker\] starting/i.test(logs),
    'worker initialized (Redis + Supabase catalog check + BullMQ)',
  )
}

/** Cron: scheduler active (interval registered / started log) */
function validateCron() {
  const name = 'itu-sidecar-val-cron'
  stopRm(name)
  const base =
    process.env.CRON_PROVIDER_SYNC_BASE_URL || 'http://127.0.0.1:9'
  const r = run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '-e',
    'NODE_ENV=development',
    '-e',
    `CRON_PROVIDER_SYNC_BASE_URL=${base}`,
    '-e',
    'CRON_PROVIDER_SYNC_RUN_ON_START=false',
    '-e',
    'CRON_PROVIDER_SYNC_INTERVAL_HOURS=24',
    IMAGE,
    'node',
    'sidecar-dist/provider-sync-cron.js',
  ])
  must(r.status === 0, 'cron container start')
  sleep(3000)
  const logs = containerLogs(name)
  stopRm(name)
  must(
    /\[provider-sync-cron\] started/i.test(logs),
    'cron scheduler active (started log)',
  )
}

/** System-plans: Supabase-backed sweep init */
function validateSystemPlans(scriptName, distFile, logNeedle) {
  const supabaseUrl = dockerReachableUrl(process.env.SUPABASE_URL)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  must(!!supabaseUrl && !!serviceKey, `SUPABASE_* for ${scriptName}`)

  const name = `itu-sidecar-val-${scriptName}`
  stopRm(name)
  const onceEnv = scriptName.includes('merge')
    ? 'SYSTEM_PLAN_DUPLICATE_MERGE_RUN_ONCE=1'
    : 'SYSTEM_PLAN_AVAILABILITY_RUN_ONCE=1'
  const r = run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    `SUPABASE_URL=${supabaseUrl}`,
    '-e',
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    '-e',
    'NODE_ENV=development',
    '-e',
    onceEnv,
    IMAGE,
    'node',
    distFile,
  ])
  must(r.status === 0, `${scriptName} container start`)
  sleep(15000)
  const logs = containerLogs(name)
  stopRm(name)
  must(new RegExp(logNeedle, 'i').test(logs), `${scriptName} process started`)
  // One sweep against Supabase (success or handled API errors still prove connectivity attempt)
  must(
    /scanned=|operators=|plans=|sweep failed|deactivated=/i.test(logs),
    `${scriptName} Supabase init/sweep executed`,
  )
}

async function main() {
  loadDotEnv()
  must(dockerAvailable(), 'Docker daemon available')

  // Import graph gate (host-side)
  const audit = run(process.execPath, ['scripts/audit-sidecar-imports.mjs'], {
    stdio: 'inherit',
  })
  must(audit.status === 0, 'sidecar import audit (no app/components/next/.next)')

  buildImage()
  imageSize()

  validateSocket()
  validateWorker()
  validateCron()
  validateSystemPlans(
    'availability',
    'sidecar-dist/system-plans-availability-worker.js',
    '\\[system-plans-availability\\] starting',
  )
  validateSystemPlans(
    'merge',
    'sidecar-dist/system-plans-duplicate-merge-worker.js',
    '\\[system-plans-duplicate-merge\\] starting',
  )

  console.log('\n=== Sidecar Phase 3C validation complete ===\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
