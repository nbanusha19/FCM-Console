import type { Database } from "@/lib/database.types";
import { apiRequest, ApiError } from "@/lib/api";

type Tables = Database["public"]["Tables"];
type TableName = keyof Tables;
type Row<K extends TableName> = Tables[K]["Row"];
type RowData = Record<string, unknown>;
type DbError = { message: string; code?: string } | null;
type DbResult<T> = { data: T; error: DbError; count?: number | null };
type Filter = { column: string; op: "eq" | "ilike" | "in"; value: unknown };
type Order = { column: string; ascending: boolean };

interface QueryResponse {
  data: RowData[] | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

class RemoteQuery<K extends TableName> implements PromiseLike<DbResult<Row<K>[] | null>> {
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Partial<Row<K>> | Partial<Row<K>>[] = {};
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private projection = "*";
  private maxRows: number | undefined;
  private countRequested = false;
  private headOnly = false;
  private returning = false;
  private executed: Promise<DbResult<Row<K>[] | null>> | undefined;

  constructor(private readonly table: K) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.projection = columns;
    this.countRequested = options?.count === "exact";
    this.headOnly = options?.head ?? false;
    if (this.operation !== "select") this.returning = true;
    return this;
  }

  insert(values: Partial<Row<K>> | Partial<Row<K>>[]) {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  upsert(values: Partial<Row<K>> | Partial<Row<K>>[]) {
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

  in(column: string, values: unknown[]) {
    this.filters.push({ column, op: "in", value: values });
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
    if (result.error) return { data: null, error: result.error };
    if (rows.length !== 1) {
      return {
        data: null,
        error: { message: rows.length ? "Expected one row, found multiple." : "No rows found." },
      };
    }
    return { data: rows[0]!, error: null };
  }

  async maybeSingle(): Promise<DbResult<Row<K> | null>> {
    const result = await this.execute();
    const rows = result.data ?? [];
    if (result.error) return { data: null, error: result.error };
    if (rows.length > 1) return { data: null, error: { message: "Expected zero or one row, found multiple." } };
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = DbResult<Row<K>[] | null>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<Row<K>[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute(): Promise<DbResult<Row<K>[] | null>> {
    if (!this.executed) this.executed = this.executeRequest();
    return this.executed;
  }

  private async executeRequest(): Promise<DbResult<Row<K>[] | null>> {
    try {
      const response = await apiRequest<QueryResponse>(`/db/${this.table}`, {
        method: "POST",
        body: JSON.stringify({
          action: this.operation,
          data: this.payload,
          filters: this.filters,
          order: this.orders,
          columns: this.projection,
          limit: this.maxRows,
          count: this.countRequested,
          head: this.headOnly,
        }),
      });
      return {
        data: response.data as Row<K>[] | null,
        error: response.error,
        ...(response.count !== undefined ? { count: response.count } : {}),
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "The database request failed.",
          ...(error instanceof ApiError && error.status ? { code: String(error.status) } : {}),
        },
      };
    }
  }
}

function table<K extends TableName>(name: K) {
  return new RemoteQuery(name);
}

export const remoteDatabaseClient = {
  from: table,
  async rpc(name: string, args: Record<string, unknown> = {}) {
    try {
      const data = await apiRequest<unknown>(`/rpc/${name}`, {
        method: "POST",
        body: JSON.stringify(args),
      });
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : "The database operation failed." },
      };
    }
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: File) {
          const form = new FormData();
          form.set("bucket", bucket);
          form.set("path", path);
          form.set("file", file);
          try {
            const data = await apiRequest<{ path: string }>("/files", {
              method: "POST",
              body: form,
            });
            return { data, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : "File upload failed." },
            };
          }
        },
        async createSignedUrl(path: string, expiresIn?: number) {
          try {
            const query = new URLSearchParams({ bucket, path });
            if (expiresIn) query.set("expires_in", String(expiresIn));
            const data = await apiRequest<{ signedUrl: string }>(`/files/signed-url?${query.toString()}`);
            return { data: { signedUrl: data.signedUrl }, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : "Unable to create a file URL." },
            };
          }
        },
      };
    },
  },
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
  },
};
