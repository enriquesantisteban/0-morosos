'use server'

import { del } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appUsers, expenses, floors, history, invitations, members, notifications, requests } from '@/lib/db/schema'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const allowedTypes = ['Alquiler', 'Luz', 'Agua', 'Basura', 'Comunidad', 'Internet', 'Otros'] as const

type ExpenseInput = {
  title: string
  type: string
  amount: number
  date: string
  note?: string
  periodStart?: string
  periodEnd?: string
  rentMonth?: string
  invoicePath?: string
  invoiceName?: string
}

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Inicia sesión para continuar.')
  return session.user
}

async function getMembership() {
  const user = await getSessionUser()
  const [existing] = await db.select().from(members).where(eq(members.userId, user.id)).limit(1)
  if (existing) {
    const floor = await getFloor(existing.floorId)
    return { user, membership: existing, floor }
  }

  const floorId = randomUUID()
  const floorName = 'Mi piso'
  await db.transaction(async (tx) => {
    await tx.insert(floors).values({ id: floorId, name: floorName, adminId: user.id })
    await tx.insert(members).values({ id: randomUUID(), floorId, userId: user.id, email: user.email, name: user.name || 'Administrador', role: 'admin' })
  })
  const [membership] = await db.select().from(members).where(and(eq(members.floorId, floorId), eq(members.userId, user.id))).limit(1)
  const [floor] = await db.select().from(floors).where(eq(floors.id, floorId)).limit(1)
  if (!membership || !floor) throw new Error('No se pudo preparar tu piso.')
  return { user, membership, floor }
}

async function getFloor(id: string) {
  const [floor] = await db.select().from(floors).where(eq(floors.id, id)).limit(1)
  if (!floor) throw new Error('No encontramos este piso.')
  return floor
}

async function requireAdmin() {
  const context = await getMembership()
  if (context.membership.role !== 'admin' && context.floor.adminId !== context.user.id) throw new Error('Solo la persona administradora puede realizar esta acción.')
  return context
}

function validateExpense(input: ExpenseInput) {
  const title = input.title.trim()
  if (!title || title.length > 80) throw new Error('El concepto debe tener entre 1 y 80 caracteres.')
  if (!allowedTypes.includes(input.type as typeof allowedTypes[number])) throw new Error('Selecciona un tipo de gasto válido.')
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10000000) throw new Error('Introduce un importe válido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) throw new Error('La fecha no es válida.')
  if (['Luz', 'Agua'].includes(input.type) && (!input.periodStart || !input.periodEnd || input.periodStart > input.periodEnd)) throw new Error('Indica un periodo válido para la factura.')
  if (input.type === 'Alquiler' && !/^\d{4}-\d{2}$/.test(input.rentMonth || '')) throw new Error('Indica el mes al que corresponde el alquiler.')
  if ((input.note || '').length > 240) throw new Error('La nota no puede superar los 240 caracteres.')
  return { ...input, title }
}

export async function getDashboardData() {
  const { user, membership, floor } = await getMembership()
  const [expenseRows, memberRows, requestRows, notificationRows] = await Promise.all([
    db.select({ expense: expenses, creator: appUsers.name }).from(expenses).leftJoin(appUsers, eq(expenses.createdBy, appUsers.id)).where(eq(expenses.floorId, floor.id)).orderBy(desc(expenses.date)),
    db.select({ membership: members, username: appUsers.username }).from(members).leftJoin(appUsers, eq(members.userId, appUsers.id)).where(eq(members.floorId, floor.id)).orderBy(desc(members.createdAt)),
    db.select({ request: requests, sender: appUsers.name, expenseTitle: expenses.title }).from(requests).leftJoin(appUsers, eq(requests.sentBy, appUsers.id)).leftJoin(expenses, eq(requests.expenseId, expenses.id)).where(and(eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'))).orderBy(desc(requests.createdAt)),
    db.select().from(notifications).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, user.id))).orderBy(desc(notifications.createdAt)),
  ])
  return {
    floor: { id: floor.id, name: floor.name, role: membership.role },
    user: { id: user.id, name: user.name, username: 'username' in user ? user.username : null },
    expenses: expenseRows.map(({ expense, creator }) => ({ ...expense, amount: Number(expense.amount), person: creator || 'Miembro del piso' })),
    members: memberRows.map(({ membership: item, username }) => ({ ...item, username })),
    requests: requestRows.map(({ request, sender, expenseTitle }) => ({ ...request, sender: sender || 'Miembro del piso', expenseTitle })),
    notifications: notificationRows,
  }
}

const invitationHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createFloorInvitation() {
  const { user, floor } = await requireAdmin()
  const token = randomBytes(32).toString('base64url')
  await db.insert(invitations).values({ id: randomUUID(), floorId: floor.id, tokenHash: invitationHash(token), createdBy: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
  return { token }
}

export async function removeFloorMember(memberId: string) {
  const { user, floor } = await requireAdmin()
  if (!memberId || memberId.length > 128) throw new Error('El miembro indicado no es válido.')
  const [target] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.floorId, floor.id))).limit(1)
  if (!target) throw new Error('No encontramos a esa persona en tu piso.')
  if (target.userId === user.id || target.role === 'admin') throw new Error('No puedes eliminar a la persona administradora del piso.')
  await db.transaction(async (tx) => {
    await tx.delete(members).where(and(eq(members.id, memberId), eq(members.floorId, floor.id), eq(members.userId, target.userId)))
    await tx.delete(notifications).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, target.userId)))
  })
  revalidatePath('/')
}

export async function validateFloorInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false
  const [invitation] = await db.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.tokenHash, invitationHash(token)), gt(invitations.expiresAt, new Date()), isNull(invitations.usedAt))).limit(1)
  return Boolean(invitation)
}

export async function joinFloorWithInvitation(token: string) {
  const user = await getSessionUser()
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error('El enlace de invitación no es válido.')
  const [existing] = await db.select({ id: members.id }).from(members).where(eq(members.userId, user.id)).limit(1)
  if (existing) throw new Error('Esta cuenta ya pertenece a un piso.')
  const [invitation] = await db.select().from(invitations).where(and(eq(invitations.tokenHash, invitationHash(token)), gt(invitations.expiresAt, new Date()), isNull(invitations.usedAt))).limit(1)
  if (!invitation) throw new Error('La invitación ha caducado o ya se utilizó.')
  await db.transaction(async (tx) => {
    const claimed = await tx.update(invitations).set({ usedAt: new Date() }).where(and(eq(invitations.id, invitation.id), isNull(invitations.usedAt), gt(invitations.expiresAt, new Date()))).returning({ id: invitations.id })
    if (!claimed.length) throw new Error('La invitación ya se utilizó. Pide un enlace nuevo.')
    await tx.insert(members).values({ id: randomUUID(), floorId: invitation.floorId, userId: user.id, email: user.email, name: user.name || 'Miembro', role: 'miembro' })
  })
  revalidatePath('/')
}

export async function getExpenseDetails(id: string) {
  const { floor } = await getMembership()
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  const entries = await db.select({ entry: history, actor: appUsers.name }).from(history).leftJoin(appUsers, eq(history.actorId, appUsers.id)).where(and(eq(history.expenseId, id), eq(history.floorId, floor.id))).orderBy(desc(history.createdAt))
  return { expense: { ...expense, amount: Number(expense.amount) }, history: entries.map(({ entry, actor }) => ({ ...entry, actor: actor || 'Miembro del piso' })) }
}

async function notifyFloor(floorId: string, actorId: string, title: string, message: string) {
  const recipients = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floorId))
  if (!recipients.length) return
  await db.insert(notifications).values(recipients.filter(({ userId }) => userId !== actorId).map(({ userId }) => ({ id: randomUUID(), floorId, userId, title, message })))
}

export async function createExpense(input: ExpenseInput) {
  const { user, floor } = await requireAdmin()
  const value = validateExpense(input)
  if (value.invoicePath && (!value.invoicePath.startsWith(`facturas/${floor.id}/`) || value.invoicePath.includes('..'))) throw new Error('La factura no pertenece a este piso.')
  if (value.invoiceName && value.invoiceName.length > 120) throw new Error('El nombre de la factura es demasiado largo.')
  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({ id, floorId: floor.id, title: value.title, type: value.type, amount: value.amount.toFixed(2), date: value.date, periodStart: value.periodStart || null, periodEnd: value.periodEnd || null, rentMonth: value.rentMonth || null, note: value.note?.trim() || null, createdBy: user.id, invoicePath: value.invoicePath || null, invoiceName: value.invoiceName || null })
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'creado', next: value })
    const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
    const rows = recipients.filter((row) => row.userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Nuevo gasto', message: `${value.title}: ${value.amount.toFixed(2)} €` }))
    if (rows.length) await tx.insert(notifications).values(rows)
  })
  revalidatePath('/')
  return { id }
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { user, floor } = await requireAdmin()
  const value = validateExpense(input)
  if (value.invoicePath && (!value.invoicePath.startsWith(`facturas/${floor.id}/`) || value.invoicePath.includes('..'))) throw new Error('La factura no pertenece a este piso.')
  const [previous] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!previous) throw new Error('No encontramos ese gasto en tu piso.')
  const next = {
    title: value.title,
    type: value.type,
    amount: value.amount.toFixed(2),
    date: value.date,
    periodStart: value.periodStart || null,
    periodEnd: value.periodEnd || null,
    rentMonth: value.rentMonth || null,
    note: value.note?.trim() || null,
    invoicePath: value.invoicePath || previous.invoicePath,
    invoiceName: value.invoiceName || previous.invoiceName,
    updatedAt: new Date(),
  }
  await db.transaction(async (tx) => {
    await tx.update(expenses).set(next).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id)))
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'editado', previous, next })
    const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
    const rows = recipients.filter(({ userId }) => userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Gasto actualizado', message: value.title }))
    if (rows.length) await tx.insert(notifications).values(rows)
  })
  revalidatePath('/')
}

export async function deleteExpense(id: string) {
  const { user, floor } = await requireAdmin()
  const [previous] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!previous) throw new Error('No encontramos ese gasto en tu piso.')
  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'eliminado', previous, next: null })
    await tx.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id)))
    const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
    const rows = recipients.filter(({ userId }) => userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Gasto eliminado', message: previous.title }))
    if (rows.length) await tx.insert(notifications).values(rows)
  })
  if (previous.invoicePath) await del(previous.invoicePath).catch(() => undefined)
  revalidatePath('/')
}

export async function submitExpenseRequest(expenseId: string, reason: string, proposal: Partial<ExpenseInput>) {
  const { user, floor } = await getMembership()
  if (!reason.trim() || reason.trim().length > 300) throw new Error('Explica brevemente el cambio (máximo 300 caracteres).')
  if (proposal.amount !== undefined && (!Number.isFinite(proposal.amount) || proposal.amount <= 0)) throw new Error('El importe propuesto no es válido.')
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  const safeProposal = Object.fromEntries(Object.entries(proposal).filter(([key]) => ['title', 'type', 'amount', 'date', 'note', 'periodStart', 'periodEnd', 'rentMonth'].includes(key)))
  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(requests).values({ id, floorId: floor.id, expenseId, sentBy: user.id, reason: reason.trim(), proposal: safeProposal, status: 'pendiente' })
    const admins = await tx.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.role, 'admin')))
    if (admins.length) await tx.insert(notifications).values(admins.map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Nueva solicitud de cambio', message: reason.trim() })))
  })
  revalidatePath('/')
  return { id }
}

export async function resolveExpenseRequest(id: string, decision: 'aprobada' | 'rechazada') {
  const { user, floor } = await requireAdmin()
  const [pending] = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'))).limit(1)
  if (!pending) throw new Error('La solicitud ya no está pendiente o no pertenece a tu piso.')
  await db.transaction(async (tx) => {
    if (decision === 'aprobada') {
      const [current] = await tx.select().from(expenses).where(and(eq(expenses.id, pending.expenseId), eq(expenses.floorId, floor.id))).limit(1)
      if (!current) throw new Error('El gasto asociado ya no existe.')
      const proposal = pending.proposal as Partial<ExpenseInput>
      const updates: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date() }
      if (typeof proposal.title === 'string') updates.title = proposal.title.trim().slice(0, 80)
      if (typeof proposal.type === 'string' && allowedTypes.includes(proposal.type as typeof allowedTypes[number])) updates.type = proposal.type
      if (typeof proposal.amount === 'number' && Number.isFinite(proposal.amount) && proposal.amount > 0) updates.amount = proposal.amount.toFixed(2)
      if (typeof proposal.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposal.date)) updates.date = proposal.date
      if (typeof proposal.note === 'string') updates.note = proposal.note.slice(0, 240)
      if (typeof proposal.periodStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposal.periodStart)) updates.periodStart = proposal.periodStart
      if (typeof proposal.periodEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proposal.periodEnd)) updates.periodEnd = proposal.periodEnd
      if (typeof proposal.rentMonth === 'string' && /^\d{4}-\d{2}$/.test(proposal.rentMonth)) updates.rentMonth = proposal.rentMonth
      await tx.update(expenses).set(updates).where(and(eq(expenses.id, pending.expenseId), eq(expenses.floorId, floor.id)))
      await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: pending.expenseId, actorId: user.id, action: 'solicitud_aprobada', previous: current, next: proposal })
    }
    await tx.update(requests).set({ status: decision, resolvedBy: user.id, resolvedAt: new Date() }).where(and(eq(requests.id, id), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente')))
    await tx.insert(notifications).values({ id: randomUUID(), floorId: floor.id, userId: pending.sentBy, title: decision === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', message: pending.reason })
  })
  revalidatePath('/')
}

export async function markNotificationsRead() {
  const { user, floor } = await getMembership()
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, user.id)))
  revalidatePath('/')
}
