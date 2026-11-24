import { randomUUID } from 'node:crypto'
import { get, put } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { expenses, members } from '@/lib/db/schema'

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 })
  const pathname = request.nextUrl.searchParams.get('path')
  if (!pathname || !pathname.startsWith(`facturas/${floorId}/`) || pathname.includes('..')) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })
  const [expense] = await db.select({ isPrivate: expenses.isPrivate, createdBy: expenses.createdBy }).from(expenses).where(and(eq(expenses.floorId, floorId), eq(expenses.invoicePath, pathname))).limit(1)
  if (!expense || (expense.isPrivate && expense.createdBy !== session.user.id)) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })

  if (request.nextUrl.searchParams.get('raw') !== '1') {
    const rawUrl = `/api/factura?path=${encodeURIComponent(pathname)}&raw=1`
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(pathname)
    const content = isImage ? `<img src="${rawUrl}" alt="Factura" />` : `<iframe src="${rawUrl}" title="Factura en PDF"></iframe>`
    return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factura</title><style>*{box-sizing:border-box}body{margin:0;background:#202420;color:#fff;font:14px Arial,sans-serif}.toolbar{position:fixed;z-index:2;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:#202420eF}.toolbar button{padding:9px 14px;border:0;border-radius:6px;background:#fff;color:#26372a;font-weight:700;cursor:pointer}.viewer{height:100dvh;padding-top:54px;display:grid;place-items:center}iframe{width:100%;height:100%;border:0;background:white}img{max-width:100%;max-height:calc(100dvh - 70px);object-fit:contain}</style></head><body><header class="toolbar"><span>Factura</span><button onclick="window.close()">Cerrar ventana</button></header><main class="viewer">${content}</main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' } })
  }

  try {
    const result = await get(pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (!result) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })
    return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType, 'Content-Disposition': 'inline', ETag: result.blob.etag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la factura.' }, { status: 500 })
  }
}
