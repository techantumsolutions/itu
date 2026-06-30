import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

async function runOnce() {
  const baseUrl = (process.env.CRON_PROVIDER_SYNC_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
  const endpoint = `${baseUrl}/api/cron/lcr-v2-sync`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.CRON_SECRET?.trim()) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET.trim()}`
  }

  const started = new Date().toISOString()
  try {
    const res = await fetch(endpoint, { method: 'POST', headers })
    const body = await res.text()
    if (!res.ok) {
      console.error(`[provider-sync-cron] ${started} failed status=${res.status} endpoint=${endpoint}`)
      return
    }
    console.log(`[provider-sync-cron] ${started} ok endpoint=${endpoint} body=${body.slice(0, 500)}`)
  } catch (error) {
    console.error(
      `[provider-sync-cron] ${started} request_error endpoint=${endpoint} message=${
        error instanceof Error ? error.message : 'unknown'
      }`,
    )
  }
}

async function main() {
  loadDotEnv()
  const intervalHours = envInt('CRON_PROVIDER_SYNC_INTERVAL_HOURS', 24)
  const runOnStart = String(process.env.CRON_PROVIDER_SYNC_RUN_ON_START || 'true').toLowerCase() !== 'false'
  const intervalMs = intervalHours * 60 * 60 * 1000

  console.log(
    `[provider-sync-cron] started intervalHours=${intervalHours} runOnStart=${runOnStart} pid=${process.pid}`,
  )

  if (runOnStart) {
    await runOnce()
  }

  setInterval(() => {
    void runOnce()
  }, intervalMs)
}

void main()
