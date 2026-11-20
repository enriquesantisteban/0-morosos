import { randomUUID } from 'node:crypto'
import { get, put } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { members } from '@/lib/db/schema'

const maxBytes = 5 * 1024 * 1024
const formats = {
  'image/jpeg': { ext: 'jpg', test: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', test: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': { ext: 'webp', test: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' },
  'application/pdf': { ext: 'pdf', test: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 5)) === '%PDF-' },
} as const

async function getFloorId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const [member] = await db.select({ floorId: members.floorId }).from(members).where(eq(members.userId, session.user.id)).limit(1)
  return member?.floorId ?? null
}

export async function POST(request: NextRequest) {
  const floorId = await getFloorId()
  if (!floorId) return NextResponse.json({ error: 'Inicia sesión y accede a un piso para subir facturas.' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona una factura.' }, { status: 400 })
  if (file.size <= 0 || file.size > maxBytes) return NextResponse.json({ error: 'La factura debe pesar menos de 5 MB.' }, { status: 400 })
  const format = formats[file.type as keyof typeof formats]
  if (!format) return NextResponse.json({ error: 'Usa una imagen JPG, PNG, WebP o un PDF.' }, { status: 400 })
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!format.test(bytes)) return NextResponse.json({ error: 'El contenido del archivo no coincide con su formato.' }, { status: 400 })

  try {
    const pathname = `facturas/${floorId}/${randomUUID()}.${format.ext}`
    const blob = await put(pathname, file, { access: 'private', addRandomSuffix: false, contentType: file.type })
    return NextResponse.json({ pathname: blob.pathname, name: file.name.slice(0, 120) })
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar la factura. Inténtalo de nuevo.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const floorId = await getFloorId()
  if (!floorId) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 })
  const pathname = request.nextUrl.searchParams.get('path')
  if (!pathname || !pathname.startsWith(`facturas/${floorId}/`) || pathname.includes('..')) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })

  try {
    const result = await get(pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (!result) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })
    return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType, 'Content-Disposition': 'inline', ETag: result.blob.etag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la factura.' }, { status: 500 })
  }
}
