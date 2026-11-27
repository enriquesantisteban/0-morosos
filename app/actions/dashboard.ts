'use server'

import { del } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appUsers, expenses, floorContracts, floors, history, invitations, members, notifications, requests } from '@/lib/db/schema'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const allowedTypes = ['Alquiler', 'Luz', 'Agua', 'Basura', 'Comunidad', 'Internet', 'Compras', 'Otros'] as const

type ExpenseInput = {
  title: string
  type: string
  amount: number
  date: string
  note?: string
  isPrivate?: boolean
  periodStart?: string
  periodEnd?: string
  rentMonth?: string
  invoicePath?: string
  invoiceName?: string
  splitMode?: 'igual' | 'partes' | 'importes'
  splitValues?: Record<string, number>
}

type SplitMode = 'igual' | 'partes' | 'importes'

function validateSplit(total: number, memberIds: string[], mode: SplitMode = 'partes', values: Record<string, number> = {}) {
  if (!['igual', 'partes', 'importes'].includes(mode)) throw new Error('Elige un tipo de reparto válido.')
  if (Object.keys(values).some((id) => !memberIds.includes(id))) throw new Error('El reparto contiene un miembro que no pertenece al piso.')
  const allocations = Object.fromEntries(memberIds.map((id) => [id, mode === 'igual' ? 1 : values[id] ?? (mode === 'importes' ? 0 : 1)]))
  if (Object.values(allocations).some((amount) => !Number.isFinite(amount) || amount < 0 || amount > 10000000)) throw new Error('Comprueba las partes o importes del reparto.')
  if (mode === 'partes' && Object.values(allocations).reduce((sum, amount) => sum + amount, 0) <= 0) throw new Error('El reparto debe asignar al menos una parte.')
  if (mode === 'importes' && Math.abs(Object.values(allocations).reduce((sum, amount) => sum + amount, 0) - total) > 0.009) throw new Error('La suma de los importes debe coincidir con el gasto.')
  return allocations
}

function calculateShares(total: number, memberIds: string[], mode: SplitMode = 'partes', allocations: Record<string, number> = {}) {
  if (mode === 'importes') return Object.fromEntries(memberIds.map((id) => [id, Number((allocations[id] || 0).toFixed(2))]))
  const weightFor = (id: string) => mode === 'igual' ? 1 : allocations[id] ?? 1
  const totalParts = memberIds.reduce((sum, id) => sum + weightFor(id), 0)
  if (totalParts <= 0) return Object.fromEntries(memberIds.map((id) => [id, 0]))
  const shares = Object.fromEntries(memberIds.map((id) => [id, Number((total * weightFor(id) / totalParts).toFixed(2))]))
  const lastParticipating = [...memberIds].reverse().find((id) => weightFor(id) > 0)
  if (lastParticipating) shares[lastParticipating] = Number((shares[lastParticipating] + total - Object.values(shares).reduce((sum, amount) => sum + amount, 0)).toFixed(2))
  return shares
}

function isMissingContractTable(error: unknown) {
  let current: unknown = error
  while (current && typeof current === 'object') {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown }
    const message = String(candidate.message || '')
    if (candidate.code === '42P01' && message.includes('contratos_piso')) return true
    if (message.includes('contratos_piso') && message.includes('does not exist')) return true
    current = candidate.cause
  }
  return false
}

async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Inicia sesión para continuar.')
  return session.user
}

async function findRemovedFloorName(userId: string) {
  const [removal] = await db.select({ next: history.next }).from(history)
    .where(and(eq(history.action, 'member_removed'), sql`${history.next}->>'removedUserId' = ${userId}`))
    .orderBy(desc(history.createdAt)).limit(1)
  const next = removal?.next as Record<string, unknown> | null
  return typeof next?.floorName === 'string' ? next.floorName : null
}

export async function getRemovedFloorName() {
  const user = await getSessionUser()
  const [membership] = await db.select({ id: members.id }).from(members).where(eq(members.userId, user.id)).limit(1)
  if (membership) return null
  return findRemovedFloorName(user.id)
}

async function getMembership() {
  const user = await getSessionUser()
  const [existing] = await db.select().from(members).where(eq(members.userId, user.id)).limit(1)
  if (existing) {
    const floor = await getFloor(existing.floorId)
    return { user, membership: existing, floor }
  }

  const removedFloorName = await findRemovedFloorName(user.id)
  if (removedFloorName) throw new Error(`Has sido eliminado de ${removedFloorName}.`)

  const floorId = randomUUID()
  const floorName = 'Mi piso'
  await db.transaction(async (tx) => {
    await tx.insert(floors).values({ id: floorId, name: floorName, adminId: user.id })
    await tx.insert(members).values({ id: randomUUID(), floorId, userId: user.id, email: user.email, name: user.name || 'Administrador/a', role: 'admin' })
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
  if (context.membership.role !== 'admin' && context.floor.adminId !== context.user.id) throw new Error('Solo la administración del piso puede realizar esta acción.')
  return context
}

function validateExpense(input: ExpenseInput) {
  const title = (input.title || '').trim() || input.type
  if (!title || title.length > 80) throw new Error('El concepto debe tener entre 1 y 80 caracteres.')
  if (!allowedTypes.includes(input.type as typeof allowedTypes[number])) throw new Error('Selecciona un tipo de gasto válido.')
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10000000) throw new Error('Introduce un importe válido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) throw new Error('La fecha no es válida.')
  if (input.periodStart && (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || Number.isNaN(Date.parse(input.periodStart)))) throw new Error('La fecha de inicio del periodo no es válida.')
  if (input.periodEnd && (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd) || Number.isNaN(Date.parse(input.periodEnd)))) throw new Error('La fecha de fin del periodo no es válida.')
  if (input.periodStart && input.periodEnd && input.periodStart > input.periodEnd) throw new Error('El inicio del periodo debe ser anterior al fin.')
  if ((input.note || '').length > 240) throw new Error('La nota no puede superar los 240 caracteres.')
  if (input.isPrivate !== undefined && typeof input.isPrivate !== 'boolean') throw new Error('La privacidad del gasto no es válida.')
  return { ...input, title }
}

export async function getDashboardData() {
  const { user, membership, floor } = await getMembership()
  const [expenseRows, memberRows, requestRows, notificationRows, pendingAdds, paymentRows, floorInfoRows, splitRows] = await Promise.all([
    db.select({ expense: expenses, creator: appUsers.name }).from(expenses).leftJoin(appUsers, eq(expenses.createdBy, appUsers.id)).where(eq(expenses.floorId, floor.id)).orderBy(desc(expenses.date)),
    db.select({ membership: members, image: appUsers.image }).from(members).leftJoin(appUsers, eq(members.userId, appUsers.id)).where(eq(members.floorId, floor.id)).orderBy(desc(members.createdAt)),
    db.select({ request: requests, sender: appUsers.name, expenseTitle: expenses.title }).from(requests).leftJoin(appUsers, eq(requests.sentBy, appUsers.id)).leftJoin(expenses, eq(requests.expenseId, expenses.id)).where(and(eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'))).orderBy(desc(requests.createdAt)),
    db.select().from(notifications).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, user.id))).orderBy(desc(notifications.createdAt)),
    db.select({ expenseId: requests.expenseId, proposal: requests.proposal }).from(requests).where(and(eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'), sql`${requests.proposal}->>'_newExpense' = 'true'`)),
    db.select({ entry: history, actor: appUsers.name, expenseTitle: expenses.title }).from(history).leftJoin(appUsers, eq(history.actorId, appUsers.id)).leftJoin(expenses, eq(history.expenseId, expenses.id)).where(and(eq(history.floorId, floor.id), inArray(history.action, ['pago_pendiente', 'pago_confirmado', 'pago_rechazado', 'pago_revertido']))).orderBy(desc(history.createdAt)),
    db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, '__floor_info__'), eq(history.action, 'floor_info'))).orderBy(desc(history.createdAt)).limit(1),
    db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.action, 'reparto'))).orderBy(desc(history.createdAt)),
  ])
  let contractRows: typeof floorContracts.$inferSelect[] = []
  let contractSchemaReady = true
  try {
    contractRows = await db.select().from(floorContracts).where(eq(floorContracts.floorId, floor.id)).limit(1)
  } catch (error) {
    if (!isMissingContractTable(error)) throw error
    contractSchemaReady = false
  }
  const resolvedPayments = new Set(paymentRows.filter(({ entry }) => entry.action === 'pago_confirmado' || entry.action === 'pago_rechazado').map(({ entry }) => (entry.next as Record<string, unknown> | null)?.requestHistoryId))
  const paymentApprovals = paymentRows.filter(({ entry }) => entry.action === 'pago_pendiente' && !resolvedPayments.has(entry.id)).map(({ entry, actor, expenseTitle }) => ({ id: entry.id, expenseId: entry.expenseId, expenseTitle: expenseTitle || 'Gasto eliminado', memberId: String((entry.next as Record<string, unknown> | null)?.memberId || entry.actorId), memberName: actor || 'Miembro del piso', amount: Number((entry.next as Record<string, unknown> | null)?.amount || 0), createdAt: entry.createdAt }))
  const resolutionFor = (id: string) => paymentRows.find(({ entry }) => (entry.action === 'pago_confirmado' || entry.action === 'pago_rechazado') && (entry.next as Record<string, unknown> | null)?.requestHistoryId === id)?.entry
  const contract = contractRows[0]
  const isAdmin = membership.role === 'admin' || floor.adminId === user.id
  const canViewContract = Boolean(contract && (isAdmin || contract.visibleTo.includes(user.id)))
  const expensePayments = new Map<string, Map<string, { status: 'pendiente' | 'confirmado' | 'rechazado' | 'sin_pagar'; amount: number }>>()
  for (const { entry } of paymentRows) {
    const payload = entry.next as Record<string, unknown> | null
    if (entry.action === 'pago_pendiente') {
      if (resolutionFor(entry.id)) continue
      const memberId = String(payload?.memberId || entry.actorId)
      const paymentsForExpense = expensePayments.get(entry.expenseId) || new Map()
      if (!paymentsForExpense.has(memberId)) paymentsForExpense.set(memberId, { status: 'pendiente', amount: Number(payload?.amount || 0) })
      expensePayments.set(entry.expenseId, paymentsForExpense)
    } else if (entry.action === 'pago_confirmado' || entry.action === 'pago_rechazado' || entry.action === 'pago_revertido') {
      const memberId = String(payload?.memberId || entry.actorId)
      const paymentsForExpense = expensePayments.get(entry.expenseId) || new Map()
      if (!paymentsForExpense.has(memberId)) paymentsForExpense.set(memberId, { status: entry.action === 'pago_confirmado' ? 'confirmado' : entry.action === 'pago_revertido' ? 'sin_pagar' : 'rechazado', amount: Number(payload?.amount || 0) })
      expensePayments.set(entry.expenseId, paymentsForExpense)
    }
  }
  return {
    floor: { id: floor.id, name: floor.name, role: membership.role, description: (floorInfoRows[0]?.next as Record<string, unknown> | null)?.description as string || '' },
    user: { id: user.id, name: user.name, username: 'username' in user ? user.username : null, image: user.image || null },
    contract: contract && canViewContract ? { fileName: contract.fileName, updatedAt: contract.updatedAt, visibleTo: isAdmin ? contract.visibleTo : [] } : null,
    contractExists: Boolean(contract),
    contractSchemaReady,
    expenses: expenseRows.filter(({ expense }) => !expense.isPrivate || expense.createdBy === user.id).map(({ expense, creator }) => {
      const expenseAmount = Number(expense.amount)
      if (expense.isPrivate) {
        return { ...expense, amount: expenseAmount, person: creator || user.name, pendingApproval: false, paymentStatus: 'confirmado' as const, personalShare: expenseAmount, splitMode: 'igual' as const, splitValues: { [user.id]: 1 }, payments: [{ memberId: user.id, name: creator || user.name, status: 'confirmado' as const, amount: expenseAmount, parts: 1 }] }
      }
      const splitEntry = splitRows.find((entry) => entry.expenseId === expense.id)
      const pendingSplit = pendingAdds.find((request) => request.expenseId === expense.id)?.proposal as { splitMode?: SplitMode; splitValues?: Record<string, number> } | undefined
      const splitPayload = (splitEntry?.next as { mode?: SplitMode; allocations?: Record<string, number> } | null) || (pendingSplit ? { mode: pendingSplit.splitMode, allocations: pendingSplit.splitValues } : null)
      const splitMode = splitPayload?.mode || 'igual'
      const shareAmounts = calculateShares(Number(expense.amount), memberRows.map(({ membership: member }) => member.userId), splitMode, splitPayload?.allocations || {})
      const paymentsForExpense = expensePayments.get(expense.id)
      const paymentByMember = memberRows.map(({ membership: member }) => ({ memberId: member.userId, name: member.name, status: (paymentsForExpense?.get(member.userId)?.status || 'sin_pagar') as 'sin_pagar' | 'pendiente' | 'confirmado' | 'rechazado', amount: paymentsForExpense?.get(member.userId)?.amount || shareAmounts[member.userId] || 0, parts: splitPayload?.allocations?.[member.userId] ?? 1 }))
      const personalPayment = paymentsForExpense?.get(user.id)
      return { ...expense, amount: Number(expense.amount), person: creator || 'Miembro del piso', pendingApproval: pendingAdds.some((request) => request.expenseId === expense.id), paymentStatus: (personalPayment?.status || 'ninguno') as 'ninguno' | 'sin_pagar' | 'pendiente' | 'confirmado' | 'rechazado', personalShare: personalPayment?.amount || shareAmounts[user.id] || 0, splitMode, splitValues: splitPayload?.allocations || Object.fromEntries(memberRows.map(({ membership: member }) => [member.userId, 1])), payments: paymentByMember }
    }),
    members: memberRows.map(({ membership: item, image }) => ({ ...item, image })),
    requests: requestRows.map(({ request, sender, expenseTitle }) => ({ ...request, sender: sender || 'Miembro del piso', expenseTitle })),
    paymentApprovals,
    notifications: notificationRows,
  }
}

export async function updateContractVisibility(userIds: string[]) {
  const { user, floor } = await requireAdmin()
  if (!Array.isArray(userIds) || userIds.length > 100 || userIds.some((id) => typeof id !== 'string' || id.length > 128)) throw new Error('La lista de permisos no es válida.')
  const visibleTo = [...new Set(userIds)]
  const floorMembers = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
  const allowedIds = new Set(floorMembers.map((member) => member.userId))
  if (visibleTo.some((id) => !allowedIds.has(id))) throw new Error('Solo puedes compartir el contrato con miembros de tu piso.')
  const [contract] = await db.select({ id: floorContracts.id }).from(floorContracts).where(eq(floorContracts.floorId, floor.id)).limit(1)
  if (!contract) throw new Error('Sube primero el contrato del piso.')
  await db.update(floorContracts).set({ visibleTo, updatedAt: new Date() }).where(eq(floorContracts.floorId, floor.id))
  revalidatePath('/')
}

export async function updateOwnProfileName(value: string) {
  const user = await getSessionUser()
  const name = value.trim()
  if (!name || name.length > 60) throw new Error('El nombre debe tener entre 1 y 60 caracteres.')
  await db.transaction(async (tx) => {
    await tx.update(appUsers).set({ name, updatedAt: new Date() }).where(eq(appUsers.id, user.id))
    await tx.update(members).set({ name }).where(eq(members.userId, user.id))
  })
  revalidatePath('/')
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
  if (target.userId === user.id || target.role === 'admin') throw new Error('No puedes eliminar a quien administra el piso.')
  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: '__member_removed__', actorId: user.id, action: 'member_removed', next: { removedUserId: target.userId, floorName: floor.name } })
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
  const { user, floor } = await getMembership()
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  if (expense.isPrivate && expense.createdBy !== user.id) throw new Error('No encontramos ese gasto en tu piso.')
  const entries = await db.select({ entry: history, actor: appUsers.name }).from(history).leftJoin(appUsers, eq(history.actorId, appUsers.id)).where(and(eq(history.expenseId, id), eq(history.floorId, floor.id))).orderBy(desc(history.createdAt))
  return { expense: { ...expense, amount: Number(expense.amount) }, history: entries.map(({ entry, actor }) => ({ ...entry, actor: actor || 'Miembro del piso' })) }
}

export async function createExpense(input: ExpenseInput) {
  const context = await getMembership()
  const { user, floor } = context
  const value = validateExpense(input)
  const isPrivate = value.isPrivate === true
  const memberRows = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
  const splitMode = input.splitMode || 'igual'
  const splitValues = isPrivate ? {} : validateSplit(value.amount, memberRows.map((member) => member.userId), splitMode, input.splitValues)
  const splitSnapshot = { mode: splitMode, allocations: splitValues }
  if (value.invoicePath && (!value.invoicePath.startsWith(`facturas/${floor.id}/`) || value.invoicePath.includes('..'))) throw new Error('La factura no pertenece a este piso.')
  if (value.invoiceName && value.invoiceName.length > 120) throw new Error('El nombre de la factura es demasiado largo.')
  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(expenses).values({ id, floorId: floor.id, title: value.title, type: value.type, amount: value.amount.toFixed(2), date: value.date, periodStart: value.periodStart || null, periodEnd: value.periodEnd || null, rentMonth: value.rentMonth || null, note: value.note?.trim() || null, createdBy: user.id, invoicePath: value.invoicePath || null, invoiceName: value.invoiceName || null, isPrivate })
    if (isPrivate) {
      await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'creado', next: { ...value, isPrivate: true } })
      return
    }
    if (context.membership.role !== 'admin' && floor.adminId !== user.id) {
      const proposal = { title: value.title, type: value.type, amount: value.amount, date: value.date, note: value.note || '', periodStart: value.periodStart || '', periodEnd: value.periodEnd || '', rentMonth: value.rentMonth || '', splitMode, splitValues, _newExpense: true }
      const requestId = randomUUID()
      await tx.insert(requests).values({ id: requestId, floorId: floor.id, expenseId: id, sentBy: user.id, reason: 'Nuevo gasto', proposal, status: 'pendiente' })
      const admins = await tx.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.role, 'admin')))
      if (admins.length) await tx.insert(notifications).values(admins.map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Nuevo gasto pendiente', message: `${value.title}: ${value.amount.toFixed(2)} €`, targetType: 'request', targetId: requestId })))
      return
    }
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'creado', next: value })
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'reparto', next: splitSnapshot })
    const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
    const rows = recipients.filter((row) => row.userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Nuevo gasto', message: `${value.title}: ${value.amount.toFixed(2)} €`, targetType: 'expense', targetId: id }))
    if (rows.length) await tx.insert(notifications).values(rows)
  })
  revalidatePath('/')
  return { id }
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { user, membership, floor } = await getMembership()
  const value = validateExpense(input)
  const memberRows = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
  const splitMode = input.splitMode || 'igual'
  if (value.invoicePath && (!value.invoicePath.startsWith(`facturas/${floor.id}/`) || value.invoicePath.includes('..'))) throw new Error('La factura no pertenece a este piso.')
  const [previous] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!previous) throw new Error('No encontramos ese gasto en tu piso.')
  if (previous.isPrivate ? previous.createdBy !== user.id : membership.role !== 'admin' && floor.adminId !== user.id) throw new Error('No encontramos ese gasto en tu piso.')
  const splitValues = previous.isPrivate ? {} : validateSplit(value.amount, memberRows.map((member) => member.userId), splitMode, input.splitValues)
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
    if (!previous.isPrivate) {
      await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'reparto', next: { mode: splitMode, allocations: splitValues } })
      const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
      const rows = recipients.filter(({ userId }) => userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Gasto actualizado', message: value.title, targetType: 'expense', targetId: id }))
      if (rows.length) await tx.insert(notifications).values(rows)
    }
  })
  revalidatePath('/')
}

export async function deleteExpense(id: string) {
  const { user, membership, floor } = await getMembership()
  const [previous] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id))).limit(1)
  if (!previous) throw new Error('No encontramos ese gasto en tu piso.')
  if (previous.isPrivate ? previous.createdBy !== user.id : membership.role !== 'admin' && floor.adminId !== user.id) throw new Error('No encontramos ese gasto en tu piso.')
  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: id, actorId: user.id, action: 'eliminado', previous, next: null })
    await tx.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.floorId, floor.id)))
    if (!previous.isPrivate) {
      const recipients = await tx.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
      const rows = recipients.filter(({ userId }) => userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Gasto eliminado', message: previous.title }))
      if (rows.length) await tx.insert(notifications).values(rows)
    }
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
  if (expense.isPrivate) throw new Error('Los gastos privados no pueden compartirse como gasto del piso.')
  const safeProposal = Object.fromEntries(Object.entries(proposal).filter(([key]) => ['title', 'type', 'amount', 'date', 'note', 'periodStart', 'periodEnd', 'rentMonth'].includes(key)))
  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(requests).values({ id, floorId: floor.id, expenseId, sentBy: user.id, reason: reason.trim(), proposal: safeProposal, status: 'pendiente' })
    const admins = await tx.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.role, 'admin')))
    if (admins.length) await tx.insert(notifications).values(admins.map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Nueva solicitud de cambio', message: reason.trim(), targetType: 'request', targetId: id })))
  })
  revalidatePath('/')
  return { id }
}

export async function resolveExpenseRequest(id: string, decision: 'aprobada' | 'rechazada') {
  const { user, floor } = await requireAdmin()
  const [pending] = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'))).limit(1)
  if (!pending) throw new Error('La solicitud ya no está pendiente o no pertenece a tu piso.')
  await db.transaction(async (tx) => {
    const isNewExpense = (pending.proposal as Partial<ExpenseInput> & { _newExpense?: boolean })._newExpense === true
    if (decision === 'aprobada') {
      if (isNewExpense) {
        const [current] = await tx.select().from(expenses).where(and(eq(expenses.id, pending.expenseId), eq(expenses.floorId, floor.id))).limit(1)
        if (!current) throw new Error('El gasto asociado ya no existe.')
        const proposal = pending.proposal as Partial<ExpenseInput>
        await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: pending.expenseId, actorId: pending.sentBy, action: 'creado', previous: null, next: proposal })
        await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: pending.expenseId, actorId: pending.sentBy, action: 'reparto', next: { mode: proposal.splitMode || 'igual', allocations: proposal.splitValues || {} } })
      } else {
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
    }
    if (decision === 'rechazada' && isNewExpense) await tx.delete(expenses).where(and(eq(expenses.id, pending.expenseId), eq(expenses.floorId, floor.id)))
    await tx.update(requests).set({ status: decision, resolvedBy: user.id, resolvedAt: new Date() }).where(and(eq(requests.id, id), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente')))
    await tx.insert(notifications).values({ id: randomUUID(), floorId: floor.id, userId: pending.sentBy, title: decision === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', message: pending.reason, targetType: 'expense', targetId: pending.expenseId })
  })
  revalidatePath('/')
}

export async function updateFloorName(name: string) {
  const { floor } = await requireAdmin()
  const clean = name.trim()
  if (!clean || clean.length > 60) throw new Error('El nombre debe tener entre 1 y 60 caracteres.')
  await db.update(floors).set({ name: clean }).where(eq(floors.id, floor.id))
  revalidatePath('/')
}

export async function updateFloorDescription(description: string) {
  const { user, floor } = await requireAdmin()
  const clean = description.trim()
  if (clean.length > 1200) throw new Error('La descripción no puede superar los 1.200 caracteres.')
  await db.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: '__floor_info__', actorId: user.id, action: 'floor_info', next: { description: clean } })
  revalidatePath('/')
}

export async function markExpensePaid(expenseId: string) {
  const { user, floor, membership } = await getMembership()
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  if (expense.isPrivate) throw new Error('Los gastos privados no tienen pagos compartidos.')
  const [pendingApproval] = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.expenseId, expenseId), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'), sql`${requests.proposal}->>'_newExpense' = 'true'`)).limit(1)
  if (pendingApproval) throw new Error('Espera a que se apruebe el gasto antes de indicar el pago.')
  const paymentEvents = await db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, expenseId), inArray(history.action, ['pago_pendiente', 'pago_confirmado', 'pago_rechazado', 'pago_revertido']))).orderBy(desc(history.createdAt))
  const isAdmin = membership.role === 'admin' || floor.adminId === user.id
  const resolvedRequests = new Set(paymentEvents.filter((event) => event.action === 'pago_confirmado' || event.action === 'pago_rechazado').map((event) => (event.next as Record<string, unknown> | null)?.requestHistoryId))
  let currentStatus: 'pendiente' | 'confirmado' | 'rechazado' | 'sin_pagar' = 'sin_pagar'
  let hasCurrentStatus = false
  for (const event of paymentEvents) {
    const payload = event.next as Record<string, unknown> | null
    if (String(payload?.memberId || event.actorId) !== user.id || hasCurrentStatus) continue
    if (event.action === 'pago_pendiente') {
      if (resolvedRequests.has(event.id)) continue
      currentStatus = 'pendiente'
    } else {
      currentStatus = event.action === 'pago_confirmado' ? 'confirmado' : event.action === 'pago_revertido' ? 'sin_pagar' : 'rechazado'
    }
    hasCurrentStatus = true
  }
  if (currentStatus === 'confirmado') throw new Error('Tu parte ya aparece como pagada.')
  if (currentStatus === 'pendiente') throw new Error('Ya hay un pago pendiente de revisión para este gasto.')
  const memberRows = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
  const [splitEntry] = await db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, expenseId), eq(history.action, 'reparto'))).orderBy(desc(history.createdAt)).limit(1)
  const splitPayload = splitEntry?.next as { mode?: SplitMode; allocations?: Record<string, number> } | null
  const amount = calculateShares(Number(expense.amount), memberRows.map((member) => member.userId), splitPayload?.mode || 'igual', splitPayload?.allocations || {})[user.id] || 0
  if (amount <= 0) throw new Error('Este gasto no te asigna ninguna parte.')
  await db.transaction(async (tx) => {
    if (isAdmin) {
      await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId, actorId: user.id, action: 'pago_confirmado', next: { memberId: user.id, amount, direct: true } })
    } else {
      const paymentId = randomUUID()
      await tx.insert(history).values({ id: paymentId, floorId: floor.id, expenseId, actorId: user.id, action: 'pago_pendiente', next: { memberId: user.id, amount } })
      const admins = await tx.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.role, 'admin')))
      const rows = admins.filter(({ userId }) => userId !== user.id).map(({ userId }) => ({ id: randomUUID(), floorId: floor.id, userId, title: 'Pago pendiente de confirmar', message: `${user.name}: ${amount.toFixed(2)} € · ${expense.title}`, targetType: 'payment', targetId: paymentId }))
      if (rows.length) await tx.insert(notifications).values(rows)
    }
  })
  revalidatePath('/')
}

export async function resolvePayment(id: string, decision: 'confirmado' | 'rechazado') {
  const { user, floor } = await requireAdmin()
  const [payment] = await db.select().from(history).where(and(eq(history.id, id), eq(history.floorId, floor.id), eq(history.action, 'pago_pendiente'))).limit(1)
  if (!payment) throw new Error('No encontramos ese pago pendiente.')
  const existing = await db.select().from(history).where(and(eq(history.floorId, floor.id), inArray(history.action, ['pago_confirmado', 'pago_rechazado']))).orderBy(desc(history.createdAt))
  if (existing.some(({ next }) => (next as Record<string, unknown> | null)?.requestHistoryId === id)) throw new Error('Este pago ya se ha revisado.')
  const payload = payment.next as Record<string, unknown> | null
  const memberId = String(payload?.memberId || payment.actorId)
  const amount = Number(payload?.amount || 0)
  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId: payment.expenseId, actorId: user.id, action: decision === 'confirmado' ? 'pago_confirmado' : 'pago_rechazado', previous: payment.next, next: { requestHistoryId: id, memberId, amount } })
    await tx.insert(notifications).values({ id: randomUUID(), floorId: floor.id, userId: memberId, title: decision === 'confirmado' ? 'Pago confirmado' : 'Pago rechazado', message: decision === 'confirmado' ? `Se ha confirmado tu parte de ${amount.toFixed(2)} €.` : 'La administración no ha podido confirmar el pago. Puedes volver a marcarlo cuando se haya realizado.' })
  })
  revalidatePath('/')
}

export async function markMemberExpensePaid(expenseId: string, memberId: string) {
  const { user, floor } = await requireAdmin()
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  if (expense.isPrivate) throw new Error('Los gastos privados no tienen pagos compartidos.')
  const [member] = await db.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.userId, memberId))).limit(1)
  if (!member) throw new Error('Esa persona ya no forma parte del piso.')
  const [pendingApproval] = await db.select({ id: requests.id }).from(requests).where(and(eq(requests.expenseId, expenseId), eq(requests.floorId, floor.id), eq(requests.status, 'pendiente'), sql`${requests.proposal}->>'_newExpense' = 'true'`)).limit(1)
  if (pendingApproval) throw new Error('Espera a que se apruebe el gasto antes de registrar pagos.')

  const paymentEvents = await db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, expenseId), inArray(history.action, ['pago_pendiente', 'pago_confirmado', 'pago_rechazado', 'pago_revertido']))).orderBy(desc(history.createdAt))
  const resolvedRequests = new Set(paymentEvents.filter((event) => event.action === 'pago_confirmado' || event.action === 'pago_rechazado').map((event) => (event.next as Record<string, unknown> | null)?.requestHistoryId))
  let currentStatus: 'pendiente' | 'confirmado' | 'rechazado' | 'sin_pagar' = 'sin_pagar'
  let unresolvedRequestId: string | null = null
  let hasCurrentStatus = false
  for (const event of paymentEvents) {
    const payload = event.next as Record<string, unknown> | null
    if (String(payload?.memberId || event.actorId) !== memberId || hasCurrentStatus) continue
    if (event.action === 'pago_pendiente') {
      if (resolvedRequests.has(event.id)) continue
      currentStatus = 'pendiente'
      unresolvedRequestId = event.id
      hasCurrentStatus = true
    } else {
      currentStatus = event.action === 'pago_confirmado' ? 'confirmado' : event.action === 'pago_revertido' ? 'sin_pagar' : 'rechazado'
      hasCurrentStatus = true
    }
  }
  if (currentStatus === 'confirmado') throw new Error('La parte de esta persona ya está marcada como pagada.')

  const memberRows = await db.select({ userId: members.userId }).from(members).where(eq(members.floorId, floor.id))
  const [splitEntry] = await db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, expenseId), eq(history.action, 'reparto'))).orderBy(desc(history.createdAt)).limit(1)
  const splitPayload = splitEntry?.next as { mode?: SplitMode; allocations?: Record<string, number> } | null
  const amount = calculateShares(Number(expense.amount), memberRows.map((item) => item.userId), splitPayload?.mode || 'igual', splitPayload?.allocations || {})[memberId] || 0
  if (amount <= 0) throw new Error('Esta persona no tiene una parte asignada en el gasto.')

  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId, actorId: user.id, action: 'pago_confirmado', previous: unresolvedRequestId ? paymentEvents.find((event) => event.id === unresolvedRequestId)?.next : null, next: { ...(unresolvedRequestId ? { requestHistoryId: unresolvedRequestId } : { direct: true }), memberId, amount } })
    if (memberId !== user.id) await tx.insert(notifications).values({ id: randomUUID(), floorId: floor.id, userId: memberId, title: 'Pago registrado', message: `La administración ha marcado tu parte de ${amount.toFixed(2)} € como pagada · ${expense.title}` })
  })
  revalidatePath('/')
}

export async function revertMemberExpensePaid(expenseId: string, memberId: string) {
  const { user, floor } = await requireAdmin()
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.floorId, floor.id))).limit(1)
  if (!expense) throw new Error('No encontramos ese gasto en tu piso.')
  if (expense.isPrivate) throw new Error('Los gastos privados no tienen pagos compartidos.')
  const [member] = await db.select({ userId: members.userId }).from(members).where(and(eq(members.floorId, floor.id), eq(members.userId, memberId))).limit(1)
  if (!member) throw new Error('Esa persona ya no forma parte del piso.')
  const paymentEvents = await db.select().from(history).where(and(eq(history.floorId, floor.id), eq(history.expenseId, expenseId), inArray(history.action, ['pago_pendiente', 'pago_confirmado', 'pago_rechazado', 'pago_revertido']))).orderBy(desc(history.createdAt))
  const resolvedRequests = new Set(paymentEvents.filter((event) => event.action === 'pago_confirmado' || event.action === 'pago_rechazado').map((event) => (event.next as Record<string, unknown> | null)?.requestHistoryId))
  let currentStatus: 'pendiente' | 'confirmado' | 'rechazado' | 'sin_pagar' = 'sin_pagar'
  let latestMemberEvent: (typeof paymentEvents)[number] | undefined
  let hasCurrentStatus = false
  for (const event of paymentEvents) {
    const payload = event.next as Record<string, unknown> | null
    if (String(payload?.memberId || event.actorId) !== memberId || hasCurrentStatus) continue
    if (event.action === 'pago_pendiente') {
      if (resolvedRequests.has(event.id)) continue
      currentStatus = 'pendiente'
    } else {
      currentStatus = event.action === 'pago_confirmado' ? 'confirmado' : event.action === 'pago_revertido' ? 'sin_pagar' : 'rechazado'
    }
    latestMemberEvent = event
    hasCurrentStatus = true
  }
  if (currentStatus !== 'confirmado') throw new Error('Esta parte no aparece como pagada.')
  const amount = Number((latestMemberEvent?.next as Record<string, unknown> | null)?.amount || 0)
  await db.transaction(async (tx) => {
    await tx.insert(history).values({ id: randomUUID(), floorId: floor.id, expenseId, actorId: user.id, action: 'pago_revertido', previous: latestMemberEvent?.next, next: { memberId, amount } })
    if (memberId !== user.id) await tx.insert(notifications).values({ id: randomUUID(), floorId: floor.id, userId: memberId, title: 'Pago actualizado', message: `La administración ha marcado tu parte de ${amount.toFixed(2)} € como no pagada · ${expense.title}` })
  })
  revalidatePath('/')
}

export async function markNotificationsRead() {
  const { user, floor } = await getMembership()
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, user.id)))
  revalidatePath('/')
}

export async function markNotificationRead(id: string) {
  const { user, floor } = await getMembership()
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.floorId, floor.id), eq(notifications.userId, user.id)))
  revalidatePath('/')
}

export async function deleteNotifications() {
  const { user, floor } = await getMembership()
  await db.delete(notifications).where(and(eq(notifications.floorId, floor.id), eq(notifications.userId, user.id)))
  revalidatePath('/')
}

export async function deleteNotification(id: string) {
  const { user, floor } = await getMembership()
  await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.floorId, floor.id), eq(notifications.userId, user.id)))
  revalidatePath('/')
}
