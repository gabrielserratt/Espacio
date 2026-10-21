import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, lt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CancelActivityParams,
  CancelActivityResponse,
  CreateActivityBody,
  CreateActivityResponse,
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateMovementBody,
  CreateMovementResponse,
  CreatePartnerBody,
  CreatePartnerResponse,
  DuplicateActivityBody,
  DuplicateActivityParams,
  DuplicateActivityResponse,
  GetActivityParams,
  GetActivityResponse,
  GetDashboardResponse,
  GetPartnerLedgerParams,
  GetPartnerLedgerResponse,
  GetReportsQueryParams,
  GetReportsResponse,
  ListActivitiesQueryParams,
  ListActivitiesResponse,
  ListCategoriesResponse,
  ListMovementsQueryParams,
  ListMovementsResponse,
  ListPartnersResponse,
  UpdateActivityBody,
  UpdateActivityParams,
  UpdateActivityResponse,
  UpdateMovementBody,
  UpdateMovementParams,
  UpdateMovementResponse,
  UpdatePartnerBody,
  UpdatePartnerParams,
  UpdatePartnerResponse,
  VoidMovementBody,
  VoidMovementParams,
  VoidMovementResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  activitiesTable,
  auditLogsTable,
  categoriesTable,
  movementsTable,
  partnersTable,
} from "@workspace/db";
import { getAuth } from "@clerk/express";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();
router.use(requireAdmin);

type MovementType =
  | "income"
  | "expense"
  | "partner_contribution"
  | "partner_expense"
  | "reimbursement";

const OPERATING_EXPENSES: MovementType[] = ["expense", "partner_expense"];
const PARTNER_MOVEMENTS: MovementType[] = [
  "partner_contribution",
  "partner_expense",
  "reimbursement",
];

function dateInBuenosAires(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dbDate(value: Date | string): string {
  return value instanceof Date ? dateString(value) : value;
}

function serializeActivity<T extends { createdAt: Date; updatedAt?: Date }>(
  activity: T,
) {
  return {
    ...activity,
    createdAt: activity.createdAt.toISOString(),
    ...(activity.updatedAt
      ? { updatedAt: activity.updatedAt.toISOString() }
      : {}),
  };
}

function serializePartner<T extends { createdAt: Date; updatedAt?: Date }>(
  partner: T,
) {
  return {
    ...partner,
    createdAt: partner.createdAt.toISOString(),
    ...(partner.updatedAt ? { updatedAt: partner.updatedAt.toISOString() } : {}),
  };
}

function serializeMovement<T extends { createdAt: Date; updatedAt: Date }>(
  movement: T,
) {
  return {
    ...movement,
    createdAt: movement.createdAt.toISOString(),
    updatedAt: movement.updatedAt.toISOString(),
  };
}

function sumAmounts(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

function operatingTotals(rows: Array<{ type: MovementType; amount: number }>) {
  const income = rows
    .filter((row) => row.type === "income")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = rows
    .filter((row) => OPERATING_EXPENSES.includes(row.type))
    .reduce((sum, row) => sum + Number(row.amount), 0);
  return { income, expenses, result: income - expenses };
}

function debtFromRows(rows: Array<{ type: MovementType; amount: number }>) {
  return rows.reduce((total, row) => {
    if (row.type === "partner_expense") return total + Number(row.amount);
    if (row.type === "reimbursement") return total - Number(row.amount);
    return total;
  }, 0);
}

function actorId(req: Parameters<typeof getAuth>[0]): string | null {
  return getAuth(req).userId ?? null;
}

async function movementRows(options: {
  from?: string;
  to?: string;
  type?: MovementType;
  includeVoided?: boolean;
  partnerId?: number;
  activityId?: number;
}) {
  const filters = [];
  if (options.from) filters.push(gte(movementsTable.date, options.from));
  if (options.to) filters.push(lte(movementsTable.date, options.to));
  if (options.type) filters.push(eq(movementsTable.type, options.type));
  if (!options.includeVoided) {
    filters.push(eq(movementsTable.status, "active"));
  }
  if (options.partnerId !== undefined) {
    filters.push(eq(movementsTable.partnerId, options.partnerId));
  }
  if (options.activityId !== undefined) {
    filters.push(eq(movementsTable.activityId, options.activityId));
  }

  const rows = await db
    .select({
      id: movementsTable.id,
      type: movementsTable.type,
      date: movementsTable.date,
      concept: movementsTable.concept,
      amount: movementsTable.amount,
      categoryId: movementsTable.categoryId,
      categoryName: categoriesTable.name,
      activityId: movementsTable.activityId,
      activityName: activitiesTable.name,
      partnerId: movementsTable.partnerId,
      partnerName: partnersTable.name,
      receiptPath: movementsTable.receiptPath,
      notes: movementsTable.notes,
      status: movementsTable.status,
      voidReason: movementsTable.voidReason,
      createdAt: movementsTable.createdAt,
      updatedAt: movementsTable.updatedAt,
    })
    .from(movementsTable)
    .leftJoin(categoriesTable, eq(movementsTable.categoryId, categoriesTable.id))
    .leftJoin(activitiesTable, eq(movementsTable.activityId, activitiesTable.id))
    .leftJoin(partnersTable, eq(movementsTable.partnerId, partnersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(movementsTable.date), desc(movementsTable.createdAt));

  return rows.map((row) => serializeMovement(row));
}

async function partnerSummaries() {
  const [partners, rows] = await Promise.all([
    db.select().from(partnersTable).orderBy(asc(partnersTable.name)),
    db
      .select({
        partnerId: movementsTable.partnerId,
        type: movementsTable.type,
        amount: movementsTable.amount,
      })
      .from(movementsTable)
      .where(eq(movementsTable.status, "active")),
  ]);

  return partners.map((partner) => {
    const related = rows.filter((row) => row.partnerId === partner.id);
    const totalContributed = sumAmounts(
      related.filter((row) => row.type === "partner_contribution"),
    );
    const directExpenses = sumAmounts(
      related.filter((row) => row.type === "partner_expense"),
    );
    const reimbursements = sumAmounts(
      related.filter((row) => row.type === "reimbursement"),
    );
    return {
      ...serializePartner(partner),
      totalContributed,
      directExpenses,
      reimbursements,
      balanceDue: directExpenses - reimbursements,
    };
  });
}

type AuditExecutor = Pick<NodePgDatabase, "insert">;

async function audit(
  tx: AuditExecutor,
  entityType: string,
  entityId: number,
  action: "created" | "updated" | "voided" | "cancelled",
  beforeData: unknown,
  afterData: unknown,
  actor: string | null,
) {
  await tx.insert(auditLogsTable).values({
    entityType,
    entityId,
    action,
    beforeData: beforeData as Record<string, unknown> | null,
    afterData: afterData as Record<string, unknown>,
    actorId: actor,
  });
}

async function validateMovementLinks(input: {
  type: MovementType;
  categoryId?: number | null;
  activityId?: number | null;
  partnerId?: number | null;
}): Promise<string | null> {
  if (
    (PARTNER_MOVEMENTS.includes(input.type) && input.partnerId == null) ||
    (!PARTNER_MOVEMENTS.includes(input.type) && input.partnerId != null)
  ) {
    return "Los aportes, gastos cubiertos y devoluciones deben tener un socio; los demás movimientos no.";
  }
  if (input.categoryId != null) {
    const [category] = await db
      .select()
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, input.categoryId),
          eq(categoriesTable.active, true),
        ),
      )
      .limit(1);
    if (!category) return "La categoría seleccionada no existe.";
    const expected =
      input.type === "income"
        ? "income"
        : OPERATING_EXPENSES.includes(input.type)
          ? "expense"
          : null;
    if (
      expected &&
      category.appliesTo !== "both" &&
      category.appliesTo !== expected
    ) {
      return "La categoría no corresponde a este tipo de movimiento.";
    }
  }
  if (input.activityId != null) {
    const [activity] = await db
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(eq(activitiesTable.id, input.activityId))
      .limit(1);
    if (!activity) return "La actividad seleccionada no existe.";
  }
  if (input.partnerId != null) {
    const [partner] = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.id, input.partnerId))
      .limit(1);
    if (!partner) return "El socio seleccionado no existe.";
  }
  return null;
}

function nextRepeatDate(
  value: string,
  recurrence: "weekly" | "biweekly" | "monthly",
  step: number,
): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (recurrence === "weekly" || recurrence === "biweekly") {
    date.setUTCDate(date.getUTCDate() + (recurrence === "weekly" ? 7 : 14));
    return dateString(date);
  }
  const targetMonth = month - 1 + step;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return dateString(new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))));
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const today = dateInBuenosAires();
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [monthRows, yearRows, debtRows, upcomingRows, recentRows] =
    await Promise.all([
      movementRows({ from: monthStart, to: today }),
      movementRows({ from: yearStart, to: today }),
      db
        .select({ type: movementsTable.type, amount: movementsTable.amount })
        .from(movementsTable)
        .where(eq(movementsTable.status, "active")),
      db
        .select()
        .from(activitiesTable)
        .where(
          and(
            gte(activitiesTable.date, today),
            eq(activitiesTable.status, "scheduled"),
          ),
        )
        .orderBy(asc(activitiesTable.date), asc(activitiesTable.startTime))
        .limit(6),
      movementRows({ includeVoided: false }),
    ]);

  const month = operatingTotals(monthRows as Array<{ type: MovementType; amount: number }>);
  const year = operatingTotals(yearRows as Array<{ type: MovementType; amount: number }>);
  res.json(
    GetDashboardResponse.parse({
      monthIncome: month.income,
      monthExpenses: month.expenses,
      monthResult: month.result,
      accumulatedResult: year.result,
      partnerDebt: debtFromRows(
        debtRows as Array<{ type: MovementType; amount: number }>,
      ),
      upcomingActivities: upcomingRows.map(serializeActivity),
      recentMovements: recentRows.slice(0, 8),
    }),
  );
});

router.get("/partners", async (_req, res): Promise<void> => {
  res.json(ListPartnersResponse.parse(await partnerSummaries()));
});

router.post("/partners", async (req, res): Promise<void> => {
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [partner] = await db
    .insert(partnersTable)
    .values(parsed.data)
    .returning();
  await audit(
    db,
    "partner",
    partner.id,
    "created",
    null,
    partner as unknown as Record<string, unknown>,
    actorId(req),
  );
  res.status(201).json(
    CreatePartnerResponse.parse({
      ...serializePartner(partner),
      totalContributed: 0,
      directExpenses: 0,
      reimbursements: 0,
      balanceDue: 0,
    }),
  );
});

router.patch("/partners/:id", async (req, res): Promise<void> => {
  const params = UpdatePartnerParams.safeParse(req.params);
  const parsed = UpdatePartnerBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(partnersTable)
    .where(eq(partnersTable.id, params.data.id))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Socio no encontrado." });
    return;
  }
  const [updated] = await db
    .update(partnersTable)
    .set(parsed.data)
    .where(eq(partnersTable.id, params.data.id))
    .returning();
  await audit(
    db,
    "partner",
    updated.id,
    "updated",
    before as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    actorId(req),
  );
  const summary = (await partnerSummaries()).find((item) => item.id === updated.id);
  res.json(UpdatePartnerResponse.parse(summary));
});

router.get("/partners/:id/ledger", async (req, res): Promise<void> => {
  const params = GetPartnerLedgerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const summary = (await partnerSummaries()).find(
    (item) => item.id === params.data.id,
  );
  if (!summary) {
    res.status(404).json({ error: "Socio no encontrado." });
    return;
  }
  const movements = await movementRows({
    partnerId: params.data.id,
    includeVoided: true,
  });
  res.json(GetPartnerLedgerResponse.parse({ partner: summary, movements }));
});

router.get("/activities", async (req, res): Promise<void> => {
  const parsed = ListActivitiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  if (parsed.data.from) {
    filters.push(gte(activitiesTable.date, dbDate(parsed.data.from)));
  }
  if (parsed.data.to) {
    filters.push(lte(activitiesTable.date, dbDate(parsed.data.to)));
  }
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(activitiesTable.date), asc(activitiesTable.startTime));
  res.json(ListActivitiesResponse.parse(activities.map(serializeActivity)));
});

router.post("/activities", async (req, res): Promise<void> => {
  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { recurrence, recurrenceCount, ...activityInput } = parsed.data;
  const count =
    recurrence && recurrence !== "none" ? (recurrenceCount ?? 1) : 1;
  const recurrenceGroup = count > 1 ? randomUUID() : null;
  const firstDate = dbDate(activityInput.date);
  const inserted = await db.transaction(async (tx) => {
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const date =
        index === 0 || !recurrence || recurrence === "none"
          ? firstDate
          : nextRepeatDate(firstDate, recurrence, index);
      const [activity] = await tx
        .insert(activitiesTable)
        .values({
          ...activityInput,
          date,
          recurrenceGroup,
          status: activityInput.status ?? "scheduled",
          pendingTasks: activityInput.pendingTasks ?? [],
        })
        .returning();
      await audit(
        tx,
        "activity",
        activity.id,
        "created",
        null,
        activity as unknown as Record<string, unknown>,
        actorId(req),
      );
      created.push(serializeActivity(activity));
    }
    return created;
  });
  res.status(201).json(CreateActivityResponse.parse(inserted));
});

router.get("/activities/:id", async (req, res): Promise<void> => {
  const params = GetActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .limit(1);
  if (!activity) {
    res.status(404).json({ error: "Actividad no encontrada." });
    return;
  }
  const movements = await movementRows({
    activityId: activity.id,
    includeVoided: false,
  });
  const totals = operatingTotals(
    movements as Array<{ type: MovementType; amount: number }>,
  );
  res.json(
    GetActivityResponse.parse({
      activity: serializeActivity(activity),
      movements,
      incomeTotal: totals.income,
      expenseTotal: totals.expenses,
      result: totals.result,
    }),
  );
});

router.patch("/activities/:id", async (req, res): Promise<void> => {
  const params = UpdateActivityParams.safeParse(req.params);
  const parsed = UpdateActivityBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Actividad no encontrada." });
    return;
  }
  const { date: updatedDate, ...activityFields } = parsed.data;
  const updateData = {
    ...activityFields,
    ...(updatedDate ? { date: dbDate(updatedDate) } : {}),
  };
  const [updated] = await db
    .update(activitiesTable)
    .set(updateData)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();
  await audit(
    db,
    "activity",
    updated.id,
    "updated",
    before as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    actorId(req),
  );
  res.json(UpdateActivityResponse.parse(serializeActivity(updated)));
});

router.post("/activities/:id/duplicate", async (req, res): Promise<void> => {
  const params = DuplicateActivityParams.safeParse(req.params);
  const parsed = DuplicateActivityBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [source] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Actividad no encontrada." });
    return;
  }
  const [created] = await db
    .insert(activitiesTable)
    .values({
      name: source.name,
      type: source.type,
      date: dbDate(parsed.data.date),
      startTime: source.startTime,
      endTime: source.endTime,
      responsible: source.responsible,
      status: "scheduled",
      description: source.description,
      notes: source.notes,
      pendingTasks: source.pendingTasks,
    })
    .returning();
  await audit(
    db,
    "activity",
    created.id,
    "created",
    null,
    created as unknown as Record<string, unknown>,
    actorId(req),
  );
  res.status(201).json(DuplicateActivityResponse.parse(serializeActivity(created)));
});

router.post("/activities/:id/cancel", async (req, res): Promise<void> => {
  const params = CancelActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Actividad no encontrada." });
    return;
  }
  const [updated] = await db
    .update(activitiesTable)
    .set({ status: "cancelled" })
    .where(eq(activitiesTable.id, params.data.id))
    .returning();
  await audit(
    db,
    "activity",
    updated.id,
    "cancelled",
    before as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    actorId(req),
  );
  res.json(CancelActivityResponse.parse(serializeActivity(updated)));
});

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.active, true))
    .orderBy(asc(categoriesTable.name));
  res.json(ListCategoriesResponse.parse(categories));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, isDefault: false })
    .returning();
  res.status(201).json(CreateCategoryResponse.parse(created));
});

router.get("/movements", async (req, res): Promise<void> => {
  const parsed = ListMovementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const movements = await movementRows({
    from: parsed.data.from ? dbDate(parsed.data.from) : undefined,
    to: parsed.data.to ? dbDate(parsed.data.to) : undefined,
    type: parsed.data.type,
    includeVoided: parsed.data.includeVoided,
  });
  res.json(ListMovementsResponse.parse(movements));
});

router.post("/movements", async (req, res): Promise<void> => {
  const parsed = CreateMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!Number.isFinite(parsed.data.amount) || parsed.data.amount <= 0) {
    res.status(400).json({ error: "El importe debe ser mayor que cero." });
    return;
  }
  if (Math.round(parsed.data.amount * 100) !== parsed.data.amount * 100) {
    res.status(400).json({ error: "El importe admite hasta dos decimales." });
    return;
  }
  if (
    parsed.data.receiptPath &&
    !parsed.data.receiptPath.startsWith("/objects/")
  ) {
    res.status(400).json({ error: "El comprobante no tiene una ruta válida." });
    return;
  }
  const linkError = await validateMovementLinks(parsed.data);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }

  const [created] = await db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(movementsTable)
      .values({
        ...parsed.data,
        date: dbDate(parsed.data.date),
        createdBy: actorId(req),
      })
      .returning();
    await audit(
      tx,
      "movement",
      movement.id,
      "created",
      null,
      movement as unknown as Record<string, unknown>,
      actorId(req),
    );
    return [movement];
  });
  const result = (await movementRows({ includeVoided: true })).find(
    (row) => row.id === created.id,
  );
  res.status(201).json(CreateMovementResponse.parse(result));
});

router.patch("/movements/:id", async (req, res): Promise<void> => {
  const params = UpdateMovementParams.safeParse(req.params);
  const parsed = UpdateMovementBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(movementsTable)
    .where(eq(movementsTable.id, params.data.id))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Movimiento no encontrado." });
    return;
  }
  if (before.status === "voided") {
    res.status(409).json({ error: "No se puede editar un movimiento anulado." });
    return;
  }
  const merged = { ...before, ...parsed.data };
  if (!Number.isFinite(merged.amount) || merged.amount <= 0) {
    res.status(400).json({ error: "El importe debe ser mayor que cero." });
    return;
  }
  if (Math.round(merged.amount * 100) !== merged.amount * 100) {
    res.status(400).json({ error: "El importe admite hasta dos decimales." });
    return;
  }
  const linkError = await validateMovementLinks({
    type: merged.type,
    categoryId: merged.categoryId,
    activityId: merged.activityId,
    partnerId: merged.partnerId,
  });
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const { date: updatedDate, ...movementFields } = parsed.data;
    const [item] = await tx
      .update(movementsTable)
      .set({
        ...movementFields,
        ...(updatedDate ? { date: dbDate(updatedDate) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(movementsTable.id, params.data.id))
      .returning();
    await audit(
      tx,
      "movement",
      item.id,
      "updated",
      before as unknown as Record<string, unknown>,
      item as unknown as Record<string, unknown>,
      actorId(req),
    );
    return [item];
  });
  const result = (await movementRows({ includeVoided: true })).find(
    (row) => row.id === updated.id,
  );
  res.json(UpdateMovementResponse.parse(result));
});

router.post("/movements/:id/void", async (req, res): Promise<void> => {
  const params = VoidMovementParams.safeParse(req.params);
  const parsed = VoidMovementBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [before] = await db
    .select()
    .from(movementsTable)
    .where(eq(movementsTable.id, params.data.id))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Movimiento no encontrado." });
    return;
  }
  if (before.status === "voided") {
    res.status(409).json({ error: "El movimiento ya está anulado." });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const [item] = await tx
      .update(movementsTable)
      .set({
        status: "voided",
        voidReason: parsed.data.reason,
        updatedAt: new Date(),
      })
      .where(eq(movementsTable.id, params.data.id))
      .returning();
    await audit(
      tx,
      "movement",
      item.id,
      "voided",
      before as unknown as Record<string, unknown>,
      item as unknown as Record<string, unknown>,
      actorId(req),
    );
    return [item];
  });
  const result = (await movementRows({ includeVoided: true })).find(
    (row) => row.id === updated.id,
  );
  res.json(VoidMovementResponse.parse(result));
});

router.get("/reports", async (req, res): Promise<void> => {
  const parsed = GetReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = dbDate(parsed.data.from);
  const to = dbDate(parsed.data.to);
  if (from > to) {
    res.status(400).json({ error: "El inicio del período debe ser anterior al fin." });
    return;
  }

  const [rows, openingRows, periodActivities, partnerRows] = await Promise.all([
    movementRows({ from, to }),
    db
      .select({ type: movementsTable.type, amount: movementsTable.amount })
      .from(movementsTable)
      .where(
        and(
          lt(movementsTable.date, from),
          eq(movementsTable.status, "active"),
        ),
      ),
    db
      .select()
      .from(activitiesTable)
      .where(and(gte(activitiesTable.date, from), lte(activitiesTable.date, to))),
    partnerSummaries(),
  ]);

  const typedRows = rows as Array<
    (typeof rows)[number] & { type: MovementType; amount: number }
  >;
  const totals = operatingTotals(typedRows);
  const expensesByCategoryMap = new Map<string, number>();
  let generalExpenses = 0;
  for (const row of typedRows) {
    if (!OPERATING_EXPENSES.includes(row.type)) continue;
    const label = row.categoryName ?? "Sin categoría";
    expensesByCategoryMap.set(
      label,
      (expensesByCategoryMap.get(label) ?? 0) + Number(row.amount),
    );
    if (!row.activityId) generalExpenses += Number(row.amount);
  }

  const activityResults = periodActivities.map((activity) => {
    const related = typedRows.filter(
      (row) => row.activityId === activity.id,
    );
    const activityTotals = operatingTotals(related);
    return {
      activityId: activity.id,
      activityName: activity.name,
      date: activity.date,
      income: activityTotals.income,
      expense: activityTotals.expenses,
      result: activityTotals.result,
    };
  });

  let debt = debtFromRows(
    openingRows as Array<{ type: MovementType; amount: number }>,
  );
  const debtHistory = [{ date: from, amount: debt }];
  const debtChanges = typedRows
    .filter((row) => row.type === "partner_expense" || row.type === "reimbursement")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const row of debtChanges) {
    debt += row.type === "partner_expense" ? Number(row.amount) : -Number(row.amount);
    const previous = debtHistory[debtHistory.length - 1];
    if (previous?.date === row.date) previous.amount = debt;
    else debtHistory.push({ date: row.date, amount: debt });
  }
  if (debtHistory[debtHistory.length - 1]?.date !== to) {
    debtHistory.push({ date: to, amount: debt });
  }

  res.json(
    GetReportsResponse.parse({
      incomeTotal: totals.income,
      expenseTotal: totals.expenses,
      result: totals.result,
      generalExpenses,
      expensesByCategory: [...expensesByCategoryMap.entries()].map(
        ([categoryName, amount]) => ({ categoryName, amount }),
      ),
      activities: activityResults,
      partners: partnerRows,
      debtHistory,
    }),
  );
});

router.get("/reports/export.csv", async (req, res): Promise<void> => {
  const parsed = GetReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await movementRows({
    from: dbDate(parsed.data.from),
    to: dbDate(parsed.data.to),
  });
  const fields = [
    "fecha",
    "tipo",
    "concepto",
    "importe",
    "categoría",
    "actividad",
    "socio",
    "estado",
    "observaciones",
  ];
  const escape = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const lines = [
    fields.map(escape).join(","),
    ...rows.map((row) =>
      [
        row.date,
        row.type,
        row.concept,
        Number(row.amount).toFixed(2),
        row.categoryName,
        row.activityName,
        row.partnerName,
        row.status,
        row.notes,
      ]
        .map(escape)
        .join(","),
    ),
  ];
  res
    .status(200)
    .type("text/csv")
    .setHeader("Content-Disposition", 'attachment; filename="espacio-vergara-movimientos.csv"')
    .send(`\uFEFF${lines.join("\r\n")}`);
});

export default router;
