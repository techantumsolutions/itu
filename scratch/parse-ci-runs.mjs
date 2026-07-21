import fs from 'node:fs'

const j = JSON.parse(
  fs.readFileSync(
    'C:/Users/Adpinz/.cursor/projects/e-Lovely-Projects-itu/agent-tools/f956ee33-5f15-4d29-b56d-94e57ee0f70c.txt',
    'utf8',
  ),
)
for (const r of j.workflow_runs.slice(0, 10)) {
  console.log([r.id, r.name, r.conclusion, r.head_branch, r.html_url].join(' | '))
}
