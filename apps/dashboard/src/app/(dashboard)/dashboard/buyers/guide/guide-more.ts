import {
  BarChart3, Bell, Building2, CalendarCheck, CalendarDays, CircleHelp, ClipboardList, Kanban, ListTodo, Settings, ShieldCheck, Sun, Upload, UserCog,
} from 'lucide-react';
import { p, steps, terms, tip, warn, type GuideSection } from './guide-types';

// Part 2 of the Contacts guide: the rest of a record, the daily screens
// (Lead Report, calendar), settings, privacy and common questions.
export const MORE: GuideSection[] = [
  {
    id: 'more-tabs',
    group: 'one',
    title: 'Notes, trips, tasks, files and history',
    icon: ClipboardList,
    summary: 'Everything else you keep about a buyer.',
    blocks: [
      terms(
        ['Contacts', 'Other people involved: a partner, family member or assistant, with their phone and email.'],
        ['Internal notes', 'Free notes only your team sees. AI can read them to make rules.'],
        ['Trips & viewings', 'Add a trip when the buyer visits the area, then add viewings to it. The buyer can get an itinerary by email (with a calendar file) or PDF, and the agent gets a reminder before each viewing. The calendar button on a viewing adds it to Google Calendar or downloads it for Outlook and iPhone.'],
        ['Tasks', 'Things to do, like "Call back on Friday", with a deadline and a person. Overdue tasks show in red.'],
        ['Files', 'Pictures and PDFs up to 20 MB, like a passport copy or a signed offer.'],
        ['Activity', 'A diary: calls (with how they went), WhatsApps, emails, viewings, website visits and alerts. Use "Log activity" to add a call or meeting.'],
        ['History', 'Every change to the buyer: who changed what, and when. Nothing is a mystery.'],
      ),
      tip('After a viewing, mark it "Done" and write the buyer\'s feedback. It helps the next agent and the AI.'),
    ],
  },
  {
    id: 'my-day',
    group: 'day',
    title: 'My day and To do today',
    icon: Sun,
    summary: 'Open these first every morning.',
    link: { href: '/dashboard/buyers/home', label: 'Open My day' },
    blocks: [
      p('"My day" is your morning page. It shows your pipeline, leads nobody called in time, overdue tasks, tasks for today, viewings in the next 7 days, buyers you are waiting on, your hot buyers and alerts to approve.'),
      p('"To do today" lists every task due today (overdue first) and buyers nobody has talked to for a while.'),
      tip('Switch on "Daily email with this summary" on My day and the same list lands in your inbox every morning, including the leads you have not called yet.'),
    ],
  },
  {
    id: 'lead-report',
    group: 'day',
    title: 'Lead Report',
    icon: ListTodo,
    summary: 'Every lead, who called them and how it went. It fills itself.',
    link: { href: '/dashboard/buyers/lead-report', label: 'Open the Lead Report' },
    blocks: [
      p('The Lead Report replaces the spreadsheet where agents wrote "called once, no answer". Every lead is a line, and the follow-up is worked out from what the team really did: calls, WhatsApps, emails and viewings.'),
      terms(
        ['Follow-up', 'Not contacted (red when overdue), no answer yet, call back, wrong number or reached. Below it: how many calls, WhatsApps and emails, and how long the first contact took.'],
        ['Log call', 'After a call, press "Log call" and choose how it went: answered, no answer, call back later or wrong number. Add a note if you like.'],
        ['Columns', 'Came in, phone and email, agent, stage, first contact, appointment (the next viewing), latest note, what they asked, budget and property type. Stage and agent can be changed right in the row.'],
        ['Buyer questions', 'Managers press "Columns" to show some of your Buyer questions (like "When do you want to buy?") as columns. Agents fill them in right in the row; answers from Facebook forms are filled in for you.'],
        ['Per agent', 'At the top, one line per agent: leads, not contacted, overdue, contacted, reached, time to first contact, calls, WhatsApps, emails, viewings, won, lost, won value and conversion. Click a name or a red number to filter the table.'],
        ['Export CSV', 'Managers can download the whole table to open in Excel.'],
      ),
      tip('Agents see only their own leads and their own line. A lead nobody contacts in time also lands on My day and in the agent\'s daily email.'),
    ],
  },
  {
    id: 'board',
    group: 'day',
    title: 'The Board',
    icon: Kanban,
    summary: 'See all buyers as cards in columns, one column per stage.',
    link: { href: '/dashboard/buyers/board', label: 'Open the Board' },
    blocks: [
      p('The Board is like sticky notes on a wall. Each column is a stage. Drag a buyer from one column to the next when they move forward.'),
      p('The filters work here too, so you can look at only your own buyers or only hot ones.'),
    ],
  },
  {
    id: 'alerts',
    group: 'day',
    title: 'Alerts: new listings and price drops',
    icon: Bell,
    summary: 'The system spots new matches for you. You say yes or no.',
    link: { href: '/dashboard/buyers/alerts', label: 'Open Alerts' },
    blocks: [
      p('When a new property comes in, or a price goes down, the system checks every buyer. If it fits someone, an alert waits for you on the Alerts tab. The red number on the tab tells you how many.'),
      steps(
        'Open Alerts. Each line shows the buyer, the property and the score.',
        'Press "Approve" for the good ones and "Reject" for the rest. "Approve all" does them all at once.',
        'Approved alerts are sent, either at once or in one daily email per buyer (your manager chooses).',
      ),
      warn('Nothing is sent without your OK. If you never approve, buyers never get alerts.'),
    ],
  },
  {
    id: 'calendar',
    group: 'day',
    title: 'Calendar and Calendly',
    icon: CalendarDays,
    summary: 'Your viewings in Google Calendar, and buyers who book a time themselves.',
    link: { href: '/dashboard/buyers/settings?tab=calendar', label: 'Open the Calendar settings' },
    blocks: [
      p('Under Settings → Calendar every user has a private calendar link. Add it once to Google Calendar (Other calendars → + → From URL), Outlook or your iPhone, and your viewings show up there. An agent\'s link has their own viewings; a manager\'s link has the whole team\'s, with the agent\'s name in each title.'),
      warn('Google decides when it reads the link again: usually within a few hours, sometimes a day. Need one viewing right now? Use the calendar button on the viewing instead.'),
      p('Calendly is a booking page where the buyer picks a free time in the agent\'s agenda. A manager connects your Calendly account once under Settings → Calendar.'),
      terms(
        ['A buyer books', 'A viewing appears on the right contact with the agent and time, and the lead counts as reached on the Lead Report.'],
        ['Someone new books', 'They arrive on New Leads, already given to the agent they booked with. Their Calendly answers fill your Buyer questions.'],
        ['Reschedule or cancel', 'The viewing moves to the new time, or is marked cancelled with the reason.'],
        ['Sending the link', 'Tick "Add my booking link" in a WhatsApp message, or copy it with the calendar button on the Lead Report. The buyer\'s name and email are already filled in.'],
      ),
      tip('Bookings come in by themselves only on a paid Calendly plan (Standard or higher). On the free plan the booking links still work, but you add the viewing yourself. Agents are matched by email, so use the same email in Calendly and here.'),
    ],
  },
  {
    id: 'reverse',
    group: 'day',
    title: 'Buyers for this property',
    icon: Building2,
    summary: 'Start from a property and find every buyer who would like it.',
    blocks: [
      p('Open a property in Properties. The "Buyers for this property" card counts every buyer whose wishlist fits it.'),
      p('Press "See buyers" to see who they are, then "Send to all" or send to the ones you tick. Buyers who already got it, or rejected it, are skipped.'),
      tip('Great for a new listing or a price drop you want to push quickly.'),
    ],
  },
  {
    id: 'reports',
    group: 'managers',
    title: 'Pipeline & Revenue',
    icon: BarChart3,
    summary: 'How the agency is doing, in numbers and charts.',
    managersOnly: true,
    link: { href: '/dashboard/buyers/reports', label: 'Open Pipeline & Revenue' },
    blocks: [
      terms(
        ['New buyers', 'How many came in, per month and per source (website, phone, Facebook…).'],
        ['Won and lost', 'How many buyers bought, and how many you lost.'],
        ['Open pipeline value', 'The total deal value of buyers still in progress.'],
        ['Expected revenue', 'Deal values multiplied by the chance of each stage. A fair guess of what is coming.'],
        ['Pipeline funnel', 'How many new buyers reached each stage.'],
        ['Per agent', 'Leads, follow-up, wins, won value and conversion per agent are on the Lead Report.'],
      ),
    ],
  },
  {
    id: 'settings',
    group: 'managers',
    title: 'Settings',
    icon: Settings,
    summary: 'How Buyer Match works for your whole agency.',
    managersOnly: true,
    link: { href: '/dashboard/buyers/settings', label: 'Open Settings' },
    blocks: [
      p('Only the agency owner or a manager can change these. Agents can look.'),
      terms(
        ['General', 'Can agents see each other\'s buyers? Who gets new website buyers? After how many days is a buyer "forgotten"? Viewing reminders, the daily email time, the hot score, after how many hours an uncalled lead turns red, the property link address and the buyer page address.'],
        ['Stages', 'The columns of your Board. Add, rename, colour, reorder and set the chance % of each one. Deleting a stage asks where its buyers should go.'],
        ['Questions', 'Your own questions about buyers. You can show them on the website wishlist form and as Lead Report columns, and translate them. Word the options like your Facebook form so its answers fill in by themselves.'],
        ['Match weights', 'How much each wish counts in the score, from 0 (not at all) to 10 (a lot). You can give one feature, like sea views, its own weight.'],
        ['Alerts & near misses', 'Switch alerts on, choose "at once" or "daily digest", and how big a price drop must be. Set how far a near miss may be over budget or away.'],
        ['Housekeeping', 'Find possible duplicates (same phone or name) and merge them. Merging keeps everything; nothing is lost.'],
        ['Facebook & Instagram', 'Connect your ad lead forms so new leads come in every 15 minutes.'],
        ['Calendar', 'Everyone\'s own calendar link, and (managers) the Calendly connection.'],
      ),
      warn('Fill in "Property links in emails" first. Without it, emails cannot link to your property pages.'),
    ],
  },
  {
    id: 'import',
    group: 'managers',
    title: 'Import from Odoo',
    icon: Upload,
    summary: 'Bring your old buyers across from an Odoo export file.',
    managersOnly: true,
    link: { href: '/dashboard/buyers/import', label: 'Open Import' },
    blocks: [
      steps(
        'In Odoo, export your buyers as an .xlsx file.',
        'On the Import tab choose the file and press "Check the file". Nothing is saved yet.',
        'Look at "What will happen": new buyers, updated buyers and values that did not match.',
        'For each value that did not match (an agent, a town…), pick what it means in SPM, or leave "Keep as a note".',
        'Press "Import". Importing the same file again updates the same buyers; it never makes copies.',
      ),
    ],
  },
  {
    id: 'privacy',
    group: 'help',
    title: 'Privacy and deleting a buyer',
    icon: ShieldCheck,
    summary: 'Consent, unsubscribe and erasing personal data (GDPR).',
    blocks: [
      p('Every buyer has a Privacy button at the top of their record.'),
      terms(
        ['Record consent', 'Write down that the buyer agreed to be contacted, and how (website, phone, in person…).'],
        ['Unsubscribe from property emails', 'The buyer gets no more property emails or alerts. Their agent still can. The buyer can also do this from the link in any email.'],
        ['Erase personal data', 'For managers. Removes the name, email, phones, address, ID, notes, files and answers for good, and the buyer disappears from your lists. Only anonymous numbers stay for Pipeline & Revenue.'],
      ),
      steps(
        'Open the buyer and press "Privacy".',
        'Choose "Erase personal data…".',
        'Type ERASE in capitals and press "Erase for good".',
      ),
      warn('Erasing cannot be undone. If the buyer is only a duplicate, merge them in Settings → Housekeeping instead.'),
    ],
  },
  {
    id: 'who-sees',
    group: 'help',
    title: 'Who can see and do what',
    icon: UserCog,
    summary: 'Agents, managers and owners.',
    blocks: [
      terms(
        ['Agents', 'See their own buyers (or everyone, if the manager allows it). Can add buyers, fill wishlists, send emails, approve alerts and add tasks.'],
        ['Managers and owners', 'See every buyer, and also get Pipeline & Revenue, the Lead Report summary, Import, Export CSV, merging, erasing and the Settings.'],
      ),
      p('People who only appear on the website or in Buyer Match, without a login, are managed in Team → Agents.'),
    ],
  },
  {
    id: 'faq',
    group: 'help',
    title: 'Common questions',
    icon: CircleHelp,
    summary: 'Quick answers to the questions we hear most.',
    blocks: [
      terms(
        ['Why does Matched show nothing?', 'The must-haves are too tight. Choose a bigger area, more property types or a wider budget.'],
        ['Why is a property I sent missing from Matched?', 'Sent and rejected properties are hidden so nobody gets them twice. Press "Show all".'],
        ['The email has no links to my website.', 'A manager must fill in Settings → General → "Property links in emails".'],
        ['The AI buttons say I need a key.', 'Add your AI key (OpenRouter or Anthropic) in Settings → AI (owner or manager).'],
        ['I added the same person twice.', 'Use Settings → Housekeeping → Possible duplicates and merge them.'],
        ['How do I remove a buyer?', 'Privacy → Erase personal data (managers). The buyer leaves your lists for good.'],
        ['A buyer says they get too many emails.', 'Privacy → Unsubscribe from property emails.'],
        ['My calendar link shows no viewings.', 'An agent\'s link only has viewings where they are the agent (see "Agent:" under the viewing). Google can take up to a day to read the link again.'],
        ['A Calendly booking did not come in.', 'Settings → Calendar must say "Bookings come in by themselves" (a paid Calendly plan), and the agent\'s Calendly email must be their email here.'],
        ['Why is a lead red on the Lead Report?', 'Nobody called, WhatsApped or emailed them in time. Log a call (even "no answer") and it changes.'],
      ),
      tip('Still stuck? Open a ticket from Support and tell us the buyer\'s number from the web address.'),
    ],
  },
];

// Labels come from the Contacts menu words (useBuyerText().nav), so they
// always match the tabs.
export const QUICK_LINKS = [
  { href: '/dashboard/buyers/home', nav: 'home', icon: Sun },
  { href: '/dashboard/buyers/today', nav: 'today', icon: CalendarCheck },
  { href: '/dashboard/buyers/alerts', nav: 'alerts', icon: Bell },
  { href: '/dashboard/buyers/board', nav: 'board', icon: Kanban },
] as const;
