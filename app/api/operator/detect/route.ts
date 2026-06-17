import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { detectPublicOperator, fetchPublicOperators } from '@/lib/catalog/public-catalog'
import { getAccountLookup, isApiConfigured as isDingConfigured, getProviders as getDingProviders } from '@/lib/api/ding-connect'
import { fetchDtoneMobileNumberLookup, getDtoneCredentialsFromEnv } from '@/lib/dtone'
import fs from 'fs'
import path from 'path'

function logDetect(data: any) {
  try {
    const logPath = path.join(process.cwd(), 'scratch', 'detect-log.jsonl')
    fs.appendFileSync(logPath, JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n')
  } catch (e) {}
}
export async function POST(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''

    if (!phoneNumber || !countryCode) {
      return NextResponse.json({ error: 'phoneNumber and countryCode are required' }, { status: 400 })
    }

    const result = await detectPublicOperator({ phoneNumber, countryCode })
    logDetect({ event: 'local_db_result', result })
    
    // Fallback logic if local detection returns Unknown
    if (result.operator === 'Unknown') {
      let fallbackResolved = false
      
      // 1. Try Ding Connect if configured
      if (isDingConfigured()) {
        try {
          const dingResult = await getAccountLookup(phoneNumber)
          logDetect({ event: 'ding_api_result', dingResult })
          if (dingResult.ResultCode === 1 && dingResult.Items && dingResult.Items.length > 0) {
            const providerCode = dingResult.Items[0].ProviderCode
            const detectedCountry = dingResult.CountryIso || countryCode
            const operators = await fetchPublicOperators(detectedCountry)
            
            let dingProviderName = providerCode
            try {
              const dingProvidersList = await getDingProviders(detectedCountry)
              const dp = dingProvidersList.find(p => p.ProviderCode === providerCode)
              if (dp && dp.Name) {
                dingProviderName = dp.Name
              }
            } catch (e) {}

            const aliases: Record<string, string[]> = {
              'jio': ['reliance'],
              'reliance': ['jio'],
              'vi': ['vodafone', 'idea'],
              'vodafone': ['vi', 'idea'],
              'idea': ['vi', 'vodafone']
            }

            const normalize = (s: string) => {
              const tokens = s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(Boolean)
              const expanded = new Set(tokens)
              for (const t of tokens) {
                if (aliases[t]) aliases[t].forEach(a => expanded.add(a))
              }
              return Array.from(expanded)
            }
            
            const dingTokens = normalize(dingProviderName)
            
            let matchedOperator = operators.find(o => o.code === providerCode || o.id === providerCode)
            if (!matchedOperator && dingTokens.length > 0) {
              matchedOperator = operators.find(o => {
                const dbTokens = normalize(o.name)
                const ignoreWords = ['ind', 'india', 'topup', 'prepaid', 'postpaid', 'telecom', 'mobile', 'communications', 'network', 'limited', 'ltd', 'private', 'pvt']
                return dbTokens.some(t => dingTokens.includes(t) && !ignoreWords.includes(t))
              })
            }

            logDetect({ event: 'ding_match', matchedOperator })

            if (matchedOperator) {
              fallbackResolved = true
              return NextResponse.json({
                operator: matchedOperator.shortName || matchedOperator.name,
                providerCode: matchedOperator.code,
                country: detectedCountry,
                source: 'ding-connect'
              })
            }
          }
        } catch (e) {
          console.error('Ding lookup failed:', e)
        }
      }

      // 2. Try DT One if configured
      if (!fallbackResolved && getDtoneCredentialsFromEnv()) {
        try {
          const dtonePhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
          const dtoneResult = await fetchDtoneMobileNumberLookup({ mobile_number: dtonePhone })
          logDetect({ event: 'dtone_api_result', dtoneResult })
          if (Array.isArray(dtoneResult) && dtoneResult.length > 0) {
            const op = dtoneResult.find((o: any) => o.identified === true) || (dtoneResult.length === 1 ? dtoneResult[0] : null)
            if (!op) {
              return NextResponse.json(result)
            }
            
            const dtoneCountry = op.country?.iso_code || countryCode
            const operators = await fetchPublicOperators(dtoneCountry)
            
            const aliases: Record<string, string[]> = {
              'jio': ['reliance'],
              'reliance': ['jio'],
              'vi': ['vodafone', 'idea'],
              'vodafone': ['vi', 'idea'],
              'idea': ['vi', 'vodafone']
            }

            const normalize = (s: string) => {
              const tokens = s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(Boolean)
              const expanded = new Set(tokens)
              for (const t of tokens) {
                if (aliases[t]) aliases[t].forEach(a => expanded.add(a))
              }
              return Array.from(expanded)
            }
            
            const dtoneTokens = op.name ? normalize(op.name) : []

            // Try to match DTONE operator id or name
            let matchedOperator = operators.find(o => 
              (op.id && (o.id === `dtone:${op.id}` || o.code === String(op.id))) ||
              (op.name && (o.name.toLowerCase().includes(op.name.toLowerCase()) || op.name.toLowerCase().includes(o.name.toLowerCase())))
            )

            if (!matchedOperator && dtoneTokens.length > 0) {
              matchedOperator = operators.find(o => {
                const dbTokens = normalize(o.name)
                const ignoreWords = ['ind', 'india', 'topup', 'prepaid', 'postpaid', 'telecom', 'mobile', 'communications', 'network', 'limited']
                return dbTokens.some(t => dtoneTokens.includes(t) && !ignoreWords.includes(t))
              })
            }
            
            logDetect({ event: 'dtone_match', matchedOperator, opName: op.name })

            if (matchedOperator) {
              fallbackResolved = true
              return NextResponse.json({
                operator: matchedOperator.shortName || matchedOperator.name,
                providerCode: matchedOperator.code,
                country: dtoneCountry,
                source: 'dtone'
              })
            } else if (op.name) {
              return NextResponse.json({
                operator: op.name,
                providerCode: undefined,
                country: dtoneCountry,
                source: 'dtone'
              })
            }
          }
        } catch (e: any) {
          logDetect({ event: 'dtone_error', error: e?.message || String(e) })
          console.error('DTONE lookup failed:', e)
        }
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('operator/detect:', error)
    return NextResponse.json({ error: 'Failed to detect operator' }, { status: 500 })
  }
}
