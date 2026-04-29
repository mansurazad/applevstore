import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Shield, UserPlus, Trash2, Edit, Users, Crown, UserCog, User, Mail, Lock, KeyRound, Settings2 } from "lucide-react";
import { useOfflineQuery, cacheReplace, readLocalTable } from "@/hooks/useOfflineQuery";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  user_id: string;
  created_at: string;
}

interface PermissionRow {
  id: string;
  role: AppRole;
  can_access_dashboard: boolean;
  can_access_pos: boolean;
  can_access_sales: boolean;
  can_access_reports: boolean;
  can_access_settings: boolean;
  can_manage_products: boolean;
  can_manage_customers: boolean;
  can_manage_suppliers: boolean;
  can_manage_categories: boolean;
  can_access_returns: boolean;
  can_access_user_management: boolean;
  can_backup_restore: boolean;
  can_reset_data: boolean;
}

const permissionLabels: Record<string, string> = {
  can_access_dashboard: "📊 ড্যাশবোর্ড",
  can_access_pos: "🛒 POS (বিক্রয় পয়েন্ট)",
  can_access_sales: "📈 সেলস হিস্টোরি",
  can_access_reports: "📋 রিপোর্টস",
  can_access_settings: "⚙️ সেটিংস",
  can_manage_products: "📦 প্রোডাক্ট ব্যবস্থাপনা",
  can_manage_customers: "👥 কাস্টমার ব্যবস্থাপনা",
  can_manage_suppliers: "🏭 সাপ্লায়ার ব্যবস্থাপনা",
  can_manage_categories: "🏷️ ক্যাটাগরি ব্যবস্থাপনা",
  can_access_returns: "🔄 রিটার্নস",
  can_access_user_management: "👤 ব্যবহারকারী ব্যবস্থাপনা",
  can_backup_restore: "💾 ব্যাকআপ/রিস্টোর",
  can_reset_data: "🗑️ ডেটা রিসেট",
};

const permissionKeys = Object.keys(permissionLabels);

export function UserManagement() {
  const { isAdmin, userId: currentUserId, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState<AppRole>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('staff');
  const [addingUser, setAddingUser] = useState(false);

  // Fetch users (offline-aware via local cache mirror)
  const { data: users, isLoading } = useOfflineQuery<UserWithRole[]>(
    ['users-with-roles'],
    async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at');
      if (profilesError) throw profilesError;
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesError) throw rolesError;
      const merged = (profiles || []).map((profile) => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email || '',
          full_name: profile.full_name,
          role: (userRole?.role as AppRole) || 'staff',
          user_id: profile.id,
          created_at: profile.created_at,
        };
      }) as UserWithRole[];
      // Cache for offline reads
      await cacheReplace('profiles_cache', (profiles || []).map((p: any) => ({ ...p })));
      await cacheReplace(
        'user_roles_cache',
        (roles || []).map((r: any) => ({ id: r.user_id, user_id: r.user_id, role: r.role }))
      );
      return merged;
    },
    async () => {
      const [profiles, roles] = await Promise.all([
        readLocalTable<any>('profiles_cache'),
        readLocalTable<any>('user_roles_cache'),
      ]);
      return profiles.map((profile) => {
        const userRole = roles.find((r: any) => r.user_id === profile.id);
        return {
          id: profile.id,
          email: profile.email || '',
          full_name: profile.full_name,
          role: (userRole?.role as AppRole) || 'staff',
          user_id: profile.id,
          created_at: profile.created_at,
        };
      }) as UserWithRole[];
    },
    undefined,
    { enabled: isAdmin }
  );

  // Fetch role permissions (offline-aware)
  const { data: rolePermissions, isLoading: permLoading } = useOfflineQuery<PermissionRow[]>(
    ['role-permissions'],
    async () => {
      const { data, error } = await supabase.from('role_permissions').select('*');
      if (error) throw error;
      const rows = (data || []) as PermissionRow[];
      await cacheReplace('role_permissions_cache', rows.map((r: any) => ({ ...r, id: r.role })));
      return rows;
    },
    async () => {
      const rows = await readLocalTable<any>('role_permissions_cache');
      return rows as PermissionRow[];
    },
    undefined,
    { enabled: isAdmin }
  );

  const filteredUsers = users?.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTogglePermission = async (role: AppRole, key: string, value: boolean) => {
    if (role === 'admin') {
      toast.error("এডমিনের পারমিশন পরিবর্তন করা যাবে না");
      return;
    }
    if (!isOnline) {
      toast.error("অফলাইনে পারমিশন পরিবর্তন করা যাবে না");
      return;
    }
    setSavingPermissions(true);
    try {
      const { error } = await supabase
        .from('role_permissions')
        .update({ [key]: value })
        .eq('role', role);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      toast.success(`${role === 'manager' ? 'ম্যানেজার' : 'স্টাফ'} পারমিশন আপডেট হয়েছে`);
    } catch (error: any) {
      toast.error('পারমিশন আপডেট ব্যর্থ: ' + error.message);
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleAddUser = async () => {
    if (!isOnline) { toast.error("অফলাইনে নতুন ব্যবহারকারী যুক্ত করা যাবে না"); return; }
    if (!newUserEmail || !newUserPassword) {
      toast.error("ইমেইল ও পাসওয়ার্ড দিতে হবে");
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    setAddingUser(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: newUserName || newUserEmail }
        }
      });
      if (authError) throw authError;
      if (authData.user) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (newUserRole !== 'staff') {
          await supabase.from('user_roles').update({ role: newUserRole }).eq('user_id', authData.user.id);
        }
        if (newUserName) {
          await supabase.from('profiles').update({ full_name: newUserName }).eq('id', authData.user.id);
        }
        toast.success(`নতুন ${newUserRole === 'manager' ? 'ম্যানেজার' : newUserRole === 'admin' ? 'এডমিন' : 'স্টাফ'} যুক্ত হয়েছে: ${newUserEmail}`);
        queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
        setShowAddDialog(false);
        setNewUserEmail(''); setNewUserPassword(''); setNewUserName(''); setNewUserRole('staff');
      }
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        toast.error("এই ইমেইল দিয়ে ইতিমধ্যে একাউন্ট আছে");
      } else {
        toast.error('ব্যবহারকারী যুক্ত করতে ব্যর্থ: ' + error.message);
      }
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    if (!isOnline) { toast.error("অফলাইনে রোল পরিবর্তন করা যাবে না"); return; }
    try {
      const { data: existingRole } = await supabase
        .from('user_roles').select('id').eq('user_id', selectedUser.user_id).maybeSingle();
      if (existingRole) {
        const { error } = await supabase.from('user_roles').update({ role: newRole }).eq('user_id', selectedUser.user_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_roles').insert({ user_id: selectedUser.user_id, role: newRole });
        if (error) throw error;
      }
      toast.success(`রোল আপডেট হয়েছে: ${selectedUser.email} → ${newRole === 'admin' ? 'এডমিন' : newRole === 'manager' ? 'ম্যানেজার' : 'স্টাফ'}`);
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      setShowEditDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('রোল আপডেট করতে ব্যর্থ: ' + error.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (!isOnline) { toast.error("অফলাইনে ব্যবহারকারী সরানো যাবে না"); return; }
    try {
      await supabase.from('user_roles').delete().eq('user_id', selectedUser.user_id);
      await supabase.from('profiles').delete().eq('id', selectedUser.user_id);
      toast.success(`ব্যবহারকারী সরানো হয়েছে: ${selectedUser.email}`);
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      setShowDeleteDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('ব্যবহারকারী সরাতে ব্যর্থ: ' + error.message);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser?.email) return;
    if (!isOnline) { toast.error("অফলাইনে পাসওয়ার্ড রিসেট ইমেইল পাঠানো যাবে না"); return; }
    setResetPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(selectedUser.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success(`পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে: ${selectedUser.email}`);
      setShowResetPasswordDialog(false);
      setSelectedUser(null);
    } catch (error: any) {
      toast.error('পাসওয়ার্ড রিসেট ইমেইল পাঠাতে ব্যর্থ: ' + error.message);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case 'admin': return <Badge className="bg-red-500 hover:bg-red-600"><Crown className="w-3 h-3 mr-1" />Admin</Badge>;
      case 'manager': return <Badge className="bg-blue-500 hover:bg-blue-600"><UserCog className="w-3 h-3 mr-1" />Manager</Badge>;
      case 'staff': return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />Staff</Badge>;
    }
  };

  const getRoleDescription = (role: AppRole) => {
    switch (role) {
      case 'admin': return 'সম্পূর্ণ সিস্টেম অ্যাক্সেস ও ব্যবহারকারী ব্যবস্থাপনা';
      case 'manager': return 'এডমিন কর্তৃক নির্ধারিত পারমিশন অনুযায়ী';
      case 'staff': return 'এডমিন কর্তৃক নির্ধারিত পারমিশন অনুযায়ী';
    }
  };

  if (roleLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">অ্যাক্সেস সীমাবদ্ধ</h3>
          <p className="text-muted-foreground">শুধুমাত্র এডমিন ব্যবহারকারী ব্যবস্থাপনা করতে পারেন।</p>
        </div>
      </Card>
    );
  }

  const managerPerms = rolePermissions?.find(r => r.role === 'manager');
  const staffPerms = rolePermissions?.find(r => r.role === 'staff');

  return (
    <Card className="p-6">
      <Tabs defaultValue="users">
        <OfflineBanner message="অফলাইনে ব্যবহারকারী তালিকা ক্যাশ থেকে দেখানো হচ্ছে — যোগ/সম্পাদনা/মুছে ফেলা অনলাইনে ফিরলে চালু হবে।" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">👥 ব্যবহারকারী ব্যবস্থাপনা</h2>
          </div>
          <TabsList>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-1" /> ব্যবহারকারী
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Settings2 className="w-4 h-4 mr-1" /> দায়িত্ব বণ্টন
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Users Tab */}
        <TabsContent value="users">
          {/* Role Legend */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-red-600">Admin</span>
              </div>
              <p className="text-sm text-muted-foreground">{getRoleDescription('admin')}</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <UserCog className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-blue-600">Manager</span>
              </div>
              <p className="text-sm text-muted-foreground">{getRoleDescription('manager')}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="font-semibold text-foreground">Staff</span>
              </div>
              <p className="text-sm text-muted-foreground">{getRoleDescription('staff')}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Input
              placeholder="ইমেইল বা নাম দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
            <Button 
              onClick={() => setShowAddDialog(true)}
              disabled={!isOnline}
              title={!isOnline ? "অফলাইনে যুক্ত করা যাবে না" : undefined}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              নতুন ব্যবহারকারী যুক্ত করুন
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ব্যবহারকারী</TableHead>
                    <TableHead>ইমেইল</TableHead>
                    <TableHead>রোল</TableHead>
                    <TableHead>যুক্ত হয়েছে</TableHead>
                    <TableHead className="text-right">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        কোনো ব্যবহারকারী পাওয়া যায়নি
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-medium text-foreground">{user.full_name || 'নাম নেই'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-foreground">{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(user.created_at).toLocaleDateString('bn-BD')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedUser(user); setNewRole(user.role); setShowEditDialog(true); }} title="রোল পরিবর্তন">
                              <Edit className="w-4 h-4" />
                            </Button>
                            {user.user_id !== currentUserId && (
                              <>
                                <Button variant="outline" size="sm" onClick={() => { setSelectedUser(user); setShowResetPasswordDialog(true); }} title="পাসওয়ার্ড রিসেট" className="border-amber-500 text-amber-600 hover:bg-amber-50">
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => { setSelectedUser(user); setShowDeleteDialog(true); }} title="ব্যবহারকারী সরান">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>মোট ব্যবহারকারী: <strong className="text-foreground">{users?.length || 0}</strong></span>
              <span>এডমিন: <strong className="text-red-600">{users?.filter(u => u.role === 'admin').length || 0}</strong></span>
              <span>ম্যানেজার: <strong className="text-blue-600">{users?.filter(u => u.role === 'manager').length || 0}</strong></span>
              <span>স্টাফ: <strong className="text-foreground">{users?.filter(u => u.role === 'staff').length || 0}</strong></span>
            </div>
          </div>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions">
          <div className="mb-4">
            <p className="text-muted-foreground text-sm">
              প্রতিটি রোলের জন্য কোন কোন পেজ ও ফিচারে অ্যাক্সেস থাকবে তা এখান থেকে নির্ধারণ করুন। এডমিনের পারমিশন সর্বদা সম্পূর্ণ থাকবে।
            </p>
          </div>

          {permLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">পারমিশন / দায়িত্ব</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Crown className="w-4 h-4 text-red-500" /> Admin
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <UserCog className="w-4 h-4 text-blue-500" /> Manager
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <User className="w-4 h-4" /> Staff
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionKeys.map((key) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{permissionLabels[key]}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={true} disabled className="opacity-60" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={managerPerms ? (managerPerms as any)[key] : false}
                          onCheckedChange={(val) => handleTogglePermission('manager', key, val)}
                          disabled={savingPermissions}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={staffPerms ? (staffPerms as any)[key] : false}
                          onCheckedChange={(val) => handleTogglePermission('staff', key, val)}
                          disabled={savingPermissions}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <p className="text-sm text-amber-700">
              ⚠️ <strong>দ্রষ্টব্য:</strong> পারমিশন পরিবর্তনের পর সংশ্লিষ্ট ব্যবহারকারীকে পুনরায় লগইন করতে হতে পারে।
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              নতুন ব্যবহারকারী যুক্ত করুন
            </DialogTitle>
            <DialogDescription>নতুন স্টাফ বা ম্যানেজার তৈরি করুন</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newUserName" className="mb-2 block">নাম</Label>
              <Input id="newUserName" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="ব্যবহারকারীর নাম" />
            </div>
            <div>
              <Label htmlFor="newUserEmail" className="mb-2 block">ইমেইল *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="newUserEmail" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="email@example.com" className="pl-10" required />
              </div>
            </div>
            <div>
              <Label htmlFor="newUserPassword" className="mb-2 block">পাসওয়ার্ড *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="newUserPassword" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="কমপক্ষে ৬ অক্ষর" className="pl-10" required />
              </div>
            </div>
            <div>
              <Label htmlFor="newUserRole" className="mb-2 block">রোল নির্বাচন করুন</Label>
              <Select value={newUserRole} onValueChange={(value: AppRole) => setNewUserRole(value)}>
                <SelectTrigger><SelectValue placeholder="রোল নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff"><div className="flex items-center gap-2"><User className="w-4 h-4" /> Staff</div></SelectItem>
                  <SelectItem value="manager"><div className="flex items-center gap-2"><UserCog className="w-4 h-4 text-blue-500" /> Manager</div></SelectItem>
                  <SelectItem value="admin"><div className="flex items-center gap-2"><Crown className="w-4 h-4 text-red-500" /> Admin</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>বাতিল</Button>
            <Button onClick={handleAddUser} disabled={addingUser || !newUserEmail || !newUserPassword} className="bg-primary">
              {addingUser ? "যুক্ত হচ্ছে..." : "ব্যবহারকারী যুক্ত করুন"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>রোল আপডেট করুন</AlertDialogTitle>
            <AlertDialogDescription><strong>{selectedUser?.email}</strong> এর রোল পরিবর্তন করুন</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="role" className="mb-2 block">রোল নির্বাচন করুন</Label>
            <Select value={newRole} onValueChange={(value: AppRole) => setNewRole(value)}>
              <SelectTrigger><SelectValue placeholder="রোল নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin"><div className="flex items-center gap-2"><Crown className="w-4 h-4 text-red-500" /> Admin - সম্পূর্ণ অ্যাক্সেস</div></SelectItem>
                <SelectItem value="manager"><div className="flex items-center gap-2"><UserCog className="w-4 h-4 text-blue-500" /> Manager</div></SelectItem>
                <SelectItem value="staff"><div className="flex items-center gap-2"><User className="w-4 h-4" /> Staff</div></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateRole}>রোল আপডেট করুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ব্যবহারকারী সরান</AlertDialogTitle>
            <AlertDialogDescription>
              আপনি কি নিশ্চিত যে <strong>{selectedUser?.email}</strong> কে সরাতে চান?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">ব্যবহারকারী সরান</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Dialog */}
      <AlertDialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-500" />
              পাসওয়ার্ড রিসেট লিংক পাঠান
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedUser?.email}</strong> এ পাসওয়ার্ড রিসেট লিংক পাঠানো হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPasswordLoading}>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={resetPasswordLoading} className="bg-amber-500 hover:bg-amber-600">
              {resetPasswordLoading ? "পাঠানো হচ্ছে..." : "📧 রিসেট লিংক পাঠান"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
