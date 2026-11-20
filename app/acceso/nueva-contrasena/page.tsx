'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, House } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function NewPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setError('El enlace no es válido o ha caducado. Solicita uno nuevo.')
      return
    }
    setLoading(true)
    const result = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)
    if (result.error) {
      setError('El enlace no es válido o ha caducado. Solicita uno nuevo.')
      return
    }
    setSuccess(true)
  }

  return <main className="auth-reset-page"><section className="auth-reset-card"><Link href="/acceso" className="brand"><span className="brand-mark"><House size={18}/></span><span>0 morosos<span className="brand-dot">.</span></span></Link>{success ? <><span className="auth-eyebrow">CONTRASEÑA ACTUALIZADA</span><h1>Ya puedes entrar</h1><p>Tu contraseña se ha cambiado correctamente. Inicia sesión con tu nombre de usuario y la nueva contraseña.</p><Link href="/acceso" className="auth-submit auth-submit-link">Ir al inicio de sesión <ArrowRight size={16}/></Link></> : <><span className="auth-eyebrow">NUEVA CONTRASEÑA</span><h1>Elige una contraseña nueva</h1><p>Usa al menos 8 caracteres.</p><form onSubmit={submit} className="auth-form"><label>Nueva contraseña<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}/></label><label>Repite la contraseña<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></label>{error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Guardando…' : 'Cambiar contraseña'} <ArrowRight size={16}/></button></form><Link href="/acceso" className="auth-back-link"><ArrowLeft size={14}/> Volver al inicio de sesión</Link></>}</section></main>
}
