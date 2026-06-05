import { aggListSystemOperators } from '../lib/aggregator/repository'
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1)
        }
        process.env[key] = value.trim()
      }
    }
  }
}

loadEnv()

async function test() {
  console.log('Fetching system operators via repository helper...')
  const ops = await aggListSystemOperators({ includeAllStatus: true, limit: 1000 })
  console.log(`Found ${ops.length} operators.`)

  const statusFilter = 'ACTIVE'
  console.log(`Simulating statusFilter = "${statusFilter}"...`)
  
  const filtered = ops.filter((op) => {
    const opStatus = String(op.status ?? '').trim().toUpperCase()
    const filterStatus = String(statusFilter ?? '').trim().toUpperCase()
    const isActiveOp = ['ACTIVE', 'ONLINE', 'TRUE'].includes(opStatus)
    const isActiveFilter = filterStatus === 'ACTIVE'
    
    const matched = isActiveOp === isActiveFilter
    if (ops.indexOf(op) < 5) {
      console.log(`op.name: "${op.system_operator_name}", op.status: "${op.status}", opStatus: "${opStatus}", isActiveOp: ${isActiveOp}, isActiveFilter: ${isActiveFilter}, matched: ${matched}`)
    }
    return matched
  })

  console.log(`\nFiltered count: ${filtered.length}`)
}

test()
