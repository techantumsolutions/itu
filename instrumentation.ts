export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateCountriesTable } = await import('@/lib/aggregator/country-startup-validation')
    await validateCountriesTable()
  }
}
