/**
 * Re-apply registry / merge-history objects missing after a dump import
 * (migrations may be recorded in schema_migrations but tables absent).
 *
 *   npm run db:repair-registry-schema
 *   npm run db:repair-registry-schema -- --seed
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { spawnSync } from 'child_process'

const DB_CONTAINER = 'supabase_db_itu'

const MIGRATIONS = [
  '20260616120000_domain_operator_registry.sql',
  '20260616130000_operator_domain_registry_country.sql',
  '20260616140000_operator_merge_history.sql',
  '20260616170000_merge_history_enhancements.sql',
]

const GRANTS = `
GRANT ALL ON TABLE domain_operator_registry TO anon, authenticated, service_role;
GRANT ALL ON TABLE operator_merge_history TO anon, authenticated, service_role;
GRANT ALL ON TABLE plan_merge_history TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
`

function runPsql(sql: string): number {
  const exec = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', shell: true },
  )
  if (exec.stdout) process.stdout.write(exec.stdout)
  if (exec.stderr) process.stderr.write(exec.stderr)
  return exec.status ?? 1
}

function tableExists(name: string): boolean {
  const exec = spawnSync(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tAc',
      `SELECT to_regclass('public.${name}') IS NOT NULL;`,
    ],
    { encoding: 'utf8', shell: true },
  )
  return exec.stdout?.trim() === 't'
}

async function main() {
  const seed = process.argv.includes('--seed')
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations')

  const missing = ['domain_operator_registry', 'operator_merge_history', 'plan_merge_history'].filter(
    (t) => !tableExists(t),
  )

  if (missing.length === 0) {
    console.log('Registry schema tables already present.')
  } else {
    console.log(`Missing tables: ${missing.join(', ')} — applying repair migrations…`)
    for (const file of MIGRATIONS) {
      const path = resolve(migrationsDir, file)
      if (!existsSync(path)) {
        console.error(`Migration file not found: ${path}`)
        process.exit(1)
      }
      console.log(`Applying ${file}…`)
      const sql = readFileSync(path, 'utf8')
      const code = runPsql(sql)
      if (code !== 0) process.exit(code)
    }
    const grantCode = runPsql(GRANTS)
    if (grantCode !== 0) process.exit(grantCode)
    console.log('Registry schema repair complete.')
  }

  if (seed) {
    console.log('Seeding domain_operator_registry…')
    const seedExec = spawnSync('npm', ['run', 'telecom:seed-registry'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
    })
    if (seedExec.status !== 0) process.exit(seedExec.status ?? 1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
