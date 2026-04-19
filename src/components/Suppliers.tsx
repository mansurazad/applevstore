import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CloudinaryUpload } from "./CloudinaryUpload";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { AutoHideSticky } from "@/components/AutoHideSticky";

export function Suppliers() {
  const { containerRef, headerRef, hidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    image_url: "",
  });

  const queryClient = useQueryClient();

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), purchase_items(*, products(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("suppliers").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier added successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    },
  });

  const updateSupplierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("suppliers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier updated!");
      setEditingSupplier(null);
      resetForm();
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted!");
    },
  });

  const receiveItemsMutation = useMutation({
    mutationFn: async ({ purchaseId, items }: { purchaseId: string; items: any[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update purchase status
      const { error: purchaseError } = await supabase
        .from("purchases")
        .update({ status: "received" })
        .eq("id", purchaseId);

      if (purchaseError) throw purchaseError;

      // Update stock for each item
      for (const item of items) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();

        if (product) {
          await supabase
            .from("products")
            .update({ stock_quantity: product.stock_quantity + item.received_quantity })
            .eq("id", item.product_id);
        }

        // Update received quantity in purchase_items
        await supabase
          .from("purchase_items")
          .update({ received_quantity: item.received_quantity })
          .eq("purchase_id", purchaseId)
          .eq("product_id", item.product_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Purchase received successfully!");
      setSelectedPurchase(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      image_url: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSupplier) {
      updateSupplierMutation.mutate({ id: editingSupplier.id, data: formData });
    } else {
      addSupplierMutation.mutate(formData);
    }
  };

  const startEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      image_url: supplier.image_url || "",
    });
  };

  const handleReceivePurchase = (purchase: any) => {
    const items = purchase.purchase_items.map((item: any) => ({
      ...item,
      received_quantity: item.quantity,
    }));
    
    receiveItemsMutation.mutate({
      purchaseId: purchase.id,
      items,
    });
  };

  return (
    <div ref={containerRef} className="flex flex-col h-screen overflow-y-auto animate-fade-in">
      {/* Auto-hide Header */}
      <AutoHideSticky hidden={hidden} headerHeight={headerHeight} headerRef={headerRef} className="px-1 pb-3 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Suppliers & Purchases</h1>
            <p className="text-muted-foreground mt-1">Manage suppliers and purchase orders</p>
          </div>
        <Dialog open={isAddDialogOpen || !!editingSupplier} onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingSupplier(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-to-r from-primary to-accent">
              ➕ Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Phone</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <CloudinaryUpload
                currentImageUrl={formData.image_url}
                onUpload={(url) => setFormData({ ...formData, image_url: url })}
                folder="apple-store/suppliers"
                label="📸 সাপ্লায়ারের ছবি"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingSupplier(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                  {editingSupplier ? "Update" : "Add"} Supplier
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </AutoHideSticky>

      {/* Scrollable Content */}
      <div className="flex-1 px-1">
        <Tabs defaultValue="suppliers" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="suppliers">Suppliers ({suppliers?.length || 0})</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Orders ({purchases?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suppliers?.map((supplier) => (
              <Card key={supplier.id} className="p-6 card-hover">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">{supplier.name}</h3>
                      {supplier.email && (
                        <p className="text-sm text-muted-foreground mt-1">📧 {supplier.email}</p>
                      )}
                      {supplier.phone && (
                        <p className="text-sm text-muted-foreground">📞 {supplier.phone}</p>
                      )}
                    </div>
                    <div className="text-3xl">🏭</div>
                  </div>
                  {supplier.address && (
                    <p className="text-sm text-muted-foreground">📍 {supplier.address}</p>
                  )}
                  {supplier.notes && (
                    <p className="text-sm text-muted-foreground italic">"{supplier.notes}"</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(supplier)}
                      className="flex-1"
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete this supplier?")) {
                          deleteSupplierMutation.mutate(supplier.id);
                        }
                      }}
                      className="flex-1"
                    >
                      🗑️ Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {(!suppliers || suppliers.length === 0) && (
            <Card className="p-12 text-center">
              <div className="text-6xl mb-4">🏭</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">No suppliers yet</h3>
              <p className="text-muted-foreground">Add your first supplier!</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <div className="space-y-4">
            {purchases?.map((purchase) => (
              <Card key={purchase.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">PO #{purchase.purchase_number}</h3>
                    <p className="text-sm text-muted-foreground">
                      Supplier: {purchase.suppliers?.name || "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Date: {new Date(purchase.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    purchase.status === 'received' ? 'bg-green-100 text-green-700' :
                    purchase.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {purchase.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  {purchase.purchase_items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm p-2 bg-muted rounded">
                      <span>{item.products?.name || "Product"}</span>
                      <span>Qty: {item.quantity} | Cost: ${Number(item.unit_cost).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="font-semibold">Total: ${Number(purchase.total_amount).toFixed(2)}</span>
                  {purchase.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => handleReceivePurchase(purchase)}
                      className="bg-gradient-to-r from-primary to-accent"
                    >
                      📦 Receive Items
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {(!purchases || purchases.length === 0) && (
            <Card className="p-12 text-center">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">No purchase orders yet</h3>
              <p className="text-muted-foreground">Create purchase orders to track inventory from suppliers</p>
            </Card>
          )}
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
