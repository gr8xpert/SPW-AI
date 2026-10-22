'use client';

import { Check, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/i18n-provider';
import { useCommonText } from '@/i18n/common';
import { DASHBOARD_LANGUAGES, LANGUAGE_INFO } from '@/i18n/languages';

// Top bar, next to the credit hours: the language this user sees the
// dashboard in. Saved on the user, so it follows them to the next login.
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const t = useCommonText();
  const { toast } = useToast();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs font-medium uppercase text-muted-foreground hover:text-foreground" title={t.language} data-testid="language-switcher">
          <Globe className="h-4 w-4" />
          {language}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t.language}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DASHBOARD_LANGUAGES.map((code) => (
          <DropdownMenuItem
            key={code}
            data-testid={`language-${code}`}
            onClick={() => {
              if (code === language) return;
              setLanguage(code).catch(() => toast({ title: t.languageFailed, variant: 'destructive' }));
            }}
          >
            <span className="flex-1">{LANGUAGE_INFO[code].name}</span>
            {code === language && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
