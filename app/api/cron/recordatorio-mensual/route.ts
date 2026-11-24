import { and, eq, isNull, ne, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { members, notifications, paymentReminders, pushSubscriptions } from '@/lib/db/schema'
import { sendWebPush } from '@/lib/web-push'

export const runtime = 'nodejs'

function madridDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return Object.fromEntries(parts.map(({ type, value }) => [type, value])) as Record<string, string>
}

async function sendReminderEmail(to: string, name: string, monthName: string) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return 'not_configured'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Recordatorio de pago del piso · ${monthName}`,
      text: `Hola ${name},\n\nRecuerda realizar el pago del piso entre los días 1 y 5 de ${monthName}. Consulta los gastos del mes en 0 morosos.`,
    }),
  })
  return response.ok ? 'sent' : 'failed'
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const today = madridDate()
  if (today.day !== '01') return NextResponse.json({ error: 'El recordatorio solo se envía el primer día del mes.' }, { status: 409 })

  const month = `${today.year}-${today.month}`
  const monthName = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', month: 'long' }).format(new Date(`${month}-01T12:00:00+01:00`))
  const payload = JSON.stringify({
    title: 'Recuerda el pago del piso',
    body: `Tienes hasta el día 5 de ${monthName} para realizar los pagos del piso.`,
    url: '/',
    tag: `pago-piso-${month}`,
  })

  const floorMembers = await db.select({ floorId: members.floorId, userId: members.userId, email: members.email, name: members.name }).from(members)
  let created = 0
  let emailSent = 0
  let emailFailed = 0
  await Promise.all(floorMembers.map(async (member) => {
    const reminder = await db.transaction(async (tx) => {
      const [row] = await tx.insert(paymentReminders).values({ id: randomUUID(), floorId: member.floorId, userId: member.userId, month }).onConflictDoNothing().returning({ id: paymentReminders.id })
      if (row) await tx.insert(notifications).values({ id: randomUUID(), floorId: member.floorId, userId: member.userId, title: 'Recuerda el pago del piso', message: `Tienes hasta el día 5 de ${monthName} para realizar los pagos del piso.` })
      return row
    })
    if (!reminder) return
    created += 1
    try {
      const emailResult = await sendReminderEmail(member.email, member.name, monthName)
      if (emailResult === 'sent') emailSent += 1
      else if (emailResult === 'failed') emailFailed += 1
    } catch {
      emailFailed += 1
    }
  }))

  let pushSent = 0
  let removed = 0
  let pushFailed = 0
  if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    const subscriptions = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .innerJoin(members, and(eq(members.floorId, pushSubscriptions.floorId), eq(members.userId, pushSubscriptions.userId)))
      .where(or(isNull(pushSubscriptions.reminderMonth), ne(pushSubscriptions.reminderMonth, month)))
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        const response = await sendWebPush(subscription, payload)
        if (response.status === 404 || response.status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
          removed += 1
        } else if (response.ok) {
          await db.update(pushSubscriptions).set({ reminderMonth: month }).where(eq(pushSubscriptions.id, subscription.id))
          pushSent += 1
        } else {
          pushFailed += 1
        }
      } catch {
        pushFailed += 1
      }
    }))
  }

  return NextResponse.json({ month, created, emailSent, emailFailed, pushSent, removed, pushFailed })
}
