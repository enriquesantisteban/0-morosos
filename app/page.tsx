import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDashboardData } from '@/app/actions/dashboard'
import DashboardClient from './dashboard-client'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  const initialData = await getDashboardData()
  return <DashboardClient initialData={initialData} />
}
