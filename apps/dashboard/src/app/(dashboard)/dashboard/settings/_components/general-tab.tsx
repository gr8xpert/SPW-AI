'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Languages, X, FileText } from 'lucide-react';
import { apiPut } from '@/lib/api';
import { SLUG_FORMAT_OPTIONS, ALL_LANGUAGES, SlugFormat } from './types';
import { useToast } from '@/hooks/use-toast';
import type { GeneralSettings } from './use-general-settings';

export function GeneralTab({ general }: { general: GeneralSettings }) {
  const { toast } = useToast();
  const {
    generalForm,
    savingGeneral,
    slugFormat,
    setSlugFormat,
    enabledLanguages,
    setEnabledLanguages,
    savingLangs,
    setSavingLangs,
    brochureContactEmail,
    setBrochureContactEmail,
    brochureContactPhone,
    setBrochureContactPhone,
    brochureLogoUrl,
    setBrochureLogoUrl,
    defaultBrochureVariant,
    setDefaultBrochureVariant,
    savingBrochure,
    onGeneralSubmit,
    onSaveBrochure,
  } = general;

  return (
    <TabsContent value="general">
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Configure your company information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={generalForm.handleSubmit(onGeneralSubmit)}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  {...generalForm.register('companyName')}
                />
                {generalForm.formState.errors.companyName && (
                  <p className="text-sm text-destructive">
                    {generalForm.formState.errors.companyName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Website Domain</Label>
                <Input
                  id="domain"
                  placeholder="yourdomain.com"
                  {...generalForm.register('domain')}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultLanguage">Default Language</Label>
                <select
                  id="defaultLanguage"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...generalForm.register('defaultLanguage')}
                >
                  {enabledLanguages.map(code => (
                    <option key={code} value={code}>{ALL_LANGUAGES[code] || code.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Property Slug Format</Label>
                <Select value={slugFormat} onValueChange={(v) => setSlugFormat(v as SlugFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SLUG_FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default URL format for property detail pages. Individual properties can override this with a custom slug.
                </p>
                {SLUG_FORMAT_OPTIONS.find((o) => o.value === slugFormat) && (
                  <p className="text-xs text-muted-foreground">
                    Example: <code className="bg-muted rounded px-1">{SLUG_FORMAT_OPTIONS.find((o) => o.value === slugFormat)!.example}</code>
                  </p>
                )}
              </div>
            </div>
            <Button type="submit" disabled={savingGeneral}>
              {savingGeneral ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Languages
          </CardTitle>
          <CardDescription>
            Languages enabled here apply across property types, features, labels, and property translations.
            English is always enabled as the base language.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {enabledLanguages.map(code => (
              <span key={code} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium">
                {ALL_LANGUAGES[code] || code.toUpperCase()}
                {code !== 'en' && (
                  <button
                    type="button"
                    className="ml-1 rounded-sm hover:bg-muted p-0.5"
                    disabled={savingLangs}
                    onClick={async () => {
                      const updated = enabledLanguages.filter(l => l !== code);
                      setEnabledLanguages(updated);
                      setSavingLangs(true);
                      try {
                        await apiPut('/api/dashboard/tenant/settings', { languages: updated });
                        toast({ title: `Removed ${ALL_LANGUAGES[code] || code}` });
                      } catch {
                        setEnabledLanguages(enabledLanguages);
                        toast({ title: 'Failed to remove language', variant: 'destructive' });
                      } finally {
                        setSavingLangs(false);
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {Object.keys(ALL_LANGUAGES).filter(c => !enabledLanguages.includes(c)).length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                onValueChange={async (code) => {
                  if (!code || enabledLanguages.includes(code)) return;
                  const updated = [...enabledLanguages, code];
                  setEnabledLanguages(updated);
                  setSavingLangs(true);
                  try {
                    await apiPut('/api/dashboard/tenant/settings', { languages: updated });
                    toast({ title: `Added ${ALL_LANGUAGES[code] || code}` });
                  } catch {
                    setEnabledLanguages(enabledLanguages);
                    toast({ title: 'Failed to add language', variant: 'destructive' });
                  } finally {
                    setSavingLangs(false);
                  }
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Add a language..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ALL_LANGUAGES)
                    .filter(([code]) => !enabledLanguages.includes(code))
                    .map(([code, name]) => (
                      <SelectItem key={code} value={code}>{name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {savingLangs && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Brochure / PDF
          </CardTitle>
          <CardDescription>
            Contact details shown in the branded property brochure header/footer, plus the default brochure layout for new properties.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brochureLogoUrl">Logo URL</Label>
            <Input
              id="brochureLogoUrl"
              placeholder="https://yourdomain.com/logo.png"
              value={brochureLogoUrl}
              onChange={(e) => setBrochureLogoUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Public URL of your logo (PNG/JPG/SVG). Shown in the branded PDF header. Upload your logo to your website or any image host first, then paste the URL here.
            </p>
            {brochureLogoUrl && (
              <div className="mt-2 rounded border bg-muted p-2 inline-block">
                <img src={brochureLogoUrl} alt="Logo preview" className="h-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brochureContactEmail">Contact Email</Label>
              <Input
                id="brochureContactEmail"
                type="email"
                placeholder="info@yourdomain.com"
                value={brochureContactEmail}
                onChange={(e) => setBrochureContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brochureContactPhone">Contact Phone</Label>
              <Input
                id="brochureContactPhone"
                placeholder="+34 600 000 000"
                value={brochureContactPhone}
                onChange={(e) => setBrochureContactPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Brochure Variant</Label>
            <p className="text-xs text-muted-foreground">
              Used when a property brochure variant is set to <em>Inherit</em>. Individual properties can override this.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDefaultBrochureVariant('branded')}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${defaultBrochureVariant === 'branded' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
              >
                Branded
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  Logo, QR code, contact in header/footer
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDefaultBrochureVariant('unbranded')}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${defaultBrochureVariant === 'unbranded' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
              >
                Unbranded
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  Blank header, page numbers only in footer
                </p>
              </button>
            </div>
          </div>
          <Button onClick={onSaveBrochure} disabled={savingBrochure}>
            {savingBrochure ? 'Saving...' : 'Save Brochure Settings'}
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
