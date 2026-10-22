'use client';

import { Languages } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { LanguageSelect, MultilingualInput, MultilingualTextarea } from './multilingual-fields';
import { agentChoices } from '@/hooks/use-agents';
import {
  displayName,
  type FormSectionProps,
  type LocationOption,
  type MultilingualChangeHandler,
  type PropertyTypeOption,
  type TeamMember,
} from './types';
import { usePropertiesText } from '../../../_i18n';

export function BasicInfoTab({
  formData,
  onChange,
  onMultilingualChange,
  propertySource,
  propertyTypes,
  locations,
  teamMembers,
  contentLang,
  onContentLangChange,
}: FormSectionProps & {
  onMultilingualChange: MultilingualChangeHandler;
  propertySource: string;
  propertyTypes: PropertyTypeOption[];
  locations: LocationOption[];
  teamMembers: TeamMember[];
  contentLang: string;
  onContentLangChange: (lang: string) => void;
}) {
  const t = usePropertiesText();
  return (
    <TabsContent value="basic" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t.tabs.basic}</CardTitle><CardDescription>{t.edit.basicDescription}</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reference">{t.fields.reference}</Label>
              <Input id="reference" value={formData.reference} onChange={(e) => onChange('reference', e.target.value)} readOnly={propertySource !== 'manual'} maxLength={50} className={propertySource !== 'manual' ? 'bg-muted' : ''} />
              {propertySource !== 'manual' && <p className="text-xs text-muted-foreground">{t.edit.readOnlySourced}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentReference">{t.fields.agentReference}</Label>
              <Input id="agentReference" value={formData.agentReference} onChange={(e) => onChange('agentReference', e.target.value)} maxLength={100} placeholder={t.edit.agentRefPlaceholder} />
            </div>
            <div className="space-y-2">
              <Label>{t.fields.listingType}</Label>
              <Select value={formData.listingType} onValueChange={(v) => onChange('listingType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">{t.listingType.sale}</SelectItem>
                  <SelectItem value="rent">{t.listingType.rent}</SelectItem>
                  <SelectItem value="holiday_rent">{t.listingType.holiday_rent}</SelectItem>
                  <SelectItem value="development">{t.listingType.development}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.fields.status}</Label>
              <Select value={formData.status} onValueChange={(v) => onChange('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t.status.draft}</SelectItem>
                  <SelectItem value="active">{t.status.active}</SelectItem>
                  <SelectItem value="sold">{t.status.sold}</SelectItem>
                  <SelectItem value="rented">{t.status.rented}</SelectItem>
                  <SelectItem value="archived">{t.status.archived}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.fields.propertyType}</Label>
              <Select value={formData.propertyTypeId} onValueChange={(v) => onChange('propertyTypeId', v)}>
                <SelectTrigger><SelectValue placeholder={t.form.selectType} /></SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (<SelectItem key={type.id} value={String(type.id)}>{displayName(type.name)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.fields.location}</Label>
              <Select value={formData.locationId} onValueChange={(v) => onChange('locationId', v)}>
                <SelectTrigger><SelectValue placeholder={t.form.selectLocation} /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (<SelectItem key={loc.id} value={String(loc.id)}>{displayName(loc.name)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="urbanization">{t.fields.urbanization}</Label>
              <Input id="urbanization" value={formData.urbanization} onChange={(e) => onChange('urbanization', e.target.value)} placeholder={t.common.eg('La Zagaleta')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">{t.fields.project}</Label>
              <Input id="project" value={formData.project} onChange={(e) => onChange('project', e.target.value)} placeholder={t.common.eg('Beach Residences')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyTypeReference">{t.fields.propertyTypeReference}</Label>
              <Input id="propertyTypeReference" value={formData.propertyTypeReference} onChange={(e) => onChange('propertyTypeReference', e.target.value)} placeholder={t.form.externalTypeCode} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.form.pricing}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="priceOnRequest" checked={formData.priceOnRequest} onCheckedChange={(c) => onChange('priceOnRequest', !!c)} />
            <Label htmlFor="priceOnRequest">{t.fields.priceOnRequest}</Label>
          </div>
          {!formData.priceOnRequest && (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="price">{t.fields.priceFrom}</Label><Input id="price" type="number" placeholder="250000" value={formData.price} onChange={(e) => onChange('price', e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="priceTo">{t.fields.priceTo} <span className="font-normal text-muted-foreground">{t.common.optional}</span></Label><Input id="priceTo" type="number" placeholder={t.form.priceToPlaceholder} value={formData.priceTo} onChange={(e) => onChange('priceTo', e.target.value)} /></div>
              <div className="space-y-2">
                <Label>{t.fields.pricePer}</Label>
                <Select value={formData.rentalPeriod || 'none'} onValueChange={(v) => onChange('rentalPeriod', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{formData.listingType === 'rent' ? t.pricePer.monthDefault : t.pricePer.whole}</SelectItem>
                    <SelectItem value="night">{t.pricePer.night}</SelectItem>
                    <SelectItem value="week">{t.pricePer.week}</SelectItem>
                    <SelectItem value="month">{t.pricePer.month}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.fields.currency}</Label>
                <Select value={formData.currency} onValueChange={(v) => onChange('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.form.agentAssignment}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.fields.agent}</Label>
              <Select value={formData.agentId || 'none'} onValueChange={(v) => onChange('agentId', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={t.form.selectAgent} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.common.none}</SelectItem>
                  {agentChoices(teamMembers, 'website', formData.agentId).map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t.form.agentHint}</p>
            </div>
            <div className="space-y-2">
              <Label>{t.fields.salesAgent}</Label>
              <Select value={formData.salesAgentId || 'none'} onValueChange={(v) => onChange('salesAgentId', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={t.form.selectSalesAgent} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.common.none}</SelectItem>
                  {agentChoices(teamMembers, 'sales', formData.salesAgentId).map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description with language dropdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> {t.form.content}</CardTitle>
              <CardDescription>{t.form.contentDescription}</CardDescription>
            </div>
            <LanguageSelect value={contentLang} onChange={onContentLangChange} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <MultilingualInput label={t.fields.title} lang={contentLang} value={formData.title} onChange={(lang, val) => onMultilingualChange('title', lang, val)} />
          <MultilingualTextarea label={t.fields.description} lang={contentLang} value={formData.description} onChange={(lang, val) => onMultilingualChange('description', lang, val)} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
