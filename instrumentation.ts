export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Prefer IPv4 — avoids intermittent "fetch failed" on Windows when IPv6 DNS is broken.
    const dns = await import('node:dns')
    dns.setDefaultResultOrder('ipv4first')

    const { validateCountriesTable } = await import('@/lib/aggregator/country-startup-validation')
    await validateCountriesTable()
  }
}
