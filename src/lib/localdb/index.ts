import Dexie, { type Table } from "dexie";
import type {
  LocalProduct,
  LocalCustomer,
  LocalSupplier,
  LocalCategory,
  LocalSale,
  LocalSaleItem,
  LocalDuePayment,
  LocalReturn,
  LocalInvestmentSector,
  LocalInvestmentEntry,
  LocalInvestmentIncome,
  LocalShopSettings,
  LocalActivityLog,
  SyncState,
  SyncError,
} from "./schema";

/**
 * Per-user Dexie database. Each authenticated user gets an isolated DB
 * (`applestore_<userId>`) so multiple accounts on one device never clash.
 * Shared catalog tables (products, customers, suppliers, categories) are
 * still stored per-user-DB but kept identical via the sync engine — this
 * keeps offline reads instant while preserving multi-user isolation.
 */
export class AppleStoreLocalDB extends Dexie {
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  suppliers!: Table<LocalSupplier, string>;
  categories!: Table<LocalCategory, string>;
  sales!: Table<LocalSale, string>;
  sale_items!: Table<LocalSaleItem, string>;
  due_payments!: Table<LocalDuePayment, string>;
  returns!: Table<LocalReturn, string>;
  investment_sectors!: Table<LocalInvestmentSector, string>;
  investment_entries!: Table<LocalInvestmentEntry, string>;
  investment_incomes!: Table<LocalInvestmentIncome, string>;
  shop_settings!: Table<LocalShopSettings, string>;
  activity_logs!: Table<LocalActivityLog, string>;
  sync_state!: Table<SyncState, string>;
  sync_errors!: Table<SyncError, string>;

  constructor(dbName: string) {
    super(dbName);

    this.version(1).stores({
      // Primary key first; comma-separated indexed fields after.
      products:
        "id, name, sku, barcode, imei, category_id, stock_quantity, condition, _dirty, _deleted, updated_at",
      customers: "id, name, phone, email, _dirty, _deleted, updated_at",
      suppliers: "id, name, phone, _dirty, _deleted, updated_at",
      categories: "id, name, _dirty, _deleted, updated_at",
      sales:
        "id, user_id, customer_id, status, payment_method, _dirty, _deleted, created_at, updated_at",
      sale_items: "id, sale_id, product_id, _dirty, _deleted",
      due_payments: "id, sale_id, _dirty, _deleted, created_at",
      returns: "id, sale_id, product_id, status, _dirty, _deleted, created_at",
      investment_sectors: "id, name, _dirty, _deleted",
      investment_entries: "id, sector_id, entry_type, entry_date, _dirty, _deleted",
      investment_incomes: "id, sector_id, income_date, _dirty, _deleted",
      shop_settings: "id, _dirty, _deleted",
      activity_logs: "id, user_id, action_type, created_at, _dirty",
      sync_state: "table",
    });

    this.version(2).stores({
      sync_errors: "id, table, row_id, operation, resolved, created_at",
    });
  }
}

let currentDB: AppleStoreLocalDB | null = null;
let currentUserId: string | null = null;

/**
 * Get (or lazily create) the local DB for the given user id.
 * Pass `null` to close the active DB on logout.
 */
export function getLocalDB(userId: string | null): AppleStoreLocalDB | null {
  if (!userId) {
    if (currentDB) {
      currentDB.close();
      currentDB = null;
      currentUserId = null;
    }
    return null;
  }

  if (currentDB && currentUserId === userId) {
    return currentDB;
  }

  if (currentDB) {
    currentDB.close();
  }

  currentUserId = userId;
  currentDB = new AppleStoreLocalDB(`applestore_${userId}`);
  return currentDB;
}

/**
 * Wipe the local DB for the current user (e.g. "Clear local cache" button).
 */
export async function clearLocalDB(): Promise<void> {
  if (!currentDB) return;
  const name = currentDB.name;
  currentDB.close();
  currentDB = null;
  currentUserId = null;
  await Dexie.delete(name);
}

export function getActiveLocalDB(): AppleStoreLocalDB | null {
  return currentDB;
}