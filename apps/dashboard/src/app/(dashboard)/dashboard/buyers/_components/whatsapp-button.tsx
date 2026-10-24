'use client';

import { useState, type ComponentProps } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBuyerText } from '../_i18n/use-buyer-text';
import type { WhatsAppKind } from '../use-whatsapp';
import { WhatsAppDialog } from './whatsapp-dialog';

// A WhatsApp button with its dialog. Without a phone number on the contact
// it stays disabled and its tooltip says why.
export function WhatsAppButton({
  base,
  kind,
  propertyIds,
  viewingId,
  taskId,
  aiBuyerId,
  handledOption,
  hasPhone,
  disabled,
  iconOnly,
  size = 'sm',
  variant = 'outline',
  className,
  onDone,
  testId,
}: {
  base: string;
  kind: WhatsAppKind;
  propertyIds?: number[];
  viewingId?: number;
  taskId?: number;
  aiBuyerId?: number;
  handledOption?: boolean;
  hasPhone: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  size?: ComponentProps<typeof Button>['size'];
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
  onDone?: () => void;
  testId?: string;
}) {
  const t = useBuyerText().whatsapp;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        disabled={disabled || !hasPhone}
        title={hasPhone ? t.button : t.noPhone}
        aria-label={t.button}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <MessageCircle className={iconOnly ? 'h-4 w-4 text-[#25d366]' : 'mr-2 h-4 w-4 text-[#25d366]'} />
        {iconOnly ? null : t.button}
      </Button>
      {open ? (
        <WhatsAppDialog
          base={base}
          kind={kind}
          propertyIds={propertyIds}
          viewingId={viewingId}
          taskId={taskId}
          aiBuyerId={aiBuyerId}
          handledOption={handledOption}
          open={open}
          onOpenChange={setOpen}
          onDone={onDone}
        />
      ) : null}
    </>
  );
}

// Has a number WhatsApp could use (mobile first, as the dialog picks it).
export function hasPhoneNumber(p: { mobile?: string | null; phone?: string | null }): boolean {
  return [p.mobile, p.phone].some((n) => (n ?? '').replace(/\D/g, '').length >= 7);
}
