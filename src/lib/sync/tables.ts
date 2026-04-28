import type { LocalTableName } from "@/lib/localdb/adapter";

/**
 * Tables that participate in two-way sync with Supabase.
 * Order matters for push: parents before children to satisfy FK-style logic.
 */
export const SYNC_TABLES: LocalTableName[] = [
  // catalogs (no deps)
  "categories",
  "suppliers",
  "customers",
  "products",
  "investment_sectors",
  "shop_settings",
  // transactional (depend on catalogs)
  "sales",
  "sale_items",
  "due_payments",
  "returns",
  "investment_entries",
  "investment_incomes",
  // logs
  "activity_logs",
];

/**
 * Server-wins fields per table (always overwritten on pull, never pushed
 * if the server value is newer). Used for stock-correctness.
 */
export const SERVER_WINS_FIELDS: Partial<Record<LocalTableName, string[]>> = {
  products: ["stock_quantity"],
};

/** Tables that don't have an updated_at column — fall back to created_at. */
export const NO_UPDATED_AT: LocalTableName[] = [
  "sale_items",
  "due_payments",
  "activity_logs",
  "investment_entries",
  "investment_incomes",
];

export function getTimestampField(table: LocalTableName): "updated_at" | "created_at" {
  return NO_UPDATED_AT.includes(table) ? "created_at" : "updated_at";
}