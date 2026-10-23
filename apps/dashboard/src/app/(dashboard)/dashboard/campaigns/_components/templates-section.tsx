'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useCampaignsText } from '../_i18n';

export interface Template {
  id: number;
  name: string;
  subject: string;
  bodyHtml: string;
  type: string;
}

// The email templates card. New and edit open the full-page template editor;
// a new template can also be started from the page header (createOpen).
export function TemplatesSection({
  templates,
  onChanged,
  createOpen,
  setCreateOpen,
}: {
  templates: Template[];
  onChanged: (createdId?: number) => void;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const t = useCampaignsText();
  const router = useRouter();
  const [deleting, setDeleting] = useState<Template | null>(null);

  useEffect(() => {
    if (createOpen) { setCreateOpen(false); router.push('/dashboard/campaigns/templates/new'); }
  }, [createOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/dashboard/email-templates/${deleting.id}`);
      toast({ title: t.list.toasts.templateDeleted });
      onChanged();
    } catch (e) {
      toast({ title: t.list.toasts.templateDeleteFailed, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.list.templatesTitle}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/campaigns/templates/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t.list.newTemplate}
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-center py-6 text-sm text-muted-foreground">{t.list.noTemplates}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.common.name}</TableHead>
                  <TableHead>{t.common.subject}</TableHead>
                  <TableHead>{t.list.type}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[300px]">{tpl.subject}</TableCell>
                    <TableCell><Badge variant="outline">{t.list.templateTypes[tpl.type || 'custom'] || tpl.type || 'custom'}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={t.common.edit} onClick={() => router.push(`/dashboard/campaigns/templates/${tpl.id}`)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={t.common.delete} onClick={() => setDeleting(tpl)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.list.deleteTemplateDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.list.deleteTemplateDialog.text(deleting?.name ?? '')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
