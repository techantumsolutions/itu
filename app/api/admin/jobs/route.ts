import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.view')
  if (denied) return denied

  try {
    const res = await supabaseRest('careers_jobs?select=*&order=created_at.desc')
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }
    const jobs = await res.json()
    return NextResponse.json({ jobs })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.edit')
  if (denied) return denied

  try {
    const body = await req.json()
    const {
      title,
      department,
      description,
      locations,
      experience,
      type,
      budget,
      responsibilities,
      skills,
      optional_skills,
      what_we_offer,
      jd_url,
      is_active,
      about_role,
      contact_email,
    } = body

    if (!title || !department || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const payload = {
      title,
      department,
      description,
      locations: Array.isArray(locations) ? locations : [],
      experience: experience || '',
      type: type || '',
      budget: budget || '',
      responsibilities: Array.isArray(responsibilities) ? responsibilities : [],
      skills: Array.isArray(skills) ? skills : [],
      optional_skills: Array.isArray(optional_skills) ? optional_skills : [],
      what_we_offer: Array.isArray(what_we_offer) ? what_we_offer : [],
      jd_url: jd_url || null,
      is_active: is_active !== false,
      about_role: about_role || '',
      contact_email: contact_email || null,
      updated_at: new Date().toISOString(),
    }

    const res = await supabaseRest('careers_jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=representation',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    const created = await res.json()

    await logAdminActivity({
      action: 'Create Job Opening',
      pageName: 'Jobs',
      details: { title, department },
    })

    return NextResponse.json({ ok: true, job: created?.[0] })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.edit')
  if (denied) return denied

  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing job ID' }, { status: 400 })
    }

    const body = await req.json()
    const payload: Record<string, any> = {}

    if (body.title !== undefined) payload.title = body.title
    if (body.department !== undefined) payload.department = body.department
    if (body.description !== undefined) payload.description = body.description
    if (body.locations !== undefined) payload.locations = Array.isArray(body.locations) ? body.locations : []
    if (body.experience !== undefined) payload.experience = body.experience
    if (body.type !== undefined) payload.type = body.type
    if (body.budget !== undefined) payload.budget = body.budget
    if (body.responsibilities !== undefined) payload.responsibilities = Array.isArray(body.responsibilities) ? body.responsibilities : []
    if (body.skills !== undefined) payload.skills = Array.isArray(body.skills) ? body.skills : []
    if (body.optional_skills !== undefined) payload.optional_skills = Array.isArray(body.optional_skills) ? body.optional_skills : []
    if (body.what_we_offer !== undefined) payload.what_we_offer = Array.isArray(body.what_we_offer) ? body.what_we_offer : []
    if (body.jd_url !== undefined) payload.jd_url = body.jd_url || null
    if (body.is_active !== undefined) payload.is_active = body.is_active
    if (body.about_role !== undefined) payload.about_role = body.about_role || ''
    if (body.contact_email !== undefined) payload.contact_email = body.contact_email || null

    payload.updated_at = new Date().toISOString()

    const res = await supabaseRest(`careers_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=representation',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    const updated = await res.json()

    await logAdminActivity({
      action: 'Update Job Opening',
      pageName: 'Jobs',
      details: { id, title: body.title },
    })

    return NextResponse.json({ ok: true, job: updated?.[0] })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.edit')
  if (denied) return denied

  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing job ID' }, { status: 400 })
    }

    const res = await supabaseRest(`careers_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Delete Job Opening',
      pageName: 'Jobs',
      details: { id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
