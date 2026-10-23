'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { CodePaneProps } from './code-editor-impl';

// CodeMirror needs the browser; the server renders a spinner in its place.
const CodeEditorImpl = dynamic(() => import('./code-editor-impl'), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>,
});

export function CodePane(props: CodePaneProps) {
  return <div className="overflow-hidden rounded-md border text-sm"><CodeEditorImpl {...props} /></div>;
}
