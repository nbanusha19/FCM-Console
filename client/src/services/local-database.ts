import type { Database } from "@/lib/database.types";
import { ensureDevUsers } from "@/services/dev-auth";
import { KEYS, getList, type StorageKey } from "@/services/storage";

type Tables = Database["public"]["Tables"];
type TableName = keyof Tables;
type Row<K extends TableName> = Tables[K]["Row"];
type RowData = Record<string, unknown>;
type DbError = { message: string; code?: string } | null;
type DbResult<T> = { data: T; error: DbError; count?: number | null };

const TABLE_PREFIX = "fcm_local_table_";
const CHANGE_EVENT = "fcm-local-database-change";
const FILE_DB_NAME = "fcm-local-files";
const FILE_STORE_NAME = "files";

let fileDatabasePromise: Promise<IDBDatabase> | undefined;
const fileUrls = new Map<string, string>();

function isBrowser() {
  return typeof window !== "undefined";
}

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function makeToken() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function seedRows(table: TableName): RowData[] {
  if (table === "profiles") {
    return ensureDevUsers().map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.role === "EMPLOYEE" ? (user.employeeId === "EMP002" ? "Operations" : "Engineering") : "",
      designation: "",
      phone: user.phone,
      role: user.role,
      ntid: user.employeeId ?? "",
      employee_id: user.employeeId ?? "",
      branch_id: user.branchId ?? null,
      status: user.status,
      building: user.employeeId === "EMP002" ? "Hosur Office" : "Bengaluru Office",
    }));
  }
  if (table === "user_roles") {
    return ensureDevUsers().map((user) => ({ user_id: user.id, role: user.role.toLowerCase() }));
  }

  const now = new Date().toISOString();
  const seedId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  if (table === "visitor_types") {
    return [
      { code: "EMPLOYEE", label: "Internal Visitor", sort_order: 1, active: true },
      { code: "EXTERNAL", label: "External Visitor", sort_order: 2, active: true },
    ];
  }
  if (table === "vms_locations") {
    return [
      "Bengaluru Office",
      "Hosur Office",
    ].map((name, i) => ({ id: seedId(i + 1), name, active: true }));
  }
  if (table === "guest_cards") {
    return Array.from({ length: 20 }, (_, i) => ({
      id: seedId(i + 101),
      code: `TEMP-${String(i + 1).padStart(6, "0")}`,
      status: "AVAILABLE",
      current_visit_id: null,
      created_at: now,
      updated_at: now,
    }));
  }
  if (table === "emg_incident_types") {
    return ["Fire", "Building Emergency", "Natural Disaster", "Other Emergency"].map((name, i) => ({
      id: seedId(i + 201),
      name,
      sort_order: i + 1,
      active: true,
    }));
  }
  if (table === "emg_assembly_points") {
    return [
      {
        name: "Safe Assembly Room A",
        location: "Building A - Ground Floor",
        description: "Primary indoor safe room",
      },
      {
        name: "Main Ground Assembly Area",
        location: "Front parking lot, near Gate 1",
        description: "Open-air assembly area",
      },
    ].map((row, i) => ({ ...row, id: seedId(i + 301), active: true }));
  }
  if (table === "hd_providers") {
    return ["Electrical", "HVAC", "Plumbing", "Housekeeping", "Carpentry", "General Services"].map(
      (name, i) => ({
        id: seedId(i + 401),
        name: `${name} Team`,
        contact: `+91 90000 1000${i + 1}`,
        email: "provider@fcm.local",
        active: true,
      }),
    );
  }
  if (table === "hd_categories") {
    return [
      ["Electrical", "Lighting, power and wiring issues"],
      ["HVAC", "Air conditioning and ventilation"],
      ["Plumbing", "Water, leaks and sanitation"],
      ["Housekeeping", "Cleaning and waste management"],
      ["Carpentry", "Furniture and woodwork repairs"],
      ["Other", "Anything else"],
    ].map(([name, description], i) => ({
      id: seedId(i + 501),
      name,
      description,
      sort_order: i + 1,
      active: true,
    }));
  }
  if (table === "hd_subcategories") {
    const names = [
      ["Electrical", "Light Not Working"],
      ["Electrical", "Power Socket Issue"],
      ["Electrical", "Fan Not Working"],
      ["Electrical", "Wiring / Sparking"],
      ["HVAC", "AC Not Cooling"],
      ["HVAC", "AC Leaking"],
      ["HVAC", "Ventilation Issue"],
      ["HVAC", "Thermostat Issue"],
      ["Plumbing", "Water Leakage"],
      ["Plumbing", "Blocked Drain"],
      ["Plumbing", "Tap Not Working"],
      ["Plumbing", "Toilet Issue"],
      ["Housekeeping", "Restroom Cleaning"],
      ["Housekeeping", "Workspace Cleaning"],
      ["Housekeeping", "Waste Disposal"],
      ["Housekeeping", "Pest Control"],
      ["Carpentry", "Door Repair"],
      ["Carpentry", "Desk / Chair Repair"],
      ["Carpentry", "Cabinet Repair"],
      ["Other", "General Request"],
    ];
    return names.map(([category, name], i) => ({
      id: seedId(i + 601),
      category_id: seedId(
        ["Electrical", "HVAC", "Plumbing", "Housekeeping", "Carpentry", "Other"].indexOf(
          category!,
        ) + 501,
      ),
      name,
      description: "",
      active: true,
    }));
  }
  if (table === "hd_services") {
    const subs = seedRows("hd_subcategories");
    const providers = seedRows("hd_providers");
    const providerByCategory = new Map([
      [seedId(501), providers[0]?.["id"]],
      [seedId(502), providers[1]?.["id"]],
      [seedId(503), providers[2]?.["id"]],
      [seedId(504), providers[3]?.["id"]],
      [seedId(505), providers[4]?.["id"]],
      [seedId(506), providers[5]?.["id"]],
    ]);
    return subs.map((sub, i) => ({
      id: seedId(i + 701),
      category_id: sub["category_id"],
      subcategory_id: sub["id"],
      name: sub["name"],
      description: "",
      provider_id: providerByCategory.get(String(sub["category_id"])) ?? providers[5]?.["id"],
      evidence_required: true,
      active: true,
    }));
  }
  if (table === "ewp_vendors") {
    return [
      ["ABC Facility Services", "+91 90000 20001", "vendor@fcm.local"],
      ["Spark Electricals", "+91 90000 20002", "vendor@fcm.local"],
      ["CoolAir HVAC Contractors", "+91 90000 20003", "vendor@fcm.local"],
    ].map(([name, contact, email], i) => ({
      id: seedId(i + 801),
      name,
      contact,
      email,
      active: true,
    }));
  }
  if (table === "ewp_locations") {
    return [
      ["Bengaluru Office", "", ""],
      ["Hosur Office", "", ""],
    ].map(([building, floor, area], i) => ({
      id: seedId(i + 901),
      building,
      floor,
      area,
      active: true,
    }));
  }
  return [];
}

function readRows<K extends TableName>(table: K): Row<K>[] {
  if (!isBrowser()) return [];
  if (table === "profiles") {
    const createdAt = new Date().toISOString();
    return ensureDevUsers().map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.role === "EMPLOYEE" ? (user.employeeId === "EMP002" ? "Operations" : "Engineering") : "",
      designation: "",
      phone: user.phone,
      role: user.role,
      ntid: user.employeeId ?? "",
      employee_id: user.employeeId ?? "",
      branch_id: user.branchId ?? null,
      status: user.status,
      building: user.employeeId === "EMP002" ? "Hosur Office" : "Bengaluru Office",
      created_at: createdAt,
    })) as unknown as Row<K>[];
  }
  if (table === "user_roles") {
    return ensureDevUsers().map((user) => ({
      user_id: user.id,
      role: user.role.toLowerCase(),
    })) as Row<K>[];
  }
  const key = `${TABLE_PREFIX}${table}`;
  const raw = window.localStorage.getItem(key);
  if (raw !== null) {
    try {
      const rows = JSON.parse(raw) as RowData[];
      const additions =
        table === "vms_locations"
          ? ["Bengaluru Office", "Hosur Office"].map((name, index) => ({
              id: `00000000-0000-4000-8000-${String(1001 + index).padStart(12, "0")}`,
              name,
              active: true,
            }))
          : table === "ewp_locations"
            ? ["Bengaluru Office", "Hosur Office"].map((building, index) => ({
                id: `00000000-0000-4000-8000-${String(1003 + index).padStart(12, "0")}`,
                building,
                floor: "",
                area: "",
                active: true,
              }))
            : [];
      let changed = false;
      for (const addition of additions) {
        const exists =
          table === "vms_locations"
            ? rows.some(
                (row) =>
                  String(row["name"]).toLowerCase() === String(addition["name"]).toLowerCase(),
              )
            : rows.some((row) => row["building"] === addition["building"] && !row["floor"] && !row["area"]);
        if (!exists) {
          rows.push(addition);
          changed = true;
        }
      }
      if (changed) window.localStorage.setItem(key, JSON.stringify(rows));
      return rows as Row<K>[];
    } catch {
      window.localStorage.removeItem(key);
    }
  }
  const initial = seedRows(table) as Row<K>[];
  if (initial.length) window.localStorage.setItem(key, JSON.stringify(initial));
  return initial;
}

function writeRows<K extends TableName>(table: K, rows: Row<K>[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(`${TABLE_PREFIX}${table}`, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { table } }));
}

function withDefaults<K extends TableName>(table: K, value: Partial<Row<K>>): Row<K> {
  const now = new Date().toISOString();
  const row: RowData = { ...value };
  if (!("id" in row) && table !== "visitor_types" && table !== "user_roles") row["id"] = makeId();
  if (!("created_at" in row)) row["created_at"] = now;
  if (!("updated_at" in row)) row["updated_at"] = now;
  if (table === "visit_requests") {
    row["request_no"] ??=
      `VMS-${new Date().getFullYear()}-${String(readRows("visit_requests").length + 1).padStart(5, "0")}`;
    row["qr_token"] ??= makeToken();
    row["visitor_code"] ??= Math.random()
      .toString(36)
      .slice(2)
      .padEnd(6, "0")
      .slice(0, 6)
      .toUpperCase();
    row["status"] ??= "PENDING";
    row["source"] ??= "PLANNED";
  } else if (table === "emergencies") {
    row["incident_no"] ??=
      `EMG-${new Date().getFullYear()}-${String(readRows("emergencies").length + 1).padStart(4, "0")}`;
    row["status"] ??= "ACTIVE";
    row["triggered_at"] ??= now;
  } else if (table === "hd_tickets") {
    row["ticket_no"] ??=
      `HD-${new Date().getFullYear()}-${String(readRows("hd_tickets").length + 1).padStart(5, "0")}`;
    row["status"] ??= "NEW";
  } else if (table === "work_permits") {
    row["permit_no"] ??= null;
    row["status"] ??= "PENDING_HSE";
  } else if (table === "hd_notifications") {
    row["is_read"] ??= false;
  } else if (table === "emg_incident_employees") {
    row["safety_status"] ??= "NOT_RESPONDED";
    row["assistance_status"] ??= "PENDING";
    row["notification_status"] ??= "SENT";
  } else if (table === "guest_cards") {
    row["status"] ??= "AVAILABLE";
    row["current_visit_id"] ??= null;
  }
  return row as Row<K>;
}

type Filter = { column: string; op: "eq" | "ilike" | "in"; value: unknown };
type Order = { column: string; ascending: boolean };

class LocalQuery<K extends TableName> implements PromiseLike<DbResult<Row<K>[] | null>> {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Partial<Row<K>> | Partial<Row<K>>[] = {};
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private maxRows: number | undefined;
  private returning = false;
  private countRequested = false;
  private headOnly = false;
  private projection = "*";

  constructor(private readonly table: K) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.projection = columns;
    this.returning = this.operation !== "select";
    this.countRequested = options?.count === "exact";
    this.headOnly = options?.head === true;
    return this;
  }
  insert(values: Partial<Row<K>> | Partial<Row<K>>[]) {
    this.operation = "insert";
    this.payload = values;
    return this;
  }
  upsert(values: Partial<Row<K>> | Partial<Row<K>>[], _options?: unknown) {
    this.operation = "upsert";
    this.payload = values;
    return this;
  }
  update(values: Partial<Row<K>>) {
    this.operation = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }
  ilike(column: string, value: string) {
    this.filters.push({ column, op: "ilike", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(value: number) {
    this.maxRows = value;
    return this;
  }

  async single(): Promise<DbResult<Row<K> | null>> {
    const result = await this.execute();
    const rows = result.data ?? [];
    if (rows.length !== 1)
      return {
        data: null,
        error: { message: rows.length ? "Expected one row, found multiple." : "No rows found." },
      };
    return { data: rows[0]!, error: null };
  }

  async maybeSingle(): Promise<DbResult<Row<K> | null>> {
    const result = await this.execute();
    const rows = result.data ?? [];
    if (rows.length > 1)
      return { data: null, error: { message: "Expected zero or one row, found multiple." } };
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = DbResult<Row<K>[] | null>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<Row<K>[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: Row<K>) {
    const values = row as RowData;
    return this.filters.every(({ column, op, value }) => {
      const current = values[column];
      if (op === "eq") return current === value;
      if (op === "in") return (value as unknown[]).includes(current);
      const pattern = String(value)
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(String(current ?? ""));
    });
  }

  private project(row: Row<K>): Row<K> {
    if (this.projection === "*") return row;
    const projected: RowData = {};
    for (const column of this.projection.split(",").map((part) => part.trim()))
      projected[column] = (row as RowData)[column];
    return projected as Row<K>;
  }

  private async execute(): Promise<DbResult<Row<K>[] | null>> {
    if (!isBrowser()) return { data: this.headOnly ? null : [], error: null, count: 0 };
    let rows = readRows(this.table);
    let affected: Row<K>[] = [];

    if (this.operation === "insert" || this.operation === "upsert") {
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
      const next = [...rows];
      for (const input of inputs) {
        const row = withDefaults(this.table, input);
        const conflict = next.findIndex((existing) => {
          const old = existing as RowData;
          const fresh = row as RowData;
          if (fresh["id"] !== undefined) return old["id"] === fresh["id"];
          if (this.table === "visitor_types") return old["code"] === fresh["code"];
          if (this.table === "user_roles")
            return old["user_id"] === fresh["user_id"] && old["role"] === fresh["role"];
          return false;
        });
        if (this.operation === "upsert" && conflict >= 0) {
          next[conflict] = { ...next[conflict], ...row };
          affected.push(next[conflict]!);
        } else {
          next.unshift(row);
          affected.push(row);
        }
      }
      rows = next;
      writeRows(this.table, rows);
    } else if (this.operation === "update") {
      rows = rows.map((row) => {
        if (!this.matches(row)) return row;
        const updated = {
          ...row,
          ...(this.payload as Partial<Row<K>>),
          updated_at: new Date().toISOString(),
        };
        affected.push(updated);
        return updated;
      });
      writeRows(this.table, rows);
    } else if (this.operation === "delete") {
      rows = rows.filter((row) => {
        if (!this.matches(row)) return true;
        affected.push(row);
        return false;
      });
      writeRows(this.table, rows);
    } else {
      affected = rows.filter((row) => this.matches(row));
    }

    const count = affected.length;
    let resultRows = affected;
    for (const order of [...this.orders].reverse()) {
      resultRows = [...resultRows].sort((a, b) => {
        const left = (a as RowData)[order.column];
        const right = (b as RowData)[order.column];
        const comparison =
          left == null
            ? right == null
              ? 0
              : -1
            : right == null
              ? 1
              : String(left).localeCompare(String(right), undefined, { numeric: true });
        return order.ascending ? comparison : -comparison;
      });
    }
    if (this.maxRows !== undefined) resultRows = resultRows.slice(0, this.maxRows);
    const data =
      this.returning || this.operation === "select"
        ? resultRows.map((row) => this.project(row))
        : [];
    return {
      data: this.headOnly ? null : data,
      error: null,
      ...(this.countRequested ? { count } : {}),
    };
  }
}

function table<K extends TableName>(name: K) {
  return new LocalQuery(name);
}

function openFileDatabase() {
  if (!fileDatabasePromise) {
    fileDatabasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(FILE_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return fileDatabasePromise;
}

function fileKey(bucket: string, path: string) {
  return `${bucket}/${path}`;
}

const localStorageApi = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File) {
        if (!isBrowser() || !window.indexedDB)
          return {
            data: null,
            error: { message: "Local file storage is unavailable in this browser." },
          };
        try {
          const db = await openFileDatabase();
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(FILE_STORE_NAME, "readwrite");
            transaction.objectStore(FILE_STORE_NAME).put(file, fileKey(bucket, path));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          });
          return { data: { path }, error: null };
        } catch (error) {
          return {
            data: null,
            error: {
              message:
                error instanceof Error ? error.message : "Unable to store this file locally.",
            },
          };
        }
      },
      async createSignedUrl(path: string, _expiresIn?: number) {
        if (!isBrowser() || !window.indexedDB) return { data: null, error: null };
        try {
          const key = fileKey(bucket, path);
          const db = await openFileDatabase();
          const file = await new Promise<Blob | undefined>((resolve, reject) => {
            const request = db
              .transaction(FILE_STORE_NAME, "readonly")
              .objectStore(FILE_STORE_NAME)
              .get(key);
            request.onsuccess = () => resolve(request.result as Blob | undefined);
            request.onerror = () => reject(request.error);
          });
          if (!file) return { data: null, error: null };
          const previousUrl = fileUrls.get(key);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          const signedUrl = URL.createObjectURL(file);
          fileUrls.set(key, signedUrl);
          return { data: { signedUrl }, error: null };
        } catch {
          return { data: null, error: null };
        }
      },
    };
  },
};

const localAuthApi = {
  async getSession() {
    return { data: { session: null }, error: null };
  },
};

const localDatabaseClient = {
  from: table,
  auth: localAuthApi,
  storage: localStorageApi,
  async rpc(name: string, args: Record<string, unknown> = {}) {
    if (name === "expire_stale_visit_requests") {
      const now = new Date().toISOString().slice(0, 10);
      const stale = readRows("visit_requests").filter(
        (row) =>
          row.visit_date < now &&
          !["REJECTED", "CANCELLED", "CHECKED_OUT", "COMPLETED"].includes(row.status),
      );
      if (stale.length) {
        const ids = new Set(stale.map((row) => row.id));
        const rows = readRows("visit_requests").map((row) =>
          ids.has(row.id) ? { ...row, status: "EXPIRED" } : row,
        );
        writeRows("visit_requests", rows);
      }
      return { data: stale.length, error: null };
    }
    if (name === "emg_mark_read" || name === "emg_confirm_safety") {
      if (!isBrowser())
        return { data: null, error: { message: "Local database is only available in a browser." } };
      const user = JSON.parse(
        window.localStorage.getItem(KEYS.currentUser as StorageKey) ?? "null",
      ) as { id?: string } | null;
      const incidentId = args["_incident"];
      const rows = readRows("emg_incident_employees");
      const target = rows.find(
        (row) => row.incident_id === incidentId && row.employee_id === user?.id,
      );
      if (!target)
        return { data: null, error: { message: "No response row exists for this incident." } };
      const now = new Date().toISOString();
      if (name === "emg_confirm_safety") {
        const incident = readRows("emergencies").find((row) => row.id === incidentId);
        if (!incident || incident.status !== "ACTIVE")
          return { data: null, error: { message: "This emergency is no longer active." } };
        if (target.safety_status !== "NOT_RESPONDED")
          return { data: null, error: { message: "Safety status has already been reported." } };
      }
      const patch: Partial<Row<"emg_incident_employees">> =
        name === "emg_mark_read"
          ? { notification_status: "READ", read_at: now }
          : {
              safety_status: args["_status"] as "SAFE" | "NEEDS_ASSISTANCE",
              response_time: now,
            };
      writeRows(
        "emg_incident_employees",
        rows.map((row) => (row.id === target.id ? { ...row, ...patch } : row)),
      );
      return { data: null, error: null };
    }
    return { data: null, error: { message: `Local operation '${name}' is not supported.` } };
  },
  channel(_name?: string) {
    const listeners = new Set<() => void>();
    const handle = () => listeners.forEach((listener) => listener());
    return {
      on(
        _event: string,
        filter: { table?: string; event?: string; schema?: string },
        callback: () => void,
      ) {
        if (filter.table) listeners.add(callback);
        return this;
      },
      subscribe() {
        if (isBrowser()) {
          window.addEventListener(CHANGE_EVENT, handle);
          window.addEventListener("storage", handle);
        }
        return this;
      },
      unsubscribe() {
        if (isBrowser()) {
          window.removeEventListener(CHANGE_EVENT, handle);
          window.removeEventListener("storage", handle);
        }
      },
    };
  },
  removeChannel(channel: { unsubscribe?: () => void }) {
    channel.unsubscribe?.();
  },
};

export { localDatabaseClient };
