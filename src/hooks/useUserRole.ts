import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getActiveLocalDB } from '@/lib/localdb';

export type AppRole = 'admin' | 'manager' | 'staff';

export interface RolePermissions {
  canAccessSettings: boolean;
  canAccessReports: boolean;
  canAccessUserManagement: boolean;
  canManageProducts: boolean;
  canManageCustomers: boolean;
  canManageSuppliers: boolean;
  canManageCategories: boolean;
  canAccessPOS: boolean;
  canAccessSales: boolean;
  canAccessReturns: boolean;
  canAccessDashboard: boolean;
  canBackupRestore: boolean;
  canResetData: boolean;
}

// Fallback permissions if DB fetch fails
const fallbackPermissions: Record<AppRole, RolePermissions> = {
  admin: {
    canAccessSettings: true, canAccessReports: true, canAccessUserManagement: true,
    canManageProducts: true, canManageCustomers: true, canManageSuppliers: true,
    canManageCategories: true, canAccessPOS: true, canAccessSales: true,
    canAccessReturns: true, canAccessDashboard: true, canBackupRestore: true, canResetData: true,
  },
  manager: {
    canAccessSettings: false, canAccessReports: false, canAccessUserManagement: false,
    canManageProducts: true, canManageCustomers: false, canManageSuppliers: false,
    canManageCategories: false, canAccessPOS: false, canAccessSales: true,
    canAccessReturns: false, canAccessDashboard: true, canBackupRestore: true, canResetData: false,
  },
  staff: {
    canAccessSettings: false, canAccessReports: false, canAccessUserManagement: false,
    canManageProducts: false, canManageCustomers: false, canManageSuppliers: false,
    canManageCategories: false, canAccessPOS: false, canAccessSales: true,
    canAccessReturns: false, canAccessDashboard: true, canBackupRestore: false, canResetData: false,
  },
};

function dbRowToPermissions(row: any): RolePermissions {
  return {
    canAccessDashboard: row.can_access_dashboard,
    canAccessPOS: row.can_access_pos,
    canAccessSales: row.can_access_sales,
    canAccessReports: row.can_access_reports,
    canAccessSettings: row.can_access_settings,
    canManageProducts: row.can_manage_products,
    canManageCustomers: row.can_manage_customers,
    canManageSuppliers: row.can_manage_suppliers,
    canManageCategories: row.can_manage_categories,
    canAccessReturns: row.can_access_returns,
    canAccessUserManagement: row.can_access_user_management,
    canBackupRestore: row.can_backup_restore,
    canResetData: row.can_reset_data,
  };
}

/**
 * Read the cached role + permissions written into Dexie by
 * RefreshCachePanel / UserManagement. Used as an offline fallback so
 * the dashboard renders even with no internet.
 */
async function readCachedRole(userId: string): Promise<{
  role: AppRole;
  permissions: RolePermissions;
} | null> {
  try {
    const db = getActiveLocalDB();
    if (!db) return null;
    const roleRow = await db.user_roles_cache
      .where('user_id')
      .equals(userId)
      .first();
    const userRole = (roleRow?.role as AppRole) || 'staff';
    let permissions: RolePermissions;
    if (userRole === 'admin') {
      permissions = fallbackPermissions.admin;
    } else {
      const permRow = await db.role_permissions_cache
        .where('role')
        .equals(userRole)
        .first();
      permissions = permRow
        ? dbRowToPermissions(permRow)
        : fallbackPermissions[userRole] || fallbackPermissions.staff;
    }
    return { role: userRole, permissions };
  } catch {
    return null;
  }
}

/**
 * Persist the freshly fetched role + permissions to the local cache so
 * the next offline session can read them instantly.
 */
async function writeRoleCache(
  userId: string,
  role: AppRole,
  permRow: any | null,
) {
  try {
    const db = getActiveLocalDB();
    if (!db) return;
    const now = new Date().toISOString();
    await db.user_roles_cache.put({
      id: userId,
      user_id: userId,
      role,
      _cachedAt: now,
    } as any);
    if (permRow) {
      await db.role_permissions_cache.put({
        ...permRow,
        id: permRow.role,
        _cachedAt: now,
      } as any);
    }
  } catch {
    /* non-fatal */
  }
}

export function useUserRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions>(fallbackPermissions.staff);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        // getSession() reads from local storage and works fully offline,
        // unlike getUser() which can hang without a network connection.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) {
          setLoading(false);
          return;
        }

        setUserId(user.id);

        // ---- 1. Hydrate immediately from local cache (works offline) ----
        const cached = await readCachedRole(user.id);
        if (cached) {
          setRole(cached.role);
          setIsAdmin(cached.role === 'admin');
          setIsManager(cached.role === 'manager' || cached.role === 'admin');
          setPermissions(cached.permissions);
          // Reveal the dashboard right away — no waiting on the network.
          setLoading(false);
        }

        // ---- 2. If we're online, refresh from the server in the background ----
        const online =
          typeof navigator === 'undefined' ? true : navigator.onLine;
        if (!online) {
          if (!cached) {
            // No cache + no network → safest default is staff.
            setRole('staff');
            setPermissions(fallbackPermissions.staff);
            setLoading(false);
          }
          return;
        }

        try {
          const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) console.error('Error fetching role:', error);

          const userRole = (data?.role as AppRole) || cached?.role || 'staff';
          setRole(userRole);
          setIsAdmin(userRole === 'admin');
          setIsManager(userRole === 'manager' || userRole === 'admin');

          const { data: permData, error: permError } = await supabase
            .from('role_permissions')
            .select('*')
            .eq('role', userRole)
            .maybeSingle();

          if (permError || !permData) {
            if (userRole === 'admin') {
              setPermissions(fallbackPermissions.admin);
            } else {
              setPermissions(
                fallbackPermissions[userRole] || fallbackPermissions.staff,
              );
            }
          } else {
            if (userRole === 'admin') {
              setPermissions(fallbackPermissions.admin);
            } else {
              setPermissions(dbRowToPermissions(permData));
            }
          }

          // Refresh local cache for next offline session.
          writeRoleCache(user.id, userRole, permData);
        } catch (netErr) {
          // Network failure mid-flight — keep cached values.
          console.warn('Role refresh failed, using cache:', netErr);
        }
      } catch (error) {
        console.error('Error in useUserRole:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { role, isAdmin, isManager, loading, userId, permissions };
}
