/**
 * Schema definitions and validation utilities for backup/restore.
 * Used by Settings.tsx to:
 *  - check that the JSON file matches the expected backup schema/version
 *  - detect rows missing required fields per table BEFORE confirming restore
 */

export const CURRENT_BACKUP_VERSION = "1.1";
export const SUPPORTED_BACKUP_VERSIONS = ["1.0", "1.1"];

/** Table -> required fields. A row missing any of these is "incomplete". */
export const REQUIRED_FIELDS: Record<string, string[]> = {
  categories: ["id", "name"],
  suppliers: ["id", "name"],
  customers: ["id", "name"],
  // Phones (Apple Store) require IMEI per project rules.
  products: ["id", "name", "price", "cost", "imei"],
  sales: ["id", "user_id", "total_amount"],
  purchases: ["id", "purchase_number", "user_id"],
  sale_items: ["id", "sale_id", "product_id", "quantity", "unit_price"],
  purchase_items: ["id", "purchase_id", "product_id", "quantity", "unit_cost"],
  returns: ["id", "sale_id", "product_id", "quantity", "reason_code"],
};

/** All tables an Apple Store backup is expected to contain. */
export const EXPECTED_TABLES = Object.keys(REQUIRED_FIELDS);

export type IncompleteRow = {
  index: number;
  id?: string;
  name?: string;
  missing: string[];
};

export type TableValidation = {
  table: string;
  total: number;
  complete: number;
  incomplete: IncompleteRow[];
};

export type SchemaCheck = {
  fileVersion?: string;
  expectedVersion: string;
  versionStatus: "match" | "older-supported" | "unsupported" | "missing";
  presentTables: string[];
  missingTables: string[];
  unknownTables: string[];
};

/**
 * Inspect the parsed backup payload and report whether the schema looks
 * sane (version + table coverage). Does NOT inspect rows.
 */
export function checkBackupSchema(payload: any): SchemaCheck {
  const fileVersion: string | undefined = payload?.version;
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const dataTables = Object.keys(data);
  const presentTables = EXPECTED_TABLES.filter((t) => Array.isArray(data[t]));
  const missingTables = EXPECTED_TABLES.filter((t) => !Array.isArray(data[t]));
  const unknownTables = dataTables.filter((t) => !EXPECTED_TABLES.includes(t));

  let versionStatus: SchemaCheck["versionStatus"];
  if (!fileVersion) versionStatus = "missing";
  else if (fileVersion === CURRENT_BACKUP_VERSION) versionStatus = "match";
  else if (SUPPORTED_BACKUP_VERSIONS.includes(fileVersion))
    versionStatus = "older-supported";
  else versionStatus = "unsupported";

  return {
    fileVersion,
    expectedVersion: CURRENT_BACKUP_VERSION,
    versionStatus,
    presentTables,
    missingTables,
    unknownTables,
  };
}

/**
 * Walk every row in every table and collect rows missing required fields.
 * Returns a per-table report so the user can see exactly which records are
 * incomplete before confirming the restore.
 */
export function validateBackupRows(payload: any): TableValidation[] {
  const data = (payload?.data ?? {}) as Record<string, any[]>;
  const report: TableValidation[] = [];
  for (const table of EXPECTED_TABLES) {
    const rows = Array.isArray(data[table]) ? data[table] : [];
    const required = REQUIRED_FIELDS[table] ?? ["id"];
    const incomplete: IncompleteRow[] = [];
    rows.forEach((row, index) => {
      const missing = required.filter((f) => {
        const v = row?.[f];
        return v === undefined || v === null || v === "";
      });
      if (missing.length) {
        incomplete.push({
          index,
          id: row?.id,
          name: row?.name ?? row?.purchase_number,
          missing,
        });
      }
    });
    report.push({
      table,
      total: rows.length,
      complete: rows.length - incomplete.length,
      incomplete,
    });
  }
  return report;
}

export function totalIncomplete(report: TableValidation[]): number {
  return report.reduce((s, r) => s + r.incomplete.length, 0);
}

export function describeVersion(check: SchemaCheck): string {
  switch (check.versionStatus) {
    case "match":
      return `সংস্করণ মিলেছে (v${check.fileVersion})`;
    case "older-supported":
      return `পুরাতন কিন্তু সমর্থিত সংস্করণ (v${check.fileVersion} → v${check.expectedVersion})`;
    case "unsupported":
      return `⚠️ অসমর্থিত সংস্করণ (v${check.fileVersion}). প্রত্যাশিত v${check.expectedVersion}`;
    case "missing":
      return `⚠️ ফাইলে সংস্করণ তথ্য নেই — প্রত্যাশিত v${check.expectedVersion}`;
  }
}