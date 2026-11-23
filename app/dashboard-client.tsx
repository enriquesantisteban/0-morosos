'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownToLine, ArrowDownUp, ArrowRight, Bell, Camera, Check, ChevronDown, Circle, CircleCheck, CircleHelp, CircleX, Clock3, Copy, CreditCard, Droplets, FileText, Filter, House, LayoutDashboard, LogOut, Menu, MoreHorizontal, Pencil, Plus, Search, Share2, Sparkles, Trash2, Undo2, Upload, UserRound, Users, Wallet, Wifi, X, Zap } from 'lucide-react'
import { createExpense, createFloorInvitation, deleteExpense, getDashboardData, markExpensePaid, markMemberExpensePaid, markNotificationsRead, removeFloorMember, resolveExpenseRequest, resolvePayment, revertMemberExpensePaid, submitExpenseRequest, updateContractVisibility, updateExpense, updateFloorDescription, updateFloorName, updateOwnProfileName } from '@/app/actions/dashboard'
import type { getDashboardData as getDashboardDataType } from '@/app/actions/dashboard'
import { authClient } from '@/lib/auth-client'

type DashboardPayload = Awaited<ReturnType<typeof getDashboardDataType>>
type Expense = { id: string; title: string; type: string; date: string; person: string; amount: number; initials: string; color: string; createdBy: string; isPrivate: boolean; periodStart: string | null; periodEnd: string | null; rentMonth: string | null; note: string | null; invoicePath: string | null; invoiceName: string | null; pendingApproval: boolean; paymentStatus: 'ninguno' | 'sin_pagar' | 'pendiente' | 'confirmado' | 'rechazado'; personalShare: number; splitMode: 'igual' | 'partes' | 'importes'; splitValues: Record<string, number>; payments: { memberId: string; name: string; status: 'sin_pagar' | 'pendiente' | 'confirmado' | 'rechazado'; amount: number; parts: number }[] }
const colors = ['lilac', 'peach', 'mint', 'blue']
const navItems = [
  { label: 'Resumen', icon: LayoutDashboard }, { label: 'Gastos', icon: Wallet }, { label: 'Compañeros', icon: Users },
  { label: 'Solicitudes', icon: ArrowDownUp }, { label: 'Notificaciones', icon: Bell },
]
const euro = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const categoryColors: Record<string, string> = { Alquiler: '#526c54', Luz: '#bd835c', Agua: '#6986a2', Basura: '#857898', Comunidad: '#b49a68', Internet: '#7187a0', Otros: '#6d896e' }
const categoryColor = (type: string) => categoryColors[type] ?? '#8b938b'
const displayDate = (value: string | Date) => new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const mapExpenses = (rows: DashboardPayload['expenses']): Expense[] => rows.map((row, index) => ({ ...row, date: String(row.date).slice(0, 10), initials: row.person.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length] }))

export default function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const [page, setPage] = useState('Resumen')
  const [selectedMonth, setSelectedMonth] = useState(() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` })
  const [floorName, setFloorName] = useState(initialData.floor.name)
  const [floorDescription, setFloorDescription] = useState(initialData.floor.description)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [topAccountMenuOpen, setTopAccountMenuOpen] = useState(false)
  const [googleLinked, setGoogleLinked] = useState(false)
  const [profileName, setProfileName] = useState(initialData.user.name)
  const [profileImage, setProfileImage] = useState(initialData.user.image)
  const [profileSaving, setProfileSaving] = useState(false)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [contractSaving, setContractSaving] = useState(false)
  const [contract, setContract] = useState(initialData.contract)
  const [contractExists, setContractExists] = useState(initialData.contractExists)
  const [contractVisibleTo, setContractVisibleTo] = useState(initialData.contract?.visibleTo || [])
  const profileImageUrl = profileImage?.startsWith('perfiles/')
    ? `/api/perfil/foto?userId=${encodeURIComponent(initialData.user.id)}&v=${encodeURIComponent(profileImage)}`
    : profileImage
  const [reportYear, setReportYear] = useState(new Date().getFullYear())
  const [expenses, setExpenses] = useState<Expense[]>(mapExpenses(initialData.expenses))
  const [members, setMembers] = useState(initialData.members)
  const [notifications, setNotifications] = useState(initialData.notifications)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [requestTarget, setRequestTarget] = useState<Expense | null>(null)
  const [invitationUrl, setInvitationUrl] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [proposedAmount, setProposedAmount] = useState('')
  const [splitMode, setSplitMode] = useState<'igual' | 'partes' | 'importes'>('igual')
  const [splitValues, setSplitValues] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ title: '', type: 'Luz', amount: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', rentMonth: '', note: '', isPrivate: false })
  const [requests, setRequests] = useState(initialData.requests.map((request, index) => ({ ...request, title: request.expenseTitle || 'Gasto eliminado', detail: request.reason === "Nuevo gasto" ? `${request.expenseTitle || "Gasto"} · ${euro(Number(request.proposal.amount))}` : request.reason, name: request.sender, initials: request.sender.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], time: new Date(request.createdAt).toLocaleDateString('es-ES') })))
  const [paymentApprovals, setPaymentApprovals] = useState(initialData.paymentApprovals)
  const filtered = useMemo(() => expenses.filter((item) => item.date.slice(0, 7) === selectedMonth && (filter === 'Todos' || item.type === filter) && `${item.title} ${item.type}`.toLowerCase().includes(search.toLowerCase())), [expenses, selectedMonth, filter, search])
  const monthKey = selectedMonth
  const monthExpenses = expenses.filter((expense) => expense.date.slice(0, 7) === monthKey)
  const monthlyExpenses = monthExpenses.filter((expense) => !expense.pendingApproval && !expense.isPrivate)
  const monthlyPrivateExpenses = monthExpenses.filter((expense) => expense.isPrivate && expense.createdBy === initialData.user.id)
  const personalMonthlyTotal = monthlyExpenses.reduce((sum, expense) => sum + (expense.payments.find((payment) => payment.memberId === initialData.user.id)?.amount || 0), 0) + monthlyPrivateExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const total = monthlyExpenses.reduce((sum, item) => sum + item.amount, 0)
  const paymentParts = monthlyExpenses.flatMap((expense) => expense.payments.filter((payment) => payment.amount > 0))
  const paidParts = paymentParts.filter((payment) => payment.status === 'confirmado').length
  const pendingParts = paymentParts.length - paidParts
  const paymentProgress = paymentParts.length ? Math.round((paidParts / paymentParts.length) * 100) : 0
  const latestExpenseDate = monthlyExpenses.reduce<string | null>((latest, expense) => !latest || expense.date > latest ? expense.date : latest, null)
  const monthLabels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthlySeries = monthLabels.map((_, index) => expenses.filter((expense) => !expense.pendingApproval && !expense.isPrivate && expense.date.slice(0, 7) === `${selectedMonth.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`).reduce((sum, expense) => sum + expense.amount, 0))
  const monthlyPrivateSeries = monthLabels.map((_, index) => expenses.filter((expense) => expense.isPrivate && expense.createdBy === initialData.user.id && expense.date.slice(0, 7) === `${selectedMonth.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`).reduce((sum, expense) => sum + expense.amount, 0))
  const maxMonthly = Math.max(0, ...monthlySeries.map((amount, index) => amount + monthlyPrivateSeries[index]))
  const rawChartStep = maxMonthly / 3
  const chartMagnitude = rawChartStep > 0 ? 10 ** Math.floor(Math.log10(rawChartStep)) : 1
  const chartFraction = rawChartStep > 0 ? rawChartStep / chartMagnitude : 0
  const chartStep = chartFraction <= 1 ? chartMagnitude : chartFraction <= 2 ? chartMagnitude * 2 : chartFraction <= 2.5 ? chartMagnitude * 2.5 : chartFraction <= 5 ? chartMagnitude * 5 : chartMagnitude * 10
  const chartMaximum = maxMonthly > 0 ? chartStep * 3 : 0
  const chartTicks = chartMaximum > 0 ? [chartMaximum, chartStep * 2, chartStep] : [0, 0, 0]
  const formatChartAmount = (amount: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: amount < 10 ? 1 : 0 }).format(amount)} €`
  const daysLeft = Math.max(0, new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate() - (selectedMonth === new Date().toISOString().slice(0, 7) ? new Date().getDate() : 0))
  const categoryTotals = ['Alquiler', 'Luz', 'Agua', 'Basura', 'Comunidad', 'Internet', 'Otros'].map((type) => ({ type, amount: monthlyExpenses.filter((expense) => expense.type === type).reduce((sum, expense) => sum + expense.amount, 0) }))
  const largestCategory = [...categoryTotals].sort((a, b) => b.amount - a.amount)[0]
  const donutGradient = total > 0 ? (() => { let accumulated = 0; const segments = categoryTotals.filter((category) => category.amount > 0).map((category) => { const start = accumulated / total * 100; accumulated += category.amount; return `${categoryColor(category.type)} ${start}% ${accumulated / total * 100}%` }); return `conic-gradient(${segments.join(', ')})` })() : 'conic-gradient(#e9ece8 0 100%)'
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }

  useEffect(() => {
    void authClient.listAccounts().then(({ data }) => {
      setGoogleLinked(Boolean(data?.some((account) => account.providerId === 'google')))
    }).catch(() => {})

    const url = new URL(window.location.href)
    const linkStatus = url.searchParams.get('google_link')
    if (linkStatus) {
      const errorCode = url.searchParams.get('error')
      if (linkStatus === 'complete') {
        setGoogleLinked(true)
        notify('Cuenta de Google vinculada. Ya podrás iniciar sesión con Google.')
      } else {
        notify(errorCode?.includes('email') && errorCode.includes('match')
          ? 'La cuenta de Google debe usar el mismo correo que esta cuenta.'
          : `No se pudo vincular Google${errorCode ? ` (${errorCode})` : ''}.`)
      }
      url.searchParams.delete('google_link')
      url.searchParams.delete('error')
      url.searchParams.delete('error_description')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])
  const selectedDate = new Date(`${selectedMonth}-01T12:00:00`)
  const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(selectedDate)
  const currentYear = new Date().getFullYear()
  const oldestYear = Math.min(currentYear - 10, ...expenses.map((expense) => Number(expense.date.slice(0, 4))))
  const yearOptions = Array.from(new Set([...Array.from({ length: currentYear - oldestYear + 1 }, (_, index) => currentYear - index), ...expenses.map((expense) => Number(expense.date.slice(0, 4)))] )).sort((a, b) => b - a)

  function exportCsv() {
    const rows = [['Concepto', 'Tipo', 'Fecha', 'Registrado por', 'Importe'], ...filtered.filter((expense) => !expense.pendingApproval && !expense.isPrivate).map((e) => [e.title, e.type, displayDate(e.date), e.person, e.amount.toFixed(2)])]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); link.download = `gastos-piso-${selectedMonth}.csv`; link.click(); URL.revokeObjectURL(link.href)
    notify('Tu informe CSV se ha descargado')
  }

  function exportPdf() {
    const reportExpenses = expenses
      .filter((expense) => !expense.pendingApproval && !expense.isPrivate && Number(expense.date.slice(0, 4)) === reportYear)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    const reportTotal = reportExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEscapes[character])
    const rows = reportExpenses.map((expense) => `<tr><td>${escapeHtml(displayDate(expense.date))}</td><td>${escapeHtml(expense.title)}</td><td>${escapeHtml(expense.type)}</td><td>${escapeHtml(expense.person)}</td><td class="amount">${escapeHtml(euro(expense.amount))}</td></tr>`).join('')
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      notify('Permite las ventanas emergentes para preparar el informe PDF.')
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de gastos ${reportYear}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#243329;margin:36px auto;max-width:1000px;padding:0 28px}header{border-bottom:2px solid #3b5841;padding-bottom:18px;margin-bottom:24px}header p{margin:0 0 8px;color:#607565;font-size:11px;letter-spacing:1.4px;font-weight:bold}h1{font-size:28px;margin:0 0 6px}header span{color:#68736b;font-size:13px}.summary{display:flex;justify-content:space-between;align-items:center;background:#f2f5f0;padding:16px 18px;border-radius:8px;margin-bottom:24px}.summary span{font-size:13px;color:#59665c}.summary strong{font-size:21px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;color:#657267;background:#f5f6f4;font-size:10px;text-transform:uppercase;letter-spacing:.6px}th,td{padding:11px 9px;border-bottom:1px solid #e5e9e4}td.amount,th:last-child{text-align:right;white-space:nowrap}.empty{text-align:center;color:#788178;padding:32px}footer{margin-top:24px;color:#899189;font-size:10px}@media print{body{margin:0 auto;padding:0 8mm;max-width:none}.summary,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}tr{break-inside:avoid}thead{display:table-header-group}}
    </style></head><body><header><p>INFORME DETALLADO · ${reportYear}</p><h1>${escapeHtml(floorName)}</h1><span>Gastos aprobados registrados durante ${reportYear}</span></header><section class="summary"><span>${reportExpenses.length} ${reportExpenses.length === 1 ? 'gasto' : 'gastos'}</span><strong>Total: ${escapeHtml(euro(reportTotal))}</strong></section><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Registrado por</th><th>Importe</th></tr></thead><tbody>${rows || '<tr><td class="empty" colspan="5">No hay gastos registrados para este año.</td></tr>'}</tbody></table><footer>Informe generado desde 0 morosos.</footer><script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`)
    reportWindow.document.close()
  }

  function exportYearCsv() {
    const yearly = expenses.filter((expense) => !expense.pendingApproval && !expense.isPrivate && Number(expense.date.slice(0, 4)) === reportYear)
    const rows = [['Concepto', 'Tipo', 'Fecha', 'Registrado por', 'Importe'], ...yearly.map((e) => [e.title, e.type, displayDate(e.date), e.person, e.amount.toFixed(2)])]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); link.download = `historico-piso-${reportYear}.csv`; link.click(); URL.revokeObjectURL(link.href)
    notify(`Histórico de ${reportYear} descargado`)
  }

  async function refreshDashboard() {
    const fresh = await getDashboardData()
    setExpenses(mapExpenses(fresh.expenses))
    setMembers(fresh.members)
    setNotifications(fresh.notifications)
    setPaymentApprovals(fresh.paymentApprovals)
    setFloorDescription(fresh.floor.description)
    setProfileName(fresh.user.name)
    setProfileImage(fresh.user.image)
    setContract(fresh.contract)
    setContractExists(fresh.contractExists)
    setContractVisibleTo(fresh.contract?.visibleTo || [])
    setRequests(fresh.requests.map((request, index) => ({ ...request, title: request.expenseTitle || 'Gasto eliminado', detail: request.reason === "Nuevo gasto" ? `${request.expenseTitle || "Gasto"} · ${euro(Number(request.proposal.amount))}` : request.reason, name: request.sender, initials: request.sender.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], time: new Date(request.createdAt).toLocaleDateString('es-ES') })))
  }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      let invoice: { pathname: string; name: string } | undefined
      if (invoiceFile) {
        const body = new FormData()
        body.set('file', invoiceFile)
        const response = await fetch('/api/factura', { method: 'POST', body })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudo subir la factura')
        invoice = result
      }
      const input = { title: form.title, type: form.type, amount: Number(form.amount), date: form.date, note: form.note, isPrivate: form.isPrivate, periodStart: form.periodStart || undefined, periodEnd: form.periodEnd || undefined, rentMonth: form.rentMonth || undefined, invoicePath: invoice?.pathname, invoiceName: invoice?.name, splitMode, splitValues: Object.fromEntries(members.map((member) => [member.userId, Number(splitValues[member.userId] ?? (splitMode === 'importes' ? 0 : 1))])) }
      if (editingId) await updateExpense(editingId, input)
      else await createExpense(input)
      setInvoiceFile(null)
      setEditingId(null)
      await refreshDashboard()
      setForm({ title: '', type: 'Luz', amount: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', rentMonth: '', note: '', isPrivate: false })
      setSplitMode('igual')
      setSplitValues({})
      setShowAdd(false)
      notify(form.isPrivate ? 'Gasto privado guardado en tu perfil' : initialData.floor.role === 'admin' || editingId ? 'Gasto guardado en el piso' : 'Gasto enviado a aprobación')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar el gasto')
    } finally {
      setSaving(false)
    }
  }

  function shareWhatsApp() {
    const sharedExpenses = expenses.filter((expense) => !expense.pendingApproval && !expense.isPrivate && expense.date.slice(0, 7) === selectedMonth)
    const total = sharedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    const sharesByMember = new Map(members.map((member) => [member.userId, { name: member.name, amount: 0 }]))
    for (const expense of sharedExpenses) {
      for (const payment of expense.payments) {
        if (payment.amount > 0) {
          const memberShare = sharesByMember.get(payment.memberId) || { name: payment.name, amount: 0 }
          sharesByMember.set(payment.memberId, { ...memberShare, amount: memberShare.amount + payment.amount })
        }
      }
    }
    const memberTotals = [...sharesByMember.values()].sort((memberA, memberB) => memberA.name.localeCompare(memberB.name, 'es'))
    const message = [
      `*Gastos de ${monthName} · ${floorName}*`,
      '',
      ...(sharedExpenses.length ? sharedExpenses.map((expense) => `• ${expense.title}: ${euro(expense.amount)}`) : ['Sin gastos registrados.']),
      '',
      `*Total: ${euro(total)}*`,
      '',
      '*Total por persona:*',
      ...(memberTotals.length ? memberTotals.map(({ name, amount }) => `• ${name}: ${euro(amount)}`) : ['Sin importes asignados.']),
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  async function resolveRequest(id: string, decision: 'aprobada' | 'rechazada') {
    try {
      await resolveExpenseRequest(id, decision)
      await refreshDashboard()
      notify(decision === 'aprobada' ? 'Solicitud aprobada y aplicada' : 'Solicitud rechazada')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo resolver la solicitud')
    }
  }

  async function markPaid(expense: Expense) {
    try { await markExpensePaid(expense.id); await refreshDashboard(); notify(initialData.floor.role === 'admin' ? 'Tu parte quedó marcada como pagada' : `Tu parte de ${euro(expense.personalShare)} quedó pendiente de confirmación`) }
    catch (error) { notify(error instanceof Error ? error.message : 'No se pudo registrar el pago') }
  }

  async function markMemberPaid(expense: Expense, member: Expense['payments'][number]) {
    try {
      await markMemberExpensePaid(expense.id, member.memberId)
      await refreshDashboard()
      notify(`${member.name}: parte marcada como pagada`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo registrar el pago')
    }
  }

  async function undoMemberPaid(expense: Expense, member: Expense['payments'][number]) {
    if (!window.confirm(`¿Deshacer el pago de ${member.name} para «${expense.title}»?`)) return
    try {
      await revertMemberExpensePaid(expense.id, member.memberId)
      await refreshDashboard()
      notify(`${member.name}: parte marcada como no pagada`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo deshacer el pago')
    }
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(`¿Eliminar el gasto «${expense.title}»? Esta acción no se puede deshacer.`)) return
    try {
      await deleteExpense(expense.id)
      await refreshDashboard()
      notify('Gasto eliminado')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo eliminar el gasto')
    }
  }

  async function decidePayment(id: string, decision: 'confirmado' | 'rechazado') {
    try { await resolvePayment(id, decision); await refreshDashboard(); notify(decision === 'confirmado' ? 'Pago confirmado' : 'Pago rechazado') }
    catch (error) { notify(error instanceof Error ? error.message : 'No se pudo revisar el pago') }
  }

  async function editFloorDescription() {
    const description = window.prompt('Descripción, novedades o datos útiles del piso', floorDescription)
    if (description === null) return
    try { await updateFloorDescription(description); setFloorDescription(description.trim()); notify('Información del piso actualizada') }
    catch (error) { notify(error instanceof Error ? error.message : 'No se pudo guardar la información del piso') }
  }

  async function signOut() {
    setTopAccountMenuOpen(false)
    await import('@/lib/auth-client').then(({ authClient }) => authClient.signOut())
    window.location.assign('/acceso')
  }

  async function linkGoogleAccount() {
    setAccountMenuOpen(false)
    const callbackURL = new URL(window.location.href)
    callbackURL.searchParams.set('google_link', 'complete')
    const errorCallbackURL = new URL(window.location.href)
    errorCallbackURL.searchParams.set('google_link', 'error')
    try {
      const result = await authClient.linkSocial({
        provider: 'google',
        callbackURL: callbackURL.toString(),
        errorCallbackURL: errorCallbackURL.toString(),
      })
      if (result.error) notify(result.error.message || 'No se pudo iniciar la vinculación con Google')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo conectar con Google')
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSaving(true)
    try {
      await updateOwnProfileName(profileName)
      await refreshDashboard()
      notify('Perfil actualizado')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo actualizar el perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  async function uploadProfilePhoto(file: File | null) {
    if (!file) return
    setProfileSaving(true)
    try {
      const body = new FormData()
      body.set('file', file)
      const response = await fetch('/api/perfil/foto', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la foto')
      setProfileImage(result.image)
      notify('Foto de perfil actualizada')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar la foto')
    } finally {
      setProfileSaving(false)
    }
  }

  async function saveContract() {
    setContractSaving(true)
    try {
      if (contractFile) {
        const body = new FormData()
        body.set('file', contractFile)
        body.set('visibleTo', JSON.stringify(contractVisibleTo.filter((id) => id !== initialData.user.id)))
        const response = await fetch('/api/contrato', { method: 'POST', body })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el contrato')
        setContractFile(null)
      } else {
        await updateContractVisibility(contractVisibleTo.filter((id) => id !== initialData.user.id))
      }
      await refreshDashboard()
      notify(contractFile ? 'Contrato subido y permisos guardados' : 'Permisos del contrato actualizados')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar el contrato')
    } finally {
      setContractSaving(false)
    }
  }

  function openExpenseForm() {
    setEditingId(null)
    setInvoiceFile(null)
    setForm({ title: '', type: 'Luz', amount: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', rentMonth: '', note: '', isPrivate: false })
    setSplitMode('igual')
    setSplitValues(Object.fromEntries(members.map((member) => [member.userId, '1'])))
    setShowAdd(true)
  }

  function editExpense(expense: Expense) {
    setEditingId(expense.id)
    setInvoiceFile(null)
    setForm({ title: expense.title, type: expense.type, amount: String(expense.amount), date: expense.date, periodStart: expense.periodStart || '', periodEnd: expense.periodEnd || '', rentMonth: expense.rentMonth || '', note: expense.note || '', isPrivate: expense.isPrivate })
    setSplitMode(expense.splitMode)
    setSplitValues(Object.fromEntries(members.map((member) => [member.userId, String(expense.splitValues[member.userId] ?? (expense.splitMode !== 'importes' ? 1 : expense.payments.find((payment) => payment.memberId === member.userId)?.amount ?? 0))])))
    setShowAdd(true)
  }

  function defaultSplitValues(mode: 'igual' | 'partes' | 'importes', total: number) {
    if (mode !== 'importes') return Object.fromEntries(members.map((member) => [member.userId, '1']))
    const centsEach = members.length ? Math.floor(Math.max(0, total) * 100 / members.length) : 0
    let assigned = 0
    return Object.fromEntries(members.map((member, index) => {
      const cents = index === members.length - 1 ? Math.round(Math.max(0, total) * 100) - assigned : centsEach
      assigned += cents
      return [member.userId, (cents / 100).toFixed(2)]
    }))
  }

  function equalShare(index: number) {
    const totalCents = Math.round((Number(form.amount) || 0) * 100)
    const eachCents = Math.floor(totalCents / Math.max(1, members.length))
    const cents = index === members.length - 1 ? totalCents - eachCents * (members.length - 1) : eachCents
    return cents / 100
  }

  async function sendExpenseRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!requestTarget) return
    try {
      await submitExpenseRequest(requestTarget.id, requestReason, { amount: Number(proposedAmount) })
      setRequestTarget(null)
      setRequestReason('')
      setProposedAmount('')
      await refreshDashboard()
      notify('Solicitud enviada a la administración del piso')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo enviar la solicitud')
    }
  }

  async function inviteMember() {
    try {
      const { token } = await createFloorInvitation()
      const link = new URL(`/acceso?invitacion=${encodeURIComponent(token)}`, window.location.origin).toString()
      setInvitationUrl(link)
      try { await navigator.clipboard.writeText(link); notify('Enlace copiado · válido durante 7 días') } catch { notify('Enlace de invitación creado · válido durante 7 días') }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo crear la invitación')
    }
  }

  async function copyInvitation() {
    if (!invitationUrl) return
    try {
      await navigator.clipboard.writeText(invitationUrl)
      notify('Enlace copiado')
    } catch {
      notify('No se pudo copiar. Selecciona el enlace para copiarlo manualmente.')
    }
  }

  async function removeMember(memberId: string, name: string) {
    if (!window.confirm(`¿Eliminar a ${name} de ${initialData.floor.name}?`)) return
    try {
      await removeFloorMember(memberId)
      await refreshDashboard()
      notify(`${name} ya no forma parte del piso`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo eliminar a esta persona')
    }
  }

  async function readNotifications() {
    try {
      await markNotificationsRead()
      setNotifications((current) => current.map((item) => ({ ...item, read: true })))
      notify('Todas marcadas como leídas')
    } catch {
      notify('No se pudieron actualizar las notificaciones')
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#inicio" onClick={(e) => { e.preventDefault(); setPage('Resumen') }}><span className="brand-mark"><House size={19} strokeWidth={2.3} /></span><span>0 morosos<span className="brand-dot">.</span></span></a>
        <div className="workspace-label">TU ESPACIO</div>
        <button className="home-switcher" onClick={async () => { if (initialData.floor.role !== 'admin') return; const name = window.prompt('Nombre del piso', floorName); if (name === null) return; try { await updateFloorName(name); setFloorName(name.trim()); notify('Nombre del piso actualizado') } catch (error) { notify(error instanceof Error ? error.message : 'No se pudo cambiar el nombre') } }}><span className="home-emoji"><House size={16} /></span><span className="home-copy"><b>{floorName}</b><small>{members.length} compañeros · editar</small></span><ChevronDown size={15} /></button>
        <nav className="side-nav" aria-label="Navegación principal">
          <div className="nav-caption">GESTIÓN</div>
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setPage(label); setMobileNav(false) }} className={`nav-link ${page === label ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{((label === 'Solicitudes' && initialData.floor.role === 'admin' && (requests.length > 0 || paymentApprovals.length > 0)) || (label === 'Notificaciones' && notifications.some((item) => !item.read))) && <span className="nav-badge">{label === 'Solicitudes' ? requests.length + paymentApprovals.length : notifications.filter((item) => !item.read).length}</span>}</button>)}
          <div className="nav-caption nav-caption-lower">HERRAMIENTAS</div>
          <button className={`nav-link ${page === 'Contrato' ? 'active' : ''}`} onClick={() => { setPage('Contrato'); setMobileNav(false) }}><FileText size={18} strokeWidth={1.8} /><span>Contrato</span></button>
          <button className={`nav-link ${page === 'Perfil' ? 'active' : ''}`} onClick={() => { setPage('Perfil'); setMobileNav(false) }}><UserRound size={18} strokeWidth={1.8} /><span>Perfil</span></button>
          <button className={`nav-link ${page === 'Informes' ? 'active' : ''}`} onClick={() => { setPage('Informes'); setMobileNav(false) }}><ArrowDownToLine size={18} strokeWidth={1.8} /><span>Informes</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Sparkles size={16} /></div><b>Convivir, más fácil.</b><p>Un piso organizado es un piso feliz.</p><button onClick={() => notify('Centro de ayuda: hola@0morosos.es')}>Centro de ayuda <ArrowRight size={13} /></button></div>
          <div className="profile-menu-wrap"><div className="profile-row"><span className="avatar lilac">{profileImageUrl ? <img src={profileImageUrl} alt=""/> : profileName.slice(0, 2).toUpperCase()}</span><span className="profile-copy"><b>{profileName}</b><small>@{initialData.user.username || 'usuario'} · {initialData.floor.role === 'admin' ? 'Administrador/a' : 'Miembro'}</small></span><button className="profile-menu-trigger" aria-label="Abrir opciones de cuenta" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button></div>{accountMenuOpen && <div className="account-menu"><button onClick={() => void linkGoogleAccount()} disabled={googleLinked}>{googleLinked ? 'Google ya está vinculado' : 'Vincular cuenta de Google'}</button><button onClick={() => void signOut()}>Cerrar sesión</button></div>}</div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}

      <section className="main-area">
        <header className="topbar"><button className="mobile-menu" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu /></button><div className="breadcrumb"><span>{floorName}</span><span className="crumb-slash">/</span><b>{page}</b></div><div className="top-actions"><span className="period-label">{new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date())}</span><button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => setPage('Notificaciones')}><Bell size={19} />{notifications.some((item) => !item.read) && <i />}</button><div className="top-profile-menu-wrap"><button className="avatar top-avatar lilac top-avatar-button" aria-label="Abrir menú de cuenta" aria-expanded={topAccountMenuOpen} onClick={() => setTopAccountMenuOpen((open) => !open)}>{profileImageUrl ? <img src={profileImageUrl} alt=""/> : profileName.slice(0, 2).toUpperCase()}</button>{topAccountMenuOpen && <div className="top-account-menu"><button onClick={() => void signOut()}><LogOut size={15}/> Cerrar sesión</button></div>}</div></div></header>
        <div className="page-content">
          {page === 'Contrato' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> DOCUMENTACIÓN DEL PISO</div><h1>Contrato</h1><p className="page-subtitle">Consulta el contrato de alquiler y los permisos para compartirlo.</p></div></div>
            {!initialData.contractSchemaReady ? <section className="panel contract-empty"><span className="contract-document-icon"><FileText size={24}/></span><div><h2>Falta actualizar la base de datos</h2><p>Ejecuta <code>pnpm db:migrate</code> con la variable DATABASE_URL de Vercel para activar el apartado Contrato.</p></div></section> : null}
            {initialData.contractSchemaReady && initialData.floor.role === 'admin' && <section className="panel contract-manager">
              <div className="panel-heading"><div><h2>Personas con acceso</h2><p>Elige qué miembros pueden abrir el contrato. Tú, como administrador/a, siempre tendrás acceso.</p></div></div>
              <div className="contract-member-list">{members.map((member) => <label className="contract-member-option" key={member.userId}><input type="checkbox" checked={member.userId === initialData.user.id || contractVisibleTo.includes(member.userId)} disabled={member.userId === initialData.user.id} onChange={(event) => setContractVisibleTo((current) => event.target.checked ? [...new Set([...current, member.userId])] : current.filter((id) => id !== member.userId))}/><span><b>{member.name}</b><small>{member.userId === initialData.user.id ? 'Administración · acceso permanente' : member.email}</small></span></label>)}</div>
              <div className="contract-upload-row"><label className="contract-file-picker"><Upload size={16}/><span>{contractFile?.name || (contract ? 'Elegir un nuevo PDF para reemplazarlo' : 'Seleccionar contrato en PDF')}</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setContractFile(event.currentTarget.files?.[0] ?? null)}/></label><button className="primary-button" onClick={() => void saveContract()} disabled={contractSaving || (!contractFile && !contract)}>{contractSaving ? 'Guardando…' : contractFile ? 'Subir contrato y guardar permisos' : 'Guardar permisos'}</button></div>
              <p className="field-hint">PDF · máximo 4 MB. El archivo se guarda de forma privada.</p>
            </section>}
            {initialData.contractSchemaReady && (
              contract ? (
                <section className="panel contract-document">
                  <span className="contract-document-icon"><FileText size={24}/></span>
                  <div className="contract-document-copy">
                    <span className="summary-label">CONTRATO DEL PISO</span>
                    <h2>{contract.fileName}</h2>
                    <p>Actualizado el {new Date(contract.updatedAt).toLocaleDateString('es-ES')}</p>
                  </div>
                  <a className="outline-button" href="/api/contrato" target="_blank" rel="noreferrer">Abrir contrato <ArrowRight size={14}/></a>
                </section>
              ) : (
                <section className="panel contract-empty">
                  <span className="contract-document-icon"><FileText size={24}/></span>
                  <h2>{contractExists ? 'El contrato aún no está compartido contigo' : 'Todavía no hay un contrato disponible'}</h2>
                  <p>{initialData.floor.role === 'admin' ? 'Sube el PDF y selecciona qué miembros del piso podrán verlo.' : 'Pide a la administración del piso que comparta el contrato contigo.'}</p>
                </section>
              )
            )}
          </>}
          {page === 'Perfil' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> TU CUENTA</div><h1>Perfil</h1><p className="page-subtitle">Tu nombre y foto para que tus compañeros te reconozcan.</p></div></div>
            <section className="panel profile-editor">
              <div className="profile-photo-column"><div className="profile-avatar-large">{profileImageUrl ? <img src={profileImageUrl} alt={`Foto de ${profileName}`}/> : profileName.slice(0, 2).toUpperCase()}</div><label className="outline-button profile-photo-button"><Camera size={15}/> Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={profileSaving} onChange={(event) => { void uploadProfilePhoto(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = '' }}/></label><small>JPG, PNG o WebP · máximo 5 MB</small></div>
              <form className="profile-name-form" onSubmit={saveProfile}><div><h2>Tu información</h2><p>Este nombre aparece en la actividad y en la lista del piso.</p></div><label>Nombre<input value={profileName} onChange={(event) => setProfileName(event.target.value)} required maxLength={60} autoComplete="name"/></label><button className="primary-button" type="submit" disabled={profileSaving}><Check size={16}/>{profileSaving ? 'Guardando…' : 'Guardar nombre'}</button></form>
            </section>
          </>}
          {page === 'Resumen' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> TU PISO, AL DÍA</div><h1>¡Hola, {profileName.split(' ')[0]}! <Sparkles className="wave" size={20} aria-hidden="true" /></h1><p className="page-subtitle">Así van las cuentas de <b>{floorName}</b> en {monthName}.</p></div></div>
            <section className="dashboard-upload-card"><div className="upload-card-mark"><Upload size={20}/></div><div className="upload-card-copy"><span className="summary-label">GASTO NUEVO</span><h2>¿Ha llegado una factura?</h2><p>Regístrala con su importe y periodo. El piso verá el desglose al momento.</p></div><button className="upload-card-action" onClick={openExpenseForm}><Plus size={16}/> Añadir factura</button><span className="upload-card-decoration" aria-hidden="true">€</span></section>
            <section className="panel floor-info-card"><div><span className="summary-label">INFORMACIÓN DEL PISO</span><p>{floorDescription || (initialData.floor.role === 'admin' ? 'Añade una descripción, novedades o datos útiles como la contraseña del wifi.' : 'La administración aún no ha añadido información.')}</p></div>{initialData.floor.role === 'admin' && <button className="outline-button" onClick={() => void editFloorDescription()}>{floorDescription ? 'Editar información' : 'Añadir información'}</button>}</section>
            <div className="summary-period"><label>Mes del resumen<select aria-label="Mes del resumen" value={selectedMonth.slice(5, 7)} onChange={(event) => setSelectedMonth(`${selectedMonth.slice(0, 4)}-${event.target.value}`)}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, index, 1))}</option>)}</select></label><label>Año<select aria-label="Año del resumen" value={selectedMonth.slice(0, 4)} onChange={(event) => setSelectedMonth(`${event.target.value}-${selectedMonth.slice(5, 7)}`)}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label></div>
            <section className="summary-grid" aria-label="Resumen de gastos">
              <article className="summary-card total-card"><div className="summary-top"><span className="summary-label">GASTOS DE {monthName.toUpperCase()}</span><span className="card-icon dark-icon"><Wallet size={17} /></span></div><div className="summary-value">{euro(total)}</div><div className="summary-foot"><span className="trend-pill"><ArrowDownUp size={12} /> Resumen mensual</span><span>{monthlyExpenses.length} {monthlyExpenses.length === 1 ? 'gasto registrado' : 'gastos registrados'}</span></div><div className="card-orb" /></article>
              <article className="summary-card"><div className="summary-top"><span className="summary-label">TU PARTE DEL MES</span><span className="card-icon green-icon"><Users size={17} /></span></div><div className="summary-value">{euro(personalMonthlyTotal)}</div><div className="summary-foot"><span className="quiet-text">Repartido entre {members.length}</span><span className="mini-avatars">{members.slice(0, 4).map((member, index) => <i key={member.id} className={`avatar ${colors[index % colors.length]}`}>{member.name.slice(0, 1).toUpperCase()}</i>)}</span></div></article>
              <article className="summary-card"><div className="summary-top"><span className="summary-label">GASTOS REGISTRADOS</span><span className="card-icon orange-icon"><FileText size={17} /></span></div><div className="summary-value">{monthlyExpenses.length.toString().padStart(2, '0')}<small>   este mes</small></div><div className="summary-foot"><span className="quiet-text">{latestExpenseDate ? `Último · ${displayDate(latestExpenseDate)}` : 'Todavía no hay gastos'}</span><span className="mini-avatars">{members.slice(0, 4).map((member, index) => <i key={member.id} className={`avatar ${colors[index % colors.length]}`}>{member.name.slice(0, 1).toUpperCase()}</i>)}</span></div></article>
            </section>
            <section className="panel payment-status-banner" aria-label="Estado de pagos del piso"><div className="payment-status-copy"><span className="payment-status-icon"><CircleCheck size={18}/></span><div><span className="summary-label">PAGOS DEL PISO · {monthName.toUpperCase()}</span><h2>{paymentParts.length === 0 ? 'Aún no hay pagos registrados' : pendingParts === 0 ? 'Todo el piso está al día' : `${pendingParts} ${pendingParts === 1 ? 'pago pendiente' : 'pagos pendientes'}`}</h2><p>{paymentParts.length ? `${paidParts} de ${paymentParts.length} partes pagadas · ${paymentProgress}% completado` : 'Añade un gasto y cada miembro verá cuánto le corresponde.'}</p></div></div><div className="payment-status-action"><div className="payment-progress" role="progressbar" aria-label="Partes pagadas" aria-valuenow={paymentProgress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${paymentProgress}%` }}/></div><button className="outline-button" onClick={() => setPage('Gastos')}>Revisar gastos <ArrowRight size={14}/></button></div></section>
            <section className="dashboard-grid">
              <article className="panel spending-panel"><div className="panel-heading"><div><h2>Cómo se reparte</h2><p>Desglose por categoría</p></div><select className="select-button" aria-label="Mes de Cómo se reparte" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{yearOptions.flatMap((year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(12 - index).padStart(2, '0')}`)).map((month) => <option key={month} value={month}>{new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))}</option>)}</select></div><div className="spending-content"><div className="donut-wrap"><div className="donut" style={{ background: donutGradient }}><div className="donut-center"><b>{euro(total)}</b><span>en total</span></div></div></div><div className="category-legend">{categoryTotals.filter((category) => category.amount > 0).map((category) => <div key={category.type}><i className="legend-dot" style={{ backgroundColor: categoryColor(category.type) }}/><span>{category.type}</span><b>{euro(category.amount)}</b></div>)}</div></div><div className="panel-divider"/><div className="month-trend"><div className="trend-title"><span>Gasto mensual · piso y privados</span><span className="trend-legend"><i /> Piso <i className="legend-private" /> Privado</span></div><div className="bar-chart" aria-label="Gráfico de gastos mensuales"><div className="chart-guides">{chartTicks.map((tick, index) => <i key={index}>{formatChartAmount(tick)}</i>)}</div>{monthlySeries.map((amount, index) => { const privateAmount = monthlyPrivateSeries[index]; const combined = amount + privateAmount; const floorShare = combined > 0 ? amount / combined * 100 : 0; const isSelected = index === Number(selectedMonth.slice(5, 7)) - 1; const background = privateAmount > 0 ? 'linear-gradient(to top, ' + (isSelected ? '#49654e' : '#dfe7de') + ' ' + floorShare + '%, #d4bfa9 ' + floorShare + '%)' : isSelected ? '#49654e' : '#dfe7de'; return <div className={'chart-bar' + (isSelected ? ' chart-bar-current' : '')} key={index}><span style={{ height: (chartMaximum > 0 ? combined / chartMaximum * 100 : 0) + '%', background }} /><small>{monthLabels[index]}</small></div> })}</div></div></article>
              <article className="panel activity-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Lo último que ha pasado en el piso</p></div><button className="text-link" onClick={() => setPage('Gastos')}>Ver todo <ArrowRight size={14} /></button></div><div className="activity-list">{expenses.length === 0 ? <div className="activity-empty"><span className="empty-check"><Plus size={17}/></span><b>Sube la primera factura</b><span>Todos podrán consultar el importe y su parte desde aquí.</span><button className="text-link" onClick={openExpenseForm}>Añadir gasto <ArrowRight size={14}/></button></div> : expenses.slice(0, 4).map((expense) => <div className="activity-item" key={expense.id}><span className={`category-icon ${expense.type.toLowerCase()}`}><CategoryIcon type={expense.type} /></span><div className="activity-copy"><b>{expense.title}{expense.isPrivate && <small className="private-expense-badge">Privado</small>}</b><span>{expense.person} · {displayDate(expense.date)}</span></div><strong>{euro(expense.amount)}</strong></div>)}</div><button className="activity-footer" onClick={() => setPage('Gastos')}>Ver todos los gastos <ArrowRight size={14} /></button></article>
            </section>
            <section className="bottom-grid"><article className="panel month-card"><div className="panel-heading"><div><h2>El mes de un vistazo</h2><p>Un pequeño resumen para el piso</p></div><span className="month-illustration"><House size={20} /></span></div><div className="month-stats"><div><span>Mayor gasto</span><b>{largestCategory?.type || 'Sin gastos'} <i>· {total ? Math.round((largestCategory?.amount || 0) / total * 100) : 0}%</i></b></div><div><span>Gasto medio diario</span><b>{euro(total / Math.max(1, new Date().getDate()))}</b></div><div><span>Días hasta fin de mes</span><b>{daysLeft} días <i className="good-text">· hasta fin de mes</i></b></div></div></article><article className="tip-card"><div className="tip-orb"><Zap size={18} /></div><div><span className="tip-label">UN CONSEJO PARA EL PISO</span><h3>Las cuentas claras, la convivencia larga.</h3><p>Sube las facturas cuando lleguen y nadie tendrá que perseguir a nadie.</p></div><span className="tip-decoration" aria-hidden="true">•</span></article></section>
          </>}
          {page === 'Gastos' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> CUENTAS DEL PISO</div><h1>Todos los gastos</h1><p className="page-subtitle">Un registro claro, sin sorpresas a final de mes.</p></div><button className="primary-button" onClick={openExpenseForm}><Plus size={17} /> Añadir gasto</button></div><section className="panel expenses-panel"><div className="expenses-toolbar"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar un gasto..." /></label><label className="filter-select" title="Filtrar por categoría"><Filter size={16} /><select aria-label="Filtrar por categoría" value={filter} onChange={(e) => setFilter(e.target.value)}><option>Todos</option>{['Alquiler','Luz','Agua','Basura','Comunidad','Internet','Otros'].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label><label className="expense-month-select"><span className="visually-hidden">Mes</span><select aria-label="Mes" value={selectedMonth.slice(5, 7)} onChange={(event) => setSelectedMonth(`${selectedMonth.slice(0, 4)}-${event.target.value}`)}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, index, 1))}</option>)}</select></label><label className="expense-year-select"><span className="visually-hidden">Año</span><select aria-label="Año" value={selectedMonth.slice(0, 4)} onChange={(event) => setSelectedMonth(`${event.target.value}-${selectedMonth.slice(5, 7)}`)}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label><button className="icon-button expense-share-button" aria-label="Compartir gastos por WhatsApp" title="Compartir por WhatsApp" onClick={shareWhatsApp}><Share2 size={17}/></button></div><div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>CONCEPTO</th><th>CATEGORÍA</th><th>FECHA</th><th>REGISTRADO POR</th><th className="amount-column">IMPORTE</th><th /></tr></thead><tbody>{filtered.map((expense) => <tr key={expense.id} className={`${expense.pendingApproval ? "expense-pending-row" : ""} ${expandedExpenseId === expense.id ? "mobile-expanded" : ""}`}><td data-label="Gasto"><button className="expense-mobile-summary" aria-expanded={expandedExpenseId === expense.id} aria-label={`${expandedExpenseId === expense.id ? "Contraer" : "Ampliar"} ${expense.title}`} onClick={() => setExpandedExpenseId(expandedExpenseId === expense.id ? null : expense.id)}><span className={`category-icon ${expense.type.toLowerCase()}`}><CategoryIcon type={expense.type} /></span><b>{expense.title}{expense.isPrivate && <small className="private-expense-badge">Privado</small>}</b><strong>{euro(expense.amount)}</strong><ChevronDown className={`mobile-payment-icon expense-expand-icon ${expandedExpenseId === expense.id ? 'expanded' : ''}`} size={18} /></button><div className="expense-title"><span className={`category-icon ${expense.type.toLowerCase()}`}><CategoryIcon type={expense.type} /></span><b>{expense.title}</b>{expense.isPrivate && <small className="private-expense-badge">Privado</small>}{expense.pendingApproval && <small className="pending-expense-tag">Pendiente de aprobación</small>}<div className="expense-payment-list">{expense.payments.map((payment) => <span key={payment.memberId} className={`payment-member ${payment.status}`}>{payment.name}: {payment.amount <= 0 ? 'no participa' : <>{expense.splitMode === 'partes' && `${payment.parts} partes · `}{euro(payment.amount)} · {payment.status === 'confirmado' ? 'pagado' : payment.status === 'pendiente' ? 'pendiente de confirmar' : payment.status === 'rechazado' ? 'no confirmado' : 'sin pagar'}</>}{initialData.floor.role === 'admin' && !expense.isPrivate && payment.amount > 0 && (payment.status === 'confirmado' ? <button className="admin-payment-button undo-payment-button" onClick={() => void undoMemberPaid(expense, payment)}><Undo2 size={12}/> Deshacer pago</button> : <button className="admin-payment-button" onClick={() => void markMemberPaid(expense, payment)}>{payment.status === 'pendiente' ? 'Confirmar pago' : 'Marcar pagado'}</button>)}</span>)}</div></div><div className="expense-mobile-payments">{expense.pendingApproval && <span className="payment-state">Pendiente de aprobación</span>}{expense.payments.map((payment) => <div key={payment.memberId} className={`payment-member ${payment.status}`}><b>{payment.name}</b><span className="member-share-amount">{payment.amount <= 0 ? 'Sin parte asignada' : <>{expense.splitMode === 'partes' && `${payment.parts} partes · `}{euro(payment.amount)}</>}</span><span className={`member-payment-status ${payment.status}`}>{payment.amount <= 0 ? 'No participa' : payment.status === 'confirmado' ? 'Pagado' : payment.status === 'pendiente' ? 'Pendiente de confirmar' : payment.status === 'rechazado' ? 'No confirmado' : 'Sin pagar'}</span>{initialData.floor.role === 'admin' && !expense.isPrivate && payment.amount > 0 && (payment.status === 'confirmado' ? <button className="admin-payment-button undo-payment-button" onClick={() => void undoMemberPaid(expense, payment)}><Undo2 size={12}/> Deshacer pago</button> : <button className="admin-payment-button" onClick={() => void markMemberPaid(expense, payment)}>{payment.status === 'pendiente' ? 'Confirmar pago' : 'Marcar pagado'}</button>)}</div>)}</div></td><td data-label="Categoría"><span className="type-pill">{expense.type}</span></td><td className="muted-cell" data-label="Fecha">{displayDate(expense.date)}</td><td data-label="Registrado por"><span className="person-cell"><i className={`avatar ${expense.color}`}>{expense.initials}</i>{expense.person}</span></td><td className="amount-column amount-cell" data-label="Importe">{euro(expense.amount)}</td><td data-label="Acciones">{expense.invoicePath && <a className="row-more" href={`/api/factura?path=${encodeURIComponent(expense.invoicePath)}`} target="_blank" rel="noreferrer" aria-label={`Ver factura de ${expense.title}`}><FileText size={16}/></a>}{expense.pendingApproval ? <span className="payment-state">Pago disponible tras aprobación</span> : expense.personalShare <= 0 ? <span className="payment-state">No tienes parte asignada</span> : expense.paymentStatus === 'pendiente' ? <span className="payment-state">Pago pendiente de confirmar</span> : expense.paymentStatus === 'confirmado' ? <span className="payment-state payment-confirmed">Tu parte está pagada</span> : initialData.floor.role !== 'admin' ? <button className="paid-button" onClick={() => void markPaid(expense)}>{expense.paymentStatus === 'rechazado' ? 'Volver a marcar pagado' : `Marcar mi parte pagada · ${euro(expense.personalShare)}`}</button> : null}{initialData.floor.role === 'admin' ? <><button className="row-more" aria-label={`Editar ${expense.title}`} title="Editar gasto" onClick={() => editExpense(expense)}><Pencil size={16} /></button><button className="row-more" aria-label={`Eliminar ${expense.title}`} title="Eliminar gasto" onClick={() => void removeExpense(expense)}><Trash2 size={16}/></button></> : <button className="row-more" aria-label={`Solicitar cambio de ${expense.title}`} onClick={() => { setRequestTarget(expense); setProposedAmount(expense.amount.toFixed(2)) }}><ArrowDownUp size={16}/></button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><b>No encontramos gastos</b><span>Prueba con otro término o categoría.</span></div>}</div><div className="table-footer"><span>Mostrando {filtered.length} de {expenses.filter((expense) => expense.date.slice(0, 7) === selectedMonth).length} gastos del mes</span><span>Total del piso <b>{euro(filtered.filter((expense) => !expense.pendingApproval && !expense.isPrivate).reduce((sum, expense) => sum + expense.amount, 0))}</b>{filtered.some((expense) => expense.isPrivate) && <> · Privados <b>{euro(filtered.filter((expense) => expense.isPrivate).reduce((sum, expense) => sum + expense.amount, 0))}</b></>}</span></div></section></>}
          {page === 'Compañeros' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> VIDA EN COMÚN</div><h1>Tu equipo del piso</h1><p className="page-subtitle">Personas con acceso a las cuentas de {initialData.floor.name}.</p></div>{initialData.floor.role === 'admin' && <button className="primary-button" onClick={inviteMember}><Plus size={17} /> Invitar compañero</button>}</div>
            {invitationUrl && <section className="panel invitation-share"><div><b>Enlace de invitación listo</b><p>Caduca en 7 días y solo se puede usar una vez.</p></div><div className="invitation-controls"><input aria-label="Enlace de invitación" readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} /><button className="outline-button" onClick={copyInvitation}><Copy size={15} /> Copiar</button></div></section>}
            <section className="members-grid" aria-label="Miembros del piso">{members.map((member, index) => <article className="panel member-card" key={member.id}><div className="member-card-top"><span className={`avatar member-avatar ${colors[index % colors.length]}`}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span className={`role-pill ${member.role === 'admin' ? 'admin-role' : ''}`}>{member.role === 'admin' ? 'Administrador/a' : 'Miembro'}</span></div><h2>{member.name}</h2><p>{member.username ? `@${member.username}` : 'Usuario del piso'}</p><div className="member-spent"><span>Gastos registrados</span><b>{expenses.filter((expense) => expense.createdBy === member.userId).length}</b></div>{initialData.floor.role === 'admin' && member.userId !== initialData.user.id && member.role !== 'admin' && <button className="remove-member-button" onClick={() => removeMember(member.id, member.name)} aria-label={`Eliminar a ${member.name}`}><Trash2 size={14} /> Eliminar del piso</button>}</article>)}</section>
          </>}
          {page === 'Solicitudes' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> REVISIÓN DE ADMINISTRACIÓN</div><h1>Bandeja de solicitudes</h1><p className="page-subtitle">Revisa las propuestas de tus compañeros.</p></div><span className="pending-count">{requests.length + paymentApprovals.length} pendientes</span></div><section className="requests-list">{requests.length ? requests.map((request) => <article className="panel request-card" key={request.id}><span className={`avatar request-avatar ${request.color}`}>{request.initials}</span><div className="request-content"><div className="request-title-line"><h2>{request.title}</h2><span>{request.time}</span></div><p>{request.detail}</p><small>Enviada por <b>{request.name}</b></small></div>{initialData.floor.role === 'admin' && <div className="request-actions"><button className="reject-button" onClick={() => resolveRequest(request.id, 'rechazada')}>Rechazar</button><button className="approve-button" onClick={() => resolveRequest(request.id, 'aprobada')}><Check size={15}/> Aprobar</button></div>}</article>) : <div className="panel requests-empty"><span className="empty-check"><Check size={22}/></span><h2>Todo al día</h2><p>No hay solicitudes pendientes por revisar.</p></div>}</section></>}
          {page === 'Solicitudes' && <section className="payments-section"><div className="panel-heading"><div><h2>Pagos por confirmar</h2><p>Los miembros indican que han pagado su parte y tú lo confirmas.</p></div><span className="pending-count">{paymentApprovals.length} pendientes</span></div>{paymentApprovals.length ? <div className="requests-list">{paymentApprovals.map((payment) => <article className="panel request-card" key={payment.id}><span className="avatar request-avatar peach"><Wallet size={17}/></span><div className="request-content"><div className="request-title-line"><h2>{payment.expenseTitle}</h2><span>{new Date(payment.createdAt).toLocaleDateString('es-ES')}</span></div><p>{payment.memberName} indica que ha pagado <b>{euro(payment.amount)}</b>.</p></div>{initialData.floor.role === 'admin' && <div className="request-actions"><button className="reject-button" onClick={() => void decidePayment(payment.id, 'rechazado')}>Rechazar</button><button className="approve-button" onClick={() => void decidePayment(payment.id, 'confirmado')}><Check size={15}/> Confirmar pago</button></div>}</article>)}</div> : <div className="panel requests-empty"><span className="empty-check"><Check size={22}/></span><h2>Sin pagos pendientes</h2><p>Los pagos que indiquen tus compañeros aparecerán aquí.</p></div>}</section>}          {page === 'Notificaciones' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot"/> SIEMPRE AL TANTO</div><h1>Notificaciones</h1><p className="page-subtitle">Lo importante del piso, en un mismo sitio.</p></div><button className="text-link" onClick={readNotifications}>Marcar todo como leído</button></div><section className="panel notification-list">{notifications.length ? notifications.map((item) => <div className={`notification-row ${!item.read ? 'unread' : ''}`} key={item.id}><span className="category-icon request"><Bell size={17}/></span><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString('es-ES')}</small></div>{!item.read && <i className="unread-dot"/>}</div>) : <div className="empty-state"><Bell size={22}/><b>No tienes notificaciones</b><span>Te avisaremos cuando haya novedades en el piso.</span></div>}</section></>}
          {page === 'Informes' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot"/> INFORMES DEL PISO</div><h1>Las cuentas, en limpio</h1><p className="page-subtitle">Descarga o comparte el resumen de gastos de {floorName}.</p></div></div><div className="summary-period report-period"><label>Año del histórico<select value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))}>{yearOptions.map((year) => <option key={year}>{year}</option>)}</select></label><button className="outline-button" onClick={exportYearCsv}><ArrowDownToLine size={15}/> Descargar histórico {reportYear}</button></div><section className="report-grid"><article className="panel report-card"><span className="report-icon csv"><FileText size={21}/></span><span className="report-kicker">FORMATO DE TABLA</span><h2>Exportar a CSV</h2><p>Abre los gastos del periodo en una hoja de cálculo para revisarlos o archivarlos.</p><button className="outline-button" onClick={exportCsv}><ArrowDownToLine size={15}/> Descargar CSV</button></article><article className="panel report-card"><span className="report-icon whatsapp"><ArrowRight size={21}/></span><span className="report-kicker">PARA EL GRUPO</span><h2>Compartir resumen</h2><p>Prepara un mensaje ordenado con los gastos y el total del mes para WhatsApp.</p><button className="outline-button" onClick={shareWhatsApp}>Compartir por WhatsApp <ArrowRight size={15}/></button></article><article className="panel report-card"><span className="report-icon pdf"><FileText size={21}/></span><span className="report-kicker">INFORME DETALLADO</span><h2>Informe PDF</h2><p>Abre un informe imprimible con los gastos filtrados y el total del periodo.</p><button className="outline-button" onClick={exportPdf}><FileText size={15}/> Preparar informe</button></article></section></>}
        </div>
      </section>
      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if(e.target === e.currentTarget) setShowAdd(false) }}><section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="modal-kicker">{floorName.toUpperCase()} · {editingId ? 'EDITAR GASTO' : 'NUEVO GASTO'}</span><h2 id="modal-title">{editingId ? 'Edita el gasto' : 'Apúntalo y listo'}</h2><p>El piso entero podrá verlo al momento.</p></div><button className="icon-button" aria-label="Cerrar" onClick={() => setShowAdd(false)}><X size={18}/></button></div><form onSubmit={addExpense}><label>Concepto<input required maxLength={80} placeholder="Ej. Factura de la luz" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})}/></label><label className="private-expense-toggle"><input type="checkbox" checked={form.isPrivate} disabled={Boolean(editingId)} onChange={(event) => setForm({ ...form, isPrivate: event.target.checked })}/><span><b>Gasto privado</b><small>{editingId ? 'La privacidad se elige al crear el gasto.' : 'Solo tú podrás verlo; no se sumará a los gastos del piso.'}</small></span></label><div className="form-two"><label>Tipo<select value={form.type} onChange={(e) => setForm({...form,type:e.target.value})}>{['Alquiler','Luz','Agua','Basura','Comunidad','Internet','Otros'].map((type)=><option key={type}>{type}</option>)}</select></label><label>Importe (€)<input type="number" required min="0.01" step="0.01" placeholder="0,00" value={form.amount} onChange={(e) => { setForm({...form,amount:e.target.value}); if (splitMode === 'importes') setSplitValues(defaultSplitValues('importes', Number(e.target.value) || 0)) }}/></label></div>{!form.isPrivate && <section className="split-editor"><label>Forma de reparto<select value={splitMode} onChange={(event) => { const mode = event.target.value as 'igual' | 'partes' | 'importes'; setSplitMode(mode); setSplitValues(defaultSplitValues(mode, Number(form.amount) || 0)) }}><option value="igual">Igualmente</option><option value="partes">Por partes</option><option value="importes">Por importes</option></select></label><div className="split-members">{splitMode === 'igual' ? members.map((member, index) => <div className="split-preview" key={member.userId}><span>{member.name}</span><b>{euro(equalShare(index))}</b></div>) : members.map((member) => <label key={member.userId}>{member.name} · {splitMode === 'partes' ? 'Partes' : 'Importe (€)'}<input type="number" min="0" step={splitMode === 'partes' ? '1' : '0.01'} value={splitValues[member.userId] ?? (splitMode === 'partes' ? '1' : '0.00')} onChange={(event) => setSplitValues((current) => ({ ...current, [member.userId]: event.target.value }))}/></label>)}</div>{splitMode === 'importes' && <small className={Math.abs(members.reduce((sum, member) => sum + Number(splitValues[member.userId] || 0), 0) - (Number(form.amount) || 0)) > 0.009 ? 'split-invalid' : undefined}>Total repartido: {euro(members.reduce((sum, member) => sum + Number(splitValues[member.userId] || 0), 0))} de {euro(Number(form.amount) || 0)}</small>}</section>}{['Luz','Agua'].includes(form.type)&&<div className="form-two"><label>Inicio del periodo<input type="date" required value={form.periodStart} onChange={(e) => setForm({...form,periodStart:e.target.value})}/></label><label>Fin del periodo<input type="date" required value={form.periodEnd} onChange={(e) => setForm({...form,periodEnd:e.target.value})}/></label></div>}<div className="form-two"><label>Fecha del gasto<div className="form-two"><select aria-label="Mes del gasto" value={form.date.slice(5,7)} onChange={(e) => setForm({...form,date:`${form.date.slice(0,4)}-${e.target.value}-01`})}>{Array.from({length:12},(_,i)=><option key={i} value={String(i+1).padStart(2,'0')}>{new Intl.DateTimeFormat('es-ES',{month:'long'}).format(new Date(2026,i,1))}</option>)}</select><select aria-label="Año del gasto" value={form.date.slice(0,4)} onChange={(e) => setForm({...form,date:`${e.target.value}-${form.date.slice(5,7)}-01`})}>{yearOptions.map((year)=><option key={year}>{year}</option>)}</select></div></label><label>Factura (opcional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0] ?? null; setInvoiceFile(file); if (file) notify(file.size <= 5 * 1024 * 1024 ? `Factura lista: ${file.name}` : 'El archivo supera el límite de 5 MB') }}/><span className="field-hint">JPG, PNG, WebP o PDF · máximo 5 MB{invoiceFile ? ` · ${invoiceFile.name}` : ''}</span></label></div><label>Nota <span className="optional-label">OPCIONAL</span><textarea rows={2} maxLength={240} placeholder="Añade un detalle si hace falta..." value={form.note} onChange={(e) => setForm({...form,note:e.target.value})}/></label><div className="modal-foot"><span><CircleHelp size={14}/> {form.isPrivate ? 'Este gasto solo aparecerá en tu perfil y no se repartirá.' : 'Los gastos de miembros quedan pendientes de aprobación'}</span><button className="primary-button" type="submit" disabled={saving}><Plus size={16}/> {saving ? 'Guardando…' : 'Guardar gasto'}</button></div></form></section></div>}
      {requestTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestTarget(null) }}><section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div className="modal-head"><div><span className="modal-kicker">SOLICITUD PARA {initialData.floor.name.toUpperCase()}</span><h2 id="request-title">Proponer un cambio</h2><p>{requestTarget.title} · importe actual {euro(requestTarget.amount)}</p></div><button className="icon-button" aria-label="Cerrar solicitud" onClick={() => setRequestTarget(null)}><X size={18}/></button></div><form onSubmit={sendExpenseRequest}><label>Nuevo importe (€)<input type="number" required min="0.01" step="0.01" value={proposedAmount} onChange={(event) => setProposedAmount(event.target.value)}/></label><label>Motivo<textarea required rows={3} maxLength={300} value={requestReason} onChange={(event) => setRequestReason(event.target.value)} placeholder="Explica por qué propones este cambio"/></label><div className="modal-foot"><span>La administración del piso revisará tu propuesta.</span><button className="primary-button" type="submit"><ArrowRight size={16}/> Enviar solicitud</button></div></form></section></div>}
      {notice && <div className="toast-message" role="status"><Check size={16}/>{notice}</div>}
    </main>
  )
}

function CategoryIcon({type}:{type:string}) { if(type==='Luz') return <Zap size={17}/>; if(type==='Alquiler') return <House size={17}/>; if(type==='Agua') return <Droplets size={17}/>; if(type==='Basura') return <Trash2 size={17}/>; if(type==='Internet') return <Wifi size={17}/>; return <CreditCard size={17}/> }
