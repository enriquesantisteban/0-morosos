import { del, get, put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appUsers, members } from '@/lib/db/schema'

export const runtime = 'nodejs'

const maxBytes = 5 * 1024 * 1024
const formats = {
  'image/jpeg': { ext: 'jpg', test: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { ext: 'png', test: (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  'image/webp': { ext: 'webp', test: (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' },
} as const

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Inicia sesión para cambiar tu foto.' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona una foto.' }, { status: 400 })
  if (file.size <= 0 || file.size > maxBytes) return NextResponse.json({ error: 'La foto debe pesar menos de 5 MB.' }, { status: 400 })
  const format = formats[file.type as keyof typeof formats]
  if (!format) return NextResponse.json({ error: 'Usa una imagen JPG, PNG o WebP.' }, { status: 400 })
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!format.test(bytes)) return NextResponse.json({ error: 'El contenido del archivo no coincide con su formato.' }, { status: 400 })

  let blobUrl: string | null = null
  try {
    const [previous] = await db.select({ image: appUsers.image }).from(appUsers).where(eq(appUsers.id, session.user.id)).limit(1)
    const blob = await put(`perfiles/${session.user.id}/${randomUUID()}.${format.ext}`, file, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type,
    })
    blobUrl = blob.pathname
    await db.update(appUsers).set({ image: blob.pathname, updatedAt: new Date() }).where(eq(appUsers.id, session.user.id))
    blobUrl = null
    if (previous?.image?.startsWith(`perfiles/${session.user.id}/`)) {
      try { await del(previous.image) } catch { /* The new photo is saved; a stale image can be removed later. */ }
    }
    return NextResponse.json({ image: blob.pathname })
  } catch {
    if (blobUrl) {
      try { await del(blobUrl) } catch { /* Keep the upload error as the useful result. */ }
    }
    return NextResponse.json({ error: 'No se pudo guardar la foto. Inténtalo de nuevo.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Inicia sesión para ver esta foto.' }, { status: 401 })
  const targetUserId = request.nextUrl.searchParams.get('userId') || session.user.id
  if (targetUserId !== session.user.id) {
    const [currentMember] = await db.select({ floorId: members.floorId }).from(members).where(eq(members.userId, session.user.id)).limit(1)
    if (!currentMember) return NextResponse.json({ error: 'No encontramos tu piso.' }, { status: 403 })
    const [targetMember] = await db.select({ id: members.id }).from(members).where(and(eq(members.floorId, currentMember.floorId), eq(members.userId, targetUserId))).limit(1)
    if (!targetMember) return NextResponse.json({ error: 'No puedes ver esta foto.' }, { status: 403 })
  }
  const [target] = await db.select({ image: appUsers.image }).from(appUsers).where(eq(appUsers.id, targetUserId)).limit(1)
  if (!target?.image?.startsWith(`perfiles/${targetUserId}/`)) return NextResponse.json({ error: 'No hay foto de perfil.' }, { status: 404 })
  try {
    const result = await get(target.image, { access: 'private' })
    if (!result) return NextResponse.json({ error: 'No encontramos esta foto.' }, { status: 404 })
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la foto.' }, { status: 500 })
  }
}
