'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  Home,
  MoreHorizontal,
  User,
  Clock,
  DollarSign,
  MapPin,
  Star,
  Edit,
  Trash2,
  Send,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Sample lead data
const sampleLead = {
  id: 1,
  contact: {
    name: 'Sample Contact',
    email: 'contact@company.com',
    phone: '+34 612 345 678',
  },
  property: {
    id: 1,
    reference: 'REF-001',
    title: 'Luxury Villa in Marbella',
    image: '/placeholder-property.jpg',
    price: 1250000,
  },
  source: 'widget_inquiry',
  status: 'qualified',
  assignedTo: { id: 1, name: 'Sarah Agent' },
  score: 75,
  budgetMin: 1000000,
  budgetMax: 1500000,
  currency: 'EUR',
  preferredLocations: ['Marbella', 'Nueva Andalucia'],
  preferredTypes: ['Villa', 'Penthouse'],
  notes: 'Looking for a property with sea view and pool. Flexible on exact location within Marbella area.',
  nextFollowUp: '2026-04-08T10:00:00Z',
  createdAt: '2026-04-01T09:00:00Z',
  updatedAt: '2026-04-06T14:30:00Z',
};

const sampleActivities = [
  {
    id: 1,
    type: 'call',
    description: 'Discussed property requirements. Client interested in 4+ bedrooms with sea view.',
    user: 'Sarah Agent',
    metadata: { duration: 420 },
    createdAt: '2026-04-06T14:30:00Z',
  },
  {
    id: 2,
    type: 'email',
    description: 'Sent property brochure for REF-001 and two similar properties.',
    user: 'Sarah Agent',
    createdAt: '2026-04-05T11:00:00Z',
  },
  {
    id: 3,
    type: 'status_change',
    description: 'Status changed from "contacted" to "qualified"',
    user: 'Sarah Agent',
    createdAt: '2026-04-05T10:45:00Z',
  },
  {
    id: 4,
    type: 'viewing',
    description: 'Scheduled viewing for REF-001 on April 10th at 11:00',
    user: 'Sarah Agent',
    metadata: { propertyId: 1, date: '2026-04-10T11:00:00Z' },
    createdAt: '2026-04-04T16:00:00Z',
  },
  {
    id: 5,
    type: 'note',
    description: 'Client mentioned they are relocating from UK. Timeline is flexible but preferably within 6 months.',
    user: 'Sarah Agent',
    createdAt: '2026-04-03T09:00:00Z',
  },
  {
    id: 6,
    type: 'status_change',
    description: 'Status changed from "new" to "contacted"',
    user: 'Sarah Agent',
    createdAt: '2026-04-02T10:00:00Z',
  },
  {
    id: 7,
    type: 'note',
    description: 'Initial inquiry received via website widget.',
    user: 'System',
    createdAt: '2026-04-01T09:00:00Z',
  },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  new: { label: 'New', variant: 'default' },
  contacted: { label: 'Contacted', variant: 'secondary' },
  qualified: { label: 'Qualified', variant: 'warning' },
  viewing_scheduled: { label: 'Viewing Scheduled', variant: 'warning' },
  offer_made: { label: 'Offer Made', variant: 'warning' },
  won: { label: 'Won', variant: 'success' },
  lost: { label: 'Lost', variant: 'destructive' },
};

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  viewing: Home,
  offer: DollarSign,
  status_change: Clock,
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [activityType, setActivityType] = useState('note');
  const [activityDescription, setActivityDescription] = useState('');

  const lead = sampleLead;
  const activities = sampleActivities;

  const handleStatusChange = (newStatus: string) => {
    toast({
      title: 'Status updated',
      description: `Lead status changed to ${statusConfig[newStatus].label}`,
    });
  };

  const handleAddActivity = () => {
    if (!activityDescription.trim()) return;

    toast({
      title: 'Activity added',
      description: 'The activity has been logged.',
    });

    setActivityDescription('');
    setIsAddActivityOpen(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: lead.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/leads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {lead.contact.name}
              </h1>
              <Badge variant={statusConfig[lead.status].variant}>
                {statusConfig[lead.status].label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Lead #{params.id} &middot; Created {formatDate(lead.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Change Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.entries(statusConfig).map(([key, config]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => handleStatusChange(key)}
                >
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column - Contact & Property Info */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{lead.contact.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a
                  href={`mailto:${lead.contact.email}`}
                  className="font-medium text-primary hover:underline"
                >
                  {lead.contact.email}
                </a>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <a
                  href={`tel:${lead.contact.phone}`}
                  className="font-medium text-primary hover:underline"
                >
                  {lead.contact.phone}
                </a>
              </div>
              <div className="pt-2 flex gap-2">
                <Button size="sm" className="flex-1">
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lead Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Lead Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <svg className="h-20 w-20 -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-muted"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray={`${lead.score * 2.26} 226`}
                      className={
                        lead.score >= 70
                          ? 'text-primary'
                          : lead.score >= 40
                          ? 'text-primary/60'
                          : 'text-primary/30'
                      }
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                    {lead.score}
                  </span>
                </div>
                <div>
                  <p className="font-medium">
                    {lead.score >= 70
                      ? 'Hot Lead'
                      : lead.score >= 40
                      ? 'Warm Lead'
                      : 'Cold Lead'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Based on engagement
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Interest */}
          {lead.property && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Property Interest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                    <Home className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{lead.property.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.property.reference}
                    </p>
                    <p className="text-sm font-medium text-primary">
                      {formatCurrency(lead.property.price)}
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href={`/dashboard/properties/${lead.property.id}`}>
                    View Property
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Budget
                </p>
                <p className="font-medium">
                  {formatCurrency(lead.budgetMin)} - {formatCurrency(lead.budgetMax)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Locations
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {lead.preferredLocations.map((loc) => (
                    <Badge key={loc} variant="secondary">
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  Property Types
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {lead.preferredTypes.map((type) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="md:col-span-2 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileText className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Log Activity</DialogTitle>
                      <DialogDescription>
                        Record an interaction with this lead.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Activity Type</Label>
                        <Select value={activityType} onValueChange={setActivityType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="note">Note</SelectItem>
                            <SelectItem value="call">Call</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="viewing">Viewing</SelectItem>
                            <SelectItem value="offer">Offer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={activityDescription}
                          onChange={(e) => setActivityDescription(e.target.value)}
                          placeholder="Enter activity details..."
                          rows={4}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddActivityOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddActivity}>
                        <Send className="h-4 w-4 mr-2" />
                        Log Activity
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="outline">
                  <Phone className="h-4 w-4 mr-2" />
                  Log Call
                </Button>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                <Button variant="outline">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Viewing
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{lead.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Next Follow-up */}
          {lead.nextFollowUp && (
            <Card className="border-primary/20 bg-secondary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary/40 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Next Follow-up</p>
                    <p className="font-medium">{formatDate(lead.nextFollowUp)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="ml-auto">
                    Reschedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
              <CardDescription>
                History of interactions with this lead
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {activities.map((activity, index) => {
                  const Icon = activityIcons[activity.type] || FileText;

                  return (
                    <div key={activity.id} className="flex gap-4">
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        {index < activities.length - 1 && (
                          <div className="absolute top-10 left-1/2 h-full w-px -translate-x-1/2 bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium capitalize">{activity.type.replace('_', ' ')}</p>
                            <p className="text-sm text-muted-foreground">
                              {activity.user} &middot; {formatDate(activity.createdAt)}
                            </p>
                          </div>
                          {activity.metadata?.duration && (
                            <Badge variant="secondary">
                              {formatDuration(activity.metadata.duration)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-2">{activity.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
