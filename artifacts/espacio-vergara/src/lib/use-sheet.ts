import { useMutation, useQuery } from '@tanstack/react-query';
import {
  sheet,
  type Activity,
  type ActivityInput,
  type Category,
  type Movement,
  type MovementInput,
  type Partner,
  type PartnerInput,
} from '@/lib/sheet';

export const getGetDashboardQueryKey = () => ['dashboard'] as const;
export const getListActivitiesQueryKey = () => ['activities'] as const;
export const getListMovementsQueryKey = () => ['movements'] as const;
export const getListPartnersQueryKey = () => ['partners'] as const;
export const getListCategoriesQueryKey = () => ['categories'] as const;
export const getGetPartnerLedgerQueryKey = (id: number) => ['partner-ledger', id] as const;
export const getGetActivityQueryKey = (id: number) => ['activity', id] as const;
export const getGetReportsQueryKey = (params: { from: string; to: string }) => ['reports', params] as const;
export const getExportMovementsCsvQueryKey = (params: { from: string; to: string }) => ['export-csv', params] as const;

export function useGetDashboard() {
  return useQuery({ queryKey: getGetDashboardQueryKey(), queryFn: () => sheet<Dashboard>('dashboard') });
}

export function useListActivities() {
  return useQuery({ queryKey: getListActivitiesQueryKey(), queryFn: () => sheet<Activity[]>('listActivities') });
}

export function useCreateActivity() {
  return useMutation({ mutationFn: (vars: { data: ActivityInput }) => sheet<Activity[]>('createActivity', { data: vars.data }) });
}

export function useUpdateActivity() {
  return useMutation({ mutationFn: (vars: { id: number; data: Partial<ActivityInput> }) => sheet<Activity>('updateActivity', { id: vars.id, data: vars.data }) });
}

export function useDuplicateActivity() {
  return useMutation({ mutationFn: (vars: { id: number; data: { date: string } }) => sheet<Activity>('duplicateActivity', { id: vars.id, data: vars.data }) });
}

export function useCancelActivity() {
  return useMutation({ mutationFn: (vars: { id: number }) => sheet<Activity>('cancelActivity', { id: vars.id }) });
}

export function useListCategories() {
  return useQuery({ queryKey: getListCategoriesQueryKey(), queryFn: () => sheet<Category[]>('listCategories') });
}

export function useCreateCategory() {
  return useMutation({ mutationFn: (vars: { data: { name: string; appliesTo: Category['appliesTo'] } }) => sheet<Category>('createCategory', { data: vars.data }) });
}

export function useListMovements(params: { includeVoided?: boolean }) {
  return useQuery({ queryKey: [...getListMovementsQueryKey(), params], queryFn: () => sheet<Movement[]>('listMovements', params) });
}

export function useCreateMovement() {
  return useMutation({ mutationFn: (vars: { data: MovementInput }) => sheet<Movement>('createMovement', { data: vars.data }) });
}

export function useUpdateMovement() {
  return useMutation({ mutationFn: (vars: { id: number; data: MovementInput }) => sheet<Movement>('updateMovement', { id: vars.id, data: vars.data }) });
}

export function useVoidMovement() {
  return useMutation({ mutationFn: (vars: { id: number; data: { reason: string } }) => sheet<Movement>('voidMovement', { id: vars.id, reason: vars.data.reason }) });
}

export function useListPartners() {
  return useQuery({ queryKey: getListPartnersQueryKey(), queryFn: () => sheet<Partner[]>('listPartners') });
}

export function useCreatePartner() {
  return useMutation({ mutationFn: (vars: { data: PartnerInput }) => sheet<Partner>('createPartner', { data: vars.data }) });
}

export function useUpdatePartner() {
  return useMutation({ mutationFn: (vars: { id: number; data: PartnerInput }) => sheet<Partner>('updatePartner', { id: vars.id, data: vars.data }) });
}

export function useGetPartnerLedger(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetPartnerLedgerQueryKey(id),
    queryFn: () => sheet<{ partner: Partner; movements: Movement[] }>('partnerLedger', { id }),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useGetActivity(id: number, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getGetActivityQueryKey(id),
    queryFn: () => sheet<ActivityDetail>('getActivity', { id }),
    enabled: options?.query?.enabled ?? id > 0,
  });
}

export function useGetReports(params: { from: string; to: string }) {
  return useQuery({ queryKey: getGetReportsQueryKey(params), queryFn: () => sheet<Report>('reports', params) });
}

export function useExportMovementsCsv(params: { from: string; to: string }, options?: { query?: { enabled?: boolean } }) {
  return useQuery({
    queryKey: getExportMovementsCsvQueryKey(params),
    queryFn: () => sheet<{ csv: string }>('exportCsv', params).then((result) => result.csv),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ['sheet-health'],
    queryFn: async () => {
      await sheet('login');
      return { status: 'ok' as const };
    },
    retry: false,
  });
}

type Dashboard = {
  monthIncome: number;
  monthExpenses: number;
  monthResult: number;
  accumulatedResult: number;
  partnerDebt: number;
  upcomingActivities: Activity[];
  recentMovements: Movement[];
};

type ActivityDetail = {
  activity: Activity;
  movements: Movement[];
  incomeTotal: number;
  expenseTotal: number;
  result: number;
};

type Report = {
  incomeTotal: number;
  expenseTotal: number;
  result: number;
  generalExpenses: number;
  expensesByCategory: Array<{ categoryName: string; amount: number }>;
  activities: Array<{ activityId: number; activityName: string; date: string; income: number; expense: number; result: number }>;
  partners: Partner[];
  debtHistory: Array<{ date: string; amount: number }>;
};
