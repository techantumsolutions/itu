import fs from 'node:fs'

const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
for (const job of j.jobs) {
  console.log('\n==', job.name, job.conclusion, job.html_url)
  for (const s of job.steps || []) {
    if (s.conclusion && s.conclusion !== 'success' && s.conclusion !== 'skipped') {
      console.log('  FAIL STEP:', s.name, s.conclusion, `~${s.number}`)
    } else if (s.conclusion === 'failure') {
      console.log('  FAIL STEP:', s.name)
    }
  }
  for (const s of job.steps || []) {
    console.log('  -', s.number, s.name, s.conclusion || s.status)
  }
}
