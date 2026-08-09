#!/usr/bin/env node
// Generates the fixed set of pre-recorded voice cues via the local
// Chatterbox-Turbo TTS server (D:\_Dev\AI-Setup\Voice-Agent, :8002) and
// writes them into src/assets/audio/. Offline, one-time (or re-run any
// time you want a different reference voice clip) — the app never
// depends on Chatterbox being up at runtime, these ship as static
// assets. Down to just "please wait" as of 2026-08-08 — clock-in/break/
// clock-out moved to live self-voicing (Kokoro) once that engine became
// something worth actually hearing; please-wait stays pre-baked since it
// covers a real network-call wait, where zero-latency/no-network-
// dependency playback is the point.

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
