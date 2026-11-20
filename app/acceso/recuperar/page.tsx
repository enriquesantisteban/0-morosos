'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, House } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: `${window.location.origin}/acceso/nueva-contrasena`,
    })
    setLoading(false)
    if (result.error) {
      setError('No se pudo enviar el correo. Comprueba la dirección o inténtalo más tarde.')
      return
    }
    setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.')
  }

  return <main className="auth-reset-page"><section className="auth-reset-card"><Link href="/acceso" className="brand"><span className="brand-mark"><House size={18}/></span><span>0 morosos<span className="brand-dot">.</span></span></Link><span className="auth-eyebrow">RECUPERAR ACCESO</span><h1>Restablece tu contraseña</h1><p>Escribe el correo que añadiste al crear tu cuenta y te enviaremos un enlace.</p><form onSubmit={submit} className="auth-form"><label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com"/></label>{error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-success" role="status">{message}</div>}<button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Enviando…' : 'Enviar enlace de recuperación'} <ArrowRight size={16}/></button></form><Link href="/acceso" className="auth-back-link"><ArrowLeft size={14}/> Volver al inicio de sesión</Link></section></main>
}
