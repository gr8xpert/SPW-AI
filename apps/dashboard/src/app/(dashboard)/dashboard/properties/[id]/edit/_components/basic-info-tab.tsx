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
import {
  displayName,
  type FormSectionProps,
  type LocationOption,
  type MultilingualChangeHandler,
  type PropertyTypeOption,
  type TeamMember,
} from './types';

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
  return (
    <TabsContent value="basic" className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Basic Info</CardTitle><CardDescription>Reference, listing type, status, and classification</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" value={formData.reference} onChange={(e) => onChange('reference', e.target.value)} readOnly={propertySource !== 'manual'} maxLength={50} className={propertySource !== 'manual' ? 'bg-muted' : ''} />
              {propertySource !== 'manual' && <p className="text-xs text-muted-foreground">Read-only (sourced externally)</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentReference">Agent Reference</Label>
              <Input id="agentReference" value={formData.agentReference} onChange={(e) => onChange('agentReference', e.target.value)} maxLength={100} placeholder="Agent ref" />
            </div>
            <div className="space-y-2">
              <Label>Listing Type</Label>
              <Select value={formData.listingType} onValueChange={(v) => onChange('listingType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">For Sale</SelectItem>
                  <SelectItem value="rent">For Rent</SelectItem>
                  <SelectItem value="holiday_rent">Holiday Rent</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => onChange('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="rented">Rented</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Property Type</Label>
              <Select value={formData.propertyTypeId} onValueChange={(v) => onChange('propertyTypeId', v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {propertyTypes.map((type) => (<SelectItem key={type.id} value={String(type.id)}>{displayName(type.name)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={formData.locationId} onValueChange={(v) => onChange('locationId', v)}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (<SelectItem key={loc.id} value={String(loc.id)}>{displayName(loc.name)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="urbanization">Urbanization</Label>
              <Input id="urbanization" value={formData.urbanization} onChange={(e) => onChange('urbanization', e.target.value)} placeholder="e.g., La Zagaleta" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Input id="project" value={formData.project} onChange={(e) => onChange('project', e.target.value)} placeholder="e.g., Beach Residences" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyTypeReference">Property Type Reference</Label>
              <Input id="propertyTypeReference" value={formData.propertyTypeReference} onChange={(e) => onChange('propertyTypeReference', e.target.value)} placeholder="External type code" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="priceOnRequest" checked={formData.priceOnRequest} onCheckedChange={(c) => onChange('priceOnRequest', !!c)} />
            <Label htmlFor="priceOnRequest">Price on Request</Label>
          </div>
          {!formData.priceOnRequest && (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="price">Price From</Label><Input id="price" type="number" placeholder="250000" value={formData.price} onChange={(e) => onChange('price', e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="priceTo">Price To <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="priceTo" type="number" placeholder="Leave empty for one price" value={formData.priceTo} onChange={(e) => onChange('priceTo', e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Price per</Label>
                <Select value={formData.rentalPeriod || 'none'} onValueChange={(v) => onChange('rentalPeriod', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{formData.listingType === 'rent' ? 'Month (default)' : 'Whole price'}</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
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
        <CardHeader><CardTitle>Agent / Assignment</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={formData.agentId || 'none'} onValueChange={(v) => onChange('agentId', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">&mdash; None &mdash;</SelectItem>
                  {teamMembers.map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sales Agent</Label>
              <Select value={formData.salesAgentId || 'none'} onValueChange={(v) => onChange('salesAgentId', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select sales agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">&mdash; None &mdash;</SelectItem>
                  {teamMembers.map((m) => (<SelectItem key={m.id} value={m.id.toString()}>{m.name || m.email}</SelectItem>))}
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
              <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> Content</CardTitle>
              <CardDescription>Title and description in multiple languages</CardDescription>
            </div>
            <LanguageSelect value={contentLang} onChange={onContentLangChange} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <MultilingualInput label="Title" lang={contentLang} value={formData.title} onChange={(lang, val) => onMultilingualChange('title', lang, val)} />
          <MultilingualTextarea label="Description" lang={contentLang} value={formData.description} onChange={(lang, val) => onMultilingualChange('description', lang, val)} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
