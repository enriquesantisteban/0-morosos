'use client'

import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowDownUp, ArrowRight, Bell, Check, ChevronDown, CircleHelp, Copy, CreditCard, FileText, Filter, House, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Sparkles, Trash2, Users, Wallet, X, Zap } from 'lucide-react'
import { createExpense, createFloorInvitation, deleteExpense, getDashboardData, getExpenseDetails, markNotificationsRead, removeFloorMember, resolveExpenseRequest, submitExpenseRequest, updateExpense } from '@/app/actions/dashboard'
import type { getDashboardData as getDashboardDataType } from '@/app/actions/dashboard'

type DashboardPayload = Awaited<ReturnType<typeof getDashboardDataType>>
type ExpenseDetails = Awaited<ReturnType<typeof getExpenseDetails>>
type Expense = { id: string; title: string; type: string; date: string; person: string; amount: number; initials: string; color: string; createdBy: string; periodStart: string | null; periodEnd: string | null; rentMonth: string | null; note: string | null; invoicePath: string | null; invoiceName: string | null }
const colors = ['lilac', 'peach', 'mint', 'blue']
const navItems = [
  { label: 'Resumen', icon: LayoutDashboard }, { label: 'Gastos', icon: Wallet }, { label: 'Compañeros', icon: Users },
  { label: 'Solicitudes', icon: ArrowDownUp }, { label: 'Notificaciones', icon: Bell },
]
const euro = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const displayDate = (value: string | Date) => new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const mapExpenses = (rows: DashboardPayload['expenses']): Expense[] => rows.map((row, index) => ({ ...row, date: String(row.date).slice(0, 10), initials: row.person.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length] }))

export default function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const [page, setPage] = useState('Resumen')
  const [expenses, setExpenses] = useState<Expense[]>(mapExpenses(initialData.expenses))
  const [members, setMembers] = useState(initialData.members)
  const [notifications, setNotifications] = useState(initialData.notifications)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [requestTarget, setRequestTarget] = useState<Expense | null>(null)
  const [expenseDetails, setExpenseDetails] = useState<ExpenseDetails | null>(null)
  const [invitationUrl, setInvitationUrl] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [proposedAmount, setProposedAmount] = useState('')
  const [form, setForm] = useState({ title: '', type: 'Luz', amount: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', rentMonth: '', note: '' })
  const [requests, setRequests] = useState(initialData.requests.map((request, index) => ({ ...request, title: request.expenseTitle || 'Gasto eliminado', detail: request.reason, name: request.sender, initials: request.sender.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], time: new Date(request.createdAt).toLocaleDateString('es-ES') })))
  const filtered = useMemo(() => expenses.filter((item) => (filter === 'Todos' || item.type === filter) && (!dateFrom || item.date >= dateFrom) && (!dateTo || item.date <= dateTo) && `${item.title} ${item.person} ${item.type}`.toLowerCase().includes(search.toLowerCase())), [expenses, filter, dateFrom, dateTo, search])
  const monthKey = new Date().toISOString().slice(0, 7)
  const monthlyExpenses = expenses.filter((expense) => expense.date.slice(0, 7) === monthKey)
  const total = monthlyExpenses.reduce((sum, item) => sum + item.amount, 0)
  const monthLabels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthlySeries = monthLabels.map((_, index) => expenses.filter((expense) => expense.date.slice(0, 7) === `${new Date().getFullYear()}-${String(index + 1).padStart(2, '0')}`).reduce((sum, expense) => sum + expense.amount, 0))
  const maxMonthly = Math.max(1, ...monthlySeries)
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()
  const categoryTotals = ['Alquiler', 'Luz', 'Agua', 'Basura', 'Comunidad', 'Internet', 'Otros'].map((type) => ({ type, amount: monthlyExpenses.filter((expense) => expense.type === type).reduce((sum, expense) => sum + expense.amount, 0) }))
  const largestCategory = [...categoryTotals].sort((a, b) => b.amount - a.amount)[0]
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }

  function exportCsv() {
    const rows = [['Concepto', 'Tipo', 'Fecha', 'Registrado por', 'Importe'], ...filtered.map((e) => [e.title, e.type, displayDate(e.date), e.person, e.amount.toFixed(2)])]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); link.download = 'gastos-piso-noviembre.csv'; link.click(); URL.revokeObjectURL(link.href)
    notify('Tu informe CSV se ha descargado')
  }

  function exportPdf() {
    window.print()
  }

  async function refreshDashboard() {
    const fresh = await getDashboardData()
    setExpenses(mapExpenses(fresh.expenses))
    setMembers(fresh.members)
    setNotifications(fresh.notifications)
    setRequests(fresh.requests.map((request, index) => ({ ...request, title: request.expenseTitle || 'Gasto eliminado', detail: request.reason, name: request.sender, initials: request.sender.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), color: colors[index % colors.length], time: new Date(request.createdAt).toLocaleDateString('es-ES') })))
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
      const input = { title: form.title, type: form.type, amount: Number(form.amount), date: form.date, note: form.note, periodStart: form.periodStart || undefined, periodEnd: form.periodEnd || undefined, rentMonth: form.rentMonth || undefined, invoicePath: invoice?.pathname, invoiceName: invoice?.name }
      if (editingId) await updateExpense(editingId, input)
      else await createExpense(input)
      setInvoiceFile(null)
      setEditingId(null)
      await refreshDashboard()
      setForm({ title: '', type: 'Luz', amount: '', date: new Date().toISOString().slice(0, 10), periodStart: '', periodEnd: '', rentMonth: '', note: '' })
      setShowAdd(false)
      notify('Gasto guardado en el piso')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar el gasto')
    } finally {
      setSaving(false)
    }
  }

  function shareWhatsApp() {
    const message = [
      `Gastos del ${new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date())} · Piso ${initialData.floor.name}`,
      '',
      ...filtered.map((expense) => `${expense.title}: ${euro(expense.amount)} (${expense.person})`),
      '',
      `Total: ${euro(filtered.reduce((sum, expense) => sum + expense.amount, 0))}`,
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

  function editSelectedExpense() {
    if (!expenseDetails) return
    const expense = expenseDetails.expense
    setEditingId(expense.id)
    setInvoiceFile(null)
    setForm({ title: expense.title, type: expense.type, amount: String(expense.amount), date: expense.date, periodStart: expense.periodStart || '', periodEnd: expense.periodEnd || '', rentMonth: expense.rentMonth || '', note: expense.note || '' })
    setExpenseDetails(null)
    setShowAdd(true)
  }

  async function removeSelectedExpense() {
    if (!expenseDetails || !window.confirm(`¿Eliminar “${expenseDetails.expense.title}”? Esta acción no se puede deshacer.`)) return
    try {
      await deleteExpense(expenseDetails.expense.id)
      setExpenseDetails(null)
      await refreshDashboard()
      notify('Gasto eliminado del piso')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo eliminar el gasto')
    }
  }

  async function openExpenseDetails(expense: Expense) {
    try {
      setExpenseDetails(await getExpenseDetails(expense.id))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo cargar el detalle')
    }
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
      notify('Solicitud enviada a la persona administradora')
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
        <button className="home-switcher"><span className="home-emoji"><House size={16} /></span><span className="home-copy"><b>{initialData.floor.name}</b><small>{members.length} compañeros</small></span><ChevronDown size={15} /></button>
        <nav className="side-nav" aria-label="Navegación principal">
          <div className="nav-caption">GESTIÓN</div>
          {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setPage(label); setMobileNav(false) }} className={`nav-link ${page === label ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{((label === 'Solicitudes' && initialData.floor.role === 'admin' && requests.length > 0) || (label === 'Notificaciones' && notifications.some((item) => !item.read))) && <span className="nav-badge">{label === 'Solicitudes' ? requests.length : notifications.filter((item) => !item.read).length}</span>}</button>)}
          <div className="nav-caption nav-caption-lower">HERRAMIENTAS</div>
          <button className={`nav-link ${page === 'Informes' ? 'active' : ''}`} onClick={() => setPage('Informes')}><FileText size={18} strokeWidth={1.8} /><span>Informes</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Sparkles size={16} /></div><b>Convivir, más fácil.</b><p>Un piso organizado es un piso feliz.</p><button onClick={() => notify('Centro de ayuda: hola@0morosos.es')}>Centro de ayuda <ArrowRight size={13} /></button></div>
          <button className="profile-row" onClick={async () => { await import('@/lib/auth-client').then(({ authClient }) => authClient.signOut()); window.location.assign('/acceso') }}><span className="avatar lilac">{initialData.user.name.slice(0, 2).toUpperCase()}</span><span className="profile-copy"><b>{initialData.user.name}</b><small>@{initialData.user.username || 'usuario'} · {initialData.floor.role === 'admin' ? 'Administradora' : 'Miembro'}</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>
      {mobileNav && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}

      <section className="main-area">
        <header className="topbar"><button className="mobile-menu" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu /></button><div className="breadcrumb"><span>{initialData.floor.name}</span><span className="crumb-slash">/</span><b>{page}</b></div><div className="top-actions"><span className="period-label">{new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date())}</span><button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => setPage('Notificaciones')}><Bell size={19} /><i /></button><span className="avatar top-avatar lilac">{initialData.user.name.slice(0, 2).toUpperCase()}</span></div></header>
        <div className="page-content">
          {page === 'Resumen' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> TU PISO, AL DÍA</div><h1>¡Hola, {initialData.user.name.split(' ')[0]}! <Sparkles className="wave" size={20} aria-hidden="true" /></h1><p className="page-subtitle">Así van las cuentas de <b>{initialData.floor.name}</b> este mes.</p></div>{initialData.floor.role === 'admin' && <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={17} /> Añadir gasto</button>}</div>
            <section className="summary-grid" aria-label="Resumen de gastos">
              <article className="summary-card total-card"><div className="summary-top"><span className="summary-label">GASTOS DEL MES</span><span className="card-icon dark-icon"><Wallet size={17} /></span></div><div className="summary-value">{euro(total)}</div><div className="summary-foot"><span className="trend-pill"><ArrowDownUp size={12} /> 8,4%</span><span>vs. mes pasado</span></div><div className="card-orb" /></article>
              <article className="summary-card"><div className="summary-top"><span className="summary-label">POR PERSONA</span><span className="card-icon green-icon"><Users size={17} /></span></div><div className="summary-value">{euro(total / Math.max(1, members.length))}</div><div className="summary-foot"><span className="quiet-text">Repartido entre {members.length}</span><span className="mini-avatars">{members.slice(0, 4).map((member, index) => <i key={member.id} className={`avatar ${colors[index % colors.length]}`}>{member.name.slice(0, 1).toUpperCase()}</i>)}</span></div></article>
              <article className="summary-card"><div className="summary-top"><span className="summary-label">GASTOS REGISTRADOS</span><span className="card-icon orange-icon"><FileText size={17} /></span></div><div className="summary-value">{monthlyExpenses.length.toString().padStart(2, '0')}<small> este mes</small></div><div className="summary-foot"><span className="quiet-text">Último hace 4 días</span><span className="summary-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div></article>
            </section>
            <section className="dashboard-grid">
              <article className="panel spending-panel"><div className="panel-heading"><div><h2>Cómo se reparte</h2><p>Desglose por categoría</p></div><button className="select-button" onClick={() => notify('Mostrando el periodo actual')}>Este mes <ChevronDown size={14} /></button></div><div className="spending-content"><div className="donut-wrap"><div className="donut"><div className="donut-center"><b>{euro(total)}</b><span>en total</span></div></div></div><div className="category-legend">{categoryTotals.filter((category) => category.amount > 0).slice(0, 4).map((category) => <div key={category.type}><i className="legend-dot bills"/><span>{category.type}</span><b>{euro(category.amount)}</b></div>)}</div></div><div className="panel-divider"/><div className="month-trend"><div className="trend-title"><span>Gasto mensual</span><span className="trend-legend"><i /> Este año</span></div><div className="bar-chart" aria-label="Gráfico de gastos mensuales"><div className="chart-guides"><i>1.200 €</i><i>800 €</i><i>400 €</i></div>{monthlySeries.map((amount, index) => <div className={`chart-bar ${index === new Date().getMonth() ? 'chart-bar-current' : ''}`} key={index}><span style={{ height: `${Math.max(5, amount / maxMonthly * 100)}%` }} /><small>{monthLabels[index]}</small></div>)}</div></div></article>
              <article className="panel activity-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Lo último que ha pasado en el piso</p></div><button className="text-link" onClick={() => setPage('Gastos')}>Ver todo <ArrowRight size={14} /></button></div><div className="activity-list">{expenses.slice(0, 4).map((expense) => <div className="activity-item" key={expense.id}><span className={`category-icon ${expense.type.toLowerCase()}`}><CategoryIcon type={expense.type} /></span><div className="activity-copy"><b>{expense.title}</b><span>{expense.person} · {displayDate(expense.date)}</span></div><strong>{euro(expense.amount)}</strong></div>)}</div><button className="activity-footer" onClick={() => setPage('Gastos')}>Ver todos los gastos <ArrowRight size={14} /></button></article>
            </section>
            <section className="bottom-grid"><article className="panel month-card"><div className="panel-heading"><div><h2>El mes de un vistazo</h2><p>Un pequeño resumen para el piso</p></div><span className="month-illustration"><House size={20} /></span></div><div className="month-stats"><div><span>Mayor gasto</span><b>{largestCategory?.type || 'Sin gastos'} <i>· {total ? Math.round((largestCategory?.amount || 0) / total * 100) : 0}%</i></b></div><div><span>Gasto medio diario</span><b>{euro(total / Math.max(1, new Date().getDate()))}</b></div><div><span>Días hasta fin de mes</span><b>{daysLeft} días <i className="good-text">· hasta fin de mes</i></b></div></div></article><article className="tip-card"><div className="tip-orb"><Zap size={18} /></div><div><span className="tip-label">UN CONSEJO PARA EL PISO</span><h3>Las cuentas claras, la convivencia larga.</h3><p>Sube las facturas cuando lleguen y nadie tendrá que perseguir a nadie.</p></div><span className="tip-decoration" aria-hidden="true">•</span></article></section>
          </>}
          {page === 'Gastos' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> CUENTAS DEL PISO</div><h1>Todos los gastos</h1><p className="page-subtitle">Un registro claro, sin sorpresas a final de mes.</p></div>{initialData.floor.role === 'admin' && <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={17} /> Añadir gasto</button>}</div><section className="panel expenses-panel"><div className="expenses-toolbar"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar un gasto..." /></label><label className="filter-select"><Filter size={15} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>Todos</option>{['Alquiler','Luz','Agua','Basura','Comunidad','Internet','Otros'].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label><label className="date-filter">Desde<input aria-label="Fecha desde" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="date-filter">Hasta<input aria-label="Fecha hasta" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label><button className="outline-button export-button" onClick={exportCsv}><ArrowDownToLine size={15} /> Exportar CSV</button><button className="outline-button share-button" onClick={shareWhatsApp}>Compartir</button></div><div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>CONCEPTO</th><th>CATEGORÍA</th><th>FECHA</th><th>REGISTRADO POR</th><th className="amount-column">IMPORTE</th><th /></tr></thead><tbody>{filtered.map((expense) => <tr key={expense.id}><td><div className="expense-title"><span className={`category-icon ${expense.type.toLowerCase()}`}><CategoryIcon type={expense.type} /></span><b>{expense.title}</b></div></td><td><span className="type-pill">{expense.type}</span></td><td className="muted-cell">{displayDate(expense.date)}</td><td><span className="person-cell"><i className={`avatar ${expense.color}`}>{expense.initials}</i>{expense.person}</span></td><td className="amount-column amount-cell">{euro(expense.amount)}</td><td>{expense.invoicePath && <a className="row-more" href={`/api/factura?path=${encodeURIComponent(expense.invoicePath)}`} target="_blank" rel="noreferrer" aria-label={`Ver factura de ${expense.title}`}><FileText size={16}/></a>}{initialData.floor.role === 'admin' ? <button className="row-more" aria-label={`Detalle de ${expense.title}`} onClick={() => openExpenseDetails(expense)}><MoreHorizontal size={18} /></button> : <button className="row-more" aria-label={`Solicitar cambio de ${expense.title}`} onClick={() => { setRequestTarget(expense); setProposedAmount(expense.amount.toFixed(2)) }}><ArrowDownUp size={16}/></button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Search size={22} /><b>No encontramos gastos</b><span>Prueba con otro término o categoría.</span></div>}</div><div className="table-footer"><span>Mostrando {filtered.length} de {expenses.length} gastos</span><span>Total filtrado <b>{euro(filtered.reduce((sum, expense) => sum + expense.amount, 0))}</b></span></div></section><div className="share-footer"><div><span className="share-icon"><Sparkles size={18} /></span><span><b>¿Todo listo para compartir?</b><small>Envía el resumen del mes al grupo del piso.</small></span></div><button className="outline-button" onClick={shareWhatsApp}>Compartir por WhatsApp <ArrowRight size={14} /></button></div></>}
          {page === 'Compañeros' && <>
            <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> VIDA EN COMÚN</div><h1>Tu equipo del piso</h1><p className="page-subtitle">Personas con acceso a las cuentas de {initialData.floor.name}.</p></div>{initialData.floor.role === 'admin' && <button className="primary-button" onClick={inviteMember}><Plus size={17} /> Invitar compañero</button>}</div>
            {invitationUrl && <section className="panel invitation-share"><div><b>Enlace de invitación listo</b><p>Caduca en 7 días y solo se puede usar una vez.</p></div><div className="invitation-controls"><input aria-label="Enlace de invitación" readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} /><button className="outline-button" onClick={copyInvitation}><Copy size={15} /> Copiar</button></div></section>}
            <section className="members-grid" aria-label="Miembros del piso">{members.map((member, index) => <article className="panel member-card" key={member.id}><div className="member-card-top"><span className={`avatar member-avatar ${colors[index % colors.length]}`}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span className={`role-pill ${member.role === 'admin' ? 'admin-role' : ''}`}>{member.role === 'admin' ? 'Administradora' : 'Miembro'}</span></div><h2>{member.name}</h2><p>{member.username ? `@${member.username}` : 'Usuario del piso'}</p><div className="member-spent"><span>Gastos registrados</span><b>{expenses.filter((expense) => expense.createdBy === member.userId).length}</b></div>{initialData.floor.role === 'admin' && member.userId !== initialData.user.id && member.role !== 'admin' && <button className="remove-member-button" onClick={() => removeMember(member.id, member.name)} aria-label={`Eliminar a ${member.name}`}><Trash2 size={14} /> Eliminar del piso</button>}</article>)}</section>
          </>}
          {page === 'Solicitudes' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> REVISIÓN DEL ADMINISTRADOR</div><h1>Bandeja de solicitudes</h1><p className="page-subtitle">Revisa las propuestas de tus compañeros.</p></div><span className="pending-count">{requests.length} pendientes</span></div><section className="requests-list">{requests.length ? requests.map((request) => <article className="panel request-card" key={request.id}><span className={`avatar request-avatar ${request.color}`}>{request.initials}</span><div className="request-content"><div className="request-title-line"><h2>{request.title}</h2><span>{request.time}</span></div><p>{request.detail}</p><small>Enviada por <b>{request.name}</b></small></div>{initialData.floor.role === 'admin' && <div className="request-actions"><button className="reject-button" onClick={() => resolveRequest(request.id, 'rechazada')}>Rechazar</button><button className="approve-button" onClick={() => resolveRequest(request.id, 'aprobada')}><Check size={15}/> Aprobar</button></div>}</article>) : <div className="panel requests-empty"><span className="empty-check"><Check size={22}/></span><h2>Todo al día</h2><p>No hay solicitudes pendientes por revisar.</p></div>}</section></>}
          {page === 'Notificaciones' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot"/> SIEMPRE AL TANTO</div><h1>Notificaciones</h1><p className="page-subtitle">Lo importante del piso, en un mismo sitio.</p></div><button className="text-link" onClick={readNotifications}>Marcar todo como leído</button></div><section className="panel notification-list">{notifications.length ? notifications.map((item) => <div className={`notification-row ${!item.read ? 'unread' : ''}`} key={item.id}><span className="category-icon request"><Bell size={17}/></span><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString('es-ES')}</small></div>{!item.read && <i className="unread-dot"/>}</div>) : <div className="empty-state"><Bell size={22}/><b>No tienes notificaciones</b><span>Te avisaremos cuando haya novedades en el piso.</span></div>}</section></>}
          {page === 'Informes' && <><div className="welcome-row"><div><div className="eyebrow"><span className="status-dot"/> INFORMES DEL PISO</div><h1>Las cuentas, en limpio</h1><p className="page-subtitle">Descarga o comparte el resumen de gastos de La Morada.</p></div></div><section className="report-grid"><article className="panel report-card"><span className="report-icon csv"><FileText size={21}/></span><span className="report-kicker">FORMATO DE TABLA</span><h2>Exportar a CSV</h2><p>Abre los gastos del periodo en una hoja de cálculo para revisarlos o archivarlos.</p><button className="outline-button" onClick={exportCsv}><ArrowDownToLine size={15}/> Descargar CSV</button></article><article className="panel report-card"><span className="report-icon whatsapp"><ArrowRight size={21}/></span><span className="report-kicker">PARA EL GRUPO</span><h2>Compartir resumen</h2><p>Prepara un mensaje ordenado con los gastos y el total del mes para WhatsApp.</p><button className="outline-button" onClick={shareWhatsApp}>Compartir por WhatsApp <ArrowRight size={15}/></button></article><article className="panel report-card"><span className="report-icon pdf"><FileText size={21}/></span><span className="report-kicker">INFORME DETALLADO</span><h2>Informe PDF</h2><p>Abre un informe imprimible con los gastos filtrados y el total del periodo.</p><button className="outline-button" onClick={exportPdf}><FileText size={15}/> Preparar informe</button></article></section></>}
        </div>
      </section>
      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if(e.target === e.currentTarget) setShowAdd(false) }}><section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="modal-kicker">{initialData.floor.name.toUpperCase()} · {editingId ? 'EDITAR GASTO' : 'NUEVO GASTO'}</span><h2 id="modal-title">{editingId ? 'Edita el gasto' : 'Apúntalo y listo'}</h2><p>El piso entero podrá verlo al momento.</p></div><button className="icon-button" aria-label="Cerrar" onClick={() => setShowAdd(false)}><X size={18}/></button></div><form onSubmit={addExpense}><label>Concepto<input required maxLength={80} placeholder="Ej. Factura de la luz" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})}/></label><div className="form-two"><label>Tipo<select value={form.type} onChange={(e) => setForm({...form,type:e.target.value})}>{['Alquiler','Luz','Agua','Basura','Comunidad','Internet','Otros'].map((type)=><option key={type}>{type}</option>)}</select></label><label>Importe (€)<input type="number" required min="0.01" step="0.01" placeholder="0,00" value={form.amount} onChange={(e) => setForm({...form,amount:e.target.value})}/></label></div>{['Luz','Agua'].includes(form.type)&&<div className="form-two"><label>Inicio del periodo<input type="date" required value={form.periodStart} onChange={(e) => setForm({...form,periodStart:e.target.value})}/></label><label>Fin del periodo<input type="date" required value={form.periodEnd} onChange={(e) => setForm({...form,periodEnd:e.target.value})}/></label></div>}{form.type==='Alquiler'&&<label>Mes del alquiler<input type="month" required value={form.rentMonth} onChange={(e) => setForm({...form,rentMonth:e.target.value})}/></label>}<div className="form-two"><label>Fecha del gasto<input type="date" required value={form.date} onChange={(e) => setForm({...form,date:e.target.value})}/></label><label>Factura (opcional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0] ?? null; setInvoiceFile(file); if (file) notify(file.size <= 5 * 1024 * 1024 ? `Factura lista: ${file.name}` : 'El archivo supera el límite de 5 MB') }}/><span className="field-hint">JPG, PNG, WebP o PDF · máximo 5 MB{invoiceFile ? ` · ${invoiceFile.name}` : ''}</span></label></div><label>Nota <span className="optional-label">OPCIONAL</span><textarea rows={2} maxLength={240} placeholder="Añade un detalle si hace falta..." value={form.note} onChange={(e) => setForm({...form,note:e.target.value})}/></label><div className="modal-foot"><span><CircleHelp size={14}/> Solo la administradora puede editarlo</span><button className="primary-button" type="submit" disabled={saving}><Plus size={16}/> {saving ? 'Guardando…' : 'Guardar gasto'}</button></div></form></section></div>}
      {expenseDetails && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpenseDetails(null) }}><section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-detail-title"><div className="modal-head"><div><span className="modal-kicker">DETALLE DEL GASTO</span><h2 id="expense-detail-title">{expenseDetails.expense.title}</h2><p>{euro(expenseDetails.expense.amount)} · {displayDate(expenseDetails.expense.date)}</p></div><button className="icon-button" aria-label="Cerrar detalle" onClick={() => setExpenseDetails(null)}><X size={18}/></button></div><div className="expense-detail-content"><p><b>Categoría:</b> {expenseDetails.expense.type}</p>{expenseDetails.expense.note && <p><b>Nota:</b> {expenseDetails.expense.note}</p>}{expenseDetails.expense.periodStart && <p><b>Periodo:</b> {displayDate(expenseDetails.expense.periodStart)} – {displayDate(expenseDetails.expense.periodEnd || '')}</p>}{expenseDetails.expense.rentMonth && <p><b>Mes de alquiler:</b> {expenseDetails.expense.rentMonth}</p>}{expenseDetails.expense.invoicePath && <a className="outline-button" href={`/api/factura?path=${encodeURIComponent(expenseDetails.expense.invoicePath)}`} target="_blank" rel="noreferrer"><FileText size={15}/> Ver factura</a>}<h3>Historial</h3>{expenseDetails.history.length ? <ol>{expenseDetails.history.map((entry) => <li key={entry.id}><b>{entry.action === 'creado' ? 'Gasto creado' : 'Cambio aplicado'}</b><span> por {entry.actor} · {new Date(entry.createdAt).toLocaleString('es-ES')}</span>{entry.previous && <pre>{JSON.stringify(entry.previous, null, 2)}</pre>}{entry.next && <pre>{JSON.stringify(entry.next, null, 2)}</pre>}</li>)}</ol> : <p>Sin cambios registrados.</p>}</div>{initialData.floor.role === 'admin' && <div className="modal-foot"><button className="reject-button" onClick={removeSelectedExpense}>Eliminar gasto</button><button className="primary-button" onClick={editSelectedExpense}><MoreHorizontal size={15}/> Editar gasto</button></div>}</section></div>}
      {requestTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestTarget(null) }}><section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="request-title"><div className="modal-head"><div><span className="modal-kicker">SOLICITUD PARA {initialData.floor.name.toUpperCase()}</span><h2 id="request-title">Proponer un cambio</h2><p>{requestTarget.title} · importe actual {euro(requestTarget.amount)}</p></div><button className="icon-button" aria-label="Cerrar solicitud" onClick={() => setRequestTarget(null)}><X size={18}/></button></div><form onSubmit={sendExpenseRequest}><label>Nuevo importe (€)<input type="number" required min="0.01" step="0.01" value={proposedAmount} onChange={(event) => setProposedAmount(event.target.value)}/></label><label>Motivo<textarea required rows={3} maxLength={300} value={requestReason} onChange={(event) => setRequestReason(event.target.value)} placeholder="Explica por qué propones este cambio"/></label><div className="modal-foot"><span>La administradora revisará tu propuesta.</span><button className="primary-button" type="submit"><ArrowRight size={16}/> Enviar solicitud</button></div></form></section></div>}
      {notice && <div className="toast-message" role="status"><Check size={16}/>{notice}</div>}
    </main>
  )
}

function CategoryIcon({type}:{type:string}) { if(type==='Luz') return <Zap size={17}/>; if(type==='Alquiler') return <House size={17}/>; if(type==='Agua') return <span className="water-drop">●</span>; if(type==='Internet') return <span className="wifi-mark">⌁</span>; return <CreditCard size={17}/> }
