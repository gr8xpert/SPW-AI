'use client';

import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { EditorView } from '@codemirror/view';

/** insert() answers false when the editor is gone (unmounted), so the caller can keep the text for the next one. */
export interface CodeEditorApi { insert: (text: string) => boolean }

export interface CodePaneProps {
  value: string;
  onChange: (v: string) => void;
  onReady: (api: CodeEditorApi) => void;
  /** Read-only while the AI designer is working on the template. */
  readOnly?: boolean;
}

const extensions = [html(), EditorView.lineWrapping];

export default function CodeEditorImpl({ value, onChange, onReady, readOnly = false }: CodePaneProps) {
  return (
    <CodeMirror
      value={value}
      height="calc(100vh - 260px)"
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: true }}
      onCreateEditor={(view) =>
        onReady({
          insert: (text) => {
            if (!view.dom.isConnected) return false;
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
            return true;
          },
        })
      }
    />
  );
}
