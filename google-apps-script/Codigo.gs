/**
 * Casa Lupanal — hoja de cálculo.
 *
 * Pegar este archivo completo en Extensiones → Apps Script, reemplazando Código.gs.
 * El script tiene que crearse desde la hoja (no como proyecto suelto).
 *
 * Antes de publicar, en el editor:
 *   Configuración del proyecto → Propiedades del script
 *     APP_USER      = usuario compartido
 *     APP_PASSWORD  = contraseña compartida
 *   Elegir la función preparar y ejecutarla una vez.
 *   Implementar → Nueva implementación → Aplicación web
 *     Ejecutar como: Yo
 *     Quién tiene acceso: Cualquier persona
 *
 * La web manda POST con Content-Type text/plain y este JSON:
 *   { user, password, action, ... }
 * Acciones: login, dashboard, listPartners, createPartner, updatePartner,
 * partnerLedger, listActivities, createActivity, getActivity, updateActivity,
 * duplicateActivity, cancelActivity, listCategories, createCategory,
 * listMovements, movementsScreen, createMovement, updateMovement, voidMovement, reports, exportCsv.
 */

var TZ = "America/Argentina/Buenos_Aires";
var ROW_CACHE = {};
var WRITE_ACTIONS = {
  createPartner: true,
  updatePartner: true,
  createActivity: true,
  updateActivity: true,
  duplicateActivity: true,
  cancelActivity: true,
  createCategory: true,
  createMovement: true,
  updateMovement: true,
  voidMovement: true
};

var SHEETS = {
  Socios: ["id", "nombre", "email", "telefono", "notas", "creado", "actualizado"],
  Actividades: ["id", "nombre", "tipo", "fecha", "inicio", "fin", "responsable", "estado", "descripcion", "notas", "pendientes", "repeticion", "creado", "actualizado"],
  Movimientos: ["id", "tipo", "fecha", "concepto", "importe", "categoriaId", "actividadId", "socioId", "notas", "estado", "motivoAnulacion", "creado", "actualizado"],
  Categorias: ["id", "nombre", "aplicaA", "predeterminada", "activa"]
};

var ACTIVITY_TYPES = ["event", "class", "workshop", "rehearsal", "meeting", "maintenance", "other"];
var ACTIVITY_STATUS = ["scheduled", "completed", "cancelled"];
var MOVEMENT_TYPES = ["income", "expense", "partner_contribution", "partner_expense", "reimbursement"];
var PARTNER_TYPES = ["partner_contribution", "partner_expense", "reimbursement"];
var OPERATING_EXPENSES = ["expense", "partner_expense"];

var DEFAULT_CATEGORIES = [
  "Difusión",
  "Artistas",
  "Sonido",
  "Insumos",
  "Alquiler",
  "Servicios",
  "Mantenimiento",
  "Equipamiento",
  "Administración",
  "Otros"
];

function preparar() {
  ensureSheets(true);
}

function doGet() {
  return json({ ok: true, service: "Casa Lupanal" });
}

function doPost(e) {
  ROW_CACHE = {};
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    var authError = checkAuth(body.user, body.password);
    if (authError) return json({ ok: false, error: authError });
    if (WRITE_ACTIONS[body.action]) ensureSheets(false);
    return json({ ok: true, data: handle(body) });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) });
  }
}

function handle(body) {
  var action = body.action;
  var data = body.data || {};
  if (action === "login") return { ok: true };
  if (action === "dashboard") return dashboard();
  if (action === "listPartners") return partnerSummaries();
  if (action === "createPartner") return createPartner(data);
  if (action === "updatePartner") return updatePartner(body.id, data);
  if (action === "partnerLedger") return partnerLedger(body.id);
  if (action === "listActivities") return listActivities(body.from, body.to);
  if (action === "createActivity") return createActivity(data);
  if (action === "getActivity") return getActivity(body.id);
  if (action === "updateActivity") return updateActivity(body.id, data);
  if (action === "duplicateActivity") return duplicateActivity(body.id, data.date || body.date);
  if (action === "cancelActivity") return cancelActivity(body.id);
  if (action === "listCategories") return listCategories();
  if (action === "createCategory") return createCategory(data);
  if (action === "listMovements") return listMovements(body);
  if (action === "movementsScreen") return movementsScreen(body);
  if (action === "createMovement") return createMovement(data);
  if (action === "updateMovement") return updateMovement(body.id, data);
  if (action === "voidMovement") return voidMovement(body.id, data.reason || body.reason);
  if (action === "reports") return reports(body.from, body.to);
  if (action === "exportCsv") return { csv: exportCsv(body.from, body.to) };
  throw new Error("Acción desconocida.");
}

function checkAuth(user, password) {
  var props = PropertiesService.getScriptProperties();
  var expectedUser = props.getProperty("APP_USER");
  var expectedPassword = props.getProperty("APP_PASSWORD");
  if (!expectedUser || !expectedPassword) {
    return "Falta APP_USER o APP_PASSWORD en las propiedades del script.";
  }
  if (String(user || "") !== expectedUser || String(password || "") !== expectedPassword) {
    return "Usuario o contraseña incorrectos.";
  }
  return null;
}

function ensureSheets(formatColumns) {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error("Abrí el script desde la hoja de cálculo.");
  Object.keys(SHEETS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(SHEETS[name]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SHEETS[name].length).setFontWeight("bold");
  });
  var categorias = ss.getSheetByName("Categorias");
  if (categorias.getLastRow() < 2) {
    DEFAULT_CATEGORIES.forEach(function (name, index) {
      writeRow(categorias, [index + 1, name, "both", true, true]);
    });
    categorias.getRange(2, 4, DEFAULT_CATEGORIES.length, 2).setValues(
      DEFAULT_CATEGORIES.map(function () { return [true, true]; })
    );
  }
  ["Hoja 1", "Sheet1"].forEach(function (name) {
    var extra = ss.getSheetByName(name);
    if (extra && extra.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(extra);
  });
  if (formatColumns) markTextColumns(ss);
}

function markTextColumns(ss) {
  var activities = ss.getSheetByName("Actividades");
  textColumn(activities, 4);
  textColumn(activities, 5);
  textColumn(activities, 6);
  textColumn(ss.getSheetByName("Movimientos"), 3);
  normalizeActivityTimes(activities);
}

function textColumn(sheet, column) {
  sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
}

function writeRow(sheet, values) {
  ROW_CACHE = {};
  var row = Math.max(sheet.getLastRow(), 1) + 1;
  var range = sheet.getRange(row, 1, 1, values.length);
  range.setValues([values]);
  return row;
}

function replaceRow(sheet, row, values) {
  ROW_CACHE = {};
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function rows(name) {
  if (Object.prototype.hasOwnProperty.call(ROW_CACHE, name)) return ROW_CACHE[name];
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error("Falta la hoja " + name + ". En Apps Script, ejecutá preparar.");
  var headers = SHEETS[name];
  var last = sheet.getLastRow();
  if (last < 2) {
    ROW_CACHE[name] = [];
    return ROW_CACHE[name];
  }
  var result = sheet.getRange(2, 1, last - 1, headers.length).getValues().map(function (row, index) {
    var obj = { _row: index + 2 };
    headers.forEach(function (header, column) { obj[header] = row[column]; });
    return obj;
  }).filter(function (row) {
    return row.id !== "" && row.id != null;
  });
  ROW_CACHE[name] = result;
  return result;
}

function rowNumber(name, id) {
  var found = rows(name).filter(function (row) { return Number(row.id) === Number(id); })[0];
  return found ? found._row : 0;
}

function nextId(name) {
  return rows(name).reduce(function (max, row) {
    return Math.max(max, Number(row.id) || 0);
  }, 0) + 1;
}

function text(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function asDate(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  var raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

function asTime(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    return ("0" + value.getHours()).slice(-2) + ":" + ("0" + value.getMinutes()).slice(-2);
  }
  if (typeof value === "number" && isFinite(value)) {
    var minutes = Math.round((((value % 1) + 1) % 1) * 24 * 60);
    return ("0" + Math.floor(minutes / 60)).slice(-2) + ":" + ("0" + (minutes % 60)).slice(-2);
  }
  var match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return ("0" + Number(match[1])).slice(-2) + ":" + match[2];
}

function normalizeActivityTimes(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var range = sheet.getRange(2, 5, last - 1, 2);
  var values = range.getValues();
  var changed = false;
  var next = values.map(function (row) {
    return row.map(function (value) {
      var time = asTime(value);
      if (String(value || "") !== time) changed = true;
      return time;
    });
  });
  if (!changed) return;
  range.setNumberFormat("@");
  range.setValues(next);
}

function asBool(value) {
  return value === true || value === "true" || value === "TRUE";
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

function todayBA() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function requireText(value, message) {
  if (!String(value || "").trim()) throw new Error(message);
  return String(value).trim();
}

function validAmount(amount) {
  var number = Number(amount);
  if (!isFinite(number) || number <= 0) throw new Error("El importe debe ser mayor que cero.");
  if (Math.abs(number * 100 - Math.round(number * 100)) > 0.001) {
    throw new Error("El importe admite hasta dos decimales.");
  }
  return money(number);
}

function addRepeat(value, recurrence, step) {
  var parts = value.split("-").map(Number);
  var year = parts[0];
  var month = parts[1];
  var day = parts[2];
  if (recurrence === "weekly" || recurrence === "biweekly") {
    var date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + (recurrence === "weekly" ? 7 : 14) * step);
    return date.toISOString().slice(0, 10);
  }
  var targetMonth = month - 1 + step;
  var lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function mapPartner(row, summary) {
  return {
    id: Number(row.id),
    name: text(row.nombre),
    email: text(row.email),
    phone: text(row.telefono),
    notes: text(row.notas),
    totalContributed: summary.totalContributed,
    directExpenses: summary.directExpenses,
    reimbursements: summary.reimbursements,
    balanceDue: summary.balanceDue,
    createdAt: text(row.creado)
  };
}

function mapActivity(row) {
  var pending = [];
  if (row.pendientes) {
    try { pending = JSON.parse(row.pendientes); } catch (err) { pending = []; }
    if (!Array.isArray(pending)) pending = [];
  }
  return {
    id: Number(row.id),
    name: text(row.nombre),
    type: text(row.tipo),
    date: asDate(row.fecha),
    startTime: asTime(row.inicio) || null,
    endTime: asTime(row.fin) || null,
    responsible: text(row.responsable),
    status: text(row.estado) || "scheduled",
    description: text(row.descripcion),
    notes: text(row.notas),
    pendingTasks: pending,
    recurrenceGroup: text(row.repeticion),
    createdAt: text(row.creado)
  };
}

function mapCategory(row) {
  return {
    id: Number(row.id),
    name: text(row.nombre),
    appliesTo: text(row.aplicaA),
    isDefault: asBool(row.predeterminada),
    active: asBool(row.activa)
  };
}

function mapMovement(row, categories, activities, partners) {
  var category = findById(categories, row.categoriaId);
  var activity = findById(activities, row.actividadId);
  var partner = findById(partners, row.socioId);
  return {
    id: Number(row.id),
    type: text(row.tipo),
    date: asDate(row.fecha),
    concept: text(row.concepto),
    amount: money(row.importe),
    categoryId: row.categoriaId === "" || row.categoriaId == null ? null : Number(row.categoriaId),
    categoryName: category ? text(category.nombre) : null,
    activityId: row.actividadId === "" || row.actividadId == null ? null : Number(row.actividadId),
    activityName: activity ? text(activity.nombre) : null,
    partnerId: row.socioId === "" || row.socioId == null ? null : Number(row.socioId),
    partnerName: partner ? text(partner.nombre) : null,
    receiptPath: null,
    notes: text(row.notas),
    status: text(row.estado) || "active",
    voidReason: text(row.motivoAnulacion),
    createdAt: text(row.creado),
    updatedAt: text(row.actualizado)
  };
}

function findById(list, id) {
  if (id === "" || id == null) return null;
  var numeric = Number(id);
  for (var i = 0; i < list.length; i += 1) {
    if (Number(list[i].id) === numeric) return list[i];
  }
  return null;
}

function movementViews(options) {
  options = options || {};
  var categories = rows("Categorias");
  var activities = rows("Actividades");
  var partners = rows("Socios");
  return rows("Movimientos").map(function (row) {
    return mapMovement(row, categories, activities, partners);
  }).filter(function (row) {
    if (!options.includeVoided && row.status !== "active") return false;
    if (options.from && row.date < options.from) return false;
    if (options.to && row.date > options.to) return false;
    if (options.type && row.type !== options.type) return false;
    if (options.partnerId != null && row.partnerId !== Number(options.partnerId)) return false;
    if (options.activityId != null && row.activityId !== Number(options.activityId)) return false;
    return true;
  }).sort(function (a, b) {
    if (a.date === b.date) return String(b.createdAt).localeCompare(String(a.createdAt));
    return a.date < b.date ? 1 : -1;
  });
}

function operatingTotals(list) {
  var income = 0;
  var expenses = 0;
  list.forEach(function (row) {
    if (row.type === "income") income += row.amount;
    if (OPERATING_EXPENSES.indexOf(row.type) !== -1) expenses += row.amount;
  });
  return { income: money(income), expenses: money(expenses), result: money(income - expenses) };
}

function debtFrom(list) {
  return money(list.reduce(function (total, row) {
    if (row.type === "partner_expense") return total + row.amount;
    if (row.type === "reimbursement") return total - row.amount;
    return total;
  }, 0));
}

function partnerSummaries() {
  var movements = movementViews({ includeVoided: false });
  return rows("Socios").map(function (row) {
    var related = movements.filter(function (item) { return item.partnerId === Number(row.id); });
    var summary = {
      totalContributed: money(sumType(related, "partner_contribution")),
      directExpenses: money(sumType(related, "partner_expense")),
      reimbursements: money(sumType(related, "reimbursement"))
    };
    summary.balanceDue = money(summary.directExpenses - summary.reimbursements);
    return mapPartner(row, summary);
  }).sort(function (a, b) { return a.name.localeCompare(b.name, "es"); });
}

function sumType(list, type) {
  return list.reduce(function (total, row) {
    return row.type === type ? total + row.amount : total;
  }, 0);
}

function partnerRow(id, input, created) {
  return [
    id,
    requireText(input.name, "El miembro necesita un nombre."),
    text(input.email) || "",
    text(input.phone) || "",
    text(input.notes) || "",
    created,
    nowIso()
  ];
}

function createPartner(input) {
  var id = nextId("Socios");
  var created = nowIso();
  writeRow(SpreadsheetApp.getActive().getSheetByName("Socios"), partnerRow(id, input, created));
  return partnerSummaries().filter(function (item) { return item.id === id; })[0];
}

function updatePartner(id, input) {
  var current = findById(rows("Socios"), id);
  if (!current) throw new Error("Miembro no encontrado.");
  var merged = {
    name: input.name != null ? input.name : current.nombre,
    email: input.email !== undefined ? input.email : current.email,
    phone: input.phone !== undefined ? input.phone : current.telefono,
    notes: input.notes !== undefined ? input.notes : current.notas
  };
  replaceRow(
    SpreadsheetApp.getActive().getSheetByName("Socios"),
    rowNumber("Socios", id),
    partnerRow(Number(id), merged, current.creado)
  );
  return partnerSummaries().filter(function (item) { return item.id === Number(id); })[0];
}

function partnerLedger(id) {
  var partner = partnerSummaries().filter(function (item) { return item.id === Number(id); })[0];
  if (!partner) throw new Error("Miembro no encontrado.");
  return {
    partner: partner,
    movements: movementViews({ partnerId: Number(id), includeVoided: true })
  };
}

function listActivities(from, to) {
  return rows("Actividades").map(mapActivity).filter(function (row) {
    if (from && row.date < String(from).slice(0, 10)) return false;
    if (to && row.date > String(to).slice(0, 10)) return false;
    return true;
  }).sort(function (a, b) {
    if (a.date === b.date) return String(a.startTime || "").localeCompare(String(b.startTime || ""));
    return a.date < b.date ? -1 : 1;
  });
}

function activityRow(id, input, created, recurrenceGroup) {
  var pending = input.pendingTasks || input.pendientes || [];
  if (!Array.isArray(pending)) pending = [];
  var type = input.type || input.tipo;
  if (ACTIVITY_TYPES.indexOf(type) === -1) throw new Error("Tipo de actividad no válido.");
  var status = input.status || input.estado || "scheduled";
  if (ACTIVITY_STATUS.indexOf(status) === -1) throw new Error("Estado de actividad no válido.");
  return [
    id,
    requireText(input.name || input.nombre, "La actividad necesita un nombre."),
    type,
    asDate(input.date || input.fecha),
    asTime(input.startTime || input.inicio),
    asTime(input.endTime || input.fin),
    text(input.responsible || input.responsable) || "",
    status,
    text(input.description || input.descripcion) || "",
    text(input.notes || input.notas) || "",
    JSON.stringify(pending),
    recurrenceGroup || "",
    created,
    nowIso()
  ];
}

function createActivity(input) {
  var recurrence = input.recurrence || "none";
  var count = recurrence !== "none" ? Math.min(Math.max(Number(input.recurrenceCount) || 1, 1), 24) : 1;
  var firstDate = asDate(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) throw new Error("La actividad necesita una fecha.");
  var group = count > 1 ? Utilities.getUuid() : "";
  var created = [];
  var sheet = SpreadsheetApp.getActive().getSheetByName("Actividades");
  for (var index = 0; index < count; index += 1) {
    var id = nextId("Actividades");
    var date = index === 0 ? firstDate : addRepeat(firstDate, recurrence, index);
    var copy = {};
    Object.keys(input).forEach(function (key) { copy[key] = input[key]; });
    copy.date = date;
    var stamp = nowIso();
    var written = writeRow(sheet, activityRow(id, copy, stamp, group));
    sheet.getRange(written, 4, 1, 3).setNumberFormat("@");
    created.push(mapActivity(findById(rows("Actividades"), id)));
  }
  return created;
}

function getActivity(id) {
  var activity = findById(rows("Actividades"), id);
  if (!activity) throw new Error("Actividad no encontrada.");
  var movements = movementViews({ activityId: Number(id), includeVoided: false });
  var totals = operatingTotals(movements);
  return {
    activity: mapActivity(activity),
    movements: movements,
    incomeTotal: totals.income,
    expenseTotal: totals.expenses,
    result: totals.result
  };
}

function updateActivity(id, input) {
  var current = findById(rows("Actividades"), id);
  if (!current) throw new Error("Actividad no encontrada.");
  var pending = input.pendingTasks;
  if (pending == null && current.pendientes) {
    try { pending = JSON.parse(current.pendientes); } catch (err) { pending = []; }
  }
  var merged = {
    name: input.name != null ? input.name : current.nombre,
    type: input.type != null ? input.type : current.tipo,
    date: input.date != null ? input.date : current.fecha,
    startTime: input.startTime !== undefined ? input.startTime : current.inicio,
    endTime: input.endTime !== undefined ? input.endTime : current.fin,
    responsible: input.responsible !== undefined ? input.responsible : current.responsable,
    status: input.status != null ? input.status : current.estado,
    description: input.description !== undefined ? input.description : current.descripcion,
    notes: input.notes !== undefined ? input.notes : current.notas,
    pendingTasks: pending || []
  };
  var sheet = SpreadsheetApp.getActive().getSheetByName("Actividades");
  var row = rowNumber("Actividades", id);
  replaceRow(sheet, row, activityRow(Number(id), merged, current.creado, text(current.repeticion) || ""));
  sheet.getRange(row, 4, 1, 3).setNumberFormat("@");
  return mapActivity(findById(rows("Actividades"), id));
}

function duplicateActivity(id, date) {
  var source = findById(rows("Actividades"), id);
  if (!source) throw new Error("Actividad no encontrada.");
  var nextDate = asDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) throw new Error("La copia necesita una fecha.");
  var newId = nextId("Actividades");
  var pending = [];
  try { pending = JSON.parse(source.pendientes || "[]"); } catch (err) { pending = []; }
  var sheet = SpreadsheetApp.getActive().getSheetByName("Actividades");
  var written = writeRow(sheet, activityRow(newId, {
    name: source.nombre,
    type: source.tipo,
    date: nextDate,
    startTime: source.inicio,
    endTime: source.fin,
    responsible: source.responsable,
    status: "scheduled",
    description: source.descripcion,
    notes: source.notas,
    pendingTasks: pending
  }, nowIso(), ""));
  sheet.getRange(written, 4, 1, 3).setNumberFormat("@");
  return mapActivity(findById(rows("Actividades"), newId));
}

function cancelActivity(id) {
  var current = findById(rows("Actividades"), id);
  if (!current) throw new Error("Actividad no encontrada.");
  return updateActivity(id, { status: "cancelled" });
}

function listCategories() {
  return rows("Categorias").map(mapCategory).filter(function (row) {
    return row.active;
  }).sort(function (a, b) { return a.name.localeCompare(b.name, "es"); });
}

function createCategory(input) {
  var name = requireText(input.name, "La categoría necesita un nombre.");
  var appliesTo = input.appliesTo;
  if (["income", "expense", "both"].indexOf(appliesTo) === -1) {
    throw new Error("La categoría tiene que aplicar a ingresos, gastos o ambos.");
  }
  var exists = rows("Categorias").some(function (row) {
    return String(row.nombre).toLowerCase() === name.toLowerCase();
  });
  if (exists) throw new Error("Esa categoría ya existe.");
  var id = nextId("Categorias");
  var sheet = SpreadsheetApp.getActive().getSheetByName("Categorias");
  writeRow(sheet, [id, name, appliesTo, false, true]);
  return mapCategory(findById(rows("Categorias"), id));
}

function listMovements(body) {
  return movementViews({
    from: body.from ? String(body.from).slice(0, 10) : undefined,
    to: body.to ? String(body.to).slice(0, 10) : undefined,
    type: body.type || undefined,
    includeVoided: body.includeVoided === true
  });
}

function movementsScreen(body) {
  return {
    movements: listMovements(body),
    categories: listCategories(),
    partners: partnerSummaries(),
    activities: listActivities()
  };
}

function nullableId(value) {
  if (value === "" || value == null) return "";
  var number = Number(value);
  if (!isFinite(number)) throw new Error("Identificador no válido.");
  return number;
}

function validateMovement(input) {
  if (MOVEMENT_TYPES.indexOf(input.type) === -1) throw new Error("Tipo de movimiento no válido.");
  var amount = validAmount(input.amount);
  var date = asDate(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("El movimiento necesita una fecha.");
  var concept = requireText(input.concept, "El movimiento necesita un concepto.");
  var partnerId = nullableId(input.partnerId);
  var categoryId = nullableId(input.categoryId);
  var activityId = nullableId(input.activityId);
  var needsPartner = PARTNER_TYPES.indexOf(input.type) !== -1;
  if (needsPartner && partnerId === "") {
    throw new Error("Los aportes, gastos cubiertos y devoluciones deben tener un miembro.");
  }
  if (!needsPartner && partnerId !== "") {
    throw new Error("Los ingresos y gastos de la casa no llevan miembro.");
  }
  if (categoryId !== "") {
    var category = findById(rows("Categorias"), categoryId);
    if (!category || !asBool(category.activa)) throw new Error("La categoría seleccionada no existe.");
    var expected = input.type === "income" ? "income" : (OPERATING_EXPENSES.indexOf(input.type) !== -1 ? "expense" : null);
    if (expected && category.aplicaA !== "both" && category.aplicaA !== expected) {
      throw new Error("La categoría no corresponde a este tipo de movimiento.");
    }
  }
  if (activityId !== "" && !findById(rows("Actividades"), activityId)) {
    throw new Error("La actividad seleccionada no existe.");
  }
  if (partnerId !== "" && !findById(rows("Socios"), partnerId)) {
    throw new Error("El miembro seleccionado no existe.");
  }
  return {
    type: input.type,
    date: date,
    concept: concept,
    amount: amount,
    categoryId: categoryId,
    activityId: activityId,
    partnerId: partnerId,
    notes: text(input.notes) || ""
  };
}

function movementRow(id, input, status, voidReason, created) {
  return [
    id,
    input.type,
    input.date,
    input.concept,
    input.amount,
    input.categoryId,
    input.activityId,
    input.partnerId,
    input.notes,
    status,
    voidReason || "",
    created,
    nowIso()
  ];
}

function movementById(id) {
  return movementViews({ includeVoided: true }).filter(function (row) {
    return row.id === Number(id);
  })[0];
}

function createMovement(input) {
  var valid = validateMovement(input);
  var id = nextId("Movimientos");
  var sheet = SpreadsheetApp.getActive().getSheetByName("Movimientos");
  var row = writeRow(sheet, movementRow(id, valid, "active", "", nowIso()));
  sheet.getRange(row, 3).setNumberFormat("@");
  return movementById(id);
}

function updateMovement(id, input) {
  var current = findById(rows("Movimientos"), id);
  if (!current) throw new Error("Movimiento no encontrado.");
  if (text(current.estado) === "voided") throw new Error("No se puede editar un movimiento anulado.");
  var merged = validateMovement({
    type: input.type != null ? input.type : current.tipo,
    date: input.date != null ? input.date : current.fecha,
    concept: input.concept != null ? input.concept : current.concepto,
    amount: input.amount != null ? input.amount : current.importe,
    categoryId: input.categoryId !== undefined ? input.categoryId : current.categoriaId,
    activityId: input.activityId !== undefined ? input.activityId : current.actividadId,
    partnerId: input.partnerId !== undefined ? input.partnerId : current.socioId,
    notes: input.notes !== undefined ? input.notes : current.notas
  });
  var sheet = SpreadsheetApp.getActive().getSheetByName("Movimientos");
  var row = rowNumber("Movimientos", id);
  replaceRow(sheet, row, movementRow(Number(id), merged, "active", "", current.creado));
  sheet.getRange(row, 3).setNumberFormat("@");
  return movementById(id);
}

function voidMovement(id, reason) {
  var current = findById(rows("Movimientos"), id);
  if (!current) throw new Error("Movimiento no encontrado.");
  if (text(current.estado) === "voided") throw new Error("El movimiento ya está anulado.");
  var why = requireText(reason, "La anulación necesita un motivo.");
  var sheet = SpreadsheetApp.getActive().getSheetByName("Movimientos");
  var row = rowNumber("Movimientos", id);
  var values = sheet.getRange(row, 1, 1, SHEETS.Movimientos.length).getValues()[0];
  values[9] = "voided";
  values[10] = why;
  values[12] = nowIso();
  replaceRow(sheet, row, values);
  return movementById(id);
}

function dashboard() {
  var today = todayBA();
  var monthStart = today.slice(0, 7) + "-01";
  var yearStart = today.slice(0, 4) + "-01-01";
  var active = movementViews({ includeVoided: false });
  var month = operatingTotals(active.filter(function (row) { return row.date >= monthStart && row.date <= today; }));
  var year = operatingTotals(active.filter(function (row) { return row.date >= yearStart && row.date <= today; }));
  var upcoming = listActivities(today, null).filter(function (row) {
    return row.status === "scheduled";
  }).slice(0, 6);
  return {
    monthIncome: month.income,
    monthExpenses: month.expenses,
    monthResult: month.result,
    accumulatedResult: year.result,
    partnerDebt: debtFrom(active),
    upcomingActivities: upcoming,
    recentMovements: active.slice(0, 8)
  };
}

function reports(from, to) {
  var start = asDate(from);
  var end = asDate(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("El informe necesita un período.");
  }
  if (start > end) throw new Error("El inicio del período debe ser anterior al fin.");
  var period = movementViews({ from: start, to: end });
  var opening = movementViews({ to: previousDate(start) });
  var totals = operatingTotals(period);
  var byCategory = {};
  var generalExpenses = 0;
  period.forEach(function (row) {
    if (OPERATING_EXPENSES.indexOf(row.type) === -1) return;
    var label = row.categoryName || "Sin categoría";
    byCategory[label] = money((byCategory[label] || 0) + row.amount);
    if (!row.activityId) generalExpenses += row.amount;
  });
  var activities = listActivities(start, end).map(function (activity) {
    var related = period.filter(function (row) { return row.activityId === activity.id; });
    var activityTotals = operatingTotals(related);
    return {
      activityId: activity.id,
      activityName: activity.name,
      date: activity.date,
      income: activityTotals.income,
      expense: activityTotals.expenses,
      result: activityTotals.result
    };
  });
  var debt = debtFrom(opening);
  var history = [{ date: start, amount: debt }];
  period.filter(function (row) {
    return row.type === "partner_expense" || row.type === "reimbursement";
  }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (row) {
    debt = money(debt + (row.type === "partner_expense" ? row.amount : -row.amount));
    var previous = history[history.length - 1];
    if (previous && previous.date === row.date) previous.amount = debt;
    else history.push({ date: row.date, amount: debt });
  });
  if (history[history.length - 1].date !== end) history.push({ date: end, amount: debt });
  return {
    incomeTotal: totals.income,
    expenseTotal: totals.expenses,
    result: totals.result,
    generalExpenses: money(generalExpenses),
    expensesByCategory: Object.keys(byCategory).map(function (name) {
      return { categoryName: name, amount: byCategory[name] };
    }),
    activities: activities,
    partners: partnerSummaries(),
    debtHistory: history
  };
}

function previousDate(value) {
  var parts = value.split("-").map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function exportCsv(from, to) {
  var list = movementViews({
    from: from ? String(from).slice(0, 10) : undefined,
    to: to ? String(to).slice(0, 10) : undefined
  });
  var header = ["fecha", "tipo", "concepto", "importe", "categoría", "actividad", "miembro", "estado", "observaciones"];
  var lines = [header.map(csvCell).join(",")];
  list.forEach(function (row) {
    lines.push([
      row.date,
      row.type,
      row.concept,
      row.amount.toFixed(2),
      row.categoryName,
      row.activityName,
      row.partnerName,
      row.status,
      row.notes
    ].map(csvCell).join(","));
  });
  return lines.join("\r\n");
}

function csvCell(value) {
  var cell = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replace(/"/g, '""') + '"';
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
