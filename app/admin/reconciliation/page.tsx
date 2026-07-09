'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  FileUp,
  Calendar,
  Layers,
  Search,
  Phone,
  User,
  ShieldCheck,
  ShieldAlert,
  Eye,
  AlertTriangle,
  CheckCircle,
  Undo2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ReconciliationReport {
  id: string;
  provider: string;
  billing_period: string;
  billing_type: string;
  run_version: number;
  file_name: string;
  status: string;
  settlement_status: string;
  totals: {
    supplier_billed: number;
    platform_expected: number;
    cost_difference: number;
    refunds: number;
    net_settlement: number;
  };
  created_at: string;
}

interface RechargeRecord {
  id: string;
  transaction_id: string;
  provider: string;
  created_at: string;
  recharge_status: string;
  payment_status: string;
  destination_phone: string;
  user_amount: number;
  user_currency: string;
  provider_cost: number | null;
  provider_currency: string;
  billed_amount: number | null;
  billed_currency: string | null;
  recon_status: 'CLEAR' | 'UNCLEAR';
  status_code: string;
  recon_item: any | null;
}

export default function ReconciliationDashboard() {
  const router = useRouter();

  // Dialog popup control
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  // Form state
  const [supplier, setSupplier] = useState<string>('dtone');
  const [billingPeriod, setBillingPeriod] = useState<string>('');
  const [billingType, setBillingType] = useState<string>('Original');
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Data lists state
  const [reports, setReports] = useState<ReconciliationReport[]>([]);
  const [recharges, setRecharges] = useState<RechargeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Row detail popup state
  const [selectedRecharge, setSelectedRecharge] = useState<RechargeRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);

  // Execute selected recommendation action
  const handleExecuteAction = async () => {
    if (!selectedRecharge?.recon_item || !selectedAction) return;

    setIsExecutingAction(true);
    const toastId = toast.loading(`Executing "${selectedAction.toUpperCase()}" resolution...`);

    try {
      // 1. If Refund action, call refund service
      if (selectedAction === 'refund') {
        if (!selectedRecharge.transaction_id) {
          toast.error('No matching platform transaction found to issue refund.', { id: toastId });
          setIsExecutingAction(false);
          return;
        }
        const refundRes = await fetch('/api/admin/transactions/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId: selectedRecharge.transaction_id }),
        });
        if (!refundRes.ok) {
          const errData = await refundRes.json();
          toast.error(errData.error || 'Refund execution failed.', { id: toastId });
          setIsExecutingAction(false);
          return;
        }
      }

      // 2. Patch reconciliation item
      const patchPayload: Record<string, any> = {
        status: 'RESOLVED',
        reconciliation_status: 'CLEAR',
        notes: actionNotes || `Manually resolved as ${selectedAction.toUpperCase()} by Finance.`,
      };
      if (selectedAction === 'refund') {
        patchPayload.refund_status = 'completed';
      }

      const patchRes = await fetch(`/api/admin/reconciliation/items/${selectedRecharge.recon_item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      });

      if (patchRes.ok) {
        const patchData = await patchRes.json();
        toast.success('Resolution executed and item updated successfully!', { id: toastId });

        // Update the local recharges list with updated recon_item
        setRecharges(prev => prev.map(r =>
          r.id === selectedRecharge.id
            ? { ...r, recon_item: patchData.item, recon_status: 'CLEAR', status_code: 'RESOLVED' }
            : r
        ));
        setSelectedRecharge(prev => prev ? {
          ...prev,
          recon_item: patchData.item,
          recon_status: 'CLEAR',
          status_code: 'RESOLVED'
        } : null);
        setSelectedAction(null);
        setActionNotes('');
      } else {
        toast.error('Failed to save reconciliation resolution.', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error executing resolution.', { id: toastId });
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Load runs and recharges lists
  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/reconciliation');
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setRecharges(data.recharges || []);
      } else {
        toast.error('Failed to load reconciliation dashboard data.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Connection error while fetching reports.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          setFileContent(csv);
        } catch (err) {
          console.error(err);
          toast.error('Failed to parse Excel file. Please ensure it is a valid workbook.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  // Submit run
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!billingPeriod) {
      toast.error('Please specify the billing period (e.g. 2026-07).');
      return;
    }
    if (!fileContent) {
      toast.error('Please select a valid supplier billing file.');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Executing reconciliation engine pipeline. Checking transaction histories in bulk...');

    try {
      const res = await fetch('/api/admin/reconciliation/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          billingPeriod,
          billingType,
          fileName,
          fileContent,
        }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        toast.success('Comparison compile runs finished successfully!', { id: toastId });

        // Reset form & close modal
        setFileName('');
        setFileContent('');
        setIsUploadOpen(false);

        // Reload dashboard lists
        await fetchReports();

        // Navigate directly to details page
        router.push(`/admin/reconciliation/reports/${result.reportId}`);
      } else {
        toast.error(result.error || 'Reconciliation pipeline compilation run failed.', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Network failure executing reconciliation run.', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const getSupplierLabel = (supplierCode: string) => {
    switch (supplierCode.toLowerCase()) {
      case 'dtone': return 'DTOne';
      case 'ding': return 'Ding Connect';
      case 'valuetopup': return 'ValueTopup';
      default: return supplierCode;
    }
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Filter recharges by search query
  const filteredRecharges = recharges.filter(r =>
    r.destination_phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.transaction_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-4">
      {/* Header section with Modal Dialog Upload Button */}
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            Compare billing logs against operational records, check LCR routing, and audit net settlement totals.
          </p>
        </div>

        {/* POPUP INVOICE UPLOAD DIALOG */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm font-semibold">
              <Upload className="size-4" />
              Upload Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-primary" />
                Upload Provider Bill/Invoice
              </DialogTitle>
              <DialogDescription>
                Select the provider and billing parameters to execute a comparison run.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-select">Provider</Label>
                <Select value={supplier} onValueChange={setSupplier}>
                  <SelectTrigger id="supplier-select">
                    <SelectValue placeholder="Select Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dtone">DTOne</SelectItem>
                    <SelectItem value="ding">Ding Connect</SelectItem>
                    <SelectItem value="valuetopup">ValueTopup</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-period-input">Billing Period (YYYY-MM)</Label>
                <Input
                  id="billing-period-input"
                  type="month"
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-type-select">Run Billing Type</Label>
                <Select value={billingType} onValueChange={setBillingType}>
                  <SelectTrigger id="billing-type-select">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Original">Original Run</SelectItem>
                    <SelectItem value="Correction">Correction Run</SelectItem>
                    <SelectItem value="Adjustment">Adjustment Run</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-file-input">Billing File (CSV/Excel)</Label>
                <div className="flex items-center justify-center w-full">
                  <label
                    htmlFor="billing-file-input"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/30 border-muted-foreground/20 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FileUp className="w-8 h-8 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground font-semibold px-4 text-center truncate w-full">
                        {fileName ? fileName : 'Click to select file'}
                      </p>
                      <p className="text-xs text-muted-foreground/60">CSV or XLSX formats only</p>
                    </div>
                    <input
                      id="billing-file-input"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <Button type="submit" disabled={isUploading} className="w-full mt-2 gap-2">
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin size-4" />
                    Reconciling...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Upload & Compare
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* TABS SWITCHER FOR CLEAN VIEW */}
      <Tabs defaultValue="recharges" className="space-y-6">
        <TabsList className="bg-muted/60 p-1 rounded-lg">
          <TabsTrigger value="recharges" className="gap-2 font-semibold">
            <Layers className="size-4" />
            Recharge Audits
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 font-semibold">
            <Calendar className="size-4" />
            Historical Runs
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: RECHARGES LIST (MAIN VIEW) */}
        <TabsContent value="recharges">
          <Card className="shadow-elevated-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Transactions Reconciliation Feed</CardTitle>
                <CardDescription>
                  Review and audit all platform recharges and compare their operational metrics against supplier invoices.
                </CardDescription>
              </div>

              {/* Search bar */}
              <div className="relative w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search phone or provider..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <Loader2 className="animate-spin mr-2 size-5" />
                  Loading recharges feed...
                </div>
              ) : filteredRecharges.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-muted-foreground">
                  <AlertCircle className="size-8 text-muted-foreground/45 mb-2" />
                  <p className="font-semibold">No recharges found</p>
                  <p className="text-sm text-muted-foreground/60">Ensure you have transactions or try matching again.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Destination Contact</TableHead>
                      <TableHead>User Amount</TableHead>
                      <TableHead>Provider Cost</TableHead>
                      <TableHead>Supplier Billed (EUR)</TableHead>
                      <TableHead>Recharge Status</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead className="text-center">Recon Status</TableHead>
                      <TableHead className="text-center">Final Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecharges.map((recharge) => {
                      const isClear = recharge.recon_status === 'CLEAR';

                      return (
                        <TableRow key={recharge.id} className="hover:bg-muted/30">
                          {/* Provider */}
                          <TableCell className="font-medium">
                            {getSupplierLabel(recharge.provider)}
                          </TableCell>

                          {/* Date & Time */}
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(recharge.created_at)}
                          </TableCell>

                          {/* Destination contact */}
                          <TableCell className="font-mono text-sm">
                            <span className="flex items-center gap-1.5">
                              <Phone className="size-3 text-muted-foreground/60" />
                              {recharge.destination_phone}
                            </span>
                          </TableCell>

                          {/* User Amount */}
                          <TableCell className="font-mono">
                            {formatCurrency(recharge.user_amount, recharge.user_currency)}
                          </TableCell>

                          {/* Provider cost */}
                          <TableCell className="font-mono text-muted-foreground text-sm">
                            {recharge.provider_cost !== null ? formatCurrency(recharge.provider_cost, recharge.provider_currency) : '—'}
                          </TableCell>

                          {/* Billed cost (Always in EUR for DTOne/etc.) */}
                          <TableCell className="font-mono">
                            {recharge.billed_amount !== null ? (
                              <span className="font-semibold">
                                {formatCurrency(recharge.billed_amount, 'EUR')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>

                          {/* Recharge Status */}
                          <TableCell>
                            <Badge
                              variant={recharge.recharge_status === 'completed' ? 'success' : (recharge.recharge_status === 'failed' ? 'destructive' : 'secondary')}
                              className="text-xs capitalize font-medium px-2.5 py-0.5"
                            >
                              {recharge.recharge_status}
                            </Badge>
                          </TableCell>

                          {/* Payment Status */}
                          <TableCell>
                            <Badge
                              variant={recharge.payment_status === 'completed' ? 'outline' : 'secondary'}
                              className="text-xs capitalize font-medium px-2 py-0.5"
                            >
                              {recharge.payment_status}
                            </Badge>
                          </TableCell>

                          {/* Recon Status Code */}
                          <TableCell className="text-center">
                            <Badge className="text-xs font-semibold px-2 py-0.5 border rounded-lg bg-muted/65 text-muted-foreground font-mono">
                              {recharge.status_code.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>

                          {/* Final Status (CLEAR/UNCLEAR) */}
                          <TableCell className="text-center">
                            <Badge
                              variant={isClear ? 'success' : 'destructive'}
                              className={`gap-1 font-semibold text-xs py-0.5 px-3 uppercase tracking-wider ${isClear
                                ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border-rose-500/20'
                                }`}
                            >
                              {isClear ? (
                                <ShieldCheck className="size-3.5" />
                              ) : (
                                <ShieldAlert className="size-3.5" />
                              )}
                              {recharge.recon_status}
                            </Badge>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-muted-foreground hover:text-foreground"
                              title="View Details"
                              onClick={() => {
                                setSelectedRecharge(recharge);
                                setIsDetailOpen(true);
                                setActionNotes('');
                                setSelectedAction(null);
                              }}
                            >
                              <Eye className="size-4" />
                              <span className="text-xs">View</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: HISTORICAL RUNS */}
        <TabsContent value="reports">
          <Card className="shadow-elevated-sm">
            <CardHeader>
              <CardTitle>Historical Runs</CardTitle>
              <CardDescription>
                Review past comparison results, verify settlement, and review manual resolutions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="animate-spin mr-2 size-5" />
                  Loading runs list...
                </div>
              ) : reports.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted-foreground">
                  <AlertCircle className="size-8 text-muted-foreground/45 mb-2" />
                  <p className="font-semibold">No reconciliation runs completed yet</p>
                  <p className="text-sm text-muted-foreground/60">Upload a supplier billing file to start.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Run Type (Version)</TableHead>
                      <TableHead>Billed Amount</TableHead>
                      <TableHead>Cost Delta</TableHead>
                      <TableHead>Refunds Req.</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => {
                      const delta = report.totals?.cost_difference || 0;
                      const isPositive = delta > 0;
                      return (
                        <TableRow key={report.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">
                            {getSupplierLabel(report.provider)}
                          </TableCell>
                          <TableCell>
                            {report.billing_period}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-xs bg-muted border rounded px-1.5 py-0.5 mr-1">
                              {report.billing_type}
                            </span>
                            <span className="text-muted-foreground text-xs font-mono">
                              v{report.run_version}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatCurrency(report.totals?.supplier_billed || 0)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 font-mono">
                              {delta === 0 ? (
                                <span className="text-muted-foreground">$0.00</span>
                              ) : (
                                <>
                                  {isPositive ? (
                                    <TrendingDown className="size-3.5 text-green-500" />
                                  ) : (
                                    <TrendingUp className="size-3.5 text-rose-500" />
                                  )}
                                  <span className={isPositive ? 'text-green-500' : 'text-rose-500'}>
                                    {formatCurrency(Math.abs(delta))}
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {formatCurrency(report.totals?.refunds || 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => router.push(`/admin/reconciliation/reports/${report.id}`)}
                            >
                              View
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Row Investigation Details Popup */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedRecharge && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-xl">Transaction Audit Log</DialogTitle>
                    <DialogDescription className="mt-1 font-mono text-xs">
                      {selectedRecharge.recon_item
                        ? `Supplier ID: ${selectedRecharge.recon_item.supplier_tx_id} | Confidence: ${selectedRecharge.recon_item.confidence_score}% (${selectedRecharge.recon_item.matched_by || 'Unmatched'})`
                        : `Transaction ID: ${selectedRecharge.transaction_id || '—'} | No billing record matched`}
                    </DialogDescription>
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1 border rounded-full ${selectedRecharge.recon_status === 'CLEAR'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : selectedRecharge.recon_status === 'UNCLEAR'
                      ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}>
                    {selectedRecharge.recon_status}
                  </span>
                </div>
              </DialogHeader>

              {/* Side-by-side Audit comparator */}
              <div className="grid gap-6 md:grid-cols-2 mt-2">
                {/* Left Side: Supplier Details */}
                <Card className="bg-muted/15 border-muted/30">
                  <CardHeader className="py-3 bg-muted/30 border-b border-muted-foreground/10 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold">Supplier Billing Invoice Row</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 pt-3.5 text-sm font-mono">
                    {selectedRecharge.recon_item ? (
                      <>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Supplier ID</span>
                          <span className="font-semibold truncate max-w-[180px]">{selectedRecharge.recon_item.supplier_tx_id}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Supplier Reference</span>
                          <span className="font-semibold">{selectedRecharge.recon_item.supplier_ref || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Mobile MSISDN</span>
                          <span className="font-semibold">{selectedRecharge.recon_item.mobile || selectedRecharge.destination_phone}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Billed Wholesale</span>
                          <span className="font-semibold text-primary">{formatCurrency(selectedRecharge.recon_item.amount, selectedRecharge.recon_item.currency)}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Billed Currency</span>
                          <span className="font-semibold">{selectedRecharge.recon_item.currency}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Cost Difference</span>
                          <span className={`font-semibold text-xs ${selectedRecharge.recon_item.difference_amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {formatCurrency(selectedRecharge.recon_item.difference_amount, selectedRecharge.recon_item.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Row Logged Date</span>
                          <span className="text-xs">{selectedRecharge.recon_item.reconciliation_details?.supplier_snapshot?.timestamp || '—'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-36 flex-col items-center justify-center text-center text-muted-foreground/60 text-xs">
                        <AlertTriangle className="size-6 text-amber-500/70 mb-1" />
                        No matching billing invoice row found.
                        <span className="mt-1 text-[10px]">Upload a supplier billing CSV to reconcile this transaction.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right Side: Platform Record */}
                <Card className="bg-muted/15 border-muted/30">
                  <CardHeader className="py-3 bg-muted/30 border-b border-muted-foreground/10 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold">Operational Database Logs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 pt-3.5 text-sm font-mono">
                    {selectedRecharge.recon_item?.reconciliation_details?.platform_snapshot ? (
                      <>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Transaction ID</span>
                          <span className="font-semibold truncate max-w-[180px]">{selectedRecharge.recon_item.reconciliation_details.platform_snapshot.transaction_id}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Recharge Order ID</span>
                          <span className="font-semibold truncate max-w-[180px]">{selectedRecharge.recon_item.reconciliation_details.platform_snapshot.order_id || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Recharge Status</span>
                          <span className={`font-semibold text-xs border rounded-lg px-2 py-0.5 bg-muted/80 ${selectedRecharge.recon_item.reconciliation_details.platform_snapshot.recharge_status === 'completed' ? 'text-green-500' : 'text-rose-500'
                            }`}>
                            {selectedRecharge.recon_item.reconciliation_details.platform_snapshot.recharge_status}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Payment Status</span>
                          <span className="font-semibold text-xs border rounded-lg px-2 py-0.5 bg-muted/80 text-blue-500">
                            {selectedRecharge.recon_item.reconciliation_details.platform_snapshot.payment_status}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Recorded Cost</span>
                          <span className="font-semibold text-primary">{formatCurrency(selectedRecharge.recon_item.reconciliation_details.platform_snapshot.recorded_cost, selectedRecharge.recon_item.reconciliation_details.platform_snapshot.recorded_currency)}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Created At</span>
                          <span className="text-xs">{selectedRecharge.recon_item.reconciliation_details.platform_snapshot.timestamp}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-36 flex-col items-center justify-center text-center text-muted-foreground/60 text-xs">
                        <AlertTriangle className="size-6 text-rose-500/70 mb-1" />
                        No matching transaction logs found in operational tables.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Lifecycle Event Timeline */}
              {selectedRecharge.recon_item?.reconciliation_details?.timeline && (
                <div className="mt-4 border rounded-lg p-4 bg-muted/5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                    <Clock className="size-4 text-primary" />
                    Chronological Lifecycle Audit Timeline
                  </h3>
                  <div className="relative border-l border-muted-foreground/20 ml-2 pl-4 space-y-4">
                    {selectedRecharge.recon_item.reconciliation_details.timeline.map((evt: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary border border-background" />
                        <div className="flex justify-between text-xs gap-4">
                          <span className="font-medium text-muted-foreground">{evt.event}</span>
                          <span className="text-muted-foreground font-mono">{new Date(evt.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Finance Action Settlement Center */}
              <div className="mt-4 border rounded-lg p-4 bg-muted/20 border-muted">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Undo2 className="size-4 text-primary" />
                  Finance Action Settlement Center
                </h3>

                {selectedRecharge.recon_item?.status === 'RESOLVED' ? (
                  <div className="flex items-center gap-2 p-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-sm border border-emerald-500/20 font-semibold">
                    <CheckCircle className="size-4" />
                    Item Resolved: {selectedRecharge.recon_item?.notes || 'Manually reconciled.'}
                  </div>
                ) : selectedRecharge.recon_item?.recommendations?.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Select a recommendation below and click <span className="font-semibold text-foreground">Approve &amp; Execute</span> to apply the resolution.
                    </div>

                    {selectedRecharge.recon_item.recommendations.map((rec: any, idx: number) => {
                      const isSelected = selectedAction === rec.action;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedAction(isSelected ? null : rec.action)}
                          className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                            ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                            : 'bg-muted/40 border-muted-foreground/15 hover:border-muted-foreground/30 hover:bg-muted/60'
                            }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Radio indicator */}
                            <div className={`mt-0.5 shrink-0 size-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40 bg-transparent'
                              }`}>
                              {isSelected && <div className="size-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-bold text-xs uppercase text-primary tracking-wider">{rec.action.toUpperCase()} RECOMMENDATION</div>
                              <div className="text-muted-foreground text-xs mt-0.5">{rec.reason}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="dashboard-action-notes">Resolution Remarks</Label>
                      <Input
                        id="dashboard-action-notes"
                        placeholder="Add resolution notes (optional)..."
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                      />
                    </div>

                    <Button
                      className="w-full gap-2 mt-1"
                      disabled={!selectedAction || isExecutingAction}
                      onClick={handleExecuteAction}
                    >
                      {isExecutingAction ? (
                        <><Loader2 className="animate-spin size-4" /> Executing...</>
                      ) : (
                        <><CheckCircle className="size-4" /> Approve &amp; Execute {selectedAction ? selectedAction.charAt(0).toUpperCase() + selectedAction.slice(1) : 'Resolution'}</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {selectedRecharge.recon_item
                      ? 'No action recommendations generated for this item.'
                      : 'No billing record matched. Upload a supplier invoice to generate recommendations.'}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 pt-3 border-t border-muted">
                <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
