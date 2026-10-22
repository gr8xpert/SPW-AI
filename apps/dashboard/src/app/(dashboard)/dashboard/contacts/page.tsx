import { redirect } from 'next/navigation';

// Contacts moved (2026-10-22): the people are the Buyer Match section now;
// the email subscriber list is Email Campaigns → Subscribers.
export default function ContactsRedirect() {
  redirect('/dashboard/buyers');
}
