'use client'

import { useState } from 'react'
import { ArrowRight, House } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export default function RemovedMemberNotice({ floorName }: { floorName: string }) {
  const [leaving, setLeaving] = useState(false)

  async function returnToLogin() {
    setLeaving(true)
    try {
      await authClient.signOut()
    } catch {
      // Continue to the login screen even if the session has already expired.
    }
    window.location.assign('/acceso')
  }

  return <main className="removed-member-page"><section className="removed-member-card"><span className="removed-member-icon"><House size={24}/></span><span className="auth-eyebrow">ESTADO DE TU CUENTA</span><h1>Has sido eliminado del piso {floorName}</h1><p>Ya no tienes acceso a la información ni a los gastos de este piso.</p><button className="auth-submit removed-member-return" type="button" onClick={() => void returnToLogin()} disabled={leaving}>{leaving ? 'Cerrando sesión…' : <>Volver a inicio <ArrowRight size={16}/></>}</button></section></main>
}
