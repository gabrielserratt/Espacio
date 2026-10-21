import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity as ActivityIcon, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  Check, CircleDollarSign, ClipboardList, Download, FileText, HandCoins, HeartHandshake,
  LayoutDashboard, LogOut, Plus, Receipt, Search, Settings2, Users, Wallet, X,
} from 'lucide-react';
import {
  getGetActivityQueryKey, getGetDashboardQueryKey, getGetPartnerLedgerQueryKey,
  getGetReceiptQueryKey, getGetReportsQueryKey, getListActivitiesQueryKey, getListCategoriesQueryKey,
  getListMovementsQueryKey, getListPartnersQueryKey, getExportMovementsCsvQueryKey,
  useCancelActivity, useCreateActivity, useCreateCategory, useCreateMovement, useCreatePartner,
  useDuplicateActivity, useExportMovementsCsv, useGetActivity, useGetDashboard, useGetPartnerLedger,
  useGetReceipt, useGetReports, useHealthCheck, useListActivities, useListCategories,
  useListMovements, useListPartners, useRequestReceiptUploadUrl, useUpdateActivity,
  useUpdateMovement, useUpdatePartner, useVoidMovement,
  type Activity, type ActivityInput, type Category, type Movement, type MovementInput,
  type Partner, type PartnerInput,
} from '@workspace/api-client-react';
import {
  Link, Redirect, Route, Switch, useLocation, Router as WouterRouter,
} from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
const currency = (amount: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(amount || 0));
const shortDate = (date?: string | null) => date ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(`${date.slice(0, 10)}T12:00:00`)) : '—';
const longDate = (date?: string | null) => date ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00`)) : '—';
const todayString = () => new Date().toISOString().slice(0, 10);
const monthRange = () => {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10) };
};
const typeLabels: Record<string, string> = {
  income: 'Ingreso', expense: 'Gasto', partner_contribution: 'Aporte de socio',
  partner_expense: 'Gasto pagado por socio', reimbursement: 'Reintegro',
  event: 'Evento', class: 'Clase', workshop: 'Taller', rehearsal: 'Ensayo',
  meeting: 'Reunión', maintenance: 'Mantenimiento', other: 'Otro',
};

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#A47C55', colorForeground: '#252522', colorMutedForeground: '#706E67',
    colorDanger: '#A65D48', colorBackground: '#FCFAF5', colorInput: '#FCFAF5',
    colorInputForeground: '#252522', colorNeutral: '#D9D2C6', fontFamily: 'DM Sans',
    borderRadius: '0.55rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#FCFAF5] rounded-xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#252522] font-medium',
    headerSubtitle: 'text-[#706E67]',
    socialButtonsBlockButtonText: 'text-[#252522]',
    formFieldLabel: 'text-[#45443F]',
    footerActionLink: 'text-[#8B6442]',
    footerActionText: 'text-[#706E67]',
    dividerText: 'text-[#706E67]',
    identityPreviewEditButton: 'text-[#8B6442]',
    formFieldSuccessText: 'text-[#66745A]',
    alertText: 'text-[#904C3D]',
    logoBox: 'mx-auto',
    logoImage: 'max-h-9',
    socialButtonsBlockButton: 'border-[#D9D2C6] bg-[#FCFAF5]',
    formButtonPrimary: 'bg-[#30302D] hover:bg-[#484740] text-[#FCFAF5]',
    formFieldInput: 'border-[#D9D2C6] bg-[#FCFAF5] text-[#252522]',
    footerAction: 'border-t border-[#E7E1D7]',
    dividerLine: 'bg-[#D9D2C6]',
    alert: 'bg-[#F8EEE9]',
    otpCodeFieldInput: 'border-[#D9D2C6] bg-[#FCFAF5]',
    formFieldRow: 'gap-y-1',
    main: 'gap-y-4',
  },
};

function Home() {
  return <div className="landing">
    <nav className="landing-nav">
      <Brand />
      <Link href="/sign-in" className="button" data-testid="link-sign-in">Entrar <ArrowRight size={14} /></Link>
    </nav>
    <main className="landing-main">
      <div className="landing-copy">
        <div className="landing-kicker">Espacio Vergara · Gestión interna</div>
        <h1>La cultura<br />también necesita<br />un buen lugar.</h1>
        <p>Una mesa de trabajo serena para cuidar la agenda, las cuentas y las personas que hacen posible este espacio.</p>
        <div className="landing-cta">
          <Link href="/sign-in" className="button button-primary" data-testid="link-access">Acceder al espacio <ArrowRight size={15} /></Link>
          <span style={{ color: '#89867e', fontSize: 11 }}>Solo para el equipo administrador</span>
        </div>
      </div>
      <div className="landing-visual" aria-label="Ilustración abstracta de una sala" role="img">
        <div className="visual-frame" /><div className="visual-inner"><div className="visual-sun" /><div className="visual-floor" /></div>
        <div className="visual-caption">UN ESPACIO · MUCHAS POSIBILIDADES</div>
      </div>
    </main>
    <footer className="landing-foot"><span>Un lugar para encontrarnos</span><span>Vergara · Cultura independiente</span><span>Gestión, sin ruido</span></footer>
  </div>;
}

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand">
    <span className="brand-mark"><ActivityIcon size={17} strokeWidth={1.5} /></span>
    <span className="brand-name">Espacio Vergara<span className="brand-caption">Gestión cultural</span></span>
  </Link>;
}

function SignInPage() {
  return <div className="auth-screen">
    <aside className="auth-aside"><Brand /><div><div className="eyebrow">Bienvenido de nuevo</div><h1>Todo lo que sostiene el espacio, en su sitio.</h1><p>Agenda, movimientos y acuerdos de equipo, con claridad para volver a lo importante.</p></div><span className="eyebrow">Espacio Vergara · Uso interno</span></aside>
    <div className="auth-form-side"><div className="auth-card"><Link href="/" className="auth-back" data-testid="link-back-home">← Volver al inicio</Link><div style={{ height: 28 }} /><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>
  </div>;
}

function SignUpPage() {
  return <div className="auth-screen">
    <aside className="auth-aside"><Brand /><div><div className="eyebrow">Acceso del equipo</div><h1>Un espacio cuidado empieza por quienes lo cuidan.</h1><p>Las nuevas cuentas requieren aprobación del equipo administrador.</p></div><span className="eyebrow">Espacio Vergara · Uso interno</span></aside>
    <div className="auth-form-side"><div className="auth-card"><Link href="/" className="auth-back" data-testid="link-back-home">← Volver al inicio</Link><div style={{ height: 28 }} /><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>
  </div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  useEffect(() => {
    let previous: string | null | undefined;
    return addListener(({ user }) => {
      const next = user?.id ?? null;
      if (previous !== undefined && previous !== next) qc.clear();
      previous = next;
    });
  }, [addListener, qc]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Qué bueno verte', subtitle: 'Accede al espacio de trabajo de Vergara' } },
      signUp: { start: { title: 'Pide acceso al equipo', subtitle: 'Las cuentas están reservadas al equipo administrador' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator />
    <AppRoutes />
  </ClerkProvider>;
}

function AppRoutes() {
  const { isSignedIn } = useUser();
  return <Switch>
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/"><>{isSignedIn ? <Redirect to="/inicio" /> : <Home />}</></Route>
    <Route path="/inicio"><Protected><AppShell page="inicio"><DashboardPage /></AppShell></Protected></Route>
    <Route path="/agenda"><Protected><AppShell page="agenda"><AgendaPage /></AppShell></Protected></Route>
    <Route path="/movimientos"><Protected><AppShell page="movimientos"><MovementsPage /></AppShell></Protected></Route>
    <Route path="/socios"><Protected><AppShell page="socios"><PartnersPage /></AppShell></Protected></Route>
    <Route path="/informes"><Protected><AppShell page="informes"><ReportsPage /></AppShell></Protected></Route>
    <Route path="/actividades/:id"><Protected><ActivityDetailPage /></Protected></Route>
    <Route component={NotFound} />
  </Switch>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

const navItems = [
  { path: '/inicio', label: 'Inicio', icon: LayoutDashboard },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  { path: '/movimientos', label: 'Movimientos', icon: CircleDollarSign },
  { path: '/socios', label: 'Socios', icon: Users },
  { path: '/informes', label: 'Informes', icon: FileText },
];

function AppShell({ page, children }: { page: string; children: ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { data: health } = useHealthCheck();
  const initials = (user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || 'V').toUpperCase();
  return <div className="workspace">
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div><div className="nav-label">Espacio de trabajo</div><nav className="nav-list">
          {navItems.map(item => <Link key={item.path} href={item.path} className={`nav-link ${page === item.label.toLowerCase() ? 'active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase()}`}><item.icon size={16} strokeWidth={1.7} /><span>{item.label}</span></Link>)}
        </nav></div>
        <div className="sidebar-bottom">
          <div className="venue-note"><strong>Una sola sala</strong>Agenda y finanzas del espacio, sin taquilla ni gestión de asistentes.</div>
          <div className="user-line"><span className="user-initial">{initials}</span><div className="user-meta">{user?.firstName || 'Equipo Vergara'}<small>{health?.status === 'ok' ? 'Espacio conectado' : 'Equipo administrador'}</small></div><button className="logout" aria-label="Cerrar sesión" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })}><LogOut size={15} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span style={{ color: '#aaa69d' }}>Espacio Vergara</span><span style={{ padding: '0 8px' }}>/</span>{navItems.find(item => item.path === `/${page}`)?.label || 'Actividad'}</div>
          <div className="topbar-right"><span className="today-chip">{new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span><span className="health-dot" data-testid="status-health" title={health?.status || 'Conectando'}><i /> Conectado</span></div>
        </header>
        {children}
      </main>
    </div>
    <nav className="mobile-nav">{navItems.map(item => <Link key={item.path} href={item.path} className={page === item.label.toLowerCase() ? 'active' : ''} data-testid={`mobile-nav-${item.label.toLowerCase()}`}><item.icon size={17} /><span>{item.label}</span></Link>)}</nav>
  </div>;
}

function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="actions">{children}</div>}</div>;
}

function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-head"><div><h2 className="panel-title">{title}</h2>{subtitle && <div className="panel-subtitle">{subtitle}</div>}</div>{action}</header>{children}</section>;
}

function EmptyState({ title, detail, icon: Icon = ClipboardList, action }: { title: string; detail: string; icon?: typeof ClipboardList; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><Icon size={17} /></div><strong>{title}</strong><p>{detail}</p>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

function QueryError({ retry }: { retry: () => void }) {
  return <div className="error-note"><span>No pudimos cargar esta información. Revisa la conexión e inténtalo de nuevo.</span><button className="button button-danger" onClick={retry} data-testid="button-retry">Reintentar</button></div>;
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div style={{ display: 'grid', gap: 15, padding: 20 }} aria-label="Cargando"><div className="skeleton" style={{ width: '34%' }} />{Array.from({ length: count }, (_, i) => <div className="skeleton" key={i} style={{ height: 38, opacity: 1 - i * .13 }} />)}</div>;
}

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date());
  return <div className="content">
    <PageHeading eyebrow={`Vista general · ${month}`} title="Buenos días." description="Un vistazo claro a lo que ocurre en el espacio." />
    {isError && <QueryError retry={() => void refetch()} />}
    {isLoading ? <div className="metric-grid">{[1, 2, 3, 4].map(i => <div className="metric-card" key={i}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 24, width: '65%', height: 25 }} /></div>)}</div> : data && <>
      <section className="metric-grid">
        <Metric label="Ingresos del mes" value={currency(data.monthIncome)} hint="Ingresos operativos" icon={ArrowDownLeft} />
        <Metric label="Gastos del mes" value={currency(data.monthExpenses)} hint="Gastos operativos" icon={ArrowUpRight} />
        <Metric label="Resultado del mes" value={currency(data.monthResult)} hint="Ingresos menos gastos" icon={Wallet} dark />
        <Metric label="A devolver a socios" value={currency(data.partnerDebt)} hint="Deuda pendiente con el equipo" icon={HandCoins} />
      </section>
      <div style={{ color: '#89867e', fontSize: 11, margin: '-10px 0 22px' }}>Resultado económico; no representa el saldo de caja. Los aportes no son ingresos operativos.</div>
      <div className="dashboard-grid">
        <Panel title="Próximas actividades" subtitle="Lo que viene en la sala" action={<Link href="/agenda" className="button button-quiet" data-testid="link-agenda-all">Ver agenda <ArrowRight size={13} /></Link>}>
          <div className="panel-body">{data.upcomingActivities?.length ? data.upcomingActivities.slice(0, 5).map(activity => <ActivityRow key={activity.id} activity={activity} />) : <EmptyState title="La agenda está abierta" detail="Todavía no hay actividades próximas. Añade la siguiente para tenerla a mano." action={<Link href="/agenda" className="button" data-testid="link-add-activity-empty"><Plus size={14} /> Añadir actividad</Link>} />}</div>
        </Panel>
        <Panel title="Últimos movimientos" subtitle="Registro reciente" action={<Link href="/movimientos" className="button button-quiet" data-testid="link-movements-all">Ver todos <ArrowRight size={13} /></Link>}>
          <div className="panel-body">{data.recentMovements?.length ? data.recentMovements.slice(0, 5).map(movement => <MovementRow movement={movement} key={movement.id} />) : <EmptyState title="Sin movimientos aún" detail="Los ingresos y gastos registrados aparecerán aquí." />}</div>
        </Panel>
      </div>
      <div className="panel" style={{ marginTop: 15, padding: '16px 20px', display: 'flex', gap: 13, alignItems: 'flex-start' }}><div className="empty-mark" style={{ margin: 0, flexShrink: 0 }}><HeartHandshake size={16} /></div><div><div style={{ fontSize: 13, fontWeight: 600 }}>Resultado acumulado</div><div style={{ font: '18px var(--app-font-mono)', marginTop: 6 }}>{currency(data.accumulatedResult)}</div><div style={{ fontSize: 10, color: '#89867e', marginTop: 4 }}>Balance económico acumulado. No equivale al efectivo disponible.</div></div></div>
    </>}
  </div>;
}

function Metric({ label, value, hint, icon: Icon, dark = false }: { label: string; value: string; hint: string; icon: typeof Wallet; dark?: boolean }) {
  return <div className={`metric-card ${dark ? 'primary-metric' : ''}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><Icon size={16} /></div><div className="metric-value">{value}</div><div className="metric-foot">{hint}</div></div>;
}

function ActivityRow({ activity }: { activity: Activity }) {
  return <Link href={`/actividades/${activity.id}`} className="list-row" data-testid={`row-upcoming-${activity.id}`} style={{ textDecoration: 'none' }}>
    <div className="row-date"><strong>{new Date(`${activity.date.slice(0, 10)}T12:00:00`).getDate()}</strong>{new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(`${activity.date.slice(0, 10)}T12:00:00`))}</div>
    <div className="row-main"><div className="row-title">{activity.name}</div><div className="row-detail">{typeLabels[activity.type] || activity.type}{activity.startTime ? ` · ${activity.startTime}` : ''}{activity.responsible ? ` · ${activity.responsible}` : ''}</div></div>
    <span className={`status-pill ${activity.status}`}>{activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</span>
  </Link>;
}

function MovementRow({ movement }: { movement: Movement }) {
  const isPositive = movement.type === 'income' || movement.type === 'partner_contribution' || movement.type === 'reimbursement';
  return <div className="list-row" data-testid={`row-movement-${movement.id}`}>
    <div className="row-date">{shortDate(movement.date)}</div><div className="row-main"><div className="row-title">{movement.concept}</div><div className="row-detail">{typeLabels[movement.type] || movement.type}{movement.partnerName ? ` · ${movement.partnerName}` : ''}</div></div>
    <div className={`row-trailing amount ${isPositive ? 'positive' : 'negative'}`}>{movement.status === 'voided' ? 'Anulado' : `${isPositive ? '+' : '−'}${currency(movement.amount)}`}</div>
  </div>;
}

function AgendaPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, isError, refetch } = useListActivities();
  const createActivity = useCreateActivity();
  const duplicate = useDuplicateActivity();
  const cancel = useCancelActivity();
  const [duplicateDate, setDuplicateDate] = useState<Record<number, string>>({});
  const filtered = (data || []).filter(a => (statusFilter === 'all' || a.status === statusFilter) && a.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.date.localeCompare(b.date));
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); };
  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload: ActivityInput = {
      name: String(fd.get('name')), type: String(fd.get('type')) as ActivityInput['type'], date: String(fd.get('date')),
      startTime: String(fd.get('startTime') || '') || null, endTime: String(fd.get('endTime') || '') || null,
      responsible: String(fd.get('responsible') || '') || null, description: String(fd.get('description') || '') || null,
      notes: String(fd.get('notes') || '') || null, pendingTasks: String(fd.get('pendingTasks') || '').split('\n').map(x => x.trim()).filter(Boolean),
      recurrence: String(fd.get('recurrence') || 'none') as ActivityInput['recurrence'], recurrenceCount: Number(fd.get('recurrenceCount') || 1),
    };
    createActivity.mutate({ data: payload }, { onSuccess: () => { refresh(); setShowForm(false); } });
  }
  return <div className="content">
    <PageHeading eyebrow="Planificación" title="Agenda" description="Actividades y uso de la sala, sin perder detalle." >
      <button className="button button-primary" data-testid="button-new-activity" onClick={() => setShowForm(!showForm)}><Plus size={15} /> Nueva actividad</button>
    </PageHeading>
    {showForm && <Panel title="Añadir actividad" subtitle="Una nueva cita para el espacio"><form className="inline-form" onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }}>
      <ActivityFields />
      <div className="form-actions"><button type="button" className="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={createActivity.isPending} data-testid="button-save-activity">{createActivity.isPending ? 'Guardando…' : 'Guardar actividad'}</button></div>
      {createActivity.isError && <div className="error-note" style={{ marginTop: 12 }}>No se pudo guardar la actividad.</div>}
    </form></Panel>}
    <Panel title="Actividades" subtitle={`${filtered.length} en la agenda`}>
      <div className="filterbar"><div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: '#89867e' }} /><input className="field search-field" style={{ paddingLeft: 32 }} placeholder="Buscar actividad" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-activities" /></div><select className="select-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="select-activity-status"><option value="all">Todos los estados</option><option value="scheduled">Programadas</option><option value="completed">Realizadas</option><option value="cancelled">Canceladas</option></select></div>
      {isLoading ? <LoadingRows /> : isError ? <div style={{ padding: 16 }}><QueryError retry={() => void refetch()} /></div> : filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Actividad</th><th>Tipo / responsable</th><th>Estado</th><th>Repetir en</th><th>Acciones</th></tr></thead><tbody>{filtered.map(activity => <tr key={activity.id} data-testid={`row-activity-${activity.id}`}><td>{longDate(activity.date)}{activity.startTime && <div style={{ color: '#89867e', marginTop: 4 }}>{activity.startTime}{activity.endTime ? `–${activity.endTime}` : ''}</div>}</td><td><Link href={`/actividades/${activity.id}`} style={{ color: '#34332e', fontWeight: 600, textDecoration: 'none' }}>{activity.name}</Link></td><td>{typeLabels[activity.type] || activity.type}<div style={{ color: '#89867e', marginTop: 4 }}>{activity.responsible || 'Sin responsable'}</div></td><td><span className={`status-pill ${activity.status}`}>{activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</span></td><td><input className="field" type="date" value={duplicateDate[activity.id] || ''} onChange={e => setDuplicateDate({ ...duplicateDate, [activity.id]: e.target.value })} aria-label={`Nueva fecha para duplicar ${activity.name}`} data-testid={`input-duplicate-date-${activity.id}`} /></td><td><div className="actions"><button className="button icon-button" title="Duplicar" aria-label={`Duplicar ${activity.name}`} disabled={!duplicateDate[activity.id] || duplicate.isPending} data-testid={`button-duplicate-${activity.id}`} onClick={() => duplicate.mutate({ id: activity.id, data: { date: duplicateDate[activity.id] } }, { onSuccess: refresh })}><Plus size={14} /></button>{activity.status === 'scheduled' && <button className="button icon-button button-danger" title="Cancelar actividad" aria-label={`Cancelar ${activity.name}`} data-testid={`button-cancel-${activity.id}`} onClick={() => { if (window.confirm(`¿Cancelar «${activity.name}»?`)) cancel.mutate({ id: activity.id }, { onSuccess: refresh }); }}><X size={14} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Una agenda por estrenar" detail="No hay actividades que coincidan. Añade una actividad para organizar la sala." action={<button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Nueva actividad</button>} />}
    </Panel>
  </div>;
}

function ActivityFields({ activity }: { activity?: Activity } = {}) {
  return <div className="form-grid">
    <Field label="Nombre" full><input className="field" name="name" required defaultValue={activity?.name} placeholder="Ej. Taller de cerámica" data-testid="input-activity-name" /></Field>
    <Field label="Tipo"><select className="select-field" name="type" defaultValue={activity?.type || 'event'} data-testid="select-activity-type">{['event', 'class', 'workshop', 'rehearsal', 'meeting', 'maintenance', 'other'].map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></Field>
    <Field label="Fecha"><input className="field" type="date" name="date" required defaultValue={activity?.date.slice(0, 10) || todayString()} data-testid="input-activity-date" /></Field>
    <Field label="Hora de inicio"><input className="field" type="time" name="startTime" defaultValue={activity?.startTime || ''} data-testid="input-activity-start" /></Field>
    <Field label="Hora de fin"><input className="field" type="time" name="endTime" defaultValue={activity?.endTime || ''} data-testid="input-activity-end" /></Field>
    <Field label="Responsable"><input className="field" name="responsible" defaultValue={activity?.responsible || ''} placeholder="Persona responsable" data-testid="input-activity-responsible" /></Field>
    <Field label="Repetición"><select className="select-field" name="recurrence" defaultValue="none" data-testid="select-activity-recurrence"><option value="none">No repetir</option><option value="weekly">Cada semana</option><option value="biweekly">Cada dos semanas</option><option value="monthly">Cada mes</option></select></Field>
    <Field label="Número de fechas"><input className="field" type="number" name="recurrenceCount" min="1" max="24" defaultValue="1" data-testid="input-recurrence-count" /></Field>
    <Field label="Descripción" full><textarea className="textarea" name="description" defaultValue={activity?.description || ''} placeholder="Contexto para el equipo" data-testid="textarea-activity-description" /></Field>
    <Field label="Tareas pendientes · una por línea" full><textarea className="textarea" name="pendingTasks" defaultValue={activity?.pendingTasks?.join('\n') || ''} placeholder="Preparar materiales" data-testid="textarea-activity-tasks" /></Field>
    <Field label="Notas internas" full><textarea className="textarea" name="notes" defaultValue={activity?.notes || ''} data-testid="textarea-activity-notes" /></Field>
  </div>;
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: ReactNode }) {
  return <div className={`form-field ${full ? 'full' : ''}`}><label>{label}</label>{children}</div>;
}

function MovementsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categoryAppliesTo, setCategoryAppliesTo] = useState<'income' | 'expense' | 'both'>('expense');
  const [editing, setEditing] = useState<Movement | null>(null);
  const [kind, setKind] = useState('all');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ includeVoided }), [includeVoided]);
  const query = useListMovements(params);
  const categoriesQuery = useListCategories();
  const partnersQuery = useListPartners();
  const activitiesQuery = useListActivities();
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const voidMovement = useVoidMovement();
  const uploadUrl = useRequestReceiptUploadUrl();
  const createCategory = useCreateCategory();
  const [receiptPath, setReceiptPath] = useState('');
  const [uploading, setUploading] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListMovementsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void qc.invalidateQueries({ queryKey: getListPartnersQueryKey() }); };
  const filtered = (query.data || []).filter(m => (kind === 'all' || m.type === kind) && `${m.concept} ${m.partnerName || ''} ${m.activityName || ''}`.toLowerCase().includes(search.toLowerCase()));
  const openNew = () => { setEditing(null); setReceiptPath(''); setShowForm(true); };
  const editMovement = (movement: Movement) => { setEditing(movement); setReceiptPath(movement.receiptPath || ''); setShowForm(true); };
  async function handleFile(file?: File) {
    if (!file) return;
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!supported.includes(file.type) || file.size > 10 * 1024 * 1024) { window.alert('Usa un PDF o una imagen de hasta 10 MB.'); return; }
    setUploading(true);
    try {
      const signed = await uploadUrl.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' } });
      const response = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error('upload');
      setReceiptPath(signed.objectPath);
    } catch { window.alert('No se pudo subir el justificante. Vuelve a intentarlo.'); }
    finally { setUploading(false); }
  }
  function submitMovement(form: HTMLFormElement) {
    const fd = new FormData(form);
    const type = String(fd.get('type')) as MovementInput['type'];
    const payload: MovementInput = {
      type, date: String(fd.get('date')), concept: String(fd.get('concept')),
      amount: Number(fd.get('amount')), categoryId: fd.get('categoryId') ? Number(fd.get('categoryId')) : null,
      activityId: fd.get('activityId') ? Number(fd.get('activityId')) : null,
      partnerId: ['partner_contribution', 'partner_expense', 'reimbursement'].includes(type) && fd.get('partnerId') ? Number(fd.get('partnerId')) : null,
      receiptPath: receiptPath || null, notes: String(fd.get('notes') || '') || null,
    };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: () => { refresh(); setShowForm(false); } });
    else create.mutate({ data: payload }, { onSuccess: () => { refresh(); setShowForm(false); } });
  }
  return <div className="content">
    <PageHeading eyebrow="Economía cotidiana" title="Movimientos" description="Un registro fiel, con el contexto de cada actividad y socio.">
      <button className="button button-primary" onClick={openNew} data-testid="button-new-movement"><Plus size={15} /> Registrar movimiento</button>
    </PageHeading>
    <div style={{ padding: '12px 15px', marginBottom: 16, border: '1px solid #ded8cd', background: '#f9f6ef', borderRadius: 8, fontSize: 11, color: '#706e67', lineHeight: 1.55 }}><strong style={{ color: '#45443f' }}>Criterio contable.</strong> Aportes no son ingresos; los gastos pagados por socios cuentan como gasto y generan deuda. Los reintegros reducen deuda, no son gasto. Las anulaciones conservan su historial.</div>
    {showForm && <Panel title={editing ? 'Editar movimiento' : 'Registrar movimiento'} subtitle="Asegúrate de clasificarlo correctamente">
      <form className="inline-form" onSubmit={e => { e.preventDefault(); submitMovement(e.currentTarget); }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" className="button button-quiet" onClick={() => setShowCategoryForm(!showCategoryForm)} data-testid="button-toggle-category"><Plus size={13} /> Añadir categoría</button>
        </div>
        {showCategoryForm && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, padding: 12, border: '1px solid #ded8cd', borderRadius: 8 }}>
          <input className="field" placeholder="Nombre de categoría" value={newCategory} onChange={e => setNewCategory(e.target.value)} aria-label="Nombre de categoría" data-testid="input-new-category" />
          <select className="select-field" value={categoryAppliesTo} onChange={e => setCategoryAppliesTo(e.target.value as typeof categoryAppliesTo)} aria-label="Aplicación de la categoría" data-testid="select-category-applies-to"><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="both">Ambos</option></select>
          <button type="button" className="button" disabled={!newCategory.trim() || createCategory.isPending} onClick={() => createCategory.mutate({ data: { name: newCategory.trim(), appliesTo: categoryAppliesTo } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setNewCategory(''); setShowCategoryForm(false); } })} data-testid="button-save-category">{createCategory.isPending ? 'Guardando…' : 'Guardar categoría'}</button>
        </div>}
        <MovementFields movement={editing || undefined} categories={categoriesQuery.data || []} partners={partnersQuery.data || []} activities={activitiesQuery.data || []} />
        <div className="form-field full" style={{ marginTop: 13 }}><label>Justificante · PDF o imagen (máx. 10 MB)</label><input className="field" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => void handleFile(e.target.files?.[0])} data-testid="input-receipt" />{uploading && <small>Subiendo directamente a almacenamiento seguro…</small>}{receiptPath && <small style={{ color: '#66745a' }}>Justificante preparado.</small>}</div>
        <div className="form-actions"><button type="button" className="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={create.isPending || update.isPending || uploading} data-testid="button-save-movement">{create.isPending || update.isPending ? 'Guardando…' : 'Guardar movimiento'}</button></div>
        {(create.isError || update.isError) && <div className="error-note" style={{ marginTop: 12 }}>No se pudo guardar el movimiento.</div>}
      </form>
    </Panel>}
    <Panel title="Registro" subtitle={`${filtered.length} movimientos`}>
      <div className="filterbar">
        <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: '#89867e' }} /><input className="field search-field" style={{ paddingLeft: 32 }} placeholder="Buscar concepto o persona" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-movements" /></div>
        <select className="select-field" value={kind} onChange={e => setKind(e.target.value)} data-testid="select-movement-type"><option value="all">Todos los tipos</option>{Object.keys(typeLabels).slice(0, 5).map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#706e67', fontSize: 11 }}><input type="checkbox" checked={includeVoided} onChange={e => setIncludeVoided(e.target.checked)} data-testid="checkbox-include-voided" /> Mostrar anulados</label>
      </div>
      {query.isLoading ? <LoadingRows /> : query.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void query.refetch()} /></div> : filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Actividad / socio</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(m => <tr key={m.id} data-testid={`row-movement-${m.id}`}><td>{shortDate(m.date)}</td><td><strong>{m.concept}</strong>{m.categoryName && <div style={{ color: '#89867e', marginTop: 4 }}>{m.categoryName}</div>}</td><td>{typeLabels[m.type] || m.type}</td><td>{m.activityName || '—'}{m.partnerName && <div style={{ color: '#89867e', marginTop: 4 }}>{m.partnerName}</div>}</td><td className={`amount ${['income','partner_contribution','reimbursement'].includes(m.type) ? 'positive' : 'negative'}`}>{currency(m.amount)}</td><td><span className={`status-pill ${m.status === 'voided' ? 'voided' : 'scheduled'}`}>{m.status === 'voided' ? 'Anulado' : 'Activo'}</span></td><td><div className="actions"><button className="button icon-button" title="Editar" aria-label={`Editar ${m.concept}`} data-testid={`button-edit-movement-${m.id}`} disabled={m.status === 'voided'} onClick={() => editMovement(m)}><Settings2 size={14} /></button>{m.receiptPath && <ReceiptLink path={m.receiptPath} compact />}{m.status === 'active' && <button className="button icon-button button-danger" title="Anular" aria-label={`Anular ${m.concept}`} data-testid={`button-void-movement-${m.id}`} onClick={() => { const reason = window.prompt('Motivo de la anulación (se conserva el historial):'); if (reason?.trim()) voidMovement.mutate({ id: m.id, data: { reason: reason.trim() } }, { onSuccess: refresh }); }}><X size={14} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="El registro está despejado" detail="Añade el primer movimiento para llevar las cuentas del espacio." action={<button className="button button-primary" onClick={openNew}><Plus size={14} /> Registrar movimiento</button>} />}
    </Panel>
  </div>;
}

function MovementFields({ movement, categories, partners, activities }: { movement?: Movement; categories: Category[]; partners: Partner[]; activities: Activity[] }) {
  const [type, setType] = useState(movement?.type || 'income');
  const relevantCategories = categories.filter(c => c.appliesTo === 'both' || c.appliesTo === (type === 'income' ? 'income' : 'expense'));
  const needsPartner = ['partner_contribution', 'partner_expense', 'reimbursement'].includes(type);
  return <div className="form-grid">
    <Field label="Tipo"><select className="select-field" name="type" value={type} onChange={e => setType(e.target.value as typeof type)} data-testid="select-movement-form-type">{['income','expense','partner_contribution','partner_expense','reimbursement'].map(x => <option key={x} value={x}>{typeLabels[x]}</option>)}</select></Field>
    <Field label="Fecha"><input className="field" name="date" type="date" required defaultValue={movement?.date.slice(0, 10) || todayString()} data-testid="input-movement-date" /></Field>
    <Field label="Concepto" full><input className="field" name="concept" required defaultValue={movement?.concept || ''} placeholder="Descripción breve y clara" data-testid="input-movement-concept" /></Field>
    <Field label="Importe (€)"><input className="field" name="amount" type="number" min="0.01" step="0.01" required defaultValue={movement?.amount ?? ''} placeholder="0,00" data-testid="input-movement-amount" /></Field>
    <Field label="Categoría"><select className="select-field" name="categoryId" defaultValue={movement?.categoryId || ''} data-testid="select-movement-category"><option value="">Sin categoría</option>{relevantCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Actividad relacionada"><select className="select-field" name="activityId" defaultValue={movement?.activityId || ''} data-testid="select-movement-activity"><option value="">General del espacio</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    {needsPartner && <Field label="Socio relacionado"><select className="select-field" name="partnerId" required defaultValue={movement?.partnerId || ''} data-testid="select-movement-partner"><option value="">Selecciona un socio</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    <Field label="Notas internas" full><textarea className="textarea" name="notes" defaultValue={movement?.notes || ''} placeholder="Detalle útil para el equipo" data-testid="textarea-movement-notes" /></Field>
    {type === 'partner_expense' && <div className="full" style={{ gridColumn: '1 / -1', color: '#706e67', fontSize: 11 }}>Este gasto cuenta como gasto operativo y, a la vez, aumenta la deuda con el socio.</div>}
    {type === 'partner_contribution' && <div className="full" style={{ gridColumn: '1 / -1', color: '#706e67', fontSize: 11 }}>El aporte se registra en el ledger del socio; no se suma a los ingresos operativos.</div>}
    {type === 'reimbursement' && <div className="full" style={{ gridColumn: '1 / -1', color: '#706e67', fontSize: 11 }}>El reintegro reduce la deuda con el socio; no se contabiliza como gasto.</div>}
  </div>;
}

function ReceiptLink({ path, compact = false }: { path: string; compact?: boolean }) {
  const receiptQuery = useGetReceipt({ path }, { query: { queryKey: getGetReceiptQueryKey({ path }), enabled: !!path } });
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!receiptQuery.data) return;
    const next = URL.createObjectURL(receiptQuery.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [receiptQuery.data]);
  if (!url) return <span title="Cargando justificante" style={{ color: '#aaa69d', padding: 6 }}><Receipt size={14} /></span>;
  return <a className={`button ${compact ? 'icon-button' : ''}`} href={url} target="_blank" rel="noreferrer" title="Abrir justificante" aria-label="Abrir justificante" data-testid={`link-receipt-${encodeURIComponent(path)}`}><Receipt size={14} />{compact ? null : 'Ver justificante'}</a>;
}

function PartnersPage() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const list = useListPartners();
  const create = useCreatePartner();
  const update = useUpdatePartner();
  const ledger = useGetPartnerLedger(selectedId || 0, { query: { queryKey: getGetPartnerLedgerQueryKey(selectedId || 0), enabled: !!selectedId } });
  const refresh = () => { void qc.invalidateQueries({ queryKey: getListPartnersQueryKey() }); if (selectedId) void qc.invalidateQueries({ queryKey: getGetPartnerLedgerQueryKey(selectedId) }); };
  const partners = (list.data || []).filter(p => `${p.name} ${p.email || ''}`.toLowerCase().includes(search.toLowerCase()));
  function save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload: PartnerInput = { name: String(fd.get('name')), email: String(fd.get('email') || '') || null, phone: String(fd.get('phone') || '') || null, notes: String(fd.get('notes') || '') || null };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: () => { refresh(); setOpenForm(false); setEditing(null); } });
    else create.mutate({ data: payload }, { onSuccess: partner => { refresh(); setOpenForm(false); setSelectedId(partner.id); } });
  }
  return <div className="content">
    <PageHeading eyebrow="Personas y acuerdos" title="Socios" description="Información de contacto y cuenta corriente de quienes sostienen el espacio.">
      <button className="button button-primary" onClick={() => { setEditing(null); setOpenForm(!openForm); }} data-testid="button-new-partner"><Plus size={15} /> Añadir socio</button>
    </PageHeading>
    {openForm && <Panel title={editing ? 'Editar ficha' : 'Nuevo socio'} subtitle="Datos de contacto del equipo">
      <form className="inline-form" onSubmit={e => { e.preventDefault(); save(e.currentTarget); }}>
        <div className="form-grid"><Field label="Nombre"><input className="field" name="name" required defaultValue={editing?.name || ''} data-testid="input-partner-name" /></Field><Field label="Correo electrónico"><input className="field" name="email" type="email" defaultValue={editing?.email || ''} data-testid="input-partner-email" /></Field><Field label="Teléfono"><input className="field" name="phone" defaultValue={editing?.phone || ''} data-testid="input-partner-phone" /></Field><Field label="Notas" full><textarea className="textarea" name="notes" defaultValue={editing?.notes || ''} data-testid="textarea-partner-notes" /></Field></div>
        <div className="form-actions"><button type="button" className="button" onClick={() => setOpenForm(false)}>Cancelar</button><button className="button button-primary" disabled={create.isPending || update.isPending} data-testid="button-save-partner">{create.isPending || update.isPending ? 'Guardando…' : 'Guardar ficha'}</button></div>
      </form>
    </Panel>}
    <div className="detail-layout" style={{ marginTop: 15 }}>
      <Panel title="Equipo" subtitle={`${partners.length} socios`} action={<div style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', top: 11, left: 10, color: '#89867e' }} /><input className="field" style={{ width: 170, paddingLeft: 29 }} placeholder="Buscar socio" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-partners" /></div>}>
        {list.isLoading ? <LoadingRows /> : list.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void list.refetch()} /></div> : partners.length ? <div className="table-wrap"><table className="data-table" style={{ minWidth: 490 }}><thead><tr><th>Socio</th><th>Aportado</th><th>Gastos directos</th><th>Pendiente</th><th></th></tr></thead><tbody>{partners.map(p => <tr key={p.id} data-testid={`row-partner-${p.id}`} onClick={() => setSelectedId(p.id)} style={{ cursor: 'pointer', background: selectedId === p.id ? '#f4f0e7' : undefined }}><td><strong>{p.name}</strong><div style={{ color: '#89867e', marginTop: 4 }}>{p.email || p.phone || 'Sin contacto'}</div></td><td className="amount">{currency(p.totalContributed)}</td><td className="amount">{currency(p.directExpenses)}</td><td className="amount" style={{ color: p.balanceDue > 0 ? '#a65d48' : '#66745a' }}>{currency(p.balanceDue)}</td><td><button className="button icon-button" aria-label={`Editar ${p.name}`} title="Editar ficha" data-testid={`button-edit-partner-${p.id}`} onClick={e => { e.stopPropagation(); setEditing(p); setOpenForm(true); }}><Settings2 size={14} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="Un equipo por conocer" detail="Añade socios para llevar sus aportes, gastos y reintegros." action={<button className="button button-primary" onClick={() => setOpenForm(true)}><Plus size={14} /> Añadir socio</button>} />}
      </Panel>
      <Panel title={ledger.data?.partner.name || 'Cuenta del socio'} subtitle={ledger.data ? 'Aportes, gastos pagados y reintegros' : 'Selecciona a una persona para consultar su ledger'}>
        {!selectedId ? <EmptyState title="El ledger, en contexto" detail="El historial financiero individual se muestra al elegir un socio." icon={Wallet} /> : ledger.isLoading ? <LoadingRows /> : ledger.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void ledger.refetch()} /></div> : ledger.data ? <>
          <div className="balance-card" style={{ margin: 14 }}><div className="eyebrow">Pendiente de reintegro</div><div className="balance-big" style={{ color: ledger.data.partner.balanceDue > 0 ? '#a65d48' : '#66745a' }}>{currency(ledger.data.partner.balanceDue)}</div><p>Gastos pagados directamente por el socio, menos reintegros realizados. Los aportes quedan registrados aparte.</p></div>
          <div className="panel-body">{ledger.data.movements.length ? ledger.data.movements.map(m => <MovementRow key={m.id} movement={m} />) : <EmptyState title="Sin actividad en la cuenta" detail="Los movimientos vinculados a este socio aparecerán aquí." />}</div>
        </> : null}
      </Panel>
    </div>
    {selectedId && ledger.data && <div className="metric-grid" style={{ marginTop: 15 }}><Metric label="Aportes" value={currency(ledger.data.partner.totalContributed)} hint="No son ingresos operativos" icon={ArrowDownLeft} /><Metric label="Gastos directos" value={currency(ledger.data.partner.directExpenses)} hint="Pagados por el socio" icon={Receipt} /><Metric label="Reintegros" value={currency(ledger.data.partner.reimbursements)} hint="Reducen la deuda" icon={Check} /><Metric label="Pendiente" value={currency(ledger.data.partner.balanceDue)} hint="A devolver al socio" icon={HandCoins} dark /></div>}
  </div>;
}

function ReportsPage() {
  const qc = useQueryClient();
  const defaultRange = monthRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const report = useGetReports(params, { query: { queryKey: getGetReportsQueryKey(params) } });
  const exportQuery = useExportMovementsCsv(params, { query: { enabled: false, queryKey: getExportMovementsCsvQueryKey(params) } });
  const [exportPending, setExportPending] = useState(false);
  useEffect(() => {
    if (!exportPending || !exportQuery.data) return;
    const blob = new Blob([exportQuery.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vergara-movimientos-${from}-${to}.csv`; anchor.click();
    URL.revokeObjectURL(url); setExportPending(false);
  }, [exportPending, exportQuery.data, from, to]);
  const result = report.data;
  const maxCat = Math.max(1, ...(result?.expensesByCategory || []).map(c => c.amount));
  return <div className="content">
    <PageHeading eyebrow="Lectura económica" title="Informes" description="Una lectura del período; el resultado no equivale al saldo de caja.">
      <button className="button" disabled={exportQuery.isFetching} onClick={() => { setExportPending(true); void exportQuery.refetch(); }} data-testid="button-export-csv"><Download size={14} />{exportQuery.isFetching ? 'Preparando…' : 'Exportar CSV'}</button>
    </PageHeading>
    <div className="filterbar" style={{ border: '1px solid #ded8cd', borderRadius: 9, background: '#fcfaf5', marginBottom: 15 }}>
      <label style={{ fontSize: 10, color: '#706e67' }}>Desde <input className="field" type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-report-from" /></label>
      <label style={{ fontSize: 10, color: '#706e67' }}>Hasta <input className="field" type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-report-to" /></label>
      <span style={{ marginLeft: 'auto', color: '#89867e', fontSize: 10 }}>Período de movimientos activos</span>
    </div>
    {report.isError && <QueryError retry={() => void report.refetch()} />}
    {report.isLoading ? <div className="metric-grid">{[1, 2, 3].map(i => <div className="metric-card" key={i}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 20, width: '70%', height: 25 }} /></div>)}</div> : result && <>
      <Panel title="Resumen del período" subtitle={`${longDate(from)} — ${longDate(to)}`}>
        <div className="report-total"><div><span>Ingresos operativos</span><strong style={{ color: '#66745a' }}>{currency(result.incomeTotal)}</strong></div><div><span>Gastos operativos</span><strong style={{ color: '#a65d48' }}>{currency(result.expenseTotal)}</strong></div><div><span>Resultado</span><strong>{currency(result.result)}</strong></div><div><span>Gastos generales</span><strong>{currency(result.generalExpenses)}</strong></div></div>
        <div style={{ padding: '12px 20px', color: '#89867e', fontSize: 10 }}>Los aportes de socios no se consideran ingresos operativos. Los gastos pagados por socios sí forman parte de los gastos. Los reintegros no son gastos.</div>
      </Panel>
      <div className="dashboard-grid" style={{ marginTop: 15 }}>
        <Panel title="Gastos por categoría" subtitle="Distribución del gasto operativo">
          {result.expensesByCategory.length ? <div style={{ padding: '18px 22px 31px' }}>{result.expensesByCategory.map((category, index) => <div key={category.categoryName} style={{ marginBottom: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 7 }}><span>{category.categoryName}</span><span className="amount">{currency(category.amount)}</span></div><div style={{ height: 6, background: '#eee9e0', borderRadius: 10 }}><div style={{ width: `${Math.max(3, category.amount / maxCat * 100)}%`, height: 6, borderRadius: 10, background: ['#a47c55','#66745a','#a65d48','#b9a994'][index % 4] }} /></div></div>)}</div> : <EmptyState title="Sin categorías en el período" detail="Cuando haya gastos clasificados, verás aquí su distribución." /> }
        </Panel>
        <Panel title="Actividad y resultado" subtitle={`${result.activities.length} actividades con movimientos`}>
          <div className="panel-body">{result.activities.length ? result.activities.map(activity => <Link key={activity.activityId} href={`/actividades/${activity.activityId}`} className="list-row" style={{ textDecoration: 'none' }} data-testid={`row-report-activity-${activity.activityId}`}><div className="row-main"><div className="row-title">{activity.activityName}</div><div className="row-detail">{shortDate(activity.date)} · Ingresos {currency(activity.income)} · Gastos {currency(activity.expense)}</div></div><div className="row-trailing">{currency(activity.result)}</div></Link>) : <EmptyState title="Sin actividad económica" detail="Los resultados por actividad aparecerán cuando se vinculen movimientos." />}</div>
        </Panel>
      </div>
      <Panel title="Cuentas de socios" subtitle="Gastos directos y deuda pendiente" className="report-partners" >
        {result.partners.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Socio</th><th>Aportado</th><th>Gastos pagados directamente</th><th>Reintegrado</th><th>Pendiente</th></tr></thead><tbody>{result.partners.map(p => <tr key={p.id}><td>{p.name}</td><td className="amount">{currency(p.totalContributed)}</td><td className="amount">{currency(p.directExpenses)}</td><td className="amount">{currency(p.reimbursements)}</td><td className="amount">{currency(p.balanceDue)}</td></tr>)}</tbody></table></div> : <EmptyState title="Sin cuentas de socios" detail="No hay movimientos de socios en este período." />}
      </Panel>
      <Panel title="Evolución de la deuda con socios" subtitle="Histórico de importes pendientes" >
        {result.debtHistory.length ? <div className="chart-bars">{result.debtHistory.slice(-12).map((point, i) => <div className="bar-group" key={`${point.date}-${i}`}><div className="bar" style={{ height: `${Math.max(4, point.amount / Math.max(1, ...result.debtHistory.map(d => d.amount)) * 85)}%` }} /><span className="chart-label">{shortDate(point.date)}</span></div>)}</div> : <EmptyState title="Sin historial de deuda" detail="La evolución aparecerá cuando haya gastos directos y reintegros." /> }
        <div style={{ height: 30 }} />
      </Panel>
    </>}
  </div>;
}

function ActivityDetailPage() {
  const params = useActivityParams();
  const id = Number(params.id);
  const query = useGetActivity(id, { query: { queryKey: getGetActivityQueryKey(id), enabled: Number.isFinite(id) && id > 0 } });
  const qc = useQueryClient();
  const update = useUpdateActivity();
  const cancel = useCancelActivity();
  const duplicate = useDuplicateActivity();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState('');
  const activity = query.data?.activity;
  function save(form: HTMLFormElement) {
    if (!activity) return;
    const fd = new FormData(form);
    update.mutate({ id, data: {
      name: String(fd.get('name')), type: String(fd.get('type')) as Activity['type'], date: String(fd.get('date')),
      startTime: String(fd.get('startTime') || '') || null, endTime: String(fd.get('endTime') || '') || null,
      responsible: String(fd.get('responsible') || '') || null, description: String(fd.get('description') || '') || null,
      notes: String(fd.get('notes') || '') || null, pendingTasks: String(fd.get('pendingTasks') || '').split('\n').map(s => s.trim()).filter(Boolean),
    } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetActivityQueryKey(id) }); void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); setEditing(false); } });
  }
  if (query.isLoading) return <AppShell page="agenda"><div className="content"><LoadingRows /></div></AppShell>;
  if (query.isError || !activity) return <AppShell page="agenda"><div className="content"><QueryError retry={() => void query.refetch()} /><Link href="/agenda" className="button" style={{ marginTop: 15 }}><ArrowLeft size={14} /> Volver a agenda</Link></div></AppShell>;
  return <AppShell page="agenda"><div className="content">
    <Link href="/agenda" className="button button-quiet" style={{ marginBottom: 18 }} data-testid="link-back-agenda"><ArrowLeft size={14} /> Agenda</Link>
    {editing ? <Panel title="Editar actividad" subtitle="Actualiza los detalles de la sala"><form className="inline-form" onSubmit={e => { e.preventDefault(); save(e.currentTarget); }}><ActivityFields activity={activity} /><div className="form-actions"><button type="button" className="button" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" disabled={update.isPending} data-testid="button-save-activity-edit">Guardar cambios</button></div></form></Panel> : <div className="page-heading"><div className="detail-hero" style={{ flex: 1 }}><div className="eyebrow">{typeLabels[activity.type]} · {activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</div><h2>{activity.name}</h2><p>{activity.description || 'Una actividad en el corazón de Espacio Vergara.'}</p><div className="detail-meta"><span><CalendarDays size={14} />{longDate(activity.date)}</span>{activity.startTime && <span>{activity.startTime}{activity.endTime ? `–${activity.endTime}` : ''}</span>}{activity.responsible && <span><Users size={14} />{activity.responsible}</span>}</div></div><div className="actions" style={{ alignSelf: 'flex-start' }}><button className="button" onClick={() => setEditing(true)} data-testid="button-edit-activity"><Settings2 size={14} /> Editar</button>{activity.status === 'scheduled' && <button className="button button-danger" onClick={() => { if (window.confirm(`¿Cancelar «${activity.name}»?`)) cancel.mutate({ id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetActivityQueryKey(id) }); void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); } }); }} data-testid="button-cancel-activity">Cancelar</button>}</div></div>}
    <div className="detail-layout" style={{ marginTop: 15 }}>
      <Panel title="Movimientos relacionados" subtitle="Ingresos y gastos vinculados a esta actividad">
        <div className="report-total"><div><span>Ingresos</span><strong style={{ color: '#66745a' }}>{currency(query.data.incomeTotal)}</strong></div><div><span>Gastos</span><strong style={{ color: '#a65d48' }}>{currency(query.data.expenseTotal)}</strong></div><div><span>Resultado</span><strong>{currency(query.data.result)}</strong></div></div>
        <div className="panel-body">{query.data.movements.length ? query.data.movements.map(m => <MovementRow key={m.id} movement={m} />) : <EmptyState title="Sin movimientos relacionados" detail="Vincula ingresos o gastos desde el registro de movimientos." />}</div>
      </Panel>
      <div style={{ display: 'grid', alignContent: 'start', gap: 15 }}>
        <Panel title="Tareas pendientes" subtitle={`${activity.pendingTasks.length} por atender`}><div className="panel-body">{activity.pendingTasks.length ? activity.pendingTasks.map((task, i) => <div className="list-row" key={`${task}-${i}`}><span className="empty-mark" style={{ width: 25, height: 25, margin: 0 }}><Check size={12} /></span><div className="row-main">{task}</div></div>) : <EmptyState title="Todo al día" detail="No hay tareas pendientes para esta actividad." />}</div></Panel>
        <div className="panel" style={{ padding: 18 }}><div className="eyebrow">Repetir actividad</div><p style={{ color: '#706e67', fontSize: 11, lineHeight: 1.5 }}>Crea una nueva fecha con estos mismos detalles.</p><div style={{ display: 'flex', gap: 8 }}><input className="field" type="date" value={duplicateDate} onChange={e => setDuplicateDate(e.target.value)} data-testid="input-detail-duplicate-date" /><button className="button" disabled={!duplicateDate || duplicate.isPending} onClick={() => duplicate.mutate({ id, data: { date: duplicateDate } }, { onSuccess: activityCopy => { void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); setLocation(`/actividades/${activityCopy.id}`); } })} data-testid="button-detail-duplicate"><Plus size={14} /></button></div></div>
        {activity.notes && <Panel title="Notas internas"><div className="panel-body" style={{ paddingTop: 14, fontSize: 12, color: '#706e67', lineHeight: 1.6 }}>{activity.notes}</div></Panel>}
      </div>
    </div>
  </div></AppShell>;
}

function useActivityParams() {
  // Keep the routed identifier typed and scoped to this route.
  const [location] = useLocation();
  const match = location.match(/\/actividades\/(\d+)/);
  return { id: match?.[1] || '' };
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary resetKey={window.location.pathname}><ClerkProviderWithRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
