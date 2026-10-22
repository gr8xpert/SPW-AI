'use client';

import { useState } from 'react';
import { CalendarPlus, Check, FileDown, Loader2, Mail, MapPin, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerAgents, type Buyer } from '../../use-buyers';
import { nameOf, useBuyerSuggestions } from '../../use-buyer-match';
import {
  VIEWING_STATUSES,
  useBuyerTrips,
  useCreateTrip,
  useCreateViewing,
  useDeleteTrip,
  useDeleteViewing,
  useItineraryPdf,
  useSendItinerary,
  useUpdateViewing,
  type Trip,
  type Viewing,
  type ViewingStatus,
} from '../../use-buyer-viewings';
import { FilterSelect } from '../../_components/filter-select';

const STATUS_CLASS: Record<ViewingStatus, string> = {
  planned: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-muted text-muted-foreground',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

function fmtDay(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// ISO → the value a datetime-local input wants (local time).
function toLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// The buyer's trips (visiting periods) and their viewings.
export function TripsTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText().trips;
  const { toast } = useToast();
  const data = useBuyerTrips(buyer.id);
  const create = useCreateTrip(buyer.id);
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');

  const addTrip = async () => {
    if (!from || !to) return;
    if (to < from) {
      toast({ title: t.invalidRange, variant: 'destructive' });
      return;
    }
    try {
      await create.mutateAsync({ startDate: from, endDate: to, notes: notes.trim() || null });
      setAdding(false);
      setFrom('');
      setTo('');
      setNotes('');
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4" data-testid="trips-tab">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">{t.title}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </div>
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)} data-testid="trip-add">
              <CalendarPlus className="mr-2 h-4 w-4" />
              {t.addTrip}
            </Button>
          ) : null}
        </CardHeader>
        {adding ? (
          <CardContent className="grid gap-3 border-t pt-4 sm:grid-cols-[160px_160px_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="trip-from" className="text-xs">{t.from}</Label>
              <Input id="trip-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trip-to" className="text-xs">{t.to}</Label>
              <Input id="trip-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trip-notes" className="text-xs">{t.notes}</Label>
              <Input id="trip-notes" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={addTrip} disabled={!from || !to || create.isPending} data-testid="trip-save">
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t.save}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{t.cancel}</Button>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {data.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {!data.data?.trips.length && !adding ? <p className="text-sm text-muted-foreground">{t.noTrips}</p> : null}
          {data.data?.trips.map((trip) => <TripCard key={trip.id} buyer={buyer} trip={trip} />)}
          {data.data?.loose.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t.loose}</CardTitle></CardHeader>
              <CardContent className="divide-y p-0">
                {data.data.loose.map((v) => <ViewingRow key={v.id} v={v} />)}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function TripCard({ buyer, trip }: { buyer: Buyer; trip: Trip }) {
  const t = useBuyerText().trips;
  const { toast } = useToast();
  const remove = useDeleteTrip();
  const pdf = useItineraryPdf();
  const send = useSendItinerary();
  const [adding, setAdding] = useState(false);
  const lang = buyer.language?.slice(0, 2) || undefined;

  return (
    <Card data-trip={trip.id}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-sm">{fmtDay(trip.startDate)} – {fmtDay(trip.endDate)}</CardTitle>
          {trip.notes ? <CardDescription className="mt-0.5">{trip.notes}</CardDescription> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)} data-testid="viewing-add">
            <Plus className="mr-1 h-4 w-4" />
            {t.addViewing}
          </Button>
          <Button size="sm" variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate({ tripId: trip.id, lang }, { onError: (e) => toast({ title: t.failed, description: e.message, variant: 'destructive' }) })} data-testid="itinerary-pdf">
            {pdf.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}
            {t.pdf}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={send.isPending || !trip.viewings.length}
            onClick={async () => {
              try {
                const res = await send.mutateAsync({ tripId: trip.id, lang });
                toast({ title: t.emailed(res.to) });
              } catch (e) {
                toast({ title: t.failed, description: (e as Error).message, variant: 'destructive' });
              }
            }}
            data-testid="itinerary-email"
          >
            {send.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
            {t.email}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            aria-label={t.deleteTrip}
            onClick={() => window.confirm(t.confirmDeleteTrip) && remove.mutate(trip.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {adding ? <ViewingForm buyer={buyer} tripId={trip.id} onDone={() => setAdding(false)} defaultDay={trip.startDate} /> : null}
        {trip.viewings.length ? (
          <div className="divide-y border-t">{trip.viewings.map((v) => <ViewingRow key={v.id} v={v} />)}</div>
        ) : !adding ? (
          <p className="border-t px-6 py-4 text-sm text-muted-foreground">{t.noViewings}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ViewingForm({ buyer, tripId, onDone, defaultDay }: { buyer: Buyer; tripId: number; onDone: () => void; defaultDay: string }) {
  const t = useBuyerText().trips;
  const { toast } = useToast();
  const create = useCreateViewing(buyer.id);
  const suggestions = useBuyerSuggestions(buyer.id);
  const agents = useBuyerAgents();
  const [property, setProperty] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(`${defaultDay.slice(0, 10)}T10:00`);
  const [minutes, setMinutes] = useState('60');
  const [agent, setAgent] = useState(buyer.assignedTo ? String(buyer.assignedTo) : '');
  const [meeting, setMeeting] = useState('');
  const other = property === 'other';

  const save = async () => {
    if (!property || (other && !title.trim())) {
      toast({ title: t.needProperty, variant: 'destructive' });
      return;
    }
    try {
      await create.mutateAsync({
        tripId,
        propertyId: other ? null : Number(property),
        title: other ? title.trim() : null,
        startsAt: new Date(when).toISOString(),
        durationMin: Number(minutes) || 60,
        agentId: agent ? Number(agent) : null,
        meetingPoint: meeting.trim() || null,
      });
      onDone();
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const options = [
    ...(suggestions.data ?? []).filter((s) => s.property).map((s) => ({ value: String(s.propertyId), label: `${s.property!.reference} — ${nameOf(s.property!.title) || ''}` })),
    { value: 'other', label: t.otherProperty },
  ];

  return (
    <div className="grid gap-3 border-t bg-muted/30 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="viewing-form">
      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
        <Label className="text-xs">{t.property}</Label>
        <FilterSelect className="w-full" value={property} onChange={setProperty} anyLabel={t.pickProperty} options={options} />
      </div>
      {other ? (
        <div className="space-y-1">
          <Label htmlFor="v-title" className="text-xs">{t.otherTitle}</Label>
          <Input id="v-title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="v-when" className="text-xs">{t.when}</Label>
        <Input id="v-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-min" className="text-xs">{t.duration}</Label>
        <Input id="v-min" type="number" min={5} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t.agent}</Label>
        <FilterSelect className="w-full" value={agent} onChange={setAgent} anyLabel="—" options={(agents.data ?? []).map((a) => ({ value: String(a.id), label: a.name || a.email }))} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="v-meet" className="text-xs">{t.meeting}</Label>
        <Input id="v-meet" value={meeting} maxLength={500} onChange={(e) => setMeeting(e.target.value)} />
      </div>
      <div className="flex items-end gap-2">
        <Button size="sm" onClick={save} disabled={create.isPending} data-testid="viewing-save">
          {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t.cancel}</Button>
      </div>
    </div>
  );
}

function ViewingRow({ v }: { v: Viewing }) {
  const t = useBuyerText().trips;
  const { toast } = useToast();
  const update = useUpdateViewing();
  const remove = useDeleteViewing();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(v.feedback ?? '');
  const [interest, setInterest] = useState<number | null>(v.interest);
  const [when, setWhen] = useState(toLocal(v.startsAt));
  const label = v.property ? `${v.property.reference} — ${nameOf(v.property.title) || ''}` : v.title || '—';

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(patch);
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="px-6 py-3 text-sm" data-viewing={v.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-44 shrink-0 font-medium tabular-nums">{fmtTime(v.startsAt)}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLASS[v.status])} data-status={v.status}>{t.statuses[v.status]}</span>
        {v.interest ? <Badge variant="outline" className="text-[10px]">{'★'.repeat(v.interest)}</Badge> : null}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setOpen((o) => !o)} data-testid="viewing-open">…</Button>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {v.agent?.name ? <span>{t.agent}: {v.agent.name}</span> : null}
        {v.meetingPoint ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{v.meetingPoint}</span> : null}
        {v.feedback ? <span className="italic">“{v.feedback}”</span> : null}
      </div>
      {open ? (
        <div className="mt-3 grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t.status}</Label>
            <FilterSelect
              className="w-full"
              value={v.status}
              onChange={(s) => s && s !== v.status && save({ id: v.id, status: s as ViewingStatus, feedback: feedback.trim() || null, interest })}
              anyLabel={t.statuses.planned}
              options={VIEWING_STATUSES.map((s) => ({ value: s, label: t.statuses[s] }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`v-when-${v.id}`} className="text-xs">{t.when}</Label>
            <Input id={`v-when-${v.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} onBlur={() => when !== toLocal(v.startsAt) && save({ id: v.id, startsAt: new Date(when).toISOString() })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`v-fb-${v.id}`} className="text-xs">{t.feedback}</Label>
            <Textarea id={`v-fb-${v.id}`} rows={2} value={feedback} maxLength={5000} onChange={(e) => setFeedback(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">{t.interest}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={cn('text-lg leading-none', (interest ?? 0) >= n ? 'text-amber-500' : 'text-muted-foreground/40')} onClick={() => setInterest(interest === n ? null : n)} aria-label={`${n}`}>
                ★
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => save({ id: v.id, feedback: feedback.trim() || null, interest })}>{t.save}</Button>
            {v.status !== 'done' ? (
              <Button size="sm" onClick={() => save({ id: v.id, status: 'done', feedback: feedback.trim() || null, interest })} data-testid="viewing-done">
                <Check className="mr-1 h-4 w-4" />
                {t.markDone}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm(t.confirmDelete) && remove.mutate(v.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
