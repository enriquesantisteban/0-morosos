type AuthErrorContext = 'signin' | 'signup' | 'google' | 'reset'

export function getAuthErrorMessage(error: unknown, context: AuthErrorContext) {
  const details = typeof error === 'string'
    ? error
    : error && typeof error === 'object'
      ? [Reflect.get(error, 'code'), Reflect.get(error, 'message')].filter((value) => typeof value === 'string').join(' ')
      : ''
  const value = details.toLowerCase().replace(/[_-]+/g, ' ')

  if (/invalid email|email.*invalid|invalid.*email|body\.email/.test(value)) return 'La dirección de correo electrónico no es válida.'
  if (/email.*match|different.*email/.test(value)) return 'La cuenta de Google debe usar el mismo correo que esta cuenta.'
  if (/username.*(taken|exist|already)|user name.*(taken|exist|already)/.test(value)) return 'Ese nombre de usuario ya está en uso.'
  if (/email.*(taken|exist|already)|user already exists|account.*already exists/.test(value)) return 'Ya existe una cuenta con esa dirección de correo electrónico.'
  if (/password.*(short|length)|at least 8|minimum.*password/.test(value)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/too many|rate.?limit/.test(value)) return 'Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.'
  if (/network|fetch failed|failed to fetch|connection/.test(value)) return 'No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.'

  if (context === 'signin') return 'El nombre de usuario o la contraseña no son correctos.'
  if (context === 'signup') return 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.'
  if (context === 'google') return 'No se pudo completar el acceso con Google. Inténtalo de nuevo.'
  return 'No se pudo completar la solicitud. Comprueba los datos e inténtalo de nuevo.'
}
