'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, House, LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { joinFloorWithInvitation, validateFloorInvitation } from '@/app/actions/dashboard'

export default function AccessPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(normalizedUsername)) {
      setError('El usuario debe tener de 3 a 24 caracteres: letras, números, punto, guion o guion bajo.')
      return
    }
    setLoading(true)
    const invitationToken = new URLSearchParams(window.location.search).get('invitacion')
    if (mode === 'signup' && invitationToken && !(await validateFloorInvitation(invitationToken))) {
      setLoading(false)
      setError('La invitación ha caducado o ya se utilizó. Pide un enlace nuevo a la persona administradora.')
      return
    }
    const email = `${normalizedUsername}@usuarios.0morosos.invalid`
    const result = mode === 'signin'
      ? await authClient.signIn.email({ email, password, callbackURL: '/' })
      : await authClient.signUp.email({ email, password, name: name.trim(), username: normalizedUsername, callbackURL: '/' } as Parameters<typeof authClient.signUp.email>[0])
    if (result.error) {
      setLoading(false)
      setError(mode === 'signin' ? 'El usuario o la contraseña no son correctos.' : result.error.message ?? 'No se pudo crear el usuario. Comprueba que ese nombre esté disponible.')
      return
    }
    if (invitationToken) {
      try {
        await joinFloorWithInvitation(invitationToken)
      } catch (joinError) {
        setLoading(false)
        setError(joinError instanceof Error ? joinError.message : 'No se pudo aceptar la invitación.')
        return
      }
    }
    window.location.assign('/')
  }

  return <main className="auth-page"><div className="auth-art"><Link href="/" className="brand auth-brand"><span className="brand-mark"><House size={19}/></span><span>0 morosos<span className="brand-dot">.</span></span></Link><div className="auth-art-copy"><span className="auth-art-kicker">UN PISO, UN EQUIPO</span><h1>Las cuentas<br/>claras. La convivencia,<br/><em>más fácil.</em></h1><p>Gastos compartidos sin perseguir a nadie.</p><div className="auth-house-illustration"><div className="illustration-roof"/><div className="illustration-home"><span/><span/><span/></div><div className="illustration-ground"/></div></div><span className="auth-art-bottom">Hecho para vivir mejor juntos.</span></div><div className="auth-form-side"><Link href="/" className="back-link"><ArrowLeft size={14}/> Volver a la página principal</Link><div className="auth-form-wrap"><div className="auth-mobile-brand"><span className="brand-mark"><House size={19}/></span><b>0 morosos<span className="brand-dot">.</span></b></div><div className="auth-eyebrow">BIENVENIDO A CASA</div><h2>{mode === 'signin' ? 'Qué bueno verte' : 'Empieza por tu usuario'}</h2><p className="auth-lede">{mode === 'signin' ? 'Entra a tu piso y pon las cuentas al día.' : 'Elige un nombre de usuario único. Sin correo, solo tú y tu contraseña.'}</p><form onSubmit={submit} className="auth-form">{mode === 'signup' && <label>Nombre para mostrar<input autoComplete="name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Lucía Martín"/></label>}<label>Nombre de usuario<input autoComplete="username" required minLength={3} maxLength={24} value={username} onChange={e => setUsername(e.target.value)} placeholder="Ej. lucia.martin"/><span className="field-hint">Único · 3–24 caracteres · letras, números, . _ -</span></label><label>Contraseña<input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} type="password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Al menos 8 caracteres"/></label>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={loading}>{loading?<><LoaderCircle className="spinner" size={16}/> Un momento...</>:<>{mode==='signin'?'Entrar a mi piso':'Crear usuario'} <ArrowRight size={16}/></>}</button></form><p className="auth-switch">{mode==='signin'?'¿Aún no tienes usuario?':'¿Ya tienes cuenta?'} <button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('')}}>{mode==='signin'?'Crear usuario':'Iniciar sesión'}</button></p><div className="auth-security"><span>●</span> Tu acceso está protegido y tu usuario es único.</div></div><footer className="auth-footer">0 morosos · Las cuentas claras, la convivencia larga.</footer></div></main>
}
