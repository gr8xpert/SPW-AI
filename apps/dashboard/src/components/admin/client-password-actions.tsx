'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { KeyRound, Mail, Check, Copy, Wand2, Users, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

export interface ClientUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

// Unambiguous characters only — this password gets read out over the phone or
// pasted into an email, so no 0/O or 1/l/I mix-ups.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generatePassword(length = 14): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

// Support tools for a client user who is locked out: email them the standard
// reset link, or set a password directly and hand it over.
function UserPasswordActions({ clientId, user }: { clientId: string; user: ClientUser }) {
  const api = useApi();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/api/super-admin/clients/${clientId}/users/${user.id}`;

  const sendResetLink = async () => {
    if (!window.confirm(`Email a password reset link to ${user.email}?`)) return;
    setSending(true);
    try {
      await api.post(`${base}/send-password-reset`);
      toast({
        title: 'Reset link sent',
        description: `${user.email} can now choose a new password. The link expires in 1 hour.`,
      });
    } catch (e: any) {
      toast({ title: 'Reset link not sent', description: e?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const openDialog = () => {
    setPassword(generatePassword());
    setSavedPassword(null);
    setCopied(false);
    setOpen(true);
  };

  const savePassword = async () => {
    if (password.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`${base}/password`, { newPassword: password });
      setSavedPassword(password);
    } catch (e: any) {
      toast({ title: 'Failed to set password', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!savedPassword) return;
    await navigator.clipboard.writeText(savedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={sendResetLink} disabled={sending}>
          <Mail className="h-4 w-4 mr-2" />
          {sending ? 'Sending…' : 'Send reset link'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <KeyRound className="h-4 w-4 mr-2" />
          Set password
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Set password for {user.email}</DialogTitle>
            <DialogDescription>
              Replaces their current password and signs them out of every device.
            </DialogDescription>
          </DialogHeader>

          {savedPassword ? (
            <div className="space-y-3 py-2">
              <p className="text-sm">Password updated. Share it with the user securely:</p>
              <div className="flex gap-2">
                <Input readOnly value={savedPassword} className="font-mono" />
                <Button type="button" variant="outline" size="icon" onClick={copy} title="Copy">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                It won&apos;t be shown again. Ask them to change it under Settings after signing in.
              </p>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <Label htmlFor={`user-${user.id}-password`}>New password</Label>
              <div className="flex gap-2">
                <Input
                  id={`user-${user.id}-password`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPassword(generatePassword())}
                  title="Generate another"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
          )}

          <DialogFooter>
            {savedPassword ? (
              <Button type="button" onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={savePassword} disabled={saving}>
                  {saving ? 'Saving…' : 'Set password'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Fix a user's name or login email after the client was created.
function EditUserButton({
  clientId,
  user,
  onSaved,
}: {
  clientId: string;
  user: ClientUser;
  onSaved: (users: ClientUser[]) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);

  const openDialog = () => {
    setName(user.name ?? '');
    setEmail(user.email);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/api/super-admin/clients/${clientId}/users/${user.id}`, {
        name,
        email: email.trim(),
      });
      const users = res?.data ?? res;
      if (Array.isArray(users)) onSaved(users);
      toast({
        title: 'User updated',
        description:
          email.trim().toLowerCase() !== user.email.toLowerCase()
            ? `They now sign in as ${email.trim().toLowerCase()} and were signed out of other devices.`
            : undefined,
      });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Could not update user', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Changing the email changes what they sign in with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor={`user-${user.id}-name`}>Name</Label>
              <Input id={`user-${user.id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`user-${user.id}-email`}>Login email</Label>
              <Input
                id={`user-${user.id}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || !email.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Every login on a client's account with password tools for each. Shown on
// both the client detail page and the Edit page, since support may land on
// either when a client says they are locked out.
export function ClientUsersCard({ clientId, users: initialUsers }: { clientId: string; users?: ClientUser[] }) {
  const [users, setUsers] = useState<ClientUser[] | undefined>(initialUsers);
  useEffect(() => setUsers(initialUsers), [initialUsers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="stat-card-icon"><Users className="h-5 w-5" /></div>
          Users &amp; Passwords
        </CardTitle>
        <CardDescription>
          Fix a name or login email, email a reset link, or set a password and send it to them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!users || users.length === 0 ? (
          <p className="text-sm text-muted-foreground">This client has no users.</p>
        ) : (
          <div className="divide-y">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium truncate">{user.email}</p>
                    <Badge variant="secondary" className="capitalize">{user.role.replace('_', ' ')}</Badge>
                    {!user.isActive && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {user.name || '—'} · Last login{' '}
                    {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'PPp') : 'never'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <EditUserButton clientId={clientId} user={user} onSaved={setUsers} />
                  <UserPasswordActions clientId={clientId} user={user} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
