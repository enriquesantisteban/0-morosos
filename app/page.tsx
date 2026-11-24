import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDashboardData, getRemovedFloorName } from '@/app/actions/dashboard'
import DashboardClient from './dashboard-client'
import RemovedMemberNotice from './removed-member-notice'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/acceso')
  const removedFloorName = await getRemovedFloorName()
  if (removedFloorName) return <RemovedMemberNotice floorName={removedFloorName}/>
  const initialData = await getDashboardData()
  return <DashboardClient initialData={initialData} />
}
