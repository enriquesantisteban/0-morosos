import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { members, pushSubscriptions } from '@/lib/db/schema'

export const runtime = 'nodejs'

async function getMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const [membership] = await db.select({ floorId: members.floorId, userId: members.userId }).from(members).where(eq(members.userId, session.user.id)).limit(1)
  return membership ?? null
}

export async function POST(request: NextRequest) {
  const membership = await getMembership()
  if (!membership) return NextResponse.json({ error: 'Inicia sesión para activar los recordatorios.' }, { status: 401 })
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: 'Los recordatorios del dispositivo no están configurados.' }, { status: 503 })

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'La suscripción no es válida.' }, { status: 400 }) }
  if (typeof body.endpoint !== 'string' || typeof body.keys?.p256dh !== 'string' || typeof body.keys?.auth !== 'string') {
    return NextResponse.json({ error: 'La suscripción no es válida.' }, { status: 400 })
  }
  let endpoint: URL
  try { endpoint = new URL(body.endpoint) } catch { return NextResponse.json({ error: 'El destino de la notificación no es válido.' }, { status: 400 }) }
  const trustedHost = endpoint.protocol === 'https:' && (endpoint.hostname === 'fcm.googleapis.com' || endpoint.hostname.endsWith('.push.services.mozilla.com') || endpoint.hostname === 'web.push.apple.com')
  if (!trustedHost || endpoint.href.length > 2048 || body.keys.p256dh.length > 200 || body.keys.auth.length > 100) {
    return NextResponse.json({ error: 'El destino de la notificación no es válido.' }, { status: 400 })
  }

  await db.insert(pushSubscriptions).values({ id: randomUUID(), floorId: membership.floorId, userId: membership.userId, endpoint: endpoint.href, p256dh: body.keys.p256dh, auth: body.keys.auth }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { floorId: membership.floorId, userId: membership.userId, p256dh: body.keys.p256dh, auth: body.keys.auth },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const membership = await getMembership()
  if (!membership) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })
  let body: { endpoint?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'La solicitud no es válida.' }, { status: 400 }) }
  if (typeof body.endpoint !== 'string') return NextResponse.json({ error: 'La solicitud no es válida.' }, { status: 400 })
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.floorId, membership.floorId), eq(pushSubscriptions.userId, membership.userId)))
  return NextResponse.json({ ok: true })
}
