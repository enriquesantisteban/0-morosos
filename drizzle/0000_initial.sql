-- Initial schema for Better Auth and 0 morosos.
-- Safe to run more than once; it creates missing objects without deleting data.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "username" text,
  "displayUsername" text
);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "displayUsername" text;
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_unique" ON "user" ("username");

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_unique" ON "session" ("token");
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "pisos" (
  "id" text PRIMARY KEY NOT NULL,
  "nombre" text NOT NULL,
  "adminId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pisos_admin_idx" ON "pisos" ("adminId");

CREATE TABLE IF NOT EXISTS "miembros" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "userId" text NOT NULL,
  "email" text NOT NULL,
  "nombre" text NOT NULL,
  "rol" text NOT NULL DEFAULT 'miembro',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "miembros_user_floor_idx" ON "miembros" ("userId", "pisoId");
CREATE INDEX IF NOT EXISTS "miembros_floor_idx" ON "miembros" ("pisoId");

CREATE TABLE IF NOT EXISTS "gastos" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "concepto" text NOT NULL,
  "tipo" text NOT NULL,
  "importe" numeric(12,2) NOT NULL,
  "fecha" date NOT NULL,
  "periodoInicio" date,
  "periodoFin" date,
  "mesAlquiler" text,
  "nota" text,
  "registradoPor" text NOT NULL,
  "facturaPath" text,
  "facturaNombre" text,
  "privado" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "gastos" ADD COLUMN IF NOT EXISTS "privado" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "gastos_floor_date_idx" ON "gastos" ("pisoId", "fecha");

CREATE TABLE IF NOT EXISTS "solicitudes" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "gastoId" text NOT NULL,
  "enviadoPor" text NOT NULL,
  "motivo" text NOT NULL,
  "propuesta" jsonb NOT NULL,
  "estado" text NOT NULL DEFAULT 'pendiente',
  "resueltoPor" text,
  "resueltoAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "solicitudes_floor_state_idx" ON "solicitudes" ("pisoId", "estado");

CREATE TABLE IF NOT EXISTS "historial" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "gastoId" text NOT NULL,
  "actorId" text NOT NULL,
  "accion" text NOT NULL,
  "anteriores" jsonb,
  "nuevos" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "historial_floor_expense_idx" ON "historial" ("pisoId", "gastoId", "createdAt");

CREATE TABLE IF NOT EXISTS "notificaciones" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "userId" text NOT NULL,
  "titulo" text NOT NULL,
  "mensaje" text NOT NULL,
  "leida" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "notificaciones_user_idx" ON "notificaciones" ("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "invitaciones" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL,
  "tokenHash" text NOT NULL,
  "creadoPor" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "invitaciones_tokenHash_unique" ON "invitaciones" ("tokenHash");
CREATE INDEX IF NOT EXISTS "invitaciones_floor_idx" ON "invitaciones" ("pisoId", "createdAt");

CREATE TABLE IF NOT EXISTS "contratos_piso" (
  "id" text PRIMARY KEY NOT NULL,
  "pisoId" text NOT NULL UNIQUE,
  "blobPath" text NOT NULL,
  "nombreArchivo" text NOT NULL,
  "visibleTo" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "subidoPor" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
