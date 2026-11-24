import { del, get, put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { floorContracts, floors, members } from '@/lib/db/schema'

export const runtime = 'nodejs'

const maxBytes = 4 * 1024 * 1024

async function getAccess() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const [membership] = await db.select().from(members).where(eq(members.userId, session.user.id)).limit(1)
  if (!membership) return null
  const [floor] = await db.select().from(floors).where(eq(floors.id, membership.floorId)).limit(1)
  if (!floor) return null
  return { user: session.user, membership, floor, isAdmin: membership.role === 'admin' || floor.adminId === session.user.id }
}

export async function POST(request: NextRequest) {
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })
  if (!access.isAdmin) return NextResponse.json({ error: 'Solo la administración puede subir o cambiar el contrato.' }, { status: 403 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona el contrato en PDF.' }, { status: 400 })
  if (file.size <= 0 || file.size > maxBytes) return NextResponse.json({ error: 'El contrato debe pesar menos de 4 MB.' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'El contrato debe estar en formato PDF.' }, { status: 400 })
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...signature) !== '%PDF-') return NextResponse.json({ error: 'El contenido del archivo no parece ser un PDF válido.' }, { status: 400 })

  let visibleTo: unknown
  try {
    visibleTo = JSON.parse(String(form.get('visibleTo') || '[]'))
  } catch {
    return NextResponse.json({ error: 'La selección de miembros no es válida.' }, { status: 400 })
  }
  if (!Array.isArray(visibleTo) || visibleTo.length > 100 || visibleTo.some((id) => typeof id !== 'string' || id.length > 128)) {
    return NextResponse.json({ error: 'La selección de miembros no es válida.' }, { status: 400 })
  }
  const uniqueVisibleTo = [...new Set(visibleTo as string[])]
  const floorMembers = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, access.floor.id))
  const memberIds = new Set(floorMembers.map((member) => member.userId))
  if (uniqueVisibleTo.some((id) => !memberIds.has(id))) return NextResponse.json({ error: 'Solo puedes compartir el contrato con miembros de tu piso.' }, { status: 400 })

  let newBlobPath: string | null = null
  try {
    const pathname = `contratos/${access.floor.id}/${randomUUID()}.pdf`
    const blob = await put(pathname, file, { access: 'private', addRandomSuffix: false, contentType: 'application/pdf' })
    newBlobPath = blob.pathname
    const [previous] = await db.select({ blobPath: floorContracts.blobPath }).from(floorContracts).where(eq(floorContracts.floorId, access.floor.id)).limit(1)
    await db.insert(floorContracts).values({
      id: randomUUID(),
      floorId: access.floor.id,
      blobPath: blob.pathname,
      fileName: file.name.trim().slice(0, 160) || 'Contrato.pdf',
      visibleTo: uniqueVisibleTo,
      uploadedBy: access.user.id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: floorContracts.floorId,
      set: {
        blobPath: blob.pathname,
        fileName: file.name.trim().slice(0, 160) || 'Contrato.pdf',
        visibleTo: uniqueVisibleTo,
        uploadedBy: access.user.id,
        updatedAt: new Date(),
      },
    })
    newBlobPath = null
    if (previous?.blobPath) {
      try { await del(previous.blobPath) } catch { /* The current contract is saved; a stale blob can be removed later. */ }
    }
    return NextResponse.json({ fileName: file.name.trim().slice(0, 160) || 'Contrato.pdf' })
  } catch {
    if (newBlobPath) {
      try { await del(newBlobPath) } catch { /* Keep the upload error as the useful result. */ }
    }
    return NextResponse.json({ error: 'No se pudo guardar el contrato. Inténtalo de nuevo.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const access = await getAccess()
  if (!access) return NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 })
  const [contract] = await db.select().from(floorContracts).where(eq(floorContracts.floorId, access.floor.id)).limit(1)
  if (!contract) return NextResponse.json({ error: 'El piso todavía no tiene un contrato.' }, { status: 404 })
  if (!access.isAdmin && !contract.visibleTo.includes(access.user.id)) {
    return NextResponse.json({ error: 'La administración no ha compartido el contrato contigo.' }, { status: 403 })
  }

  if (request.nextUrl.searchParams.get('raw') !== '1') {
    return new NextResponse('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato</title><style>*{box-sizing:border-box}body{margin:0;background:#202420;color:#fff;font:14px Arial,sans-serif}.toolbar{position:fixed;z-index:2;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:#202420ef}.toolbar button{padding:10px 16px;border:0;border-radius:7px;background:#fff;color:#26372a;font-size:14px;font-weight:700;cursor:pointer}.viewer{height:100dvh;padding-top:54px}iframe{width:100%;height:100%;border:0;background:white}</style></head><body><header class="toolbar"><span>Contrato</span><button onclick="window.close()">Cerrar ventana</button></header><main class="viewer"><iframe src="/api/contrato?raw=1" title="Contrato de alquiler"></iframe></main></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' } })
  }

  try {
    const result = await get(contract.blobPath, { access: 'private' })
    if (!result) return NextResponse.json({ error: 'No encontramos el archivo del contrato.' }, { status: 404 })
    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="contrato.pdf"',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
        ETag: result.blob.etag,
      },
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el contrato.' }, { status: 500 })
  }
}

