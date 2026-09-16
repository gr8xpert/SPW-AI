'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export interface DeletableClient {
  id: number;
  name: string;
  slug: string;
}

// Permanent delete. The operator must type the client's slug — the same guard
// the API enforces — because this removes every property, user, feed, lead and
// ticket the client has, and there is no undo.
export function DeleteClientDialog({
  client,
  open,
  onOpenChange,
  onDeleted,
}: {
  client: DeletableClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setTyped('');
  }, [open, client?.id]);

  if (!client) return null;
  const matches = typed.trim() === client.slug;

  const confirmDelete = async () => {
    if (!matches) return;
    setDeleting(true);
    try {
      const res = await api.post(`/api/super-admin/clients/${client.id}/delete-permanently`, {
        confirmSlug: typed.trim(),
      });
      const r = res?.data ?? res;
      toast({
        title: `${client.name} deleted`,
        description:
          r && typeof r.properties === 'number'
            ? `Removed ${r.properties} properties and ${r.users} user(s). Its email and slug can be used again.`
            : 'The client and all of its data were removed.',
      });
      onOpenChange(false);
      onDeleted();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete {client.name} permanently
          </DialogTitle>
          <DialogDescription>
            This removes the client and <strong>all</strong> of its data: properties, users,
            feeds, leads, contacts, tickets, labels, locations and uploaded images. It cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-client-slug">
            Type <span className="font-mono font-semibold">{client.slug}</span> to confirm
          </Label>
          <Input
            id="confirm-client-slug"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmDelete();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Just want to block access? Use <strong>Deactivate</strong> instead — it keeps the data.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={confirmDelete} disabled={!matches || deleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
