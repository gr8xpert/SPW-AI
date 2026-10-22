// Shared ticket components (attachment drop zone / picker) wording.

export const en = {
  dropFiles: 'Drop files here',
  or: ' or ',
  browse: 'browse',
  limits: 'Images and PDFs up to 10 MB, videos (MP4, MOV, WebM) up to 90 MB',
  remove: (name: string) => `Remove ${name}`,
  attach: 'Attach',
};

export type TicketComponentsText = typeof en;
