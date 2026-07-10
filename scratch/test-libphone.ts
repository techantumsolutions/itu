import { parsePhoneNumberFromString } from 'libphonenumber-js/core'
import metadata from 'libphonenumber-js/metadata.min.json'

const actualMetadata = (metadata as any).default || metadata

console.log('Testing with + prefix and metadata as 2nd arg:')
try {
  const result = parsePhoneNumberFromString('+919988776655', actualMetadata as any)
  console.log('Result 1:', result?.nationalNumber, result?.countryCallingCode)
} catch (e: any) {
  console.error('Error 1:', e.message || e)
}

console.log('Testing with + prefix and metadata as 3rd arg (undefined 2nd arg):')
try {
  const result = parsePhoneNumberFromString('+919988776655', undefined, actualMetadata)
  console.log('Result 2:', result?.nationalNumber, result?.countryCallingCode)
} catch (e: any) {
  console.error('Error 2:', e.message || e)
}
