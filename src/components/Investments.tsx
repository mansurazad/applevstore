import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowDownCircle, ArrowUpCircle, Trash2, Building2, Pencil, Printer, FileSpreadsheet, Search, Calendar, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { useShopSettings } from "@/hooks/useShopSettings";
import * as XLSX from "xlsx";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { AutoHideSticky } from "@/components/AutoHideSticky";

export function Investments() {
  const { containerRef, headerRef, hidden, headerHeight } = useAutoHideHeader<HTMLDivElement>();
  const queryClient = useQueryClient();
  const { settings } = useShopSettings();
  const [showAddSector, setShowAddSector] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showEditSector, setShowEditSector] = useState(false);
  const [showEditEntry, setShowEditEntry] = useState(false);
  const [showEditIncome, setShowEditIncome] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [filterSector, setFilterSector] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState<"entries" | "incomes">("entries");

  // Form states
  const [sectorName, setSectorName] = useState("");
  const [sectorDesc, setSectorDesc] = useState("");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryType, setEntryType] = useState("deposit");
  const [entryPurpose, setEntryPurpose] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomePurpose, setIncomePurpose] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split('T')[0]);

  const [editSectorId, setEditSectorId] = useState("");
  const [editEntryId, setEditEntryId] = useState("");
  const [editIncomeId, setEditIncomeId] = useState("");

  const { data: sectors } = useQuery({
    queryKey: ["investment-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_sectors").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["investment-entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_entries").select("*, investment_sectors(name)").order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: incomes } = useQuery({
    queryKey: ["investment-incomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_incomes").select("*, investment_sectors(name)").order("income_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // SECTOR CRUD
  const addSectorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("investment_sectors").insert({ name: sectorName, description: sectorDesc });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-sectors"] }); toast.success("নতুন খাত যোগ হয়েছে"); setSectorName(""); setSectorDesc(""); setShowAddSector(false); },
    onError: () => toast.error("খাত যোগ করতে ব্যর্থ"),
  });

  const updateSectorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("investment_sectors").update({ name: sectorName, description: sectorDesc }).eq("id", editSectorId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-sectors"] }); toast.success("খাত আপডেট হয়েছে"); setSectorName(""); setSectorDesc(""); setEditSectorId(""); setShowEditSector(false); },
    onError: () => toast.error("খাত আপডেট করতে ব্যর্থ"),
  });

  const deleteSectorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_sectors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-sectors"] }); toast.success("খাত মুছে ফেলা হয়েছে"); },
    onError: () => toast.error("খাত মুছতে ব্যর্থ — প্রথমে এই খাতের সকল এন্ট্রি ও আয় মুছুন"),
  });

  // ENTRY CRUD
  const addEntryMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("investment_entries").insert({
        sector_id: selectedSectorId, amount: Number(entryAmount), entry_type: entryType,
        purpose: entryPurpose, notes: entryNotes, entry_date: entryDate, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-entries"] }); toast.success("এন্ট্রি যোগ হয়েছে"); resetEntryForm(); setShowAddEntry(false); },
    onError: () => toast.error("এন্ট্রি যোগ করতে ব্যর্থ"),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("investment_entries").update({
        sector_id: selectedSectorId, amount: Number(entryAmount), entry_type: entryType,
        purpose: entryPurpose, notes: entryNotes, entry_date: entryDate,
      }).eq("id", editEntryId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-entries"] }); toast.success("এন্ট্রি আপডেট হয়েছে"); resetEntryForm(); setEditEntryId(""); setShowEditEntry(false); },
    onError: () => toast.error("এন্ট্রি আপডেট করতে ব্যর্থ"),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-entries"] }); toast.success("এন্ট্রি মুছে ফেলা হয়েছে"); },
  });

  // INCOME CRUD
  const addIncomeMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("investment_incomes").insert({
        sector_id: selectedSectorId, amount: Number(incomeAmount), source: incomeSource,
        purpose: incomePurpose, notes: incomeNotes, income_date: incomeDate, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-incomes"] }); toast.success("আয় যোগ হয়েছে"); resetIncomeForm(); setShowAddIncome(false); },
    onError: () => toast.error("আয় যোগ করতে ব্যর্থ"),
  });

  const updateIncomeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("investment_incomes").update({
        sector_id: selectedSectorId, amount: Number(incomeAmount), source: incomeSource,
        purpose: incomePurpose, notes: incomeNotes, income_date: incomeDate,
      }).eq("id", editIncomeId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-incomes"] }); toast.success("আয় আপডেট হয়েছে"); resetIncomeForm(); setEditIncomeId(""); setShowEditIncome(false); },
    onError: () => toast.error("আয় আপডেট করতে ব্যর্থ"),
  });

  const deleteIncomeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investment-incomes"] }); toast.success("আয় মুছে ফেলা হয়েছে"); },
  });

  const resetEntryForm = () => { setEntryAmount(""); setEntryType("deposit"); setEntryPurpose(""); setEntryNotes(""); setEntryDate(new Date().toISOString().split('T')[0]); setSelectedSectorId(""); };
  const resetIncomeForm = () => { setIncomeAmount(""); setIncomeSource(""); setIncomePurpose(""); setIncomeNotes(""); setIncomeDate(new Date().toISOString().split('T')[0]); setSelectedSectorId(""); };

  const startEditSector = (sector: any) => { setEditSectorId(sector.id); setSectorName(sector.name); setSectorDesc(sector.description || ""); setShowEditSector(true); };
  const startEditEntry = (entry: any) => { setEditEntryId(entry.id); setSelectedSectorId(entry.sector_id); setEntryAmount(String(entry.amount)); setEntryType(entry.entry_type); setEntryPurpose(entry.purpose || ""); setEntryNotes(entry.notes || ""); setEntryDate(entry.entry_date); setShowEditEntry(true); };
  const startEditIncome = (income: any) => { setEditIncomeId(income.id); setSelectedSectorId(income.sector_id); setIncomeAmount(String(income.amount)); setIncomeSource(income.source || ""); setIncomePurpose(income.purpose || ""); setIncomeNotes(income.notes || ""); setIncomeDate(income.income_date); setShowEditIncome(true); };

  // Stats
  const sectorStats = sectors?.map(sector => {
    const sectorEntries = entries?.filter(e => e.sector_id === sector.id) || [];
    const sectorIncomes = incomes?.filter(i => i.sector_id === sector.id) || [];
    const totalDeposit = sectorEntries.filter(e => e.entry_type === 'deposit').reduce((s, e) => s + Number(e.amount), 0);
    const totalWithdraw = sectorEntries.filter(e => e.entry_type === 'withdraw').reduce((s, e) => s + Number(e.amount), 0);
    const totalIncome = sectorIncomes.reduce((s, i) => s + Number(i.amount), 0);
    return { ...sector, totalDeposit, totalWithdraw, totalIncome, netInvestment: totalDeposit - totalWithdraw };
  }) || [];

  const grandTotalInvestment = sectorStats.reduce((s, sec) => s + sec.netInvestment, 0);
  const grandTotalIncome = sectorStats.reduce((s, sec) => s + sec.totalIncome, 0);
  const grandTotalDeposit = sectorStats.reduce((s, sec) => s + sec.totalDeposit, 0);
  const grandTotalWithdraw = sectorStats.reduce((s, sec) => s + sec.totalWithdraw, 0);
  const profitLoss = grandTotalIncome - grandTotalInvestment;

  // Filtered data with search and date range
  const filteredEntries = useMemo(() => {
    let data = filterSector === "all" ? entries : entries?.filter(e => e.sector_id === filterSector);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data?.filter(e => e.purpose?.toLowerCase().includes(term) || e.notes?.toLowerCase().includes(term) || (e as any).investment_sectors?.name?.toLowerCase().includes(term));
    }
    if (dateFrom) data = data?.filter(e => e.entry_date >= dateFrom);
    if (dateTo) data = data?.filter(e => e.entry_date <= dateTo);
    return data;
  }, [entries, filterSector, searchTerm, dateFrom, dateTo]);

  const filteredIncomes = useMemo(() => {
    let data = filterSector === "all" ? incomes : incomes?.filter(i => i.sector_id === filterSector);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data?.filter(i => i.source?.toLowerCase().includes(term) || i.purpose?.toLowerCase().includes(term) || (i as any).investment_sectors?.name?.toLowerCase().includes(term));
    }
    if (dateFrom) data = data?.filter(i => i.income_date >= dateFrom);
    if (dateTo) data = data?.filter(i => i.income_date <= dateTo);
    return data;
  }, [incomes, filterSector, searchTerm, dateFrom, dateTo]);

  // Excel export
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    // Summary sheet
    const summaryData = sectorStats.map(s => ({
      'খাত': s.name, 'জমা': s.totalDeposit, 'উত্তোলন': s.totalWithdraw,
      'নেট বিনিয়োগ': s.netInvestment, 'আয়': s.totalIncome, 'লাভ/ক্ষতি': s.totalIncome - s.netInvestment,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "সারসংক্ষেপ");

    // Entries sheet
    const entryData = (filteredEntries || []).map(e => ({
      'তারিখ': e.entry_date, 'খাত': (e as any).investment_sectors?.name || '',
      'ধরণ': e.entry_type === 'deposit' ? 'জমা' : 'উত্তোলন', 'উদ্দেশ্য': e.purpose || '',
      'পরিমাণ': Number(e.amount), 'নোটস': e.notes || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryData), "ইনভেস্টমেন্ট");

    // Income sheet
    const incomeData = (filteredIncomes || []).map(i => ({
      'তারিখ': i.income_date, 'খাত': (i as any).investment_sectors?.name || '',
      'উৎস': i.source || '', 'উদ্দেশ্য': i.purpose || '',
      'পরিমাণ': Number(i.amount), 'নোটস': i.notes || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeData), "আয়");

    XLSX.writeFile(wb, `investment_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel ডাউনলোড হয়েছে");
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error("পপআপ ব্লক হয়েছে"); return; }

    const sectorRows = sectorStats.map(s => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${s.name}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">৳${s.totalDeposit.toLocaleString()}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">৳${s.totalWithdraw.toLocaleString()}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;">৳${s.netInvestment.toLocaleString()}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">৳${s.totalIncome.toLocaleString()}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${s.totalIncome - s.netInvestment >= 0 ? 'green' : 'red'}">৳${(s.totalIncome - s.netInvestment).toLocaleString()}</td>
      </tr>
    `).join('');

    const entryRows = (filteredEntries || []).map(e => `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;">${format(new Date(e.entry_date), 'dd MMM yyyy', { locale: bn })}</td>
        <td style="padding:6px;border:1px solid #ddd;">${(e as any).investment_sectors?.name || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;">${e.entry_type === 'deposit' ? 'জমা' : 'উত্তোলন'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${e.purpose || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">৳${Number(e.amount).toLocaleString()}</td>
      </tr>
    `).join('');

    const incomeRows = (filteredIncomes || []).map(i => `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;">${format(new Date(i.income_date), 'dd MMM yyyy', { locale: bn })}</td>
        <td style="padding:6px;border:1px solid #ddd;">${(i as any).investment_sectors?.name || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;">${i.source || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;">${i.purpose || ''}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right;">৳${Number(i.amount).toLocaleString()}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html><head><title>ইনভেস্টমেন্ট রিপোর্ট - ${settings.shop_name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; color: #333; }
        h1 { text-align: center; margin-bottom: 4px; }
        h3 { text-align: center; color: #666; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #1a1a2e; color: white; padding: 10px 8px; text-align: left; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .summary-card { flex: 1; padding: 16px; border-radius: 8px; text-align: center; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${settings.shop_name}</h1>
      <h3>ইনভেস্টমেন্ট রিপোর্ট — ${format(new Date(), 'dd MMMM yyyy', { locale: bn })}</h3>
      <hr/>
      <div class="summary">
        <div class="summary-card" style="background:#f0e6ff;"><strong>মোট জমা</strong><br/><span style="font-size:20px;font-weight:bold;color:#7c3aed;">৳${grandTotalDeposit.toLocaleString()}</span></div>
        <div class="summary-card" style="background:#ffe6e6;"><strong>মোট উত্তোলন</strong><br/><span style="font-size:20px;font-weight:bold;color:#dc2626;">৳${grandTotalWithdraw.toLocaleString()}</span></div>
        <div class="summary-card" style="background:#e6f0ff;"><strong>নেট বিনিয়োগ</strong><br/><span style="font-size:20px;font-weight:bold;color:#2563eb;">৳${grandTotalInvestment.toLocaleString()}</span></div>
        <div class="summary-card" style="background:#e6fff0;"><strong>মোট আয়</strong><br/><span style="font-size:20px;font-weight:bold;color:#059669;">৳${grandTotalIncome.toLocaleString()}</span></div>
        <div class="summary-card" style="background:${profitLoss >= 0 ? '#e6fff0' : '#ffe6e6'};"><strong>লাভ/ক্ষতি</strong><br/><span style="font-size:20px;font-weight:bold;color:${profitLoss >= 0 ? '#059669' : '#dc2626'};">৳${profitLoss.toLocaleString()}</span></div>
      </div>
      <h2>খাতওয়ারি সারসংক্ষেপ</h2>
      <table><thead><tr><th>খাত</th><th>জমা</th><th>উত্তোলন</th><th>নেট বিনিয়োগ</th><th>আয়</th><th>লাভ/ক্ষতি</th></tr></thead><tbody>${sectorRows}</tbody></table>
      <h2>ইনভেস্টমেন্ট এন্ট্রি</h2>
      <table><thead><tr><th>তারিখ</th><th>খাত</th><th>ধরণ</th><th>উদ্দেশ্য</th><th>পরিমাণ</th></tr></thead><tbody>${entryRows || '<tr><td colspan="5" style="text-align:center;padding:20px;">কোনো এন্ট্রি নেই</td></tr>'}</tbody></table>
      <h2>আয়ের তালিকা</h2>
      <table><thead><tr><th>তারিখ</th><th>খাত</th><th>উৎস</th><th>উদ্দেশ্য</th><th>পরিমাণ</th></tr></thead><tbody>${incomeRows || '<tr><td colspan="5" style="text-align:center;padding:20px;">কোনো আয় নেই</td></tr>'}</tbody></table>
      <p style="text-align:center;color:#999;margin-top:30px;">রিপোর্ট তৈরি: ${new Date().toLocaleString('bn-BD')} | ${settings.shop_name}</p>
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const EntryFormFields = () => (
    <div className="space-y-3">
      <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
        <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
        <SelectContent>{sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={entryType} onValueChange={setEntryType}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="deposit">➕ জমা (Deposit)</SelectItem>
          <SelectItem value="withdraw">➖ উত্তোলন (Withdraw)</SelectItem>
        </SelectContent>
      </Select>
      <Input type="number" placeholder="পরিমাণ (৳)" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} />
      <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
      <Input placeholder="উদ্দেশ্য" value={entryPurpose} onChange={e => setEntryPurpose(e.target.value)} />
      <Textarea placeholder="নোটস (ঐচ্ছিক)" value={entryNotes} onChange={e => setEntryNotes(e.target.value)} className="h-16" />
    </div>
  );

  const IncomeFormFields = () => (
    <div className="space-y-3">
      <Select value={selectedSectorId} onValueChange={setSelectedSectorId}>
        <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
        <SelectContent>{sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="number" placeholder="পরিমাণ (৳)" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value)} />
      <Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} />
      <Input placeholder="উৎস (কোথা থেকে এসেছে)" value={incomeSource} onChange={e => setIncomeSource(e.target.value)} />
      <Input placeholder="উদ্দেশ্য" value={incomePurpose} onChange={e => setIncomePurpose(e.target.value)} />
      <Textarea placeholder="নোটস (ঐচ্ছিক)" value={incomeNotes} onChange={e => setIncomeNotes(e.target.value)} className="h-16" />
    </div>
  );

  return (
    <div ref={containerRef} className="flex flex-col h-screen overflow-y-auto animate-fade-in">
      <AutoHideSticky hidden={hidden} headerHeight={headerHeight} headerRef={headerRef} className="px-1 pb-3 pt-1">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">💼 ইনভেস্টমেন্ট ট্র্যাকার</h1>
          <p className="text-sm text-muted-foreground">খাতওয়ারি বিনিয়োগ, আয় ও লাভ-ক্ষতি হিসাব</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrintReport}><Printer className="w-4 h-4 mr-1" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Dialog open={showAddSector} onOpenChange={setShowAddSector}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Building2 className="w-4 h-4 mr-1" /> নতুন খাত</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>নতুন ইনভেস্টমেন্ট খাত</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="খাতের নাম" value={sectorName} onChange={e => setSectorName(e.target.value)} />
                <Textarea placeholder="বিবরণ (ঐচ্ছিক)" value={sectorDesc} onChange={e => setSectorDesc(e.target.value)} />
                <Button onClick={() => addSectorMutation.mutate()} disabled={!sectorName} className="w-full">যোগ করুন</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddEntry} onOpenChange={(open) => { setShowAddEntry(open); if (!open) resetEntryForm(); }}>
            <DialogTrigger asChild><Button size="sm"><PiggyBank className="w-4 h-4 mr-1" /> বিনিয়োগ</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>ইনভেস্টমেন্ট এন্ট্রি</DialogTitle></DialogHeader>
              <EntryFormFields />
              <Button onClick={() => addEntryMutation.mutate()} disabled={!selectedSectorId || !entryAmount} className="w-full">যোগ করুন</Button>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddIncome} onOpenChange={(open) => { setShowAddIncome(open); if (!open) resetIncomeForm(); }}>
            <DialogTrigger asChild><Button size="sm" variant="secondary"><TrendingUp className="w-4 h-4 mr-1" /> আয়</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>আয় এন্ট্রি</DialogTitle></DialogHeader>
              <IncomeFormFields />
              <Button onClick={() => addIncomeMutation.mutate()} disabled={!selectedSectorId || !incomeAmount} className="w-full">যোগ করুন</Button>
            </DialogContent>
          </Dialog>
        </div>
      </AutoHideSticky>

      <div className="flex-1 px-1 pb-6 space-y-4">
      {/* Edit Dialogs */}
      <Dialog open={showEditSector} onOpenChange={(open) => { setShowEditSector(open); if (!open) { setSectorName(""); setSectorDesc(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>খাত সম্পাদনা</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="খাতের নাম" value={sectorName} onChange={e => setSectorName(e.target.value)} />
            <Textarea placeholder="বিবরণ" value={sectorDesc} onChange={e => setSectorDesc(e.target.value)} />
            <Button onClick={() => updateSectorMutation.mutate()} disabled={!sectorName} className="w-full">আপডেট করুন</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditEntry} onOpenChange={(open) => { setShowEditEntry(open); if (!open) resetEntryForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>এন্ট্রি সম্পাদনা</DialogTitle></DialogHeader>
          <EntryFormFields />
          <Button onClick={() => updateEntryMutation.mutate()} disabled={!selectedSectorId || !entryAmount} className="w-full">আপডেট করুন</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditIncome} onOpenChange={(open) => { setShowEditIncome(open); if (!open) resetIncomeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>আয় সম্পাদনা</DialogTitle></DialogHeader>
          <IncomeFormFields />
          <Button onClick={() => updateIncomeMutation.mutate()} disabled={!selectedSectorId || !incomeAmount} className="w-full">আপডেট করুন</Button>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">মোট জমা</p>
            <p className="text-lg font-bold text-primary">৳{grandTotalDeposit.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">মোট উত্তোলন</p>
            <p className="text-lg font-bold text-destructive">৳{grandTotalWithdraw.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">নেট বিনিয়োগ</p>
            <p className="text-lg font-bold text-blue-600">৳{grandTotalInvestment.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">মোট আয়</p>
            <p className="text-lg font-bold text-accent">৳{grandTotalIncome.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className={`${profitLoss >= 0 ? 'border-accent/20 bg-accent/5' : 'border-destructive/20 bg-destructive/5'}`}>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">লাভ/ক্ষতি</p>
            <p className={`text-lg font-bold ${profitLoss >= 0 ? 'text-accent' : 'text-destructive'}`}>৳{profitLoss.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sectorStats.map(sector => (
          <Card key={sector.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 p-4">
              <div className="flex justify-between items-start">
                <CardTitle className="text-sm">{sector.name}</CardTitle>
                <div className="flex gap-1">
                  {sector.is_default && <Badge variant="secondary" className="text-[9px]">ডিফল্ট</Badge>}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditSector(sector)}><Pencil className="w-3 h-3" /></Button>
                  {!sector.is_default && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { if (confirm("মুছে ফেলতে চান?")) deleteSectorMutation.mutate(sector.id); }}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              {sector.description && <p className="text-[10px] text-muted-foreground">{sector.description}</p>}
            </CardHeader>
            <CardContent className="pt-0 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-primary/5">
                  <p className="text-[9px] text-muted-foreground">বিনিয়োগ</p>
                  <p className="text-xs font-bold text-primary">৳{sector.netInvestment.toLocaleString('bn-BD')}</p>
                </div>
                <div className="p-2 rounded bg-accent/5">
                  <p className="text-[9px] text-muted-foreground">আয়</p>
                  <p className="text-xs font-bold text-accent">৳{sector.totalIncome.toLocaleString('bn-BD')}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-[9px] text-muted-foreground">লাভ/ক্ষতি</p>
                  <p className={`text-xs font-bold ${sector.totalIncome - sector.netInvestment >= 0 ? 'text-accent' : 'text-destructive'}`}>
                    ৳{(sector.totalIncome - sector.netInvestment).toLocaleString('bn-BD')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="খুঁজুন..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            <Select value={filterSector} onValueChange={setFilterSector}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="খাত" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সকল খাত</SelectItem>
                {sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
            {(searchTerm || dateFrom || dateTo || filterSector !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearchTerm(""); setDateFrom(""); setDateTo(""); setFilterSector("all"); }}>
                ✕ ক্লিয়ার
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tab Toggle */}
      <div className="flex gap-2">
        <Button variant={activeTab === "entries" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("entries")}>
          <ArrowDownCircle className="w-4 h-4 mr-1" /> বিনিয়োগ ({filteredEntries?.length || 0})
        </Button>
        <Button variant={activeTab === "incomes" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("incomes")}>
          <ArrowUpCircle className="w-4 h-4 mr-1" /> আয় ({filteredIncomes?.length || 0})
        </Button>
      </div>

      {/* Entries List */}
      {activeTab === "entries" && (
        <Card>
          <CardContent className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
            {(!filteredEntries || filteredEntries.length === 0) && <p className="text-sm text-muted-foreground text-center py-6">কোনো এন্ট্রি নেই</p>}
            {filteredEntries?.map(entry => (
              <div key={entry.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={entry.entry_type === 'deposit' ? 'default' : 'destructive'} className="text-[10px]">
                      {entry.entry_type === 'deposit' ? '➕ জমা' : '➖ উত্তোলন'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{(entry as any).investment_sectors?.name}</span>
                  </div>
                  {entry.purpose && <p className="text-xs mt-1 text-foreground truncate">{entry.purpose}</p>}
                  {entry.notes && <p className="text-[10px] text-muted-foreground truncate">{entry.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">{format(new Date(entry.entry_date), 'dd MMM yyyy', { locale: bn })}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <p className={`font-bold text-sm ${entry.entry_type === 'deposit' ? 'text-primary' : 'text-destructive'}`}>
                    {entry.entry_type === 'deposit' ? '+' : '-'}৳{Number(entry.amount).toLocaleString('bn-BD')}
                  </p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditEntry(entry)}><Pencil className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("মুছে ফেলতে চান?")) deleteEntryMutation.mutate(entry.id); }}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Incomes List */}
      {activeTab === "incomes" && (
        <Card>
          <CardContent className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
            {(!filteredIncomes || filteredIncomes.length === 0) && <p className="text-sm text-muted-foreground text-center py-6">কোনো আয় নেই</p>}
            {filteredIncomes?.map(income => (
              <div key={income.id} className="flex justify-between items-center p-3 rounded-lg bg-accent/5 border border-accent/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-accent">{(income as any).investment_sectors?.name}</span>
                  </div>
                  {income.source && <p className="text-xs text-foreground truncate">উৎস: {income.source}</p>}
                  {income.purpose && <p className="text-[10px] text-muted-foreground truncate">{income.purpose}</p>}
                  {income.notes && <p className="text-[10px] text-muted-foreground truncate">📝 {income.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">{format(new Date(income.income_date), 'dd MMM yyyy', { locale: bn })}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <p className="font-bold text-sm text-accent">+৳{Number(income.amount).toLocaleString('bn-BD')}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditIncome(income)}><Pencil className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("মুছে ফেলতে চান?")) deleteIncomeMutation.mutate(income.id); }}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
