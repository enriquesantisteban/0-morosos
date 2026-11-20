import { betterAuth } from 'better-auth'
import { username } from 'better-auth/plugins'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')
const resendApiKey = process.env.RESEND_API_KEY
const emailFrom = process.env.EMAIL_FROM

async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (!resendApiKey || !emailFrom) throw new Error('El envío de correos no está configurado.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: emailFrom, to: [to], subject, text }),
  })
  if (!response.ok) throw new Error('No se pudo enviar el correo.')
}

export const pool = new Pool({ connectionString, max: 5, ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false } })

export const auth = betterAuth({
  database: pool,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => sendEmail({
      to: user.email,
      subject: 'Recupera tu contraseña de 0 morosos',
      text: `Hola ${user.name},\n\nPuedes crear una contraseña nueva desde este enlace (válido durante una hora):\n${url}\n\nSi no has solicitado este cambio, ignora este mensaje.`,
    }),
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => sendEmail({
      to: user.email,
      subject: 'Confirma tu correo de 0 morosos',
      text: `Hola ${user.name},\n\nConfirma tu correo y guarda este como dirección de recuperación siguiendo este enlace:\n${url}`,
    }),
  },
  user: { changeEmail: { enabled: true } },
  account: { accountLinking: { enabled: false } },
  plugins: [username({ displayUsername: false, minUsernameLength: 3, maxUsernameLength: 24, usernameValidator: (value) => /^[a-z0-9][a-z0-9._-]{2,23}$/.test(value) })],
  trustedOrigins: [
    'http://localhost:3000',
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },
})
