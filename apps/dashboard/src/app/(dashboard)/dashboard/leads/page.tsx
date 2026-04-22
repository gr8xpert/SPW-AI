'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Plus,
  MoreHorizontal,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Building2,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'viewing_scheduled'
  | 'offer_made'
  | 'negotiating'
  | 'won'
  | 'lost';

interface Lead {
  id: number;
  status: LeadStatus;
  score: number;
  budgetMin: number;
  budgetMax: number;
  budgetCurrency: string;
  nextFollowUp: string | null;
  createdAt: string;
  contact: {
    id: number;
    name: string;
    email: string;
    phone: string;
  };
  property?: {
    id: number;
    reference: string;
    title: { en?: string };
  };
  assignedToUser?: {
    id: number;
    name: string;
  };
}

const columns: { id: LeadStatus; title: string; color: string }[] = [
  { id: 'new', title: 'New', color: 'bg-blue-500' },
  { id: 'contacted', title: 'Contacted', color: 'bg-purple-500' },
  { id: 'qualified', title: 'Qualified', color: 'bg-indigo-500' },
  { id: 'viewing_scheduled', title: 'Viewing', color: 'bg-cyan-500' },
  { id: 'offer_made', title: 'Offer Made', color: 'bg-amber-500' },
  { id: 'won', title: 'Won', color: 'bg-green-500' },
  { id: 'lost', title: 'Lost', color: 'bg-red-500' },
];

const emptyForm = { name: '', email: '', phone: '', message: '', budgetMin: '', budgetMax: '' };

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const api = useApi();
  const { toast } = useToast();

  const fetchLeads = async () => {
    try {
      const res = await api.get('/api/dashboard/leads');
      const body = res?.data || res;
      setLeads(Array.isArray(body) ? body : body.data || []);
    } catch {
      toast({ title: 'Failed to load leads', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchLeads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (id: number, status: LeadStatus) => {
    try {
      await api.put(`/api/dashboard/leads/${id}`, { status });
      toast({ title: `Lead moved to ${status.replace('_', ' ')}` });
      fetchLeads();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/leads', {
        email: form.email,
        name: form.name || undefined,
        phone: form.phone || undefined,
        message: form.message || undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        source: 'manual',
      });
      toast({ title: 'Lead created' });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchLeads();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const leadsByStatus = columns.reduce(
    (acc, col) => {
      acc[col.id] = leads.filter((lead) => lead.status === col.id);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  const inProgress =
    (leadsByStatus.contacted?.length || 0) +
    (leadsByStatus.qualified?.length || 0) +
    (leadsByStatus.viewing_scheduled?.length || 0) +
    (leadsByStatus.offer_made?.length || 0) +
    (leadsByStatus.negotiating?.length || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Manage your sales pipeline and track lead progress</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Leads</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{leads.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">New</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{leadsByStatus.new?.length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">In Progress</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{inProgress}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Won</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{leadsByStatus.won?.length || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          {api.isLoading && leads.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-4">
              {columns.map((column) => {
                const colLeads = leadsByStatus[column.id] || [];
                return (
                  <div key={column.id} className="flex-shrink-0 w-72">
                    <div className="flex items-center gap-2 mb-4">
                      <div className={cn('w-3 h-3 rounded-full', column.color)} />
                      <h3 className="font-semibold">{column.title}</h3>
                      <Badge variant="secondary" className="ml-auto">{colLeads.length}</Badge>
                    </div>
                    <div className="space-y-0">
                      {colLeads.map((lead) => (
                        <Card key={lead.id} className="mb-3 cursor-pointer hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {lead.contact?.name ? getInitials(lead.contact.name) : '?'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{lead.contact?.name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">{lead.contact?.email}</p>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {columns
                                    .filter((c) => c.id !== lead.status)
                                    .map((col) => (
                                      <DropdownMenuItem key={col.id} onClick={() => handleStatusChange(lead.id, col.id)}>
                                        Move to {col.title}
                                      </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {lead.property && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <Building2 className="h-3 w-3" />
                                <span className="truncate">{lead.property.title?.en || lead.property.reference}</span>
                              </div>
                            )}

                            {(lead.budgetMin || lead.budgetMax) && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <DollarSign className="h-3 w-3" />
                                <span>
                                  {lead.budgetMin && formatCurrency(lead.budgetMin, lead.budgetCurrency)}
                                  {lead.budgetMin && lead.budgetMax && ' - '}
                                  {lead.budgetMax && formatCurrency(lead.budgetMax, lead.budgetCurrency)}
                                </span>
                              </div>
                            )}

                            {lead.nextFollowUp && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <Calendar className="h-3 w-3" />
                                <span>Follow-up: {formatDate(lead.nextFollowUp)}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-3 pt-3 border-t">
                              <div className="flex gap-1">
                                {lead.contact?.phone && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6"><Phone className="h-3 w-3" /></Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-6 w-6"><Mail className="h-3 w-3" /></Button>
                              </div>
                              <Badge
                                variant={lead.score >= 70 ? 'success' : lead.score >= 40 ? 'warning' : 'secondary'}
                                className="text-xs"
                              >
                                Score: {lead.score || 0}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {colLeads.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                          No leads
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Lead Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>Create a new lead in your pipeline</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="john@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input placeholder="+34 600 000 000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Input placeholder="Interested in sea view villas..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Budget Min</Label>
                <Input type="number" placeholder="200000" value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Budget Max</Label>
                <Input type="number" placeholder="500000" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.email || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
