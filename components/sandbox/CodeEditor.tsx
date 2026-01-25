"use client";

import { useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface CodeEditorProps {
  code: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  language?: string;
  theme?: "vs-dark" | "light";
}

export default function CodeEditor({
  code,
  onChange,
  readOnly = true,
  language = "typescript",
  theme = "vs-dark",
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Auto-scroll to bottom when code is appended
  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        editorRef.current.revealLine(lineCount);
      }
    }
  }, [code]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-white/10">
      <Editor
        height="100%"
        language={language}
        theme={theme}
        value={code}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontLigatures: true,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          renderLineHighlight: "gutter",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
              Loading editor...
            </div>
          </div>
        }
      />
    </div>
  );
}
