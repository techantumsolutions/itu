'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Clock,
  FileText,
  ExternalLink,
  DollarSign,
  Undo2,
  FileCheck,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReconciliationItem {
  id: string;
  transaction_id: string | null;
  item_type: string;
  confidence_score: number;
  matched_by: string | null;
  supplier_tx_id: string;
  supplier_ref: string | null;
  mobile: string;
  amount: number;
  currency: string;
  provider_cost: number | null;
  difference_amount: number;
  refund_amount: number;
  supplier_cost_difference: number;
  customer_amount_difference: number;
  status: string;
  reconciliation_status: 'CLEAR' | 'PENDING' | 'UNCLEAR';
  reconciliation_details: any;
  recommendations: any[];
  notes: string | null;
  refund_status: 'required' | 'pending' | 'completed' | null;
  created_at: string;
}

interface ReportHeader {
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
  health_metrics: {
    match_rate: number;
    auto_match_percent: number;
    manual_review_percent: number;
    average_confidence: number;
    processing_time_ms: number;
    supplier_accuracy: number;
    settlement_accuracy: number;
  };
  notes: string | null;
  created_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReportDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: reportId } = use(params);

  // States
  const [report, setReport] = useState<ReportHeader | null>(null);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all'); // 'all' | 'CLEAR' | 'PENDING' | 'UNCLEAR'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdatingHeader, setIsUpdatingHeader] = useState<boolean>(false);

  // Selected item drawer/dialog details
  const [selectedItem, setSelectedItem] = useState<ReconciliationItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);

  // Load report and items
  const loadData = async (page = 1) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        pageSize: '25',
        status: activeTab,
        search: searchQuery,
      });

      const res = await fetch(`/api/admin/reconciliation/reports/${reportId}?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        setItems(data.items || []);
        setCurrentPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.total);
      } else {
        toast.error('Failed to load report data.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(1);
  }, [activeTab, reportId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(1);
  };

  // Run header patches (settlement status adjustments)
  const updateSettlementStatus = async (val: string) => {
    setIsUpdatingHeader(true);
    try {
      const res = await fetch(`/api/admin/reconciliation/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement_status: val }),
      });
      if (res.ok) {
        toast.success(`Settlement status updated to ${val.replace(/_/g, ' ').toUpperCase()}`);
        const data = await res.json();
        if (data.report) {
          setReport(prev => prev ? { ...prev, settlement_status: data.report.settlement_status } : null);
        }
      } else {
        toast.error('Failed to update settlement status.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error updating status.');
    } finally {
      setIsUpdatingHeader(false);
    }
  };

  // Execute recommendation
  const handleExecuteAction = async (actionType: 'refund' | 'resolve' | 'ignore') => {
    if (!selectedItem) return;

    setIsExecutingAction(true);
    const toastId = toast.loading(`Executing action recommendation "${actionType.toUpperCase()}"...`);

    try {
      // 1. If Refund action, call existing refund service
      if (actionType === 'refund') {
        if (!selectedItem.transaction_id) {
          toast.error('No matching platform transaction found to issue refund.', { id: toastId });
          setIsExecutingAction(false);
          return;
        }

        const refundRes = await fetch('/api/admin/transactions/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId: selectedItem.transaction_id }),
        });

        if (!refundRes.ok) {
          const errData = await refundRes.json();
          toast.error(errData.error || 'Refund execution failed.', { id: toastId });
          setIsExecutingAction(false);
          return;
        }
      }

      // 2. Patch reconciliation item override values
      const patchPayload: Record<string, any> = {
        status: 'RESOLVED',
        reconciliation_status: 'CLEAR',
        notes: actionNotes || `Manually resolved as ${actionType.toUpperCase()} by Finance.`,
      };

      if (actionType === 'refund') {
        patchPayload.refund_status = 'completed';
      }

      const patchRes = await fetch(`/api/admin/reconciliation/items/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      });

      if (patchRes.ok) {
        const patchData = await patchRes.json();
        toast.success('Action executed and reconciliation item updated successfully!', { id: toastId });

        // Update local item details
        setSelectedItem(patchData.item);
        setItems(prev => prev.map(it => it.id === selectedItem.id ? patchData.item : it));
        setActionNotes('');

        // Refresh run numbers
        const headerRes = await fetch(`/api/admin/reconciliation/reports/${reportId}?page=1&pageSize=1`);
        if (headerRes.ok) {
          const headerData = await headerRes.json();
          setReport(headerData.report);
        }
      } else {
        toast.error('Action executed but failed to save reconciliation resolution.', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error executing action.', { id: toastId });
    } finally {
      setIsExecutingAction(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CLEAR': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'PENDING': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'UNCLEAR': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-muted text-muted-foreground border-muted-foreground/20';
    }
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  return (
    <div className="flex-1 space-y-4">
      {/* Top Navigation Back */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/reconciliation')} className="gap-1.5">
          <ArrowLeft className="size-4" />
          Back to list
        </Button>
      </div>

      {report && (
        <>
          {/* Header Row */}
          <div className="flex flex-col justify-between md:flex-row md:items-center border-b border-border/60 pb-5 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  {report.provider.toUpperCase()} Run Details
                </h1>
                <span className="text-muted-foreground text-lg font-mono">
                  v{report.run_version}
                </span>
              </div>
              <p className="text-muted-foreground mt-1">
                Period: {report.billing_period} | Type: {report.billing_type} | File: {report.file_name}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="settlement-select" className="text-muted-foreground text-sm">Settlement Status</Label>
              <Select
                disabled={isUpdatingHeader}
                value={report.settlement_status}
                onValueChange={updateSettlementStatus}
              >
                <SelectTrigger id="settlement-select" className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_settlement">In Settlement</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="shadow-elevated-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Match Rate</CardTitle>
                <CheckCircle2 className="size-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.health_metrics.match_rate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Average Confidence: {report.health_metrics.average_confidence}%
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-elevated-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Auto Reconciled</CardTitle>
                <FileCheck className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.health_metrics.auto_match_percent}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Manual Review: {report.health_metrics.manual_review_percent}%
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-elevated-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Billed vs Expected</CardTitle>
                <DollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(report.totals.supplier_billed, 'EUR')}
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  Exp: {formatCurrency(report.totals.platform_expected, 'EUR')}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-elevated-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Cost Delta</CardTitle>
                {report.totals.cost_difference >= 0 ? (
                  <TrendingDown className="size-4 text-green-500" />
                ) : (
                  <TrendingUp className="size-4 text-rose-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${report.totals.cost_difference >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
                  {formatCurrency(report.totals.cost_difference, 'EUR')}
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  Refunds: {formatCurrency(report.totals.refunds, 'EUR')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtering and Table Card */}
          <Card className="shadow-elevated-sm">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs */}
                <div className="flex gap-2">
                  {['all', 'CLEAR', 'PENDING', 'UNCLEAR'].map((tab) => (
                    <Button
                      key={tab}
                      variant={activeTab === tab ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                      className="rounded-lg text-xs"
                    >
                      {tab.toUpperCase()}
                    </Button>
                  ))}
                </div>

                {/* Search */}
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search Phone, ID, Ref..."
                      className="pl-8 w-[250px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm">Search</Button>
                </form>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <Loader2 className="animate-spin mr-2 size-5" />
                  Loading items...
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                  <HelpCircle className="size-8 mb-2 text-muted-foreground/35" />
                  <p className="font-semibold">No records match the current criteria</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier ID</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Billed Amount</TableHead>
                        <TableHead>Platform Cost</TableHead>
                        <TableHead>Variance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Recon State</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const rowDiff = item.supplier_cost_difference;
                        const isMatch = item.reconciliation_status === 'CLEAR';
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono max-w-[150px] truncate">
                              {item.supplier_tx_id}
                            </TableCell>
                            <TableCell>
                              {item.mobile}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {formatCurrency(item.amount, item.currency)}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {item.provider_cost !== null ? formatCurrency(item.provider_cost, item.currency) : '—'}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {rowDiff === 0 ? (
                                <span className="text-muted-foreground">$0.00</span>
                              ) : (
                                <span className={rowDiff > 0 ? 'text-green-500' : 'text-rose-500'}>
                                  {rowDiff > 0 ? '+' : ''}{formatCurrency(rowDiff, item.currency)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-semibold px-2 py-0.5 border rounded-lg bg-muted/65 text-muted-foreground">
                                {item.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border rounded-full ${getStatusBadgeClass(item.reconciliation_status)}`}>
                                {item.reconciliation_status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setIsDrawerOpen(true);
                                }}
                              >
                                Investigate
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border/60 p-4">
                      <div className="text-xs text-muted-foreground">
                        Showing {items.length} of {totalItems} items
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => loadData(currentPage - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === totalPages}
                          onClick={() => loadData(currentPage + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Investigation Details Dialog Panel */}
      <Dialog open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-xl">Transaction Audit Log</DialogTitle>
                    <DialogDescription className="mt-1 font-mono text-xs">
                      Supplier ID: {selectedItem.supplier_tx_id} | Priority Confidence: {selectedItem.confidence_score}% ({selectedItem.matched_by || 'Unmatched'})
                    </DialogDescription>
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1 border rounded-full ${getStatusBadgeClass(selectedItem.reconciliation_status)}`}>
                    {selectedItem.reconciliation_status}
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
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Supplier ID</span>
                      <span className="font-semibold">{selectedItem.supplier_tx_id}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Supplier Reference</span>
                      <span className="font-semibold">{selectedItem.supplier_ref || '—'}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Mobile MSISDN</span>
                      <span className="font-semibold">{selectedItem.mobile}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Billed wholesale</span>
                      <span className="font-semibold text-primary">{formatCurrency(selectedItem.amount, selectedItem.currency)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Billed currency</span>
                      <span className="font-semibold">{selectedItem.currency}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground text-xs">Row Logged Date</span>
                      <span className="text-xs">{selectedItem.reconciliation_details?.supplier_snapshot?.timestamp || '—'}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Right Side: Platform Record details */}
                <Card className="bg-muted/15 border-muted/30">
                  <CardHeader className="py-3 bg-muted/30 border-b border-muted-foreground/10 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold">Operational Database Logs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 pt-3.5 text-sm font-mono">
                    {selectedItem.reconciliation_details?.platform_snapshot ? (
                      <>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Transaction ID</span>
                          <span className="font-semibold truncate max-w-[180px]">{selectedItem.reconciliation_details.platform_snapshot.transaction_id}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Recharge Order ID</span>
                          <span className="font-semibold truncate max-w-[180px]">{selectedItem.reconciliation_details.platform_snapshot.order_id || '—'}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Recharge Status</span>
                          <span className={`font-semibold text-xs border rounded-lg px-2 py-0.2 bg-muted/80 ${selectedItem.reconciliation_details.platform_snapshot.recharge_status === 'completed' ? 'text-green-500' : 'text-rose-500'}`}>
                            {selectedItem.reconciliation_details.platform_snapshot.recharge_status}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Payment status</span>
                          <span className="font-semibold text-xs border rounded-lg px-2 py-0.2 bg-muted/80 text-blue-500">
                            {selectedItem.reconciliation_details.platform_snapshot.payment_status}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Expected Cost</span>
                          <span className="font-semibold text-primary">{formatCurrency(selectedItem.reconciliation_details.platform_snapshot.recorded_cost, selectedItem.reconciliation_details.platform_snapshot.recorded_currency)}</span>
                        </div>
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Created At</span>
                          <span className="text-xs">{selectedItem.reconciliation_details.platform_snapshot.timestamp}</span>
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

              {/* Lifecycle Event timeline */}
              {selectedItem.reconciliation_details?.timeline && (
                <div className="mt-4 border rounded-lg p-4 bg-muted/5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                    <Clock className="size-4 text-primary" />
                    Chronological Lifecycle Audit Timeline
                  </h3>
                  <div className="relative border-l border-muted-foreground/20 ml-2 pl-4 space-y-4">
                    {selectedItem.reconciliation_details.timeline.map((evt: any, idx: number) => (
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

              {/* Settlement Actions Queue panel */}
              <div className="mt-4 border rounded-lg p-4 bg-muted/20 border-muted">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Undo2 className="size-4 text-primary" />
                  Finance Action Settlement Center
                </h3>

                {selectedItem.status === 'RESOLVED' ? (
                  <div className="flex items-center gap-2 p-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-sm border border-emerald-500/20 font-semibold">
                    <CheckCircle className="size-4" />
                    Item Resolved: {selectedItem.notes || 'Manually reconciled.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Review recommendations based on differences. Execute matching adjustments or refund queues.
                    </div>

                    {selectedItem.recommendations && selectedItem.recommendations.map((rec: any, idx: number) => (
                      <div key={idx} className="p-3 bg-muted/40 border border-muted-foreground/15 rounded-lg text-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div>
                          <div className="font-bold text-xs uppercase text-primary tracking-wider">{rec.action.toUpperCase()} RECOMMENDATION</div>
                          <div className="text-muted-foreground text-xs mt-0.5">{rec.reason}</div>
                        </div>

                        {rec.action !== 'none' && (
                          <Button
                            size="sm"
                            disabled={isExecutingAction}
                            onClick={() => handleExecuteAction(rec.action)}
                            className="shrink-0"
                          >
                            {isExecutingAction ? (
                              <Loader2 className="animate-spin size-3.5 mr-1" />
                            ) : null}
                            Approve & Execute {rec.action === 'refund' ? 'Refund' : 'Resolution'}
                          </Button>
                        )}
                      </div>
                    ))}

                    <div className="space-y-1.5">
                      <Label htmlFor="action-notes">Resolution Remarks</Label>
                      <Input
                        id="action-notes"
                        placeholder="Add resolution notes..."
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 pt-3 border-t border-muted">
                <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
