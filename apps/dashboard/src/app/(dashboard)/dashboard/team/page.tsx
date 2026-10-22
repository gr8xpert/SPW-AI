'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Edit, Globe, KeyRound, MoreHorizontal, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { AgentDialog } from './_components/agent-dialog';
import { useTeamText } from './_i18n';
import { initialsOf, useAgents, useAgentStats, useRemoveAgent, useResetAgentPassword, type Agent } from '@/hooks/use-agents';

function AgentsPageInner() {
  const { toast } = useToast();
  const t = useTeamText();
  const { data: session } = useSession();
  const agents = useAgents();
  const stats = useAgentStats();
  const remove = useRemoveAgent();
  const reset = useResetAgentPassword();

  const [editing, setEditing] = useState<Agent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resetFor, setResetFor] = useState<Agent | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [removing, setRemoving] = useState<Agent | null>(null);

  const list = agents.data ?? [];
  const selfId = list.find((a) => a.email && a.email === session?.user?.email)?.id ?? null;
  const open = (a: Agent | null) => {
    setEditing(a);
    setFormOpen(true);
  };

  const doReset = async () => {
    if (!resetFor) return;
    try {
      await reset.mutateAsync({ id: resetFor.id, newPassword });
      toast({ title: t.passwordChanged });
      setResetFor(null);
    } catch (e) {
      toast({ title: t.passwordChangeFailed, description: (e as Error).message, variant: 'destructive' });
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast({ title: t.agentRemoved });
    } catch (e) {
      toast({ title: t.removeFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">
            {t.description}
          </p>
        </div>
        <Button className="shadow-sm" onClick={() => open(null)} data-testid="agent-add">
          <UserPlus className="mr-2 h-4 w-4" /> {t.addAgent}
        </Button>
      </div>

      {stats.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: 'logins', label: t.stats.logins, value: `${stats.data.currentUsers} / ${stats.data.maxUsers}`, icon: Users },
            { key: 'managers', label: t.stats.managers, value: stats.data.admins, icon: Shield },
            { key: 'onWebsite', label: t.stats.onWebsite, value: list.filter((a) => a.showOnWebsite && a.isActive).length, icon: Globe },
            { key: 'workWithBuyers', label: t.stats.workWithBuyers, value: list.filter((a) => a.worksBuyers && a.isActive).length, icon: UserPlus },
          ].map((s) => (
            <Card key={s.key}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="stat-card-icon"><s.icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold tracking-tight">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {agents.isLoading ? (
            <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">{t.empty}</p>
          ) : (
            <ul className="divide-y" data-testid="agent-list">
              {list.map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-4" data-testid={`agent-row-${a.id}`}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {a.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(a.name || a.email)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{a.name || a.email}</span>
                      {a.title && <span className="text-sm text-muted-foreground">{a.title}</span>}
                      {!a.isActive && <Badge variant="destructive">{t.inactive}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant={a.access === 'manager' ? 'default' : 'secondary'}>
                        {a.access === 'manager' && <Shield className="mr-1 h-3 w-3" />}
                        {t.access[a.access]}
                      </Badge>
                      {a.worksBuyers && <Badge variant="outline">{t.buyersBadge}</Badge>}
                      {a.showOnWebsite && <Badge variant="outline"><Globe className="mr-1 h-3 w-3" />{t.websiteBadge}</Badge>}
                      {a.email && <span className="truncate text-xs text-muted-foreground">{a.email}</span>}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t.actions}><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => open(a)}><Edit className="mr-2 h-4 w-4" /> {t.edit}</DropdownMenuItem>
                      {a.canLogin && (
                        <DropdownMenuItem onClick={() => { setNewPassword(''); setResetFor(a); }}>
                          <KeyRound className="mr-2 h-4 w-4" /> {t.changePassword}
                        </DropdownMenuItem>
                      )}
                      {a.id !== selfId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setRemoving(a)}>
                            <Trash2 className="mr-2 h-4 w-4" /> {t.remove}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AgentDialog open={formOpen} onOpenChange={setFormOpen} agent={editing} selfId={selfId} />

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.changePassword}</DialogTitle>
            <DialogDescription>{t.newPasswordFor(resetFor?.name || resetFor?.email || '')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-password">{t.newPassword}</Label>
            <Input id="new-password" type="password" placeholder={t.passwordPlaceholder} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>{t.cancel}</Button>
            <Button onClick={doReset} disabled={reset.isPending || newPassword.length < 8}>{reset.isPending ? t.saving : t.changePassword}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.removeTitle(removing?.name || removing?.email || '')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.removeText}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={doRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t.remove}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AgentsPage() {
  const t = useTeamText();
  return (
    <LockedRouteGuard addon="team" featureName={t.title}>
      <AgentsPageInner />
    </LockedRouteGuard>
  );
}
