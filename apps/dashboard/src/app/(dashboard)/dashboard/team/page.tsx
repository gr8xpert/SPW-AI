'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserPlus,
  MoreHorizontal,
  Shield,
  User,
  AlertCircle,
  KeyRound,
  Trash2,
  Edit,
  Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

interface TeamMember {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  permissions: string[] | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface TeamStats {
  currentUsers: number;
  maxUsers: number;
  admins: number;
  users: number;
}

const roleColors: Record<string, 'default' | 'secondary'> = {
  admin: 'default',
  user: 'secondary',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
}

export default function TeamPage() {
  const { toast } = useToast();
  const api = useApi();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '', role: 'user' });
  const [editForm, setEditForm] = useState({ name: '', role: 'user', isActive: true });
  const [newPassword, setNewPassword] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersRes, statsRes] = await Promise.all([
        api.get('/api/dashboard/team'),
        api.get('/api/dashboard/team/stats'),
      ]);
      const membersData = (membersRes as { data: TeamMember[] })?.data || membersRes;
      const statsData = (statsRes as { data: TeamStats })?.data || statsRes;
      if (Array.isArray(membersData)) setMembers(membersData);
      if (statsData && typeof statsData === 'object') setStats(statsData as TeamStats);
    } catch {
      // handled by useApi
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!api.isReady) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.isReady]);

  const handleInvite = async () => {
    setSaving(true);
    try {
      await api.post('/api/dashboard/team/invite', inviteForm);
      await loadData();
      setInviteOpen(false);
      setInviteForm({ email: '', name: '', password: '', role: 'user' });
      toast({ title: 'Invitation sent', description: 'Team member has been added.' });
    } catch (err: any) {
      toast({ title: 'Invite failed', description: err?.message || 'Could not invite user.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedMember) return;
    setSaving(true);
    try {
      await api.put(`/api/dashboard/team/${selectedMember.id}`, editForm);
      await loadData();
      setEditOpen(false);
      setSelectedMember(null);
      toast({ title: 'Member updated' });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedMember) return;
    setSaving(true);
    try {
      await api.post(`/api/dashboard/team/${selectedMember.id}/reset-password`, { password: newPassword });
      setResetPasswordOpen(false);
      setNewPassword('');
      setSelectedMember(null);
      toast({ title: 'Password reset', description: 'The password has been changed.' });
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMember) return;
    setSaving(true);
    try {
      await api.delete(`/api/dashboard/team/${selectedMember.id}`);
      await loadData();
      setDeleteConfirmOpen(false);
      setSelectedMember(null);
      toast({ title: 'Member removed' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (member: TeamMember) => {
    setSelectedMember(member);
    setEditForm({ name: member.name || '', role: member.role, isActive: member.isActive });
    setEditOpen(true);
  };

  const openResetPassword = (member: TeamMember) => {
    setSelectedMember(member);
    setNewPassword('');
    setResetPasswordOpen(true);
  };

  const openDeleteConfirm = (member: TeamMember) => {
    setSelectedMember(member);
    setDeleteConfirmOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-description mt-1">Manage your team members and their roles</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm"><UserPlus className="h-4 w-4 mr-2" /> Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>Add a new member to your team. They will be able to log in immediately.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email *</Label>
                <Input id="invite-email" type="email" placeholder="email@company.com" value={inviteForm.email} onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" placeholder="Full name" value={inviteForm.name} onChange={(e) => setInviteForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password">Password *</Label>
                <Input id="invite-password" type="password" placeholder="Minimum 8 characters" value={inviteForm.password} onChange={(e) => setInviteForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteForm.role} onValueChange={(v) => setInviteForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={saving || !inviteForm.email || !inviteForm.password}>
                {saving ? 'Inviting...' : 'Invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="stat-card-icon">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold tracking-tight">{stats.currentUsers} <span className="text-sm font-normal text-muted-foreground">/ {stats.maxUsers}</span></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="stat-card-icon">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Admins</p>
                  <p className="text-2xl font-bold tracking-tight">{stats.admins}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="stat-card-icon">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Users</p>
                  <p className="text-2xl font-bold tracking-tight">{stats.users}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="stat-card-icon">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Seats Available</p>
                  <p className="text-2xl font-bold tracking-tight">{stats.maxUsers - stats.currentUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>All members of your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No team members yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Last Login</th>
                    <th className="py-2 pr-3 font-medium">Joined</th>
                    <th className="py-2 w-[70px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{member.name || '-'}</td>
                      <td className="py-2 pr-3">{member.email}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={roleColors[member.role]} className="capitalize">
                          {member.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                          {member.role}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={member.isActive ? 'success' : 'destructive'}>
                          {member.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {formatDate(member.lastLoginAt)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(member)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openResetPassword(member)}>
                              <KeyRound className="h-4 w-4 mr-2" /> Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => openDeleteConfirm(member)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>{selectedMember?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.isActive ? 'active' : 'inactive'} onValueChange={(v) => setEditForm(p => ({ ...p, isActive: v === 'active' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for {selectedMember?.name || selectedMember?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" placeholder="Minimum 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={saving || newPassword.length < 8}>
              {saving ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{selectedMember?.name || selectedMember?.email}</span> from your team. They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
