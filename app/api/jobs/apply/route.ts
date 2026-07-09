import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { runtimeEnv } from '@/lib/env/runtime'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { job_id, name, email, phone, cover_letter, resume_url } = body

    if (!job_id || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const payload = {
      job_id,
      name,
      email,
      phone: phone || null,
      cover_letter: cover_letter || null,
      resume_url: resume_url || null,
      status: 'pending',
    }

    const res = await supabaseRest('careers_applications', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=minimal',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
    }

    // Fetch Job Title and Contact Email for email template
    let jobTitle = 'Open Position'
    let contactEmail = ''
    try {
      const jobRes = await supabaseRest(`careers_jobs?id=eq.${encodeURIComponent(job_id)}&select=title,contact_email`, {
        method: 'GET',
      })
      if (jobRes.ok) {
        const jobData = await jobRes.json()
        if (jobData?.[0]?.title) {
          jobTitle = jobData[0].title
        }
        if (jobData?.[0]?.contact_email) {
          contactEmail = jobData[0].contact_email
        }
      }
    } catch (e) {
      console.error('Failed to fetch job details for email', e)
    }

    // SMTP Configuration
    const smtpHost = runtimeEnv('SMTP_HOST')
    const smtpPort = parseInt(runtimeEnv('SMTP_PORT') || '587', 10)
    const smtpUser = runtimeEnv('SMTP_USER')
    const smtpPass = runtimeEnv('SMTP_PASS')
    const isDev = process.env.NODE_ENV !== 'production'

    if (!smtpHost || !smtpUser || !smtpPass || smtpHost === 'smtp.example.com') {
      if (isDev) {
        console.warn(`[DEV ONLY] SMTP host is placeholder or missing. Logging emails.`)
        console.log(`\n========================================\n[DEV ONLY] THANK YOU EMAIL SENT TO ${email} for role ${jobTitle}\n========================================\n`)
        if (contactEmail) {
          console.log(`\n========================================\n[DEV ONLY] NEW APPLICATION ALERT SENT TO ${contactEmail} for role ${jobTitle} by applicant ${name}\n========================================\n`)
        }
      }
    } else {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        })

        // 1. Send Thank You email to Candidate
        await transporter.sendMail({
          from: `"ITU Careers" <${smtpUser}>`,
          to: email,
          subject: `Application Received: ${jobTitle} at ITU`,
          html: `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; min-height: 100%;">
  <div style="max-w: 550px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); border: 1px solid #f1f5f9;">
    <!-- Top banner -->
    <div style="background: linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%); padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Application Received</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.85;">Thank you for your interest in ITU</p>
    </div>
    
    <!-- Body -->
    <div style="padding: 40px 32px;">
      <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">Hi <strong>${name}</strong>,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569;">
        Thank you for submitting your application for the <strong>${jobTitle}</strong> position. We are excited that you want to join our team!
      </p>
      
      <!-- Box Info -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; color: #4c1d95; letter-spacing: 0.05em;">Next Steps</h3>
        <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b;">
          Our recruitment team is reviewing your profile, resume, and qualifications against the role requirements. If your background aligns with what we're looking for, we will reach out to arrange an interview.
        </p>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b;">
        In the meantime, you can explore other opportunities or learn more about us on our <a href="https://itu.example.com/careers" style="color: #4c1d95; text-decoration: underline; font-weight: 600;">Careers Portal</a>.
      </p>
      
      <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 28px;">
        <p style="margin: 0; font-size: 14px; color: #334155; font-weight: 600;">Best regards,</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">The ITU Recruiting Team</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        This is an automated notification regarding your application. Please do not reply directly to this message.
      </p>
    </div>
  </div>
</div>
          `,
        })

        // 2. Send Alert Notification to job's contact email address
        if (contactEmail) {
          const attachments: any[] = []
          if (resume_url && resume_url.startsWith('data:')) {
            const match = resume_url.match(/^data:(.+);base64,(.+)$/)
            if (match) {
              const contentType = match[1]
              const base64Data = match[2]
              let filename = `Resume_${name.replace(/\s+/g, '_')}`
              if (contentType.includes('pdf')) filename += '.pdf'
              else if (contentType.includes('word') || contentType.includes('msword')) filename += '.doc'
              else if (contentType.includes('officedocument.wordprocessingml')) filename += '.docx'
              else filename += '.txt'

              attachments.push({
                filename,
                content: Buffer.from(base64Data, 'base64'),
                contentType,
              })
            }
          }

          const recruiterHtml = `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; min-height: 100%;">
  <div style="max-w: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); border: 1px solid #f1f5f9;">
    <!-- Top banner -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">New Job Application</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.85;">Role: ${jobTitle}</p>
    </div>
    
    <!-- Body -->
    <div style="padding: 40px 32px;">
      <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">Hello,</p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569;">
        A new candidate has submitted their application for the <strong>${jobTitle}</strong> opening. Here are the details of the submission:
      </p>
      
      <!-- Candidate Details Table -->
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 14px; color: #475569; width: 30%;">Candidate Name</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 14px; color: #475569;">Email Address</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b;">
            <a href="mailto:${email}" style="color: #4c1d95; text-decoration: none;">${email}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 14px; color: #475569;">Phone Number</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b;">${phone || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-weight: 600; font-size: 14px; color: #475569;">Resume Status</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b;">
            ${resume_url ? '📄 Attached to this email' : '❌ No resume provided'}
          </td>
        </tr>
      </table>

      <!-- Cover Letter Section -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #0f172a; letter-spacing: 0.05em;">Cover Letter</h3>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #475569; white-space: pre-wrap;">
          ${cover_letter ? cover_letter : 'The candidate did not include a cover letter.'}
        </p>
      </div>

      <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-top: 28px;">
        You can review and manage this application in the <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/jobs" style="color: #4c1d95; text-decoration: underline; font-weight: 600;">Jobs Admin Dashboard</a>.
      </p>
      
      <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 28px;">
        <p style="margin: 0; font-size: 14px; color: #334155; font-weight: 600;">ITU Careers Portal</p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #f1f5f9;">
      <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        This is an automated operational notification.
      </p>
    </div>
  </div>
</div>
          `

          await transporter.sendMail({
            from: `"ITU Careers" <${smtpUser}>`,
            to: contactEmail,
            subject: `New Application Received: ${name} - ${jobTitle}`,
            html: recruiterHtml,
            attachments,
          })
        }
      } catch (e) {
        console.error('Failed to send application emails', e)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
