// Support Tickets (client side) wording. Ticket subjects and messages are
// user data and stay as typed; status/priority/category codes stay as sent
// by the API and only their labels change here.

export const en = {
  status: {
    open: 'Open',
    in_progress: 'In Progress',
    waiting_customer: 'Awaiting Reply',
    resolved: 'Resolved',
    closed: 'Closed',
  } as Record<string, string>,
  priority: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  } as Record<string, string>,
  category: {
    technical: 'Technical',
    billing: 'Billing',
    feature_request: 'Feature Request',
    bug: 'Bug Report',
    general: 'General',
  } as Record<string, string>,
  // The longer names in the New Ticket category picker.
  categoryOptions: {
    technical: 'Technical Issue',
    billing: 'Billing Question',
    feature_request: 'Feature Request',
    bug: 'Bug Report',
    general: 'General Inquiry',
  },

  common: {
    category: 'Category',
    priority: 'Priority',
    status: 'Status',
    cancel: 'Cancel',
    you: 'You',
    replyPlaceholder: 'Type your reply...',
    free: '(free)',
  },

  list: {
    title: 'Support Tickets',
    description: 'Get help from our support team',
    newTicket: 'New Ticket',
    searchPlaceholder: 'Search tickets...',
    allTickets: 'All Tickets',
    noTickets: 'No tickets found',
    createFirst: 'Create your first ticket',
    colTicket: 'Ticket',
    colTimeSpent: 'Time Spent',
    colLastUpdate: 'Last Update',
    colReplies: 'Replies',
    pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
    createDialog: {
      title: 'Create Support Ticket',
      description: 'Describe your issue and we’ll get back to you as soon as possible.',
      subjectLabel: 'Subject *',
      subjectPlaceholder: 'Brief description of your issue',
      messageLabel: 'Message *',
      messagePlaceholder: 'Describe your issue in detail...',
      attachments: 'Attachments',
      submit: 'Submit Ticket',
    },
    spent: (time: string) => `${time} spent`,
    loadingMessages: 'Loading messages...',
    send: 'Send',
    toasts: {
      uploadFailed: 'Upload failed',
      loadFailed: 'Failed to load tickets',
      created: 'Ticket created',
      createFailed: 'Failed to create ticket',
      replySent: 'Reply sent',
      replyFailed: 'Failed to send reply',
    },
  },

  detail: {
    backToTickets: 'Back to tickets',
    notFound: 'Ticket not found',
    opened: (date: string) => `Opened ${date}`,
    noMessages: 'No messages yet',
    staff: 'Staff',
    internal: 'Internal',
    reply: 'Reply',
    replyDescription: 'Send a message',
    attachFiles: 'Attach Files',
    sendReply: 'Send Reply',
    details: 'Details',
    requester: 'Requester',
    assignedTo: 'Assigned To',
    unassigned: 'Unassigned',
    created: 'Created',
    lastReply: 'Last Reply',
    resolved: 'Resolved',
    actions: 'Actions',
    markResolved: 'Mark as Resolved',
    closeTicket: 'Close Ticket',
    reopenTicket: 'Reopen Ticket',
    toasts: {
      loadFailed: 'Failed to load ticket',
      statusChanged: (status: string) => `Status changed to ${status}`,
      statusFailed: 'Failed to update status',
    },
  },
};

export type TicketsText = typeof en;
