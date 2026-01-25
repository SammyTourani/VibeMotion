"use client";

import { useEffect } from "react";
import EditorLayout from "@/components/EditorLayout";

export default function EditorPage() {
  // Set body class for editor-specific styles
  useEffect(() => {
    document.body.classList.add("editor-page");
    document.body.classList.remove("landing-page");
    return () => {
      document.body.classList.remove("editor-page");
    };
  }, []);

  return <EditorLayout />;
}
