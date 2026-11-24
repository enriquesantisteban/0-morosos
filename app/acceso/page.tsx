'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, House, LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { getAuthErrorMessage } from '@/lib/auth-errors'
import { joinFloorWithInvitation, validateFloorInvitation } from '@/app/actions/dashboard'

export default function AccessPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const invitationHandled = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invitationToken = params.get('invitacion')
    const googleStatus = params.get('google')

    if (googleStatus === 'error') {
      const errorCode = params.get('error') || params.get('error_description') || 'desconocido'
      const messages: Record<string, string> = {
        account_not_linked: 'Esta cuenta aún no está vinculada. Entra primero con tu usuario y contraseña y, desde el menú de tu cuenta, selecciona «Vincular cuenta de Google». Después podrás entrar directamente con Google.',
        email_not_verified: 'Google no ha podido verificar el correo de esta cuenta.',
        state_mismatch: 'La sesión de Google ha caducado. Vuelve a intentarlo en una sola pestaña.',
        unable_to_create_session: 'Google autenticó la cuenta, pero no se pudo guardar la sesión. Inténtalo de nuevo.',
      }
      setError(messages[errorCode] || getAuthErrorMessage(errorCode, 'google'))
      return
    }

    if (googleStatus !== 'complete' || invitationHandled.current) return
    invitationHandled.current = true
    setLoading(true)
    void authClient.getSession().then(async ({ data }) => {
      if (!data?.user) {
        setLoading(false)
        setError('No se pudo completar el inicio con Google. Inténtalo de nuevo.')
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
      window.location.replace('/')
    }).catch(() => {
      setLoading(false)
      setError('Google ha vuelto a la aplicación, pero no se pudo recuperar la sesión. Inténtalo de nuevo.')
    })
  }, [])

  async function signInWithGoogle() {
    setError('')
    setLoading(true)
    const invitationToken = new URLSearchParams(window.location.search).get('invitacion')
    const callbackURL = new URL('/acceso', window.location.origin)
    callbackURL.searchParams.set('google', 'complete')
    const errorCallbackURL = new URL('/acceso', window.location.origin)
    errorCallbackURL.searchParams.set('google', 'error')
    if (invitationToken) {
      callbackURL.searchParams.set('invitacion', invitationToken)
      errorCallbackURL.searchParams.set('invitacion', invitationToken)
    }
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: callbackURL.toString(), errorCallbackURL: errorCallbackURL.toString() })
      if (result.error) {
        setLoading(false)
        setError(getAuthErrorMessage(result.error, 'google'))
      }
    } catch (requestError) {
      setLoading(false)
      setError(getAuthErrorMessage(requestError, 'google'))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(normalizedUsername)) {
      setError('El usuario debe tener de 3 a 24 caracteres: letras, números, punto, guion o guion bajo.')
      return
    }
    if (mode === 'signup' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('La dirección de correo electrónico no es válida.')
      return
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Escribe el nombre que quieres mostrar.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password.length > 128) {
      setError('La contraseña no puede superar los 128 caracteres.')
      return
    }
    setLoading(true)
    const invitationToken = new URLSearchParams(window.location.search).get('invitacion')
    if (mode === 'signup' && invitationToken && !(await validateFloorInvitation(invitationToken))) {
      setLoading(false)
      setError('La invitación ha caducado o ya se utilizó. Pide un enlace nuevo a la administración del piso.')
      return
    }
    let result
    try {
      result = mode === 'signin'
        ? await authClient.signIn.username({ username: normalizedUsername, password, callbackURL: '/' })
        : await authClient.signUp.email({ email: email.trim().toLowerCase(), password, name: name.trim(), username: normalizedUsername, callbackURL: '/' })
    } catch (requestError) {
      setLoading(false)
      setError(getAuthErrorMessage(requestError, mode))
      return
    }
    if (result.error) {
      setLoading(false)
      setError(getAuthErrorMessage(result.error, mode))
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

  return <main className="auth-page"><div className="auth-art"><Link href="/" className="brand auth-brand"><span className="brand-mark"><House size={19}/></span><span>0 morosos<span className="brand-dot">.</span></span></Link><div className="auth-art-copy"><span className="auth-art-kicker">UN PISO, UN EQUIPO</span><h1>Las cuentas<br/>claras. La convivencia,<br/><em>más fácil.</em></h1><p>Gastos compartidos sin perseguir a nadie.</p><div className="auth-house-illustration"><div className="illustration-roof"/><div className="illustration-home"><span/><span/><span/></div><div className="illustration-ground"/></div></div><span className="auth-art-bottom">Hecho para vivir mejor juntos.</span></div><div className="auth-form-side"><Link href="/" className="back-link"><ArrowLeft size={14}/> Volver a la página principal</Link><div className="auth-form-wrap"><div className="auth-mobile-brand"><span className="brand-mark"><House size={19}/></span><b>0 morosos<span className="brand-dot">.</span></b></div><div className="auth-eyebrow">BIENVENIDO A CASA</div><h2>{mode === 'signin' ? 'Qué bueno verte' : 'Empieza por tu usuario'}</h2><p className="auth-lede">{mode === 'signin' ? 'Entra a tu piso y pon las cuentas al día.' : 'Elige un nombre de usuario único. Incluye un correo válido para poder recuperar tu contraseña.'}</p><form onSubmit={submit} className="auth-form" noValidate>{mode === 'signup' && <label>Nombre para mostrar<input autoComplete="name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Lucía Martín"/></label>}{mode === 'signup' && <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com"/></label>}<label>Nombre de usuario<input autoComplete="username" required minLength={3} maxLength={24} value={username} onChange={e => setUsername(e.target.value)} placeholder="Ej. lucia.martin"/><span className="field-hint">Único · 3–24 caracteres · letras, números, . _ -</span></label><label>Contraseña<input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} type="password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Al menos 8 caracteres"/></label>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={loading}>{loading?<><LoaderCircle className="spinner" size={16}/> Un momento...</>:<>{mode==='signin'?'Entrar a mi piso':'Crear usuario'} <ArrowRight size={16}/></>}</button></form>{mode === 'signin' && <Link className="forgot-password" href="/acceso/recuperar">¿Has olvidado tu contraseña?</Link>}{mode === 'signin' && <><div className="auth-divider"><span>o continúa con</span></div><button className="auth-google" type="button" onClick={() => void signInWithGoogle()} disabled={loading}><span aria-hidden="true">G</span> Continuar con Google</button></>}<p className="auth-switch">{mode==='signin'?'¿Aún no tienes usuario?':'¿Ya tienes cuenta?'} <button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('')}}>{mode==='signin'?'Crear usuario':'Iniciar sesión'}</button></p><div className="auth-security"><span>●</span> Tu acceso está protegido y tu usuario es único.</div></div><footer className="auth-footer">0 morosos · Las cuentas claras, la convivencia larga.</footer></div></main>
}
