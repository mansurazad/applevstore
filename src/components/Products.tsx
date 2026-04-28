import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ProductHistory } from "./ProductHistory";
import { ProductDetailModal } from "./ProductDetailModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { ProductQuickView } from "./ProductQuickView";
import { Eye, ScanBarcode, Download, FileSpreadsheet, FileText, ChevronDown, ChevronUp, ArrowUpDown, Filter } from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { ActivityLogger } from "@/hooks/useActivityLog";
import * as XLSX from "xlsx";
import { CloudinaryUpload } from "./CloudinaryUpload";
import { isCloudinaryUrl } from "@/lib/cloudinary";
import { db as localDb } from "@/lib/db";
import { useLiveQuery } from "@/hooks/useLiveQuery";
export function Products() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [historyProduct, setHistoryProduct] = useState<{ imei: string; name: string } | null>(null);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [quickViewIndex, setQuickViewIndex] = useState<number>(-1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const { containerRef, headerRef, hidden: headerHidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const [sortBy, setSortBy] = useState<"name" | "price_high" | "price_low" | "newest" | "oldest">("name");
  const [formData, setFormData] = useState({
    name: "",
    category_id: "",
    sku: "",
    barcode: "",
    imei: "",
    brand: "",
    model: "",
    condition: "new",
    price: "",
    cost: "",
    unit: "pcs",
    ram: "",
    storage: "",
    battery: "",
    supplier_name: "",
    supplier_mobile: "",
    supplier_nid: "",
    supplier_image_url: "",
    warranty_expiry_date: "",
    warranty_status: "no_warranty",
    image_url: "",
  });

  const queryClient = useQueryClient();

  // Offline-first reads: live-bound to local DB; sync engine refreshes in background.
  const rawProducts = useLiveQuery(() => localDb.products.list(), []);
  const categories = useLiveQuery(
    async () => {
      const all = await localDb.categories.list();
      return all.sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));
    },
    []
  );
  const products = useMemo(() => {
    if (!rawProducts) return undefined;
    const catMap = new Map((categories ?? []).map((c: any) => [c.id, c]));
    return [...rawProducts]
      .map((p: any) => ({ ...p, categories: p.category_id ? catMap.get(p.category_id) : null }))
      .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [rawProducts, categories]);

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const inserted = await localDb.products.create<any>(data);
      return { ...inserted, name: data.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product added successfully!");
      ActivityLogger.productAdded(result.name, result.id);
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add product");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await localDb.products.update<any>(id, data);
      return { id, name: data.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated successfully!");
      ActivityLogger.productUpdated(result.name, result.id);
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update product");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await localDb.products.remove(id);
      return name;
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted successfully!");
      ActivityLogger.productDeleted(name);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete product");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      category_id: "",
      sku: "",
      barcode: "",
      imei: "",
      brand: "",
      model: "",
      condition: "new",
      price: "",
      cost: "",
      unit: "pcs",
      ram: "",
      storage: "",
      battery: "",
      supplier_name: "",
      supplier_mobile: "",
      supplier_nid: "",
      supplier_image_url: "",
      warranty_expiry_date: "",
      warranty_status: "no_warranty",
      image_url: "",
    });
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `SKU-${timestamp}-${random}`.toUpperCase();
  };

  const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  };

  const extractBrand = (productName: string) => {
    return productName.split(' ')[0];
  };

  const extractModel = (productName: string) => {
    const parts = productName.split(' ');
    return parts.slice(1).join(' ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate IMEI is exactly 15 digits
    if (!formData.imei || formData.imei.length !== 15) {
      toast.error("IMEI অবশ্যই ১৫ ডিজিটের হতে হবে");
      return;
    }

    // Duplicate IMEI check — runs against the local DB (offline-safe)
    if (formData.imei) {
      const all = await localDb.products.list();
      const conflict = (all as any[]).find(
        (p) =>
          p.imei === formData.imei &&
          (p.stock_quantity ?? 0) > 0 &&
          (!editingProduct || p.id !== editingProduct.id)
      );
      if (conflict) {
        toast.error(
          `এই IMEI (${formData.imei}) দিয়ে "${conflict.name}" ইতিমধ্যে স্টকে আছে। আগে বিক্রি করুন, তারপর আবার এন্ট্রি করতে পারবেন।`
        );
        return;
      }
    }

    // Profit validation warning
    const price = parseFloat(formData.price) || 0;
    const cost = parseFloat(formData.cost) || 0;
    if (cost > 0 && price > cost * 3) {
      toast.warning(`⚠️ সতর্কতা: বিক্রয় মূল্য (${price}) ক্রয় মূল্যের (${cost}) ৩ গুণের বেশি। দয়া করে যাচাই করুন।`, {
        duration: 5000,
      });
    }

    // Brand comes from category, model comes from product name
    const selectedCategory = categories?.find(c => c.id === formData.category_id);
    const brandFromCategory = selectedCategory?.name || formData.brand || '';

    const submitData = {
      ...formData,
      sku: editingProduct ? formData.sku : generateSKU(),
      barcode: editingProduct ? formData.barcode : generateBarcode(),
      brand: brandFromCategory,
      model: formData.model || formData.name,
      name: brandFromCategory ? `${brandFromCategory} ${formData.name}` : formData.name,
      price: price,
      cost: cost,
      stock_quantity: 1,
      low_stock_threshold: 0,
      category_id: formData.category_id || null,
      image_url: formData.image_url || null,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      addMutation.mutate(submitData);
    }
  };

  const startEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || "",
      category_id: product.category_id || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      imei: product.imei || "",
      brand: product.brand || "",
      model: product.model || "",
      condition: product.condition || "new",
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
      unit: product.unit || "pcs",
      ram: product.ram || "",
      storage: product.storage || "",
      battery: product.battery || "",
      supplier_name: product.supplier_name || "",
      supplier_mobile: product.supplier_mobile || "",
      supplier_nid: product.supplier_nid || "",
      supplier_image_url: "",
      warranty_expiry_date: product.warranty_expiry_date || "",
      warranty_status: product.warranty_status || "no_warranty",
      image_url: product.image_url || "",
    });
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    let result = products.filter((product) => {
      const matchesSearch = 
        searchTerm === "" ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCondition = 
        filterCondition === "all" || 
        product.condition === filterCondition;

      const matchesCategory = 
        filterCategory === "all" || 
        product.category_id === filterCategory;

      const hasStock = showOutOfStock || product.stock_quantity > 0;

      return matchesSearch && matchesCondition && matchesCategory && hasStock;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "price_high": return Number(b.price) - Number(a.price);
        case "price_low": return Number(a.price) - Number(b.price);
        case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [products, searchTerm, filterCondition, filterCategory, showOutOfStock, sortBy]);

  const handleBarcodeScanned = (barcode: string) => {
    // Search for product by barcode or IMEI
    const product = products?.find(p => 
      p.barcode === barcode || p.imei === barcode
    );

    if (product) {
      setDetailProduct(product);
    } else {
      toast.error("Product not found with this barcode");
    }
  };

  // Download products as Excel
  const downloadExcel = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const excelData = products.map((product, index) => ({
      'ক্রমিক': index + 1,
      'প্রোডাক্ট নাম': product.name,
      'ব্র্যান্ড': product.brand || '',
      'মডেল': product.model || '',
      'IMEI': product.imei || '',
      'SKU': product.sku || '',
      'বারকোড': product.barcode || '',
      'অবস্থা': product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত',
      'ক্যাটাগরি': (product as any).categories?.name || '',
      'ক্রয় মূল্য (৳)': product.cost || 0,
      'বিক্রয় মূল্য (৳)': product.price || 0,
      'স্টক': product.stock_quantity || 0,
      'RAM': product.ram || '',
      'Storage': product.storage || '',
      'Battery': product.battery || '',
      'সাপ্লায়ার নাম': product.supplier_name || '',
      'সাপ্লায়ার মোবাইল': product.supplier_mobile || '',
      'সাপ্লায়ার NID': product.supplier_nid || '',
      'ওয়ারেন্টি স্ট্যাটাস': product.warranty_status === 'active' ? 'সক্রিয়' : product.warranty_status === 'expired' ? 'মেয়াদোত্তীর্ণ' : 'নেই',
      'ওয়ারেন্টি মেয়াদ': product.warranty_expiry_date || '',
      'যুক্ত হয়েছে': new Date(product.created_at).toLocaleDateString('bn-BD'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    // Auto-size columns
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
    worksheet['!cols'] = colWidths;

    const fileName = `Apple_Point_Products_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`${products.length}টি প্রোডাক্ট Excel এ ডাউনলোড হয়েছে`);
  };

  // Download products as PDF (using print)
  const downloadPDF = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const totalValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.stock_quantity || 0), 0);
    const totalCost = products.reduce((sum, p) => sum + (p.cost || 0) * (p.stock_quantity || 0), 0);
    const inStock = products.filter(p => (p.stock_quantity || 0) > 0).length;
    const outOfStock = products.filter(p => (p.stock_quantity || 0) <= 0).length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Apple Store - প্রোডাক্ট তালিকা</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #1a1a1a; }
          .header p { color: #666; margin-top: 5px; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 20px; background: #f5f5f5; padding: 15px; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-item .value { font-size: 18px; font-weight: bold; color: #0066cc; }
          .summary-item .label { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #0066cc; color: white; font-weight: 600; }
          tr:nth-child(even) { background: #f9f9f9; }
          tr:hover { background: #e8f4ff; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .stock-out { background: #ffe6e6 !important; color: #cc0000; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>👑 Apple Store</h1>
          <p>প্রোডাক্ট ইনভেন্টরি তালিকা</p>
          <p style="font-size: 10px; margin-top: 5px;">তারিখ: ${new Date().toLocaleDateString('bn-BD')}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="value">${products.length}</div>
            <div class="label">মোট প্রোডাক্ট</div>
          </div>
          <div class="summary-item">
            <div class="value">${inStock}</div>
            <div class="label">স্টকে আছে</div>
          </div>
          <div class="summary-item">
            <div class="value">${outOfStock}</div>
            <div class="label">আউট অফ স্টক</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalCost.toLocaleString('bn-BD')}</div>
            <div class="label">মোট বিনিয়োগ</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalValue.toLocaleString('bn-BD')}</div>
            <div class="label">মোট মূল্য</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-center">ক্রমিক</th>
              <th>প্রোডাক্ট নাম</th>
              <th>IMEI</th>
              <th>অবস্থা</th>
              <th class="text-right">ক্রয় (৳)</th>
              <th class="text-right">বিক্রয় (৳)</th>
              <th class="text-center">স্টক</th>
              <th>সাপ্লায়ার</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((product, index) => `
              <tr class="${(product.stock_quantity || 0) <= 0 ? 'stock-out' : ''}">
                <td class="text-center">${index + 1}</td>
                <td><strong>${product.name}</strong><br/><small>${product.brand || ''} ${product.model || ''}</small></td>
                <td style="font-family: monospace; font-size: 10px;">${product.imei || '-'}</td>
                <td>${product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত'}</td>
                <td class="text-right">${(product.cost || 0).toLocaleString('bn-BD')}</td>
                <td class="text-right">${(product.price || 0).toLocaleString('bn-BD')}</td>
                <td class="text-center">${product.stock_quantity || 0}</td>
                <td>${product.supplier_name || '-'}<br/><small>${product.supplier_mobile || ''}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Apple Store - Sales & Stock Management System</p>
          <p>Generated on ${new Date().toLocaleString('bn-BD')}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      toast.success(`${products.length}টি প্রোডাক্ট PDF এ ডাউনলোড হচ্ছে`);
    } else {
      toast.error("পপআপ ব্লক করা আছে। অনুগ্রহ করে পপআপ অনুমতি দিন।");
    }
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in overflow-x-hidden w-full max-w-full">
      {/* Fixed Header */}
      <div ref={headerRef} style={{ marginBottom: headerHidden ? `-${headerHeight}px` : 0, transition: 'margin-bottom 300ms ease' }} className={`sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-3 lg:pb-4 space-y-3 lg:space-y-4 transition-transform duration-300 ${headerHidden ? '-translate-y-full lg:translate-y-0 lg:!mb-0' : 'translate-y-0'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 lg:gap-4 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">Products</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 lg:hidden shrink-0"
                onClick={() => setShowHeader(!showHeader)}
                aria-label={showHeader ? "হেডার লুকান" : "হেডার দেখান"}
              >
                {showHeader ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
            <p className={`text-xs sm:text-sm lg:text-base text-muted-foreground mt-1 ${showHeader ? "block" : "hidden lg:block"}`}>Manage your inventory</p>
          </div>
          <div className={`flex-wrap items-center gap-2 ${showHeader ? "flex" : "hidden lg:flex"}`}>
            {/* Download Buttons */}
            <Button
              onClick={downloadExcel}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 text-sm md:text-base"
              title="Excel ডাউনলোড"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              onClick={downloadPDF}
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50 text-sm md:text-base"
              title="PDF ডাউনলোড"
            >
              <FileText className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-customers'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">👥 Customers</span>
              <span className="sm:hidden">👥</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-categories'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">📁 Categories</span>
              <span className="sm:hidden">📁</span>
            </Button>
            <Dialog open={isAddDialogOpen || !!editingProduct} onOpenChange={(open) => {
              if (!open) {
                setIsAddDialogOpen(false);
                setEditingProduct(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-sm md:text-base"
                >
                  <span className="hidden sm:inline">➕ Add Product</span>
                  <span className="sm:hidden">➕</span>
                </Button>
              </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
              <DialogDescription className="text-sm">
                {editingProduct ? "Update product details" : "Enter product information to add to inventory"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">মডেল / প্রোডাক্ট নাম *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        name: newName,
                        model: newName
                      });
                    }}
                    placeholder="শুধু মডেলের তথ্য দিন (ব্র্যান্ড ক্যাটাগরি থেকে আসবে)"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <Select value={formData.category_id} onValueChange={(value) => {
                    const selectedCat = categories?.find(c => c.id === value);
                    setFormData({ 
                      ...formData, 
                      category_id: value,
                      brand: selectedCat?.name || formData.brand
                    });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="ক্যাটাগরি নির্বাচন করুন (ব্র্যান্ড)" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IMEI * (15 digits)</label>
                  <Input
                    value={formData.imei}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                      setFormData({ ...formData, imei: value });
                    }}
                    placeholder="Enter 15-digit IMEI"
                    required
                    pattern="[0-9]{15}"
                    minLength={15}
                    maxLength={15}
                    title="IMEI must be exactly 15 digits"
                  />
                  {formData.imei && formData.imei.length !== 15 && (
                    <p className="text-xs text-red-500 mt-1">IMEI must be exactly 15 digits</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Brand</label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Auto-filled from product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Model</label>
                  <Input
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Auto-filled from product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Condition</label>
                  <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unit</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cost</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  />
                </div>
              </div>

              {/* Quick Specifications (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Quick Specifications (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">RAM</label>
                    <Input
                      value={formData.ram}
                      onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                      placeholder="e.g., 8GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Storage</label>
                    <Input
                      value={formData.storage}
                      onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                      placeholder="e.g., 256GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Battery</label>
                    <Input
                      value={formData.battery}
                      onChange={(e) => setFormData({ ...formData, battery: e.target.value })}
                      placeholder="e.g., 5000mAh"
                    />
                  </div>
                </div>
              </div>

              {/* Supplier Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Supplier Information (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Supplier Name</label>
                    <Input
                      value={formData.supplier_name}
                      onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                      placeholder="Enter supplier name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Supplier Mobile</label>
                    <Input
                      value={formData.supplier_mobile}
                      onChange={(e) => setFormData({ ...formData, supplier_mobile: e.target.value })}
                      placeholder="Enter mobile number"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-2">Supplier NID</label>
                    <Input
                      value={formData.supplier_nid}
                      onChange={(e) => setFormData({ ...formData, supplier_nid: e.target.value })}
                      placeholder="Enter NID number"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <CloudinaryUpload
                      currentImageUrl={formData.supplier_image_url}
                      onUpload={(url) => setFormData({ ...formData, supplier_image_url: url })}
                      folder="apple-store/suppliers"
                      label="📸 সাপ্লায়ারের ছবি (ঐচ্ছিক)"
                    />
                  </div>
                </div>
              </div>

              {/* Product Image */}
              <div className="pt-4 border-t border-border">
                <CloudinaryUpload
                  currentImageUrl={formData.image_url}
                  onUpload={(url) => setFormData({ ...formData, image_url: url })}
                  folder="apple-store/products"
                  label="📸 প্রোডাক্টের ছবি (ঐচ্ছিক)"
                />
              </div>

              {/* Warranty Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Warranty Information (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Warranty Status</label>
                    <Select value={formData.warranty_status} onValueChange={(value) => setFormData({ ...formData, warranty_status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_warranty">No Warranty</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Warranty Expiry Date</label>
                    <Input
                      type="date"
                      value={formData.warranty_expiry_date}
                      onChange={(e) => setFormData({ ...formData, warranty_expiry_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                  {editingProduct ? "Update" : "Add"} Product
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
          </div>
        </div>

      {/* Search and Filters */}
      <Card className="p-3 lg:p-4">
        {/* Collapsible filter header */}
        <button onClick={() => setShowFilters(!showFilters)} className="w-full flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="w-4 h-4 text-primary" />
            Filters & Search
          </span>
          <div className="p-1 rounded-md bg-muted/50 hover:bg-muted transition-colors">
            {showFilters ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {showFilters && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="md:col-span-2 flex gap-2">
                <Input
                  placeholder="Search by name, IMEI, brand, or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 h-9 text-sm"
                />
                <Button 
                  variant="outline" 
                  onClick={() => setShowScanner(true)}
                  className="shrink-0 h-9"
                >
                  <ScanBarcode className="w-4 h-4" />
                </Button>
              </div>
              <Select value={filterCondition} onValueChange={setFilterCondition}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-9 text-sm">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="price_high">Price: High</SelectItem>
                  <SelectItem value="price_low">Price: Low</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="showOutOfStock" 
                  checked={showOutOfStock}
                  onCheckedChange={(checked) => setShowOutOfStock(checked as boolean)}
                />
                <label htmlFor="showOutOfStock" className="text-xs lg:text-sm font-medium cursor-pointer">
                  Show out of stock (0 stock)
                </label>
              </div>
              {(searchTerm || filterCondition !== "all" || filterCategory !== "all") && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {filteredProducts.length} found
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSearchTerm(""); setFilterCondition("all"); setFilterCategory("all"); }}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
      </div>

      {/* Scrollable Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto pb-20 lg:pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 pb-6">
        {filteredProducts?.map((product) => (
          <Card key={product.id} className="p-4 lg:p-6 card-hover">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
              <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground">{product.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {product.brand && (
                      <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-1 rounded-full">
                        {product.brand}
                      </span>
                    )}
                    {product.condition && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${
                        product.condition === 'new' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {product.condition === 'new' ? '✨ New' : '♻️ Used'}
                      </span>
                    )}
                    {product.categories && (
                      <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {product.categories.name}
                      </span>
                    )}
                  </div>
                </div>
                {product.stock_quantity <= product.low_stock_threshold && (
                  <span className="text-xl" title="Low Stock">⚠️</span>
                )}
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
              )}
              <div className="space-y-2 text-sm">
                {(product.ram || product.storage || product.battery) && (
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
                    {product.ram && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">🧠 {product.ram}</span>
                    )}
                    {product.storage && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">💾 {product.storage}</span>
                    )}
                    {product.battery && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">🔋 {product.battery}</span>
                    )}
                  </div>
                )}
                {(product.supplier_name || product.supplier_mobile) && (
                  <div className="pb-2 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-1">Supplier Info:</p>
                    {product.supplier_name && (
                      <p className="text-xs">📦 {product.supplier_name}</p>
                    )}
                    {product.supplier_mobile && (
                      <p className="text-xs">📱 {product.supplier_mobile}</p>
                    )}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-semibold text-foreground">${Number(product.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock:</span>
                  <span className={`font-semibold ${product.stock_quantity <= product.low_stock_threshold ? 'text-amber-600' : 'text-foreground'}`}>
                    {product.stock_quantity} {product.unit}
                  </span>
                </div>
                {product.sku && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SKU:</span>
                    <span className="font-mono text-xs text-foreground">{product.sku}</span>
                  </div>
                )}
                {product.imei && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IMEI:</span>
                    <span className="font-mono text-xs text-foreground">{product.imei}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const index = filteredProducts.findIndex(p => p.id === product.id);
                    if (window.innerWidth < 1024) {
                      setQuickViewIndex(index);
                    } else {
                      setDetailProduct(product);
                    }
                  }}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(product)}
                  className="flex-1"
                >
                  ✏️
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryProduct({ imei: product.imei || "", name: product.name })}
                  className="flex-1"
                  disabled={!product.imei}
                >
                  📜
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this product?")) {
                      deleteMutation.mutate({ id: product.id, name: product.name });
                    }
                  }}
                  className="flex-1"
                >
                  🗑️
                </Button>
              </div>
            </div>
          </Card>
        ))}
        </div>

        {(!filteredProducts || filteredProducts.length === 0) && (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              {products && products.length > 0 ? "No matching products" : "No products yet"}
            </h3>
            <p className="text-muted-foreground">
              {products && products.length > 0 
                ? "Try adjusting your search or filters" 
                : "Add your first product to get started!"}
            </p>
          </Card>
        )}
      </div>

      {historyProduct && (
        <ProductHistory
          imei={historyProduct.imei}
          productName={historyProduct.name}
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />

      <ProductQuickView
        products={filteredProducts || []}
        initialIndex={quickViewIndex}
        isOpen={quickViewIndex >= 0}
        onClose={() => setQuickViewIndex(-1)}
      />
    </div>
  );
}
