import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const reactHookSoft = {
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/refs': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/static-components': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/exhaustive-deps': 'warn',
}

const tsSoft = {
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-empty-object-type': 'warn',
}

const otherSoft = {
  'react/no-unescaped-entities': 'warn',
  '@next/next/no-img-element': 'warn',
}

function withSelectiveOverrides(configs) {
  return configs.map((cfg) => {
    if (!cfg || typeof cfg !== 'object') return cfg
    const rules = cfg.rules ? { ...cfg.rules } : {}
    let changed = false

    for (const [rule, value] of Object.entries({ ...reactHookSoft, ...tsSoft, ...otherSoft })) {
      const pluginPrefix = rule.split('/')[0]
      const hasPlugin =
        (cfg.plugins && Object.prototype.hasOwnProperty.call(cfg.plugins, pluginPrefix)) ||
        Object.prototype.hasOwnProperty.call(rules, rule) ||
        Object.keys(rules).some((r) => r.startsWith(pluginPrefix + '/'))
      if (!hasPlugin) continue
      rules[rule] = value
      changed = true
    }

    if (!changed) return cfg
    return { ...cfg, rules }
  })
}

export default defineConfig([
  ...withSelectiveOverrides([...nextVitals, ...nextTs]),
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'supabase-local/**',
    'scratch/**',
    'scratch.mjs',
    'coverage/**',
    'public/uploads/**',
    '**/*.canvas.tsx',
    'tsc-errors.log',
    'eslint-errors.json',
  ]),
])
