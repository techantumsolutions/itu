import { NextResponse } from 'next/server'
import { getSupportBotQa, listSupportBotQa, matchSupportBotAnswer } from '@/lib/support-bot/qa'

/** Public: suggested questions + match answers for the ticket assistant. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')?.trim()
    if (id) {
      const item = await getSupportBotQa(id)
      if (!item || !item.isActive) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json({ item })
    }

    const items = await listSupportBotQa({ activeOnly: true })
    const category = url.searchParams.get('category')?.trim().toLowerCase()
    const filtered = category
      ? items.filter((i) => i.category === category)
      : items

    const mapped = filtered.map(
      ({ id: itemId, question, answer, category: cat, isSuggested, keywords, sortOrder }) => ({
        id: itemId,
        question,
        answer,
        category: cat,
        isSuggested,
        keywords,
        sortOrder,
      }),
    )

    const suggestions = mapped
      .filter((i) => i.isSuggested)
      .slice(0, 12)

    return NextResponse.json({
      suggestions,
      items: mapped,
      categories: [...new Set(items.map((i) => i.category))],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load assistant' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }
    if (query.length > 2000) {
      return NextResponse.json({ error: 'query is too long' }, { status: 400 })
    }

    const { matches, best } = await matchSupportBotAnswer(query, {
      category: category || null,
      limit: 5,
    })
    return NextResponse.json({
      best,
      matches: matches.map((m) => ({
        id: m.id,
        question: m.question,
        answer: m.answer,
        category: m.category,
        score: m.score,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to match answer' },
      { status: 500 },
    )
  }
}
