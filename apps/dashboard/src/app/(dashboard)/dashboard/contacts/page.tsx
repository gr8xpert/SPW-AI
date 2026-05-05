'use client';

import { useState, useEffect, useRef } from 'react';
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
  Download,
  FileUp,
  UserMinus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = useApi();
  const { toast } = useToast();

  const fetchContacts = async () => {
    if (!api.isReady) return;
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

  useEffect(() => { fetchContacts(); }, [page, search, api.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const parseCsv = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
          else if (ch === '"') { inQuotes = false; }
          else { current += ch; }
        } else {
          if (ch === '"') { inQuotes = true; }
          else if (ch === ',' || ch === ';') { result.push(current.trim()); current = ''; }
          else { current += ch; }
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const values = parseRow(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ''; });
      return obj;
    });
    return { headers, rows };
  };

  const FIELD_OPTIONS = [
    { value: '', label: '-- Skip --' },
    { value: 'email', label: 'Email' },
    { value: 'name', label: 'Name' },
    { value: 'phone', label: 'Phone' },
    { value: 'tags', label: 'Tags' },
  ];

  const autoMapColumns = (headers: string[]) => {
    const map: Record<string, string> = {};
    for (const h of headers) {
      const lower = h.toLowerCase().trim();
      if (lower.includes('email') || lower.includes('e-mail')) map[h] = 'email';
      else if (lower.includes('name') || lower.includes('nombre')) map[h] = 'name';
      else if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile')) map[h] = 'phone';
      else if (lower.includes('tag')) map[h] = 'tags';
      else map[h] = '';
    }
    return map;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        toast({ title: 'Invalid CSV file', description: 'No headers found', variant: 'destructive' });
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setColumnMap(autoMapColumns(headers));
      setImportResult(null);
      setIsImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!columnMap.email && !Object.values(columnMap).includes('email')) {
      toast({ title: 'Email column is required', description: 'Map at least one column to Email', variant: 'destructive' });
      return;
    }
    const emailCol = Object.entries(columnMap).find(([, v]) => v === 'email')?.[0];
    if (!emailCol) {
      toast({ title: 'Email column is required', variant: 'destructive' });
      return;
    }

    setImporting(true);
    const contacts = csvRows
      .filter((row) => row[emailCol]?.includes('@'))
      .map((row) => {
        const contact: Record<string, any> = { email: row[emailCol], source: 'import' };
        for (const [csvCol, field] of Object.entries(columnMap)) {
          if (!field || field === 'email') continue;
          const val = row[csvCol];
          if (!val) continue;
          if (field === 'tags') {
            contact.tags = val.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean);
          } else {
            contact[field] = val;
          }
        }
        return contact;
      });

    if (contacts.length === 0) {
      toast({ title: 'No valid rows', description: 'No rows with valid email addresses found', variant: 'destructive' });
      setImporting(false);
      return;
    }

    try {
      const res = await api.post('/api/dashboard/contacts/import', { contacts });
      const body = res?.data || res;
      setImportResult(body);
      toast({ title: `Import complete: ${body.created} created, ${body.updated} updated` });
      fetchContacts();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.getRaw('/api/dashboard/contacts/export');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Contacts exported' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-description mt-1">Manage your contact list for email campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button className="shadow-sm" onClick={() => { setForm(emptyForm); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Contacts</CardTitle>
            <div className="stat-card-icon">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{total}</div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Subscribed</CardTitle>
            <div className="stat-card-icon">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {contacts.filter((c) => c.subscribed).length}
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unsubscribed</CardTitle>
            <div className="stat-card-icon">
              <UserMinus className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
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
              <Input type="email" placeholder="email@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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

      {/* Hidden file input for CSV import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,.txt"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Import CSV Dialog */}
      <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) { setCsvRows([]); setCsvHeaders([]); setColumnMap({}); setImportResult(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Contacts from CSV</DialogTitle>
            <DialogDescription>
              Map your CSV columns to contact fields. Only rows with a valid email will be imported.
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{importResult.created}</div>
                    <p className="text-sm text-muted-foreground">Contacts created</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{importResult.updated}</div>
                    <p className="text-sm text-muted-foreground">Contacts updated</p>
                  </CardContent>
                </Card>
              </div>
              {importResult.errors?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{importResult.errors.length} errors</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded border p-2 text-sm text-muted-foreground">
                    {importResult.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setIsImportOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileUp className="h-4 w-4" />
                <span>{csvRows.length} rows found in file</span>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Column Mapping</Label>
                <div className="rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CSV Column</TableHead>
                        <TableHead>Maps To</TableHead>
                        <TableHead>Preview</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvHeaders.map((header) => (
                        <TableRow key={header}>
                          <TableCell className="font-mono text-sm">{header}</TableCell>
                          <TableCell>
                            <select
                              className="w-full rounded border bg-background px-2 py-1 text-sm"
                              value={columnMap[header] || ''}
                              onChange={(e) => setColumnMap({ ...columnMap, [header]: e.target.value })}
                            >
                              {FIELD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {csvRows[0]?.[header] || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {csvRows.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Preview (first 3 rows)</Label>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvHeaders.filter((h) => columnMap[h]).map((h) => (
                            <TableHead key={h}>{columnMap[h]}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvRows.slice(0, 3).map((row, i) => (
                          <TableRow key={i}>
                            {csvHeaders.filter((h) => columnMap[h]).map((h) => (
                              <TableCell key={h} className="text-sm">{row[h] || '-'}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                <Button onClick={handleImport} disabled={importing || !Object.values(columnMap).includes('email')}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import {csvRows.filter((r) => {
                    const emailCol = Object.entries(columnMap).find(([, v]) => v === 'email')?.[0];
                    return emailCol && r[emailCol]?.includes('@');
                  }).length} Contacts
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
