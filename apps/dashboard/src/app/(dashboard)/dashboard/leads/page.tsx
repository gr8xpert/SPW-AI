'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Plus,
  MoreHorizontal,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Building2,
} from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { formatCurrency, getInitials, formatDate } from '@/lib/utils';
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

function LeadCard({
  lead,
  onStatusChange,
}: {
  lead: Lead;
  onStatusChange: (id: number, status: LeadStatus) => void;
}) {
  return (
    <Card className="mb-3 cursor-pointer hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getInitials(lead.contact.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">{lead.contact.name}</p>
              <p className="text-xs text-muted-foreground">{lead.contact.email}</p>
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
                  <DropdownMenuItem
                    key={col.id}
                    onClick={() => onStatusChange(lead.id, col.id)}
                  >
                    Move to {col.title}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Property */}
        {lead.property && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Building2 className="h-3 w-3" />
            <span className="truncate">
              {lead.property.title?.en || lead.property.reference}
            </span>
          </div>
        )}

        {/* Budget */}
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

        {/* Follow-up */}
        {lead.nextFollowUp && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Calendar className="h-3 w-3" />
            <span>Follow-up: {formatDate(lead.nextFollowUp)}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex gap-1">
            {lead.contact.phone && (
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Phone className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Mail className="h-3 w-3" />
            </Button>
          </div>
          <Badge
            variant={lead.score >= 70 ? 'success' : lead.score >= 40 ? 'warning' : 'secondary'}
            className="text-xs"
          >
            Score: {lead.score}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({
  column,
  leads,
  onStatusChange,
}: {
  column: (typeof columns)[0];
  leads: Lead[];
  onStatusChange: (id: number, status: LeadStatus) => void;
}) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 mb-4">
        <div className={cn('w-3 h-3 rounded-full', column.color)} />
        <h3 className="font-semibold">{column.title}</h3>
        <Badge variant="secondary" className="ml-auto">
          {leads.length}
        </Badge>
      </div>
      <div className="space-y-0">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onStatusChange={onStatusChange} />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            No leads
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => apiGet<Lead[]>('/api/dashboard/leads'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LeadStatus }) =>
      apiPatch(`/api/dashboard/leads/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const handleStatusChange = (id: number, status: LeadStatus) => {
    updateStatus.mutate({ id, status });
  };

  // Group leads by status
  const leadsByStatus = columns.reduce(
    (acc, col) => {
      acc[col.id] = leads.filter((lead) => lead.status === col.id);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            Manage your sales pipeline and track lead progress
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leads.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leadsByStatus.new?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(leadsByStatus.contacted?.length || 0) +
                (leadsByStatus.qualified?.length || 0) +
                (leadsByStatus.viewing_scheduled?.length || 0) +
                (leadsByStatus.offer_made?.length || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Won This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {leadsByStatus.won?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-4">
              {columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  leads={leadsByStatus[column.id] || []}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
