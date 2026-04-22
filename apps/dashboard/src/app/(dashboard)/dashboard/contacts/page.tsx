'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  MoreHorizontal,
  Mail,
  Phone,
  Upload,
  UserMinus,
  Trash2,
  Edit,
  Loader2,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

interface Contact {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  source: string;
  subscribed: boolean;
  tags: string[];
  createdAt: string;
}

const sourceLabels: Record<string, string> = {
  inquiry: 'Property Inquiry',
  newsletter: 'Newsletter',
  import: 'CSV Import',
  manual: 'Manual',
  api: 'API',
};

const emptyForm = { name: '', email: '', phone: '', source: 'manual' as string, tags: '' };

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);

  const api = useApi();
  const { toast } = useToast();

  const fetchContacts = async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get(`/api/dashboard/contacts?${params}`);
      const body = res?.data || res;
      setContacts(body.data || []);
      setTotal(body.total || 0);
      setTotalPages(body.meta?.pages || Math.ceil((body.total || 0) / 20) || 1);
    } catch {
      toast({ title: 'Failed to load contacts', variant: 'destructive' });
    }
  };

  useEffect(() => { fetchContacts(); }, [page, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    try {
      await api.post('/api/dashboard/contacts', {
        email: form.email,
        name: form.name || undefined,
        phone: form.phone || undefined,
        source: form.source,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        subscribed: true,
      });
      toast({ title: 'Contact created' });
      setIsAddOpen(false);
      setForm(emptyForm);
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!editingContact) return;
    try {
      await api.put(`/api/dashboard/contacts/${editingContact.id}`, {
        email: form.email,
        name: form.name || undefined,
        phone: form.phone || undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      });
      toast({ title: 'Contact updated' });
      setIsEditOpen(false);
      setEditingContact(null);
      setForm(emptyForm);
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Failed to update', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    try {
      await api.delete(`/api/dashboard/contacts/${deletingContact.id}`);
      toast({ title: 'Contact deleted' });
      setIsDeleteOpen(false);
      setDeletingContact(null);
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
    }
  };

  const handleUnsubscribe = async (contact: Contact) => {
    try {
      await api.post(`/api/dashboard/contacts/${contact.id}/unsubscribe`);
      toast({ title: `${contact.name || contact.email} unsubscribed` });
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Failed to unsubscribe', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (contact: Contact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name || '',
      email: contact.email,
      phone: contact.phone || '',
      source: contact.source,
      tags: contact.tags?.join(', ') || '',
    });
    setIsEditOpen(true);
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">Manage your contact list for email campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subscribed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {contacts.filter((c) => c.subscribed).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unsubscribed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {contacts.filter((c) => !c.subscribed).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-10"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {api.isLoading && contacts.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No contacts found</p>
              <Button className="mt-4" onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first contact
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                      <TableCell>{contact.email}</TableCell>
                      <TableCell>{contact.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{sourceLabels[contact.source] || contact.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {contact.tags?.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                          {contact.tags?.length > 3 && (
                            <Badge variant="secondary" className="text-xs">+{contact.tags.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={contact.subscribed ? 'success' : 'destructive'}>
                          {contact.subscribed ? 'Subscribed' : 'Unsubscribed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(contact.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(contact)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {contact.subscribed && (
                              <DropdownMenuItem onClick={() => handleUnsubscribe(contact)}>
                                <UserMinus className="h-4 w-4 mr-2" />
                                Unsubscribe
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingContact(contact); setIsDeleteOpen(true); }}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Add a new contact to your list</DialogDescription>
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
              <Label>Tags (comma separated)</Label>
              <Input placeholder="buyer, premium" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
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

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingContact(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update contact details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!form.email || api.isLoading}>
              {api.isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingContact?.name || deletingContact?.email}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
