/**
 * Local DB schema mirror of Supabase tables.
 * Each row carries sync metadata: _dirty, _deleted, _syncedAt.
 */

export type SyncMeta = {
  _dirty?: 0 | 1;        // 1 = unsynced local change (Dexie can't index booleans cleanly)
  _deleted?: 0 | 1;      // soft delete flag
  _syncedAt?: string;    // last successful push/pull timestamp
  _localOnly?: 0 | 1;    // created offline, no server id yet
};

export type LocalProduct = SyncMeta & {
  id: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price: number;
  cost: number;
  stock_quantity: number;
  unit?: string | null;
  image_url?: string | null;
  brand?: string | null;
  condition?: string | null;
  imei?: string | null;
  model?: string | null;
  ram?: string | null;
  storage?: string | null;
  battery?: string | null;
  supplier_name?: string | null;
  supplier_mobile?: string | null;
  supplier_nid?: string | null;
  warranty_expiry_date?: string | null;
  warranty_status?: string | null;
  low_stock_threshold?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalCustomer = SyncMeta & {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  image_url?: string | null;
  total_purchases?: number | null;
  purchase_count?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalSupplier = SyncMeta & {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalCategory = SyncMeta & {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalSale = SyncMeta & {
  id: string;
  user_id: string;
  customer_id?: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_method?: string | null;
  status?: string | null;
  notes?: string | null;
  instant_customer_name?: string | null;
  instant_customer_phone?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalSaleItem = SyncMeta & {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  condition?: string | null;
  created_at?: string;
};

export type LocalDuePayment = SyncMeta & {
  id: string;
  sale_id: string;
  amount: number;
  payment_method: string;
  notes?: string | null;
  collected_by?: string | null;
  created_at?: string;
};

export type LocalReturn = SyncMeta & {
  id: string;
  sale_id: string;
  sale_item_id: string;
  product_id: string;
  quantity: number;
  refund_amount: number;
  reason_code: string;
  reason_notes?: string | null;
  status: string;
  processed_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalInvestmentSector = SyncMeta & {
  id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LocalInvestmentEntry = SyncMeta & {
  id: string;
  sector_id: string;
  amount: number;
  entry_type: string;
  purpose?: string | null;
  notes?: string | null;
  entry_date: string;
  created_by?: string | null;
  created_at?: string;
};

export type LocalInvestmentIncome = SyncMeta & {
  id: string;
  sector_id: string;
  amount: number;
  source?: string | null;
  purpose?: string | null;
  notes?: string | null;
  income_date: string;
  created_by?: string | null;
  created_at?: string;
};

export type LocalShopSettings = SyncMeta & {
  id: string;
  shop_name: string;
  shop_subtitle?: string | null;
  shop_address?: string | null;
  shop_phone?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LocalActivityLog = SyncMeta & {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  action_type: string;
  details?: any;
  ip_address?: string | null;
  created_at?: string;
};

/**
 * Sync state — single-row table tracking last full pull per table.
 */
export type SyncState = {
  table: string;        // primary key
  lastPulledAt?: string;
  lastPushedAt?: string;
};

/**
 * Captures push/pull failures so the user can review and retry.
 */
export type SyncError = {
  id: string;            // primary key (uuid)
  table: string;         // affected local table
  row_id?: string | null;// row id that failed (if applicable)
  operation: "push" | "pull" | "delete" | "stock";
  message: string;       // human-readable error
  payload?: any;         // serialized row/payload for debugging
  created_at: string;    // ISO timestamp
  resolved?: 0 | 1;      // 1 once successfully retried/cleared
};

/**
 * Represents a sync conflict where both the local DB and the server have
 * diverging changes for the same row. Stored locally until the user picks
 * a winning side via the conflict resolution UI.
 */
export type SyncConflict = {
  id: string;                // primary key (uuid)
  table: string;             // affected local table
  row_id: string;            // conflicting row id
  local: any;                // local version (with _dirty=1)
  remote: any;               // server version
  detected_at: string;       // ISO timestamp
  resolved?: 0 | 1;          // 1 once user picked a side
  resolution?: "local" | "remote" | null;
};