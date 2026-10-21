export type Row = Record<string, unknown>;
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs fn atomically; rolls back if it throws. Nested calls join the outer transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
