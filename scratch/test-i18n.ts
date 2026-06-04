import * as countries from 'i18n-iso-countries'

console.log('Keys of countries namespace:', Object.keys(countries))
console.log('default export:', (countries as any).default ? Object.keys((countries as any).default) : 'none')
