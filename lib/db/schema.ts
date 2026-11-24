import { boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const floors = pgTable('pisos', {
  id: text('id').primaryKey(),
  name: text('nombre').notNull(),
  adminId: text('adminId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('pisos_admin_idx').on(table.adminId)])

export const members = pgTable('miembros', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  userId: text('userId').notNull(),
  email: text('email').notNull(),
  name: text('nombre').notNull(),
  role: text('rol').notNull().default('miembro'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('miembros_user_floor_idx').on(table.userId, table.floorId), index('miembros_floor_idx').on(table.floorId)])

export const expenses = pgTable('gastos', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  title: text('concepto').notNull(),
  type: text('tipo').notNull(),
  amount: numeric('importe', { precision: 12, scale: 2 }).notNull(),
  date: date('fecha').notNull(),
  periodStart: date('periodoInicio'),
  periodEnd: date('periodoFin'),
  rentMonth: text('mesAlquiler'),
  note: text('nota'),
  createdBy: text('registradoPor').notNull(),
  invoicePath: text('facturaPath'),
  invoiceName: text('facturaNombre'),
  isPrivate: boolean('privado').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('gastos_floor_date_idx').on(table.floorId, table.date)])

export const requests = pgTable('solicitudes', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  expenseId: text('gastoId').notNull(),
  sentBy: text('enviadoPor').notNull(),
  reason: text('motivo').notNull(),
  proposal: jsonb('propuesta').notNull().$type<Record<string, unknown>>(),
  status: text('estado').notNull().default('pendiente'),
  resolvedBy: text('resueltoPor'),
  resolvedAt: timestamp('resueltoAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('solicitudes_floor_state_idx').on(table.floorId, table.status)])

export const history = pgTable('historial', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  expenseId: text('gastoId').notNull(),
  actorId: text('actorId').notNull(),
  action: text('accion').notNull(),
  previous: jsonb('anteriores').$type<Record<string, unknown>>(),
  next: jsonb('nuevos').$type<Record<string, unknown>>(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('historial_floor_expense_idx').on(table.floorId, table.expenseId, table.createdAt)])

export const notifications = pgTable('notificaciones', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  userId: text('userId').notNull(),
  title: text('titulo').notNull(),
  message: text('mensaje').notNull(),
  read: boolean('leida').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('notificaciones_user_idx').on(table.userId, table.createdAt)])

export const pushSubscriptions = pgTable('suscripciones_push', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  userId: text('userId').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  reminderMonth: text('recordatorioMes'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('suscripciones_push_endpoint_unique').on(table.endpoint), index('suscripciones_push_user_idx').on(table.floorId, table.userId)])

export const paymentReminders = pgTable('recordatorios_pago', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  userId: text('userId').notNull(),
  month: text('mes').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('recordatorios_pago_month_user_unique').on(table.floorId, table.userId, table.month)])

export const invitations = pgTable('invitaciones', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  createdBy: text('creadoPor').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  usedAt: timestamp('usedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('invitaciones_floor_idx').on(table.floorId, table.createdAt)])

export const floorContracts = pgTable('contratos_piso', {
  id: text('id').primaryKey(),
  floorId: text('pisoId').notNull().unique(),
  blobPath: text('blobPath').notNull(),
  fileName: text('nombreArchivo').notNull(),
  visibleTo: jsonb('visibleTo').notNull().$type<string[]>().default([]),
  uploadedBy: text('subidoPor').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const appUsers = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  username: text('username'),
  image: text('image'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})
