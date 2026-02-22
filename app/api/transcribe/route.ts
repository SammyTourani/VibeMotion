import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Word, TranscriptData } from "@/lib/types";

// Initialize OpenAI client
// For hackathon: Use API key from environment variable
// To set: export OPENAI_API_KEY="sk-..."
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(request: NextRequest) {
  try {
    // Check if OpenAI API key is configured
    if (!openai) {
      return NextResponse.json(
        {
          error:
            "OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    // Get the file from the request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: "File must be a video or audio file" },
        { status: 400 }
      );
    }

    console.log(`[Transcribe] Processing: ${file.name} (${file.size} bytes)`);

    // Send to OpenAI Whisper API with word-level timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    // Extract word-level timestamps
    const words: Word[] = [];

    // OpenAI returns words in the 'words' field with word-level timestamps
    if (transcription.words && Array.isArray(transcription.words)) {
      transcription.words.forEach((word: { word: string; start: number; end: number }) => {
        words.push({
          text: word.word,
          start: word.start,
          end: word.end,
        });
      });
    }

    // Create transcript data
    const transcriptData: TranscriptData = {
      text: transcription.text,
      words: words,
    };

    console.log(
      `[Transcribe] Success: ${file.name} - ${words.length} words, ${transcription.text.length} characters`
    );

    return NextResponse.json(transcriptData);
  } catch (error: unknown) {
    console.error("[Transcribe] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Transcription failed",
      },
      { status: 500 }
    );
  }
}
