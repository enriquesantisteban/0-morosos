import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDashboardData, getRemovedFloorName } from '@/app/actions/dashboard'
import DashboardClient from './dashboard-client'
import { House } from 'lucide-react'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  const removedFloorName = await getRemovedFloorName()
  if (removedFloorName) {
    return <main className="removed-member-page"><section className="removed-member-card"><span className="removed-member-icon"><House size={24}/></span><span className="auth-eyebrow">ESTADO DE TU CUENTA</span><h1>Has sido eliminado del piso {removedFloorName}</h1><p>Ya no tienes acceso a la información ni a los gastos de este piso.</p></section></main>
  }
  const initialData = await getDashboardData()
  return <DashboardClient initialData={initialData} />
}
