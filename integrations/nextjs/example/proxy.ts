// Next 16: proxy.ts in the project root. On Next 14–15 name this file
// middleware.ts and the function `middleware`.
import { NextResponse, type NextRequest } from 'next/server';
import { spmCleanPropertyUrl } from '@/spm/clean-url';

export function proxy(request: NextRequest) {
  // Property pages: drop parameters SPM does not use (301 to the clean address).
  return spmCleanPropertyUrl(request) ?? NextResponse.next();
}

// The property folder (NEXT_PUBLIC_SPM_PROPERTY_SLUG), with language prefixes if any.
export const config = {
  matcher: ['/property/:slug*', '/:lang/property/:slug*'],
};
