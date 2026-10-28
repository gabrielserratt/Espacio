import { type FormEvent, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  Check, CircleDollarSign, ClipboardList, Download, FileText, HandCoins, HeartHandshake,
  BookOpen, LayoutDashboard, LogOut, Plus, Receipt, Search, Settings2, Users, Wallet, X,
} from 'lucide-react';
import {
  getGetActivityQueryKey, getGetDashboardQueryKey, getGetPartnerLedgerQueryKey,
  getGetReportsQueryKey, getListActivitiesQueryKey, getMovementsScreenQueryKey,
  getListPartnersQueryKey, getExportMovementsCsvQueryKey,
  useCancelActivity, useCreateActivity, useCreateCategory, useCreateMovement, useCreatePartner,
  useDuplicateActivity, useExportMovementsCsv, useGetActivity, useGetDashboard, useGetPartnerLedger,
  useGetReports, useListActivities, useListPartners, useMovementsScreen, useUpdateActivity,
  useUpdateMovement, useUpdatePartner, useVoidMovement,
} from '@/lib/use-sheet';
import {
  clearSession, readSession, saveSession, sheet,
  type Activity, type ActivityInput, type Category, type Movement, type MovementInput,
  type Partner, type PartnerInput, type Session,
} from '@/lib/sheet';
import {
  Link, Redirect, Route, Switch, useLocation, Router as WouterRouter,
} from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

const SessionContext = createContext<{
  session: Session | null;
  signIn: (user: string, password: string) => Promise<void>;
  signOut: () => void;
} | null>(null);

function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('La sesión no está disponible.');
  return value;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const signIn = async (user: string, password: string) => {
    const next = { user: user.trim(), password };
    await sheet('login', {}, next);
    saveSession(next);
    setSession(next);
  };
  const signOut = () => {
    clearSession();
    setSession(null);
    queryClient.clear();
  };
  return <SessionContext.Provider value={{ session, signIn, signOut }}>{children}</SessionContext.Provider>;
}

function useHashLocation(): [string, (to: string, options?: { replace?: boolean }) => void] {
  const read = () => {
    const hash = window.location.hash.replace(/^#/, '');
    return hash.startsWith('/') ? hash : '/';
  };
  const [location, setLocationState] = useState(read);
  useEffect(() => {
    const onChange = () => setLocationState(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = (to: string, options?: { replace?: boolean }) => {
    const next = to.startsWith('/') ? to : `/${to}`;
    if (options?.replace) window.history.replaceState(null, '', `#${next}`);
    else window.location.hash = next;
    setLocationState(next);
  };
  return [location, navigate];
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
const currency = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0));
const formatAmountInput = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatThousandsInput = (raw: string) => {
  const cleaned = raw.replace(/\./g, '').replace(/[^\d,]/g, '');
  const comma = cleaned.indexOf(',');
  const whole = (comma === -1 ? cleaned : cleaned.slice(0, comma)).replace(/^0+(?=\d)/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (comma === -1) return grouped;
  return `${grouped || '0'},${cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 2)}`;
};
const parseAmount = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'));
const shortDate = (date?: string | null) => date ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(`${date.slice(0, 10)}T12:00:00`)) : '—';
const longDate = (date?: string | null) => date ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00`)) : '—';
const todayString = () => new Date().toISOString().slice(0, 10);
const notebookToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const pick = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};
const slashDate = (date?: string | null) => {
  if (!date) return '';
  const [, month, day] = date.slice(0, 10).split('-');
  return `${Number(day)}/${Number(month)}`;
};
const notebookMoney = (amount: number) => {
  const negative = amount < 0;
  const abs = Math.abs(Number(amount) || 0);
  const cents = Math.round(abs * 100) % 100 !== 0;
  const formatted = new Intl.NumberFormat('es-AR', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(abs);
  return `${negative ? '−' : ''}$${formatted}`;
};
const notebookOrder = (a: Movement, b: Movement) => a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;
const notebookLabel = (movement: Movement) => movement.type !== 'income' && movement.partnerName ? `${movement.partnerName} - ${movement.concept}` : movement.concept;
const notebookCents = (value: number) => Math.round(value * 100) / 100;
function pendingNotebookExpenses(lines: Movement[]) {
  const open = lines.filter(movement => movement.type === 'partner_expense').sort(notebookOrder).map(movement => ({ movement, remaining: movement.amount }));
  const repayments = lines.filter(movement => movement.type === 'reimbursement').sort(notebookOrder);
  for (const repayment of repayments) {
    let credit = repayment.amount;
    const apply = (matches: (movement: Movement) => boolean) => {
      for (const line of open) {
        if (credit <= 0) return;
        if (line.remaining <= 0 || !matches(line.movement)) continue;
        const used = Math.min(credit, line.remaining);
        line.remaining = notebookCents(line.remaining - used);
        credit = notebookCents(credit - used);
      }
    };
    const concept = repayment.concept.trim().toLowerCase();
    apply(movement => movement.partnerId != null && movement.partnerId === repayment.partnerId && movement.concept.trim().toLowerCase() === concept);
    apply(movement => movement.partnerId != null && movement.partnerId === repayment.partnerId);
  }
  return open.filter(line => line.remaining > 0);
}
const clockTime = (value?: string | null) => {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};
const timeLabel = (start?: string | null, end?: string | null) => {
  const from = clockTime(start);
  const to = clockTime(end);
  if (!from) return '';
  return to ? `${from}–${to}` : from;
};
const monthRange = () => {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10) };
};
const typeLabels: Record<string, string> = {
  income: 'Ingreso', expense: 'Gasto', partner_contribution: 'Aporte de un miembro',
  partner_expense: 'Gasto pagado por un miembro', reimbursement: 'Reintegro',
  event: 'Evento', class: 'Clase', workshop: 'Taller', rehearsal: 'Ensayo',
  meeting: 'Reunión', maintenance: 'Mantenimiento', other: 'Otro',
};

function Home() {
  const { session } = useSession();
  if (session) return <Redirect to="/inicio" />;
  return <div className="landing">
    <nav className="landing-nav">
      <Brand />
      <Link href="/sign-in" className="button" data-testid="link-sign-in">Entrar <ArrowRight size={14} /></Link>
    </nav>
    <main className="landing-main">
      <div className="landing-copy">
        <div className="landing-kicker">Casa Lupanal · Uso interno</div>
        <h1>Agenda, cuentas<br />y miembros.</h1>
        <p>Para cargar lo de la sala y llevar las cuentas de la compañía.</p>
        <div className="landing-cta">
          <Link href="/sign-in" className="button button-primary" data-testid="link-access">Entrar <ArrowRight size={15} /></Link>
          <span style={{ color: '#8A8478', fontSize: 11 }}>Uso interno</span>
        </div>
      </div>
      <div className="landing-visual" aria-label="Ilustración abstracta de una sala" role="img">
        <div className="visual-frame" /><div className="visual-inner"><div className="visual-sun" /><div className="visual-floor" /></div>
        <div className="visual-caption">USO INTERNO</div>
      </div>
    </main>
    <footer className="landing-foot"><span>Casa Lupanal</span><span>Gestión interna</span><span>Agenda · Cuentas · Miembros</span></footer>
  </div>;
}

function TheaterMasks() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="15.2" cy="9.4" rx="5.6" ry="6.6" fill="#E2B657" />
    <circle cx="13.3" cy="8.2" r="0.75" fill="#2C2A26" />
    <circle cx="17.1" cy="8.2" r="0.75" fill="#2C2A26" />
    <path d="M13 11.6c1.3-1 3.1-1 4.4 0" fill="none" stroke="#2C2A26" strokeWidth="1.1" strokeLinecap="round" />
    <ellipse cx="9" cy="14.6" rx="5.6" ry="6.6" fill="#FFFCF7" />
    <circle cx="7.1" cy="13.4" r="0.75" fill="#2C2A26" />
    <circle cx="10.9" cy="13.4" r="0.75" fill="#2C2A26" />
    <path d="M6.8 16.4c1.3 1.1 3.1 1.1 4.4 0" fill="none" stroke="#2C2A26" strokeWidth="1.1" strokeLinecap="round" />
  </svg>;
}

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand">
    <span className="brand-mark"><TheaterMasks /></span>
    <span className="brand-name">Casa Lupanal<span className="brand-caption">Uso interno</span></span>
  </Link>;
}

function SignInPage() {
  const { signIn } = useSession();
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setPending(true);
    setError('');
    try {
      await signIn(String(data.get('user') || ''), String(data.get('password') || ''));
      setLocation('/inicio');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }
  return <div className="auth-screen">
    <aside className="auth-aside"><Brand /><div><div className="eyebrow">Ingreso</div><h1>Agenda, movimientos y miembros.</h1><p>Tu nombre y la contraseña de la casa.</p></div><span className="eyebrow">Uso interno</span></aside>
    <div className="auth-form-side"><div className="auth-card">
      <Link href="/" className="auth-back" data-testid="link-back-home">← Volver al inicio</Link>
      <div style={{ height: 28 }} />
      <h2>Ingreso</h2>
      <p>Tu nombre y la contraseña de la casa.</p>
      <form onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }} style={{ display: 'grid', gap: 12 }}>
        <Field label="Nombre"><input className="field" name="user" required autoComplete="username" data-testid="input-user" /></Field>
        <Field label="Contraseña"><input className="field" name="password" type="password" required autoComplete="current-password" data-testid="input-password" /></Field>
        {error && <div className="error-note">{error}</div>}
        <button className="button button-primary" disabled={pending} data-testid="button-sign-in">{pending ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div></div>
  </div>;
}

function AppRoutes() {
  return <Switch>
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/" component={Home} />
    <Route path="/inicio"><Protected><AppShell page="inicio"><DashboardPage /></AppShell></Protected></Route>
    <Route path="/agenda"><Protected><AppShell page="agenda"><AgendaPage /></AppShell></Protected></Route>
    <Route path="/movimientos"><Protected><AppShell page="movimientos"><MovementsPage /></AppShell></Protected></Route>
    <Route path="/verdu"><Protected><AppShell page="verdu"><NotebookPage /></AppShell></Protected></Route>
    <Route path="/socios"><Protected><AppShell page="socios"><PartnersPage /></AppShell></Protected></Route>
    <Route path="/informes"><Protected><AppShell page="informes"><ReportsPage /></AppShell></Protected></Route>
    <Route path="/actividades/:id"><Protected><ActivityDetailPage /></Protected></Route>
    <Route component={NotFound} />
  </Switch>;
}

function Protected({ children }: { children: ReactNode }) {
  const { session } = useSession();
  if (!session) return <Redirect to="/" />;
  return <>{children}</>;
}

const navItems = [
  { path: '/inicio', label: 'Inicio', icon: LayoutDashboard },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  { path: '/movimientos', label: 'Movimientos', icon: CircleDollarSign },
  { path: '/verdu', label: 'Verdu de Pachu', icon: BookOpen },
  { path: '/socios', label: 'Miembros', icon: Users },
  { path: '/informes', label: 'Informes', icon: FileText },
];

function AppShell({ page, children }: { page: string; children: ReactNode }) {
  const { session, signOut } = useSession();
  const [, setLocation] = useLocation();
  const initials = (session?.user?.[0] || 'V').toUpperCase();
  return <div className="workspace">
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
          <div><div className="nav-label">Menú</div><nav className="nav-list">
          {navItems.map(item => <Link key={item.path} href={item.path} className={`nav-link ${page === item.path.slice(1) ? 'active' : ''}`} data-testid={`link-nav-${item.path.slice(1)}`}><item.icon size={16} strokeWidth={1.7} /><span>{item.label}</span></Link>)}
        </nav></div>
        <div className="sidebar-bottom">
          <div className="venue-note"><strong>Uso interno</strong>Agenda, movimientos y cuentas de los miembros.</div>
          <div className="user-line"><span className="user-initial">{initials}</span><div className="user-meta">{session?.user || 'Casa Lupanal'}<small>Casa conectada</small></div><button className="logout" aria-label="Cerrar sesión" data-testid="button-sign-out" onClick={() => { signOut(); setLocation('/'); }}><LogOut size={15} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span style={{ color: '#A39E94' }}>Casa Lupanal</span><span style={{ padding: '0 8px' }}>/</span>{navItems.find(item => item.path === `/${page}`)?.label || 'Actividad'}</div>
          <div className="topbar-right" data-testid="text-signed-in-user"><span className="today-chip">{session?.user || 'Casa Lupanal'}</span></div>
        </header>
        {children}
      </main>
    </div>
    <nav className="mobile-nav">{navItems.map(item => <Link key={item.path} href={item.path} className={page === item.path.slice(1) ? 'active' : ''} data-testid={`mobile-nav-${item.path.slice(1)}`}><item.icon size={17} /><span>{item.label}</span></Link>)}</nav>
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
    <PageHeading eyebrow={`Resumen · ${month}`} title="Inicio" description="Ingresos, gastos y actividades del mes." />
    {isError && <QueryError retry={() => void refetch()} />}
    {isLoading ? <div className="metric-grid">{[1, 2, 3, 4].map(i => <div className="metric-card" key={i}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 24, width: '65%', height: 25 }} /></div>)}</div> : data && <>
      <section className="metric-grid">
        <Metric label="Ingresos del mes" value={currency(data.monthIncome)} hint="Ingresos operativos" icon={ArrowDownLeft} />
        <Metric label="Gastos del mes" value={currency(data.monthExpenses)} hint="Gastos operativos" icon={ArrowUpRight} />
        <Metric label="Resultado del mes" value={currency(data.monthResult)} hint="Ingresos menos gastos" icon={Wallet} dark />
        <Metric label="A devolver" value={currency(data.partnerDebt)} hint="Saldo con los miembros" icon={HandCoins} />
      </section>
      <div style={{ color: '#8A8478', fontSize: 11, margin: '-6px 0 12px' }}>Resultado económico; no representa el saldo de caja. Los aportes no son ingresos operativos.</div>
      <div className="dashboard-grid">
        <Panel title="Próximas actividades" subtitle="Lo cargado de acá en adelante" action={<Link href="/agenda" className="button button-quiet" data-testid="link-agenda-all">Ver agenda <ArrowRight size={13} /></Link>}>
          <div className="panel-body">{data.upcomingActivities?.length ? data.upcomingActivities.slice(0, 5).map(activity => <ActivityRow key={activity.id} activity={activity} />) : <EmptyState title="Sin actividades próximas" detail="Cuando se cargue una, aparece acá." action={<Link href="/agenda" className="button" data-testid="link-add-activity-empty"><Plus size={14} /> Añadir actividad</Link>} />}</div>
        </Panel>
        <Panel title="Últimos movimientos" subtitle="Los más recientes" action={<Link href="/movimientos" className="button button-quiet" data-testid="link-movements-all">Ver todos <ArrowRight size={13} /></Link>}>
          <div className="panel-body">{data.recentMovements?.length ? data.recentMovements.slice(0, 5).map(movement => <MovementRow movement={movement} key={movement.id} />) : <EmptyState title="Sin movimientos" detail="Los ingresos y gastos van a aparecer acá." />}</div>
        </Panel>
      </div>
      <div className="panel" style={{ marginTop: 12, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}><div className="empty-mark" style={{ margin: 0, flexShrink: 0, width: 30, height: 30 }}><HeartHandshake size={14} /></div><div><div style={{ fontSize: 12, fontWeight: 600 }}>Resultado acumulado</div><div style={{ font: '16px var(--app-font-mono)', marginTop: 2 }}>{currency(data.accumulatedResult)}</div><div style={{ fontSize: 10, color: '#8A8478', marginTop: 2 }}>Del año. No es el dinero en caja.</div></div></div>
    </>}
  </div>;
}

function Metric({ label, value, hint, icon: Icon, dark = false }: { label: string; value: string; hint: string; icon: typeof Wallet; dark?: boolean }) {
  return <div className={`metric-card ${dark ? 'primary-metric' : ''}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><Icon size={14} /></div><div className="metric-value">{value}</div><div className="metric-foot">{hint}</div></div>;
}

function ActivityRow({ activity }: { activity: Activity }) {
  return <Link href={`/actividades/${activity.id}`} className="list-row" data-testid={`row-upcoming-${activity.id}`} style={{ textDecoration: 'none' }}>
    <div className="row-date"><strong>{new Date(`${activity.date.slice(0, 10)}T12:00:00`).getDate()}</strong>{new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(`${activity.date.slice(0, 10)}T12:00:00`))}</div>
    <div className="row-main"><div className="row-title">{activity.name}</div><div className="row-detail">{typeLabels[activity.type] || activity.type}{timeLabel(activity.startTime, activity.endTime) ? ` · ${timeLabel(activity.startTime, activity.endTime)}` : ''}{activity.responsible ? ` · ${activity.responsible}` : ''}</div></div>
    <span className={`status-pill ${activity.status}`}>{activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</span>
  </Link>;
}

function MovementRow({ movement }: { movement: Movement }) {
  const isPositive = movement.type === 'income' || movement.type === 'partner_contribution' || movement.type === 'reimbursement';
  return <div className="list-row" data-testid={`row-movement-${movement.id}`}>
    <div className="row-date">{shortDate(movement.date)}</div><div className="row-main"><div className="row-title">{movement.concept}</div><div className="row-detail">{typeLabels[movement.type] || movement.type}{movement.partnerName ? ` · ${movement.partnerName}` : ''}</div></div>
    <div className={`row-trailing amount-chip ${movement.status === 'voided' ? 'voided' : isPositive ? 'positive' : 'negative'}`}>{movement.status === 'voided' ? 'Anulado' : `${isPositive ? '+' : '−'}${currency(movement.amount)}`}</div>
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
    <PageHeading eyebrow="Sala" title="Agenda" description="Actividades cargadas." >
      <button className="button button-primary" data-testid="button-new-activity" onClick={() => setShowForm(!showForm)}><Plus size={15} /> Nueva actividad</button>
    </PageHeading>
    {showForm && <Panel title="Añadir actividad" subtitle="Fecha, horario y responsable."><form className="inline-form" onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }}>
      <ActivityFields />
      <div className="form-actions"><button type="button" className="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={createActivity.isPending} data-testid="button-save-activity">{createActivity.isPending ? 'Guardando…' : 'Guardar actividad'}</button></div>
      {createActivity.isError && <div className="error-note" style={{ marginTop: 12 }}>{errorText(createActivity.error)}</div>}
    </form></Panel>}
    <Panel title="Actividades" subtitle={`${filtered.length} en la agenda`}>
      <div className="filterbar"><div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: '#8A8478' }} /><input className="field search-field" style={{ paddingLeft: 32 }} placeholder="Buscar actividad" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-activities" /></div><select className="select-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="select-activity-status"><option value="all">Todos los estados</option><option value="scheduled">Programadas</option><option value="completed">Realizadas</option><option value="cancelled">Canceladas</option></select></div>
      {isLoading ? <LoadingRows /> : isError ? <div style={{ padding: 16 }}><QueryError retry={() => void refetch()} /></div> : filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Actividad</th><th>Tipo / responsable</th><th>Estado</th><th>Repetir en</th><th>Acciones</th></tr></thead><tbody>{filtered.map(activity => <tr key={activity.id} data-testid={`row-activity-${activity.id}`}><td>{longDate(activity.date)}{timeLabel(activity.startTime, activity.endTime) && <div style={{ color: '#8A8478', marginTop: 4 }}>{timeLabel(activity.startTime, activity.endTime)}</div>}</td><td><Link href={`/actividades/${activity.id}`} style={{ color: '#2C2A26', fontWeight: 600, textDecoration: 'none' }}>{activity.name}</Link></td><td>{typeLabels[activity.type] || activity.type}<div style={{ color: '#8A8478', marginTop: 4 }}>{activity.responsible || 'Sin responsable'}</div></td><td><span className={`status-pill ${activity.status}`}>{activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</span></td><td><input className="field" type="date" value={duplicateDate[activity.id] || ''} onChange={e => setDuplicateDate({ ...duplicateDate, [activity.id]: e.target.value })} aria-label={`Nueva fecha para duplicar ${activity.name}`} data-testid={`input-duplicate-date-${activity.id}`} /></td><td><div className="actions"><button className="button icon-button" title="Duplicar" aria-label={`Duplicar ${activity.name}`} disabled={!duplicateDate[activity.id] || duplicate.isPending} data-testid={`button-duplicate-${activity.id}`} onClick={() => duplicate.mutate({ id: activity.id, data: { date: duplicateDate[activity.id] } }, { onSuccess: refresh })}><Plus size={14} /></button>{activity.status === 'scheduled' && <button className="button icon-button button-danger" title="Cancelar actividad" aria-label={`Cancelar ${activity.name}`} data-testid={`button-cancel-${activity.id}`} onClick={() => { if (window.confirm(`¿Cancelar «${activity.name}»?`)) cancel.mutate({ id: activity.id }, { onSuccess: refresh }); }}><X size={14} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Sin actividades" detail="No hay actividades con este filtro." action={<button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Nueva actividad</button>} />}
    </Panel>
  </div>;
}

function ActivityFields({ activity }: { activity?: Activity } = {}) {
  return <div className="form-grid">
    <Field label="Nombre" full><input className="field" name="name" required defaultValue={activity?.name} placeholder="Ej. Taller de cerámica" data-testid="input-activity-name" /></Field>
    <Field label="Tipo"><select className="select-field" name="type" defaultValue={activity?.type || 'event'} data-testid="select-activity-type">{['event', 'class', 'workshop', 'rehearsal', 'meeting', 'maintenance', 'other'].map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></Field>
    <Field label="Fecha"><input className="field" type="date" name="date" required defaultValue={activity?.date.slice(0, 10) || todayString()} data-testid="input-activity-date" /></Field>
    <Field label="Hora de inicio"><input className="field" type="time" name="startTime" defaultValue={clockTime(activity?.startTime)} data-testid="input-activity-start" /></Field>
    <Field label="Hora de fin"><input className="field" type="time" name="endTime" defaultValue={clockTime(activity?.endTime)} data-testid="input-activity-end" /></Field>
    <Field label="Responsable"><input className="field" name="responsible" defaultValue={activity?.responsible || ''} placeholder="Persona responsable" data-testid="input-activity-responsible" /></Field>
    <Field label="Repetición"><select className="select-field" name="recurrence" defaultValue="none" data-testid="select-activity-recurrence"><option value="none">No repetir</option><option value="weekly">Cada semana</option><option value="biweekly">Cada dos semanas</option><option value="monthly">Cada mes</option></select></Field>
    <Field label="Número de fechas"><input className="field" type="number" name="recurrenceCount" min="1" max="24" defaultValue="1" data-testid="input-recurrence-count" /></Field>
    <Field label="Descripción" full><textarea className="textarea" name="description" defaultValue={activity?.description || ''} placeholder="Detalle" data-testid="textarea-activity-description" /></Field>
    <Field label="Tareas pendientes · una por línea" full><textarea className="textarea" name="pendingTasks" defaultValue={activity?.pendingTasks?.join('\n') || ''} placeholder="Preparar materiales" data-testid="textarea-activity-tasks" /></Field>
    <Field label="Notas" full><textarea className="textarea" name="notes" defaultValue={activity?.notes || ''} data-testid="textarea-activity-notes" /></Field>
  </div>;
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: ReactNode }) {
  return <div className={`form-field ${full ? 'full' : ''}`}><label>{label}</label>{children}</div>;
}

function NotebookPage() {
  const qc = useQueryClient();
  const screen = useMovementsScreen({ includeVoided: false });
  const create = useCreateMovement();
  const [kind, setKind] = useState<'income' | 'expense' | 'back' | ''>('');
  const [memberId, setMemberId] = useState('');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const lines = screen.data?.movements || [];
  const incomeLines = lines.filter(movement => movement.type === 'income').sort(notebookOrder);
  const recentIncomes = incomeLines.slice(-3);
  const expenseLines = lines.filter(movement => movement.type === 'expense' || movement.type === 'partner_expense');
  const pending = pendingNotebookExpenses(lines);
  const saldo = incomeLines.reduce((total, movement) => total + movement.amount, 0) - expenseLines.reduce((total, movement) => total + movement.amount, 0);
  const needsMember = kind === 'expense' || kind === 'back';
  const partners = [...(screen.data?.partners || [])].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const choose = (next: 'income' | 'expense' | 'back') => { setKind(next); setError(''); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parseAmount(amount);
    if (needsMember && !memberId) { setError('Elegí un integrante.'); return; }
    if (!concept.trim()) { setError('Escribí el concepto.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Escribí el importe.'); return; }
    const payload: MovementInput = {
      type: kind === 'income' ? 'income' : kind === 'expense' ? 'partner_expense' : 'reimbursement',
      date: notebookToday(),
      concept: concept.trim(),
      amount: value,
      partnerId: needsMember ? Number(memberId) : null,
      categoryId: null,
      activityId: null,
      notes: null,
      origin: 'pachu',
    };
    create.mutate({ data: payload }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getMovementsScreenQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        void qc.invalidateQueries({ queryKey: getListPartnersQueryKey() });
        void qc.invalidateQueries({ queryKey: ['reports'] });
        setConcept('');
        setAmount('');
        setError('');
      },
      onError: err => setError(errorText(err)),
    });
  };
  return <div className="content notebook-page">
    <div className="notebook-paper">
      <h1>El cuadernito de Pachu</h1>
      <div className="notebook-choices" role="group" aria-label="Qué anotar">
        <button type="button" className="notebook-blob" aria-pressed={kind === 'income'} onClick={() => choose('income')} data-testid="button-notebook-income">Ingreso</button>
        <button type="button" className="notebook-blob" aria-pressed={kind === 'expense'} onClick={() => choose('expense')} data-testid="button-notebook-expense">Gasto</button>
        <button type="button" className="notebook-blob" aria-pressed={kind === 'back'} onClick={() => choose('back')} data-testid="button-notebook-return">Le devolvimos</button>
      </div>
      {kind && <form className="notebook-form" onSubmit={submit}>
        {needsMember && <label>Integrante
          <select value={memberId} onChange={event => { setMemberId(event.target.value); setError(''); }} data-testid="select-notebook-member">
            <option value="">Elegí un integrante</option>
            {partners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </select>
        </label>}
        <label>Concepto
          <input value={concept} onChange={event => { setConcept(event.target.value); setError(''); }} placeholder={kind === 'income' ? 'Entradas' : 'Tela'} autoComplete="off" data-testid="input-notebook-concept" />
        </label>
        <label>Importe ($)
          <input value={amount} onChange={event => { setAmount(formatThousandsInput(event.target.value)); setError(''); }} inputMode="decimal" placeholder="0" autoComplete="off" data-testid="input-notebook-amount" />
        </label>
        {error && <p className="notebook-error">{error}</p>}
        {needsMember && partners.length === 0 && <p className="notebook-error">Para un gasto o una devolución, primero cargá el integrante en Miembros.</p>}
        <div className="notebook-actions">
          <button type="submit" className="notebook-blob notebook-save" disabled={create.isPending || (needsMember && partners.length === 0)} data-testid="button-notebook-save">{create.isPending ? 'Anotando…' : 'Anotar'}</button>
          <span>Fecha de hoy, {slashDate(notebookToday())}.</span>
        </div>
      </form>}
      {screen.isLoading ? <p className="notebook-wait">Abriendo el cuaderno…</p> : screen.isError ? <QueryError retry={() => void screen.refetch()} /> : <>
        <div className="notebook-heading">Últimos ingresos:</div>
        {recentIncomes.map(movement => <NotebookRow key={movement.id} movement={movement} amount={movement.amount} />)}
        <div className="notebook-heading">Gastos:</div>
        {pending.map(line => <NotebookRow key={line.movement.id} movement={line.movement} amount={-line.remaining} />)}
        <div className="notebook-saldo"><span>Saldo:</span><strong data-testid="text-notebook-saldo">{notebookMoney(saldo)}</strong></div>
      </>}
    </div>
  </div>;
}

function NotebookRow({ movement, amount }: { movement: Movement; amount: number }) {
  return <div className="notebook-row" data-testid={`row-notebook-${movement.id}`}>
    <span>{slashDate(movement.date)}</span>
    <span>{notebookLabel(movement)}</span>
    <span>{notebookMoney(amount)}</span>
  </div>;
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
  const screen = useMovementsScreen(params);
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const voidMovement = useVoidMovement();
  const createCategory = useCreateCategory();
  const refresh = () => { void qc.invalidateQueries({ queryKey: getMovementsScreenQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); void qc.invalidateQueries({ queryKey: getListPartnersQueryKey() }); };
  const movements = screen.data?.movements || [];
  const filtered = movements.filter(m => (kind === 'all' || m.type === kind) && `${m.concept} ${m.partnerName || ''} ${m.activityName || ''}`.toLowerCase().includes(search.toLowerCase()));
  const openNew = () => { setEditing(null); setShowForm(true); };
  const editMovement = (movement: Movement) => { setEditing(movement); setShowForm(true); };
  function submitMovement(form: HTMLFormElement) {
    const fd = new FormData(form);
    const type = String(fd.get('type')) as MovementInput['type'];
    const payload: MovementInput = {
      type, date: String(fd.get('date')), concept: String(fd.get('concept')),
      amount: parseAmount(String(fd.get('amount') || '')), categoryId: fd.get('categoryId') ? Number(fd.get('categoryId')) : null,
      activityId: fd.get('activityId') ? Number(fd.get('activityId')) : null,
      partnerId: ['partner_contribution', 'partner_expense', 'reimbursement'].includes(type) && fd.get('partnerId') ? Number(fd.get('partnerId')) : null,
      notes: String(fd.get('notes') || '') || null,
    };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: () => { refresh(); setShowForm(false); } });
    else create.mutate({ data: payload }, { onSuccess: () => { refresh(); setShowForm(false); } });
  }
  return <div className="content">
    <PageHeading eyebrow="Cuentas" title="Movimientos" description="Ingresos, gastos, aportes y reintegros.">
      <button className="button button-primary" onClick={openNew} data-testid="button-new-movement"><Plus size={15} /> Registrar movimiento</button>
    </PageHeading>
    {showForm && <Panel title={editing ? 'Editar movimiento' : 'Registrar movimiento'} subtitle="Tipo, importe y a qué corresponde.">
      <form key={editing?.id ?? 'new'} className="inline-form" onSubmit={e => { e.preventDefault(); submitMovement(e.currentTarget); }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" className="button button-quiet" onClick={() => setShowCategoryForm(!showCategoryForm)} data-testid="button-toggle-category"><Plus size={13} /> Añadir categoría</button>
        </div>
        {showCategoryForm && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, padding: 12, border: '1px solid #E6E0D4', borderRadius: 8 }}>
          <input className="field" placeholder="Nombre de categoría" value={newCategory} onChange={e => setNewCategory(e.target.value)} aria-label="Nombre de categoría" data-testid="input-new-category" />
          <select className="select-field" value={categoryAppliesTo} onChange={e => setCategoryAppliesTo(e.target.value as typeof categoryAppliesTo)} aria-label="Aplicación de la categoría" data-testid="select-category-applies-to"><option value="expense">Gastos</option><option value="income">Ingresos</option><option value="both">Ambos</option></select>
          <button type="button" className="button" disabled={!newCategory.trim() || createCategory.isPending} onClick={() => createCategory.mutate({ data: { name: newCategory.trim(), appliesTo: categoryAppliesTo } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getMovementsScreenQueryKey() }); setNewCategory(''); setShowCategoryForm(false); } })} data-testid="button-save-category">{createCategory.isPending ? 'Guardando…' : 'Guardar categoría'}</button>
        </div>}
        <MovementFields movement={editing || undefined} categories={screen.data?.categories || []} partners={screen.data?.partners || []} activities={screen.data?.activities || []} />
        <div className="form-actions"><button type="button" className="button" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={create.isPending || update.isPending} data-testid="button-save-movement">{create.isPending || update.isPending ? 'Guardando…' : 'Guardar movimiento'}</button></div>
        {(create.isError || update.isError) && <div className="error-note" style={{ marginTop: 12 }}>{errorText(create.error || update.error)}</div>}
      </form>
    </Panel>}
    <Panel title="Registro" subtitle={`${filtered.length} movimientos`}>
      <div className="filterbar">
        <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: '#8A8478' }} /><input className="field search-field" style={{ paddingLeft: 32 }} placeholder="Buscar concepto o miembro" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-movements" /></div>
        <select className="select-field" value={kind} onChange={e => setKind(e.target.value)} data-testid="select-movement-type"><option value="all">Todos los tipos</option>{Object.keys(typeLabels).slice(0, 5).map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#6F6A62', fontSize: 11 }}><input type="checkbox" checked={includeVoided} onChange={e => setIncludeVoided(e.target.checked)} data-testid="checkbox-include-voided" /> Mostrar anulados</label>
      </div>
      {screen.isLoading ? <LoadingRows /> : screen.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void screen.refetch()} /></div> : filtered.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Actividad / miembro</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(m => <tr key={m.id} data-testid={`row-movement-${m.id}`}><td>{shortDate(m.date)}</td><td><strong>{m.concept}</strong>{m.categoryName && <div style={{ color: '#8A8478', marginTop: 4 }}>{m.categoryName}</div>}</td><td>{typeLabels[m.type] || m.type}</td><td>{m.activityName || '—'}{m.partnerName && <div style={{ color: '#8A8478', marginTop: 4 }}>{m.partnerName}</div>}</td><td className="amount"><span className={`amount-chip ${m.status === 'voided' ? 'voided' : ['income','partner_contribution','reimbursement'].includes(m.type) ? 'positive' : 'negative'}`}>{m.status === 'voided' ? 'Anulado' : `${['income','partner_contribution','reimbursement'].includes(m.type) ? '+' : '−'}${currency(m.amount)}`}</span></td><td><span className={`status-pill ${m.status === 'voided' ? 'voided' : 'scheduled'}`}>{m.status === 'voided' ? 'Anulado' : 'Activo'}</span></td><td><div className="actions"><button className="button icon-button" title="Editar" aria-label={`Editar ${m.concept}`} data-testid={`button-edit-movement-${m.id}`} disabled={m.status === 'voided'} onClick={() => editMovement(m)}><Settings2 size={14} /></button>{m.status === 'active' && <button className="button icon-button button-danger" title="Anular" aria-label={`Anular ${m.concept}`} data-testid={`button-void-movement-${m.id}`} onClick={() => { const reason = window.prompt('Motivo de la anulación (se conserva el historial):'); if (reason?.trim()) voidMovement.mutate({ id: m.id, data: { reason: reason.trim() } }, { onSuccess: refresh }); }}><X size={14} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Sin movimientos" detail="Cargá un ingreso o un gasto para llevar las cuentas." action={<button className="button button-primary" onClick={openNew}><Plus size={14} /> Registrar movimiento</button>} />}
    </Panel>
  </div>;
}

function MovementFields({ movement, categories, partners, activities }: { movement?: Movement; categories: Category[]; partners: Partner[]; activities: Activity[] }) {
  const [type, setType] = useState(movement?.type || 'income');
  const [amount, setAmount] = useState(movement?.amount ? formatAmountInput(movement.amount) : '');
  const relevantCategories = categories.filter(c => c.appliesTo === 'both' || c.appliesTo === (type === 'income' ? 'income' : 'expense'));
  const needsPartner = ['partner_contribution', 'partner_expense', 'reimbursement'].includes(type);
  return <div className="form-grid">
    <Field label="Tipo"><select className="select-field" name="type" value={type} onChange={e => setType(e.target.value as typeof type)} data-testid="select-movement-form-type">{['income','expense','partner_contribution','partner_expense','reimbursement'].map(x => <option key={x} value={x}>{typeLabels[x]}</option>)}</select></Field>
    <Field label="Fecha"><input className="field" name="date" type="date" required defaultValue={movement?.date.slice(0, 10) || todayString()} data-testid="input-movement-date" /></Field>
    <Field label="Concepto" full><input className="field" name="concept" required defaultValue={movement?.concept || ''} placeholder="Qué se pagó o cobró" data-testid="input-movement-concept" /></Field>
    <Field label="Importe ($)"><input className="field" name="amount" inputMode="decimal" required value={amount} placeholder="0,00" onChange={e => setAmount(formatThousandsInput(e.target.value))} data-testid="input-movement-amount" /></Field>
    <Field label="Categoría"><select className="select-field" name="categoryId" defaultValue={movement?.categoryId || ''} data-testid="select-movement-category"><option value="">Sin categoría</option>{relevantCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Actividad relacionada"><select className="select-field" name="activityId" defaultValue={movement?.activityId || ''} data-testid="select-movement-activity"><option value="">General de la casa</option>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    {needsPartner && <Field label="Miembro"><select className="select-field" name="partnerId" required defaultValue={movement?.partnerId || ''} data-testid="select-movement-partner"><option value="">Elegí un miembro</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    <Field label="Notas" full><textarea className="textarea" name="notes" defaultValue={movement?.notes || ''} placeholder="Nota" data-testid="textarea-movement-notes" /></Field>
    {type === 'partner_expense' && <div className="full" style={{ gridColumn: '1 / -1', color: '#6F6A62', fontSize: 11 }}>Este gasto cuenta como gasto y aumenta lo que hay que devolver.</div>}
    {type === 'partner_contribution' && <div className="full" style={{ gridColumn: '1 / -1', color: '#6F6A62', fontSize: 11 }}>El aporte queda en la cuenta de ese miembro y no suma como ingreso.</div>}
    {type === 'reimbursement' && <div className="full" style={{ gridColumn: '1 / -1', color: '#6F6A62', fontSize: 11 }}>El reintegro reduce lo que hay que devolver y no cuenta como gasto.</div>}
  </div>;
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
    <PageHeading eyebrow="Cuentas" title="Miembros" description="Contacto, aportes y lo que hay que devolver.">
      <button className="button button-primary" onClick={() => { setEditing(null); setOpenForm(!openForm); }} data-testid="button-new-partner"><Plus size={15} /> Añadir</button>
    </PageHeading>
    {openForm && <Panel title={editing ? 'Editar ficha' : 'Nueva ficha'} subtitle="Nombre y contacto.">
      <form className="inline-form" onSubmit={e => { e.preventDefault(); save(e.currentTarget); }}>
        <div className="form-grid"><Field label="Nombre"><input className="field" name="name" required defaultValue={editing?.name || ''} data-testid="input-partner-name" /></Field><Field label="Correo electrónico"><input className="field" name="email" type="email" defaultValue={editing?.email || ''} data-testid="input-partner-email" /></Field><Field label="Teléfono"><input className="field" name="phone" defaultValue={editing?.phone || ''} data-testid="input-partner-phone" /></Field><Field label="Notas" full><textarea className="textarea" name="notes" defaultValue={editing?.notes || ''} data-testid="textarea-partner-notes" /></Field></div>
        <div className="form-actions"><button type="button" className="button" onClick={() => setOpenForm(false)}>Cancelar</button><button className="button button-primary" disabled={create.isPending || update.isPending} data-testid="button-save-partner">{create.isPending || update.isPending ? 'Guardando…' : 'Guardar ficha'}</button></div>
      </form>
    </Panel>}
    <div className="detail-layout" style={{ marginTop: 15 }}>
      <Panel title="Miembros" subtitle={`${partners.length} miembros`} action={<div style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', top: 11, left: 10, color: '#8A8478' }} /><input className="field" style={{ width: 170, paddingLeft: 29 }} placeholder="Buscar" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-partners" /></div>}>
        {list.isLoading ? <LoadingRows /> : list.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void list.refetch()} /></div> : partners.length ? <div className="table-wrap"><table className="data-table" style={{ minWidth: 490 }}><thead><tr><th>Nombre</th><th>Aportado</th><th>Gastos directos</th><th>Pendiente</th><th></th></tr></thead><tbody>{partners.map(p => <tr key={p.id} data-testid={`row-partner-${p.id}`} onClick={() => setSelectedId(p.id)} style={{ cursor: 'pointer', background: selectedId === p.id ? '#F8F1D0' : undefined }}><td><strong>{p.name}</strong><div style={{ color: '#8A8478', marginTop: 4 }}>{p.email || p.phone || 'Sin contacto'}</div></td><td className="amount">{currency(p.totalContributed)}</td><td className="amount">{currency(p.directExpenses)}</td><td className="amount" style={{ color: p.balanceDue > 0 ? '#7A5E12' : '#6F6A62' }}>{currency(p.balanceDue)}</td><td><button className="button icon-button" aria-label={`Editar ${p.name}`} title="Editar ficha" data-testid={`button-edit-partner-${p.id}`} onClick={e => { e.stopPropagation(); setEditing(p); setOpenForm(true); }}><Settings2 size={14} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="Sin miembros" detail="Cargá un miembro para llevar sus aportes y devoluciones." action={<button className="button button-primary" onClick={() => setOpenForm(true)}><Plus size={14} /> Añadir socio</button>} />}
      </Panel>
      <Panel title={ledger.data?.partner.name || 'Cuenta'} subtitle={ledger.data ? 'Aportes, gastos pagados y reintegros' : 'Elegí un miembro para ver su cuenta'}>
        {!selectedId ? <EmptyState title="Cuenta" detail="Elegí un miembro para ver sus movimientos." icon={Wallet} /> : ledger.isLoading ? <LoadingRows /> : ledger.isError ? <div style={{ padding: 16 }}><QueryError retry={() => void ledger.refetch()} /></div> : ledger.data ? <>
          <div className="balance-card" style={{ margin: 14 }}><div className="eyebrow">Pendiente de reintegro</div><div className="balance-big" style={{ color: ledger.data.partner.balanceDue > 0 ? '#7A5E12' : '#6F6A62' }}>{currency(ledger.data.partner.balanceDue)}</div><p>Gastos pagados por ese miembro, menos lo ya devuelto. Los aportes quedan aparte.</p></div>
          <div className="panel-body">{ledger.data.movements.length ? ledger.data.movements.map(m => <MovementRow key={m.id} movement={m} />) : <EmptyState title="Sin movimientos" detail="Los de este miembro van a aparecer acá." />}</div>
        </> : null}
      </Panel>
    </div>
    {selectedId && ledger.data && <div className="metric-grid" style={{ marginTop: 15 }}><Metric label="Aportes" value={currency(ledger.data.partner.totalContributed)} hint="No son ingresos operativos" icon={ArrowDownLeft} /><Metric label="Gastos directos" value={currency(ledger.data.partner.directExpenses)} hint="Pagados por el miembro" icon={Receipt} /><Metric label="Reintegros" value={currency(ledger.data.partner.reimbursements)} hint="Reducen lo pendiente" icon={Check} /><Metric label="Pendiente" value={currency(ledger.data.partner.balanceDue)} hint="A devolver" icon={HandCoins} dark /></div>}
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
  return <div className="content reports">
    <PageHeading eyebrow="Cuentas" title="Informes" description="El resultado no es el dinero en caja.">
      <button className="button" disabled={exportQuery.isFetching} onClick={() => { setExportPending(true); void exportQuery.refetch(); }} data-testid="button-export-csv"><Download size={14} />{exportQuery.isFetching ? 'Preparando…' : 'Exportar CSV'}</button>
    </PageHeading>
    <div className="reports-stack">
    <div className="filterbar" style={{ border: '1px solid #E6E0D4', borderRadius: 9, background: '#FFFCF7' }}>
      <label className="report-date">Desde <input className="field" type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-report-from" /></label>
      <label className="report-date">Hasta <input className="field" type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-report-to" /></label>
      <span style={{ marginLeft: 'auto', color: '#8A8478', fontSize: 11 }}>Período de movimientos activos</span>
    </div>
    {report.isError && <QueryError retry={() => void report.refetch()} />}
    {report.isLoading ? <div className="metric-grid">{[1, 2, 3].map(i => <div className="metric-card" key={i}><div className="skeleton" /><div className="skeleton" style={{ marginTop: 20, width: '70%', height: 25 }} /></div>)}</div> : result && <>
      <Panel title="Resumen del período" subtitle={`${longDate(from)} — ${longDate(to)}`}>
        <div className="report-total"><div><span>Ingresos operativos</span><strong style={{ color: '#7A5E12' }}>{currency(result.incomeTotal)}</strong></div><div><span>Gastos operativos</span><strong style={{ color: '#5C5852' }}>{currency(result.expenseTotal)}</strong></div><div><span>Resultado</span><strong>{currency(result.result)}</strong></div><div><span>Gastos generales</span><strong>{currency(result.generalExpenses)}</strong></div></div>
        <div style={{ padding: '12px 20px 16px', color: '#8A8478', fontSize: 11, lineHeight: 1.5 }}>Los aportes de los miembros no son ingresos. Los gastos que pagó un miembro sí son gastos. Los reintegros no son gastos.</div>
      </Panel>
      <div className="dashboard-grid">
        <Panel title="Gastos por categoría" subtitle="Distribución del gasto operativo">
          {result.expensesByCategory.length ? <div className="category-list">{result.expensesByCategory.map((category, index) => <div key={category.categoryName}><div className="category-line"><span>{category.categoryName}</span><span className="amount">{currency(category.amount)}</span></div><div style={{ height: 6, marginTop: 7, background: '#EFEBE2', borderRadius: 10 }}><div style={{ width: `${Math.max(3, category.amount / maxCat * 100)}%`, height: 6, borderRadius: 10, background: ['#E2B657','#2C2A26','#8A8478','#D4C49A'][index % 4] }} /></div></div>)}</div> : <EmptyState title="Sin categorías en el período" detail="Los gastos clasificados aparecen acá." /> }
        </Panel>
        <Panel title="Actividad y resultado" subtitle={`${result.activities.length} actividades con movimientos`}>
          <div className="panel-body">{result.activities.length ? result.activities.map(activity => <Link key={activity.activityId} href={`/actividades/${activity.activityId}`} className="list-row" style={{ textDecoration: 'none' }} data-testid={`row-report-activity-${activity.activityId}`}><div className="row-main"><div className="row-title">{activity.activityName}</div><div className="row-detail">{shortDate(activity.date)} · Ingresos {currency(activity.income)} · Gastos {currency(activity.expense)}</div></div><div className="row-trailing">{currency(activity.result)}</div></Link>) : <EmptyState title="Sin movimientos en actividades" detail="Cuando un movimiento tenga actividad, el resultado aparece acá." />}</div>
        </Panel>
      </div>
      <Panel title="Cuentas de los miembros" subtitle="Gastos directos y lo pendiente" className="report-partners" >
        {result.partners.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Nombre</th><th>Aportado</th><th>Gastos pagados directamente</th><th>Reintegrado</th><th>Pendiente</th></tr></thead><tbody>{result.partners.map(p => <tr key={p.id}><td>{p.name}</td><td className="amount">{currency(p.totalContributed)}</td><td className="amount">{currency(p.directExpenses)}</td><td className="amount">{currency(p.reimbursements)}</td><td className="amount">{currency(p.balanceDue)}</td></tr>)}</tbody></table></div> : <EmptyState title="Sin cuentas" detail="No hay movimientos de miembros en este período." />}
      </Panel>
      <Panel title="Evolución de lo pendiente" subtitle="Lo que hay que devolver" >
        {result.debtHistory.length ? <div className="chart-bars">{result.debtHistory.slice(-12).map((point, i) => <div className="bar-group" key={`${point.date}-${i}`}><div className="bar" style={{ height: `${Math.max(4, point.amount / Math.max(1, ...result.debtHistory.map(d => d.amount)) * 85)}%` }} /><span className="chart-label">{shortDate(point.date)}</span></div>)}</div> : <EmptyState title="Sin deuda en el período" detail="Aparece cuando un miembro pague un gasto o haya un reintegro." /> }
        <div style={{ height: 28 }} />
      </Panel>
    </>}
    </div>
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
    {editing ? <Panel title="Editar actividad" subtitle="Fecha, horario y responsable."><form className="inline-form" onSubmit={e => { e.preventDefault(); save(e.currentTarget); }}><ActivityFields activity={activity} /><div className="form-actions"><button type="button" className="button" onClick={() => setEditing(false)}>Cancelar</button><button className="button button-primary" disabled={update.isPending} data-testid="button-save-activity-edit">Guardar cambios</button></div></form></Panel> : <div className="page-heading"><div className="detail-hero" style={{ flex: 1 }}><div className="eyebrow">{typeLabels[activity.type]} · {activity.status === 'scheduled' ? 'Programada' : activity.status === 'completed' ? 'Realizada' : 'Cancelada'}</div><h2>{activity.name}</h2><p>{activity.description || 'Sin descripción.'}</p><div className="detail-meta"><span><CalendarDays size={14} />{longDate(activity.date)}</span>{timeLabel(activity.startTime, activity.endTime) && <span>{timeLabel(activity.startTime, activity.endTime)}</span>}{activity.responsible && <span><Users size={14} />{activity.responsible}</span>}</div></div><div className="actions" style={{ alignSelf: 'flex-start' }}><button className="button" onClick={() => setEditing(true)} data-testid="button-edit-activity"><Settings2 size={14} /> Editar</button>{activity.status === 'scheduled' && <button className="button button-danger" onClick={() => { if (window.confirm(`¿Cancelar «${activity.name}»?`)) cancel.mutate({ id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetActivityQueryKey(id) }); void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); } }); }} data-testid="button-cancel-activity">Cancelar</button>}</div></div>}
    <div className="detail-layout" style={{ marginTop: 15 }}>
      <Panel title="Movimientos relacionados" subtitle="Ingresos y gastos vinculados a esta actividad">
        <div className="report-total"><div><span>Ingresos</span><strong style={{ color: '#7A5E12' }}>{currency(query.data.incomeTotal)}</strong></div><div><span>Gastos</span><strong style={{ color: '#5C5852' }}>{currency(query.data.expenseTotal)}</strong></div><div><span>Resultado</span><strong>{currency(query.data.result)}</strong></div></div>
        <div className="panel-body">{query.data.movements.length ? query.data.movements.map(m => <MovementRow key={m.id} movement={m} />) : <EmptyState title="Sin movimientos" detail="Los de esta actividad aparecen acá." />}</div>
      </Panel>
      <div style={{ display: 'grid', alignContent: 'start', gap: 15 }}>
        <Panel title="Tareas pendientes" subtitle={`${activity.pendingTasks.length} cargadas`}><div className="panel-body">{activity.pendingTasks.length ? activity.pendingTasks.map((task, i) => <div className="list-row" key={`${task}-${i}`}><span className="empty-mark" style={{ width: 25, height: 25, margin: 0 }}><Check size={12} /></span><div className="row-main">{task}</div></div>) : <EmptyState title="Sin tareas" detail="Esta actividad no tiene tareas." />}</div></Panel>
        <div className="panel" style={{ padding: 18 }}><div className="eyebrow">Repetir actividad</div><p style={{ color: '#6F6A62', fontSize: 11, lineHeight: 1.5 }}>Misma actividad, otra fecha.</p><div style={{ display: 'flex', gap: 8 }}><input className="field" type="date" value={duplicateDate} onChange={e => setDuplicateDate(e.target.value)} data-testid="input-detail-duplicate-date" /><button className="button" disabled={!duplicateDate || duplicate.isPending} onClick={() => duplicate.mutate({ id, data: { date: duplicateDate } }, { onSuccess: activityCopy => { void qc.invalidateQueries({ queryKey: getListActivitiesQueryKey() }); setLocation(`/actividades/${activityCopy.id}`); } })} data-testid="button-detail-duplicate"><Plus size={14} /></button></div></div>
        {activity.notes && <Panel title="Notas"><div className="panel-body" style={{ paddingTop: 14, fontSize: 12, color: '#6F6A62', lineHeight: 1.6 }}>{activity.notes}</div></Panel>}
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
  return <QueryClientProvider client={queryClient}><SessionProvider><TooltipProvider><WouterRouter hook={useHashLocation}><ErrorBoundary resetKey={window.location.pathname}><AppRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></SessionProvider></QueryClientProvider>;
}

export default App;
