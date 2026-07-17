/**
 * Phase 3E metrics: image sizes, docker history, cold/cached build, cold start.
 * Then runs phase3d validate + smoke against built tags.
 *
 * Usage (Docker Desktop required, BuildKit on by default in modern Docker):
 *   node scripts/docker-phase3e-measure.mjs
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = process.cwd()
const WEB = process.env.WEB_IMAGE_TAG || 'itu-web:phase3e'
const SIDECAR = process.env.SIDECAR_IMAGE_TAG || 'itu-sidecar:phase3e'

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
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
    ...opts,
  })
}

function must(cond, msg) {
  if (!cond) {
    console.error(`FAIL  ${msg}`)
    process.exit(1)
  }
  console.log(`PASS  ${msg}`)
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function fmtMb(n) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function webBuildArgs() {
  return [
    '--build-arg',
    `NEXT_PUBLIC_APP_URL=${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}`,
    '--build-arg',
    `NEXT_PUBLIC_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://host.docker.internal:54421'}`,
    '--build-arg',
    `NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ''}`,
    '--build-arg',
    `NEXT_PUBLIC_RECAPTCHA_ENABLED=${process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED || 'false'}`,
  ]
}

function buildWeb(noCache) {
  const args = ['build', '-f', 'Dockerfile', '-t', WEB, ...webBuildArgs(), '.']
  if (noCache) args.splice(1, 0, '--no-cache')
  const t0 = Date.now()
  const r = run('docker', args, { stdio: 'inherit' })
  return { ok: r.status === 0, ms: Date.now() - t0 }
}

function buildSidecar(noCache) {
  const args = ['build', '-f', 'Dockerfile.sidecar', '-t', SIDECAR, '.']
  if (noCache) args.splice(1, 0, '--no-cache')
  const t0 = Date.now()
  const r = run('docker', args, { stdio: 'inherit' })
  return { ok: r.status === 0, ms: Date.now() - t0 }
}

function imageSize(tag) {
  const r = run('docker', ['image', 'inspect', tag, '--format', '{{.Size}}'])
  return r.status === 0 ? Number(String(r.stdout).trim()) : null
}

function history(tag) {
  const r = run('docker', ['history', tag, '--no-trunc', '--format', '{{.Size}}\t{{.CreatedBy}}'])
  return r.status === 0 ? String(r.stdout) : ''
}

function coldStartMs() {
  const name = 'itu-p3e-cold'
  run('docker', ['rm', '-f', name], { stdio: 'ignore' })
  const t0 = Date.now()
  const start = run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    'NODE_ENV=production',
    '-e',
    'HOSTNAME=0.0.0.0',
    '-e',
    'PORT=3000',
    '-e',
    `REDIS_URL=${process.env.REDIS_URL || 'redis://host.docker.internal:6379'}`.replace(
      /127\.0\.0\.1|localhost/g,
      'host.docker.internal',
    ),
    '-e',
    `SUPABASE_URL=${(process.env.SUPABASE_URL || '').replace(/127\.0\.0\.1|localhost/g, 'host.docker.internal')}`,
    '-e',
    `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
    '-e',
    `OTP_SESSION_SECRET=${process.env.OTP_SESSION_SECRET || 'phase3e-measure-secret'}`,
    WEB,
  ])
  if (start.status !== 0) return null
  let elapsed = null
  for (let i = 0; i < 90; i++) {
    sleep(1000)
    const h = run('docker', ['exec', name, 'wget', '-qO-', 'http://127.0.0.1:3000/api/health'])
    if (h.status === 0 && String(h.stdout).includes('"ok":true')) {
      elapsed = Date.now() - t0
      break
    }
  }
  run('docker', ['rm', '-f', name], { stdio: 'ignore' })
  return elapsed
}

function main() {
  loadDotEnv()
  must(run('docker', ['version']).status === 0, 'Docker available')

  console.log('\n=== Cold build ( --no-cache ) ===\n')
  const coldWeb = buildWeb(true)
  must(coldWeb.ok, `cold web build (${(coldWeb.ms / 1000).toFixed(1)}s)`)
  const coldSide = buildSidecar(true)
  must(coldSide.ok, `cold sidecar build (${(coldSide.ms / 1000).toFixed(1)}s)`)

  console.log('\n=== Cached rebuild ===\n')
  const cachedWeb = buildWeb(false)
  must(cachedWeb.ok, `cached web build (${(cachedWeb.ms / 1000).toFixed(1)}s)`)
  const cachedSide = buildSidecar(false)
  must(cachedSide.ok, `cached sidecar build (${(cachedSide.ms / 1000).toFixed(1)}s)`)

  const webBytes = imageSize(WEB)
  const sideBytes = imageSize(SIDECAR)
  must(webBytes != null && sideBytes != null, 'image sizes')

  console.log('\n=== docker history (web) ===\n')
  console.log(history(WEB))
  console.log('\n=== docker history (sidecar) ===\n')
  console.log(history(SIDECAR))

  const coldStart = coldStartMs()
  must(coldStart != null, `cold start → /api/health (${coldStart}ms)`)

  console.log('\n=== phase3d validate ===\n')
  process.env.WEB_IMAGE_TAG = WEB
  process.env.SIDECAR_IMAGE_TAG = SIDECAR
  const v = run(process.execPath, ['scripts/docker-phase3d-validate.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, WEB_IMAGE_TAG: WEB, SIDECAR_IMAGE_TAG: SIDECAR, DOCKER_BUILDKIT: '1' },
  })
  must(v.status === 0, 'docker:validate:phase3d')

  console.log('\n=== smoke (compose stack must be up, or skip if not) ===\n')
  const smoke = run(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'scripts/docker-smoke-test.ts',
      '--web',
      'http://localhost:3000',
      '--socket',
      'http://localhost:3001',
    ],
    { stdio: 'inherit' },
  )
  if (smoke.status !== 0) {
    console.log('WARN  docker:smoke failed (start prod stack first: npm run docker:prod)')
  } else {
    console.log('PASS  docker:smoke')
  }

  console.log('\n=== Phase 3E metrics ===')
  console.log(`web_image_size=${fmtMb(webBytes)}`)
  console.log(`sidecar_image_size=${fmtMb(sideBytes)}`)
  console.log(`total_app_images=${fmtMb(webBytes + sideBytes)}`)
  console.log(`cold_web_build_s=${(coldWeb.ms / 1000).toFixed(1)}`)
  console.log(`cold_sidecar_build_s=${(coldSide.ms / 1000).toFixed(1)}`)
  console.log(`cached_web_build_s=${(cachedWeb.ms / 1000).toFixed(1)}`)
  console.log(`cached_sidecar_build_s=${(cachedSide.ms / 1000).toFixed(1)}`)
  console.log(`cold_startup_ms=${coldStart}`)
  console.log('OK\n')
}

main()
