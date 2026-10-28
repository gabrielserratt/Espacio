const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbydNsrm8jii9N7luCcJ-Du2xppP1s3NZ4IonL8IVYIzPE1aPrCAPpDszZTMYLHhVmgqtg/exec';

const SESSION_KEY = 'espacio-vergara-session';

export type Session = { user: string; password: string };

export type ActivityType = 'event' | 'class' | 'workshop' | 'rehearsal' | 'meeting' | 'maintenance' | 'other';
export type ActivityStatus = 'scheduled' | 'completed' | 'cancelled';
export type MovementType = 'income' | 'expense' | 'partner_contribution' | 'partner_expense' | 'reimbursement';

export type Activity = {
  id: number;
  name: string;
  type: ActivityType;
  date: string;
  startTime: string | null;
  endTime: string | null;
  responsible: string | null;
  status: ActivityStatus;
  description: string | null;
  notes: string | null;
  pendingTasks: string[];
  recurrenceGroup: string | null;
  createdAt: string | null;
};

export type ActivityInput = {
  name: string;
  type: ActivityType;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  responsible?: string | null;
  status?: ActivityStatus;
  description?: string | null;
  notes?: string | null;
  pendingTasks?: string[];
  recurrence?: 'none' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceCount?: number;
};

export type Partner = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  totalContributed: number;
  directExpenses: number;
  reimbursements: number;
  balanceDue: number;
  createdAt: string | null;
};

export type PartnerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type Category = {
  id: number;
  name: string;
  appliesTo: 'income' | 'expense' | 'both';
  isDefault: boolean;
  active?: boolean;
};

export type Movement = {
  id: number;
  type: MovementType;
  date: string;
  concept: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  activityId: number | null;
  activityName: string | null;
  partnerId: number | null;
  partnerName: string | null;
  receiptPath: string | null;
  notes: string | null;
  origin: string | null;
  status: 'active' | 'voided';
  voidReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MovementInput = {
  type: MovementType;
  date: string;
  concept: string;
  amount: number;
  categoryId?: number | null;
  activityId?: number | null;
  partnerId?: number | null;
  notes?: string | null;
  origin?: string | null;
};

export function readSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.user || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function sheet<T>(action: string, extra: Record<string, unknown> = {}, credentials?: Session): Promise<T> {
  const session = credentials ?? readSession();
  if (!session) throw new Error('Tenés que entrar de nuevo.');
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ user: session.user, password: session.password, action, ...extra }),
  });
  const text = (await response.text()).trim().replace(/^\)\]\}',?\s*/, '');
  let payload: { ok?: boolean; data?: T; error?: string };
  try {
    payload = JSON.parse(text) as { ok?: boolean; data?: T; error?: string };
  } catch {
    throw new Error('La hoja no respondió. Revisá que la aplicación web siga publicada.');
  }
  if (!payload.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload.data as T;
}

export async function pingSheet(): Promise<boolean> {
  const response = await fetch(SCRIPT_URL, { method: 'GET', redirect: 'follow', cache: 'no-store' });
  const text = (await response.text()).trim();
  const payload = JSON.parse(text) as { ok?: boolean };
  return payload.ok === true;
}
