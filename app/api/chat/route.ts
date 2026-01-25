import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Initialize Google GenAI client
const genai = process.env.GOOGLE_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

// Use Gemini 2.0 Flash - fast and capable
const MODEL_ID = "gemini-2.0-flash";

// Types for chat messages
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClipInfo {
  id: string;
  name: string;
  duration: number | null;
  transcript: string | null;
}

interface ChatRequest {
  message: string;
  history: ChatMessage[];
  clips: ClipInfo[];
}

// System prompt for video editing assistant
const SYSTEM_PROMPT = `You are an AI video editing assistant for a tool that helps creators make vertical videos (TikTok, Reels, Shorts) from their talking-head clips.

## Your Role
- Help users understand and edit their video content
- Provide suggestions for improving their videos
- Answer questions about their transcripts
- Guide them through the editing process

## Context
The user has uploaded video clips with transcripts. You can see:
- Clip names and durations
- Full transcripts of what was said in each clip

## What You Can Help With
1. **Content Review** - Analyze transcripts, identify key points, suggest improvements
2. **Editing Suggestions** - Recommend cuts, reordering, removing sections
3. **Caption Guidance** - Help with caption formatting and timing
4. **Creative Ideas** - Suggest hooks, transitions, and engagement tactics

## Response Style
- Be concise and helpful
- Use bullet points for lists
- Reference specific parts of the transcript when relevant
- Be encouraging and supportive

## Important
- You can see transcripts but cannot directly edit the video
- Guide users on what changes they should make
- If asked to do something impossible, explain what they can do instead`;

export async function POST(request: NextRequest) {
  try {
    // Check if Google API key is configured
    if (!genai) {
      return NextResponse.json(
        {
          error:
            "Google API key not configured. Set GOOGLE_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body: ChatRequest = await request.json();
    const { message, history, clips } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Build context about the clips
    let clipsContext = "";
    if (clips && clips.length > 0) {
      clipsContext = "\n\n## Current Clips\n";
      clips.forEach((clip, index) => {
        const duration = clip.duration
          ? `${Math.floor(clip.duration / 60)}:${Math.floor(clip.duration % 60)
              .toString()
              .padStart(2, "0")}`
          : "unknown";
        clipsContext += `\n### Clip ${index + 1}: ${clip.name} (${duration})\n`;
        if (clip.transcript) {
          clipsContext += `**Transcript:**\n${clip.transcript}\n`;
        } else {
          clipsContext += `*No transcript available*\n`;
        }
      });
    }

    // Build conversation history for Gemini
    // Gemini uses a different format - we need to build a conversation string
    let conversationHistory = "";
    if (history && Array.isArray(history)) {
      history.forEach((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        conversationHistory += `${role}: ${msg.content}\n\n`;
      });
    }

    const fullPrompt = conversationHistory
      ? `Previous conversation:\n${conversationHistory}\nUser: ${message}`
      : message;

    console.log(`[Chat] Processing message: "${message.substring(0, 50)}..."`);

    // Call Gemini API
    const response = await genai.models.generateContent({
      model: MODEL_ID,
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT + clipsContext,
        maxOutputTokens: 1024,
      },
    });

    // Extract text from response
    const assistantMessage = response.text || "";

    console.log(
      `[Chat] Response: "${assistantMessage.substring(0, 50)}..."`
    );

    return NextResponse.json({
      message: assistantMessage,
      usage: {
        // Gemini doesn't provide token counts in the same way, use estimates
        input_tokens: 0,
        output_tokens: 0,
      },
    });
  } catch (error: unknown) {
    console.error("[Chat] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat request failed",
      },
      { status: 500 }
    );
  }
}
