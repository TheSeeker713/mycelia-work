#!/usr/bin/env node
// Generates the fixed set of pre-recorded voice cues via the local
// Chatterbox-Turbo TTS server (D:\_Dev\AI-Setup\Voice-Agent, :8002) and
// writes them into src/assets/audio/. Offline, one-time (or re-run any
// time you want a different reference voice clip) — the app never
// depends on Chatterbox being up at runtime, these ship as static
// assets. See src/assets/audio/README.md for the full cue list; this
// script currently covers the cues with a real, wired trigger point
// (Phase 5/6's clock in/break/clock out, and the check-in/journal AI
// wait). The rest (welcome, todo-alert, idle-nudge, journal-ready,
// goodbye) are Phase 11 polish, added here once they have one too.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CHATTERBOX_URL = process.env.CHATTERBOX_URL ?? "http://127.0.0.1:8002";
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "assets",
  "audio",
);

// Short, direct, no exclamation-point cheerfulness — same voice
// discipline as the rest of the app (docs/reference/authentic-voice-notes.md).
const LINES = {
  "clock-in": "Clocked in.",
  "break-start": "Taking a break.",
  "break-resume": "Back to work.",
  "clock-out": "Clocked out.",
  "please-wait": "Give me a moment, I'm working on that.",
};

async function generateLine(name, text) {
  const form = new FormData();
  form.append("text", text);
  const res = await fetch(`${CHATTERBOX_URL}/tts`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Chatterbox returned ${res.status} for "${name}"`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(OUT_DIR, `${name}.wav`);
  await writeFile(outPath, buffer);
  console.log(`  wrote ${outPath} (${buffer.length} bytes)`);
}

async function main() {
  console.log(`Generating ${Object.keys(LINES).length} voice lines via ${CHATTERBOX_URL} ...`);
  for (const [name, text] of Object.entries(LINES)) {
    console.log(`  "${text}" -> ${name}.wav`);
    await generateLine(name, text);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  console.error("\nIs Chatterbox-Turbo running? cd D:\\_Dev\\AI-Setup\\Voice-Agent && .\\start_all.ps1");
  process.exitCode = 1;
});
