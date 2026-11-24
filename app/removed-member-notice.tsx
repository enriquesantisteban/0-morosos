'use client'

import { House } from 'lucide-react'

export default function RemovedMemberNotice({ floorName }: { floorName: string }) {
  return <main className="removed-member-page"><section className="removed-member-card"><span className="removed-member-icon"><House size={24}/></span><span className="auth-eyebrow">ESTADO DE TU CUENTA</span><h1>Has sido eliminado del piso {floorName}</h1><p>Ya no tienes acceso a la información ni a los gastos de este piso.</p></section></main>
}
