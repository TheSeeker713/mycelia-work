#!/usr/bin/env node
// Generates the one pre-recorded voice cue ("please wait") for every
// entry in the narration-voice roster, via the local Kokoro TTS server
// (D:\_Dev\AI-Setup\Voice-Agent\tts\kokoro, :8006) — one file per
// voice/pitch combination, so whichever voice is selected in Settings,
// the pre-baked cue actually matches it instead of playing a fixed,
// unrelated voice. Offline, one-time (or re-run any time the roster
// changes) — the app never depends on Kokoro being up to READ these
// files at runtime, they ship as static assets; Kokoro only needs to
// be up while running this script.
//
// This roster must stay in sync with src/services/voiceClient.ts's
// NARRATION_VOICES — duplicated here rather than imported since this
// is a plain Node script, not run through the app's TS/Vite pipeline.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const KOKORO_URL = process.env.KOKORO_URL ?? "http://127.0.0.1:8006";
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "assets",
  "audio",
);

const TEXT = "Give me a moment, I'm working on that.";

const NARRATION_VOICES = [
  { id: "af_heart_200", voice: "af_heart", pitchShiftCents: 200 },
  { id: "af_heart_150", voice: "af_heart", pitchShiftCents: 150 },
  { id: "af_heart_100", voice: "af_heart", pitchShiftCents: 100 },
  { id: "af_sarah", voice: "af_sarah", pitchShiftCents: 0 },
  { id: "af_sky", voice: "af_sky", pitchShiftCents: 0 },
  { id: "af_nova", voice: "af_nova", pitchShiftCents: 0 },
  { id: "af_kore", voice: "af_kore", pitchShiftCents: 0 },
  { id: "am_adam", voice: "am_adam", pitchShiftCents: 0 },
  { id: "am_michael", voice: "am_michael", pitchShiftCents: 0 },
  { id: "am_onyx", voice: "am_onyx", pitchShiftCents: 0 },
  { id: "am_liam", voice: "am_liam", pitchShiftCents: 0 },
  { id: "am_echo", voice: "am_echo", pitchShiftCents: 0 },
];

async function generateLine(entry) {
  const form = new FormData();
  form.append("text", TEXT);
  form.append("voice", entry.voice);
  form.append("pitch_shift_cents", String(entry.pitchShiftCents));
  const res = await fetch(`${KOKORO_URL}/tts`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Kokoro returned ${res.status} for "${entry.id}"`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(OUT_DIR, `please-wait-${entry.id}.wav`);
  await writeFile(outPath, buffer);
  console.log(`  wrote ${outPath} (${buffer.length} bytes)`);
}

async function main() {
  console.log(`Generating ${NARRATION_VOICES.length} "please wait" cues via ${KOKORO_URL} ...`);
  for (const entry of NARRATION_VOICES) {
    console.log(`  ${entry.id} (voice=${entry.voice}, pitch=${entry.pitchShiftCents}) -> please-wait-${entry.id}.wav`);
    await generateLine(entry);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  console.error("\nIs Kokoro running? cd D:\\_Dev\\AI-Setup\\Voice-Agent && .\\start_all.ps1");
  process.exitCode = 1;
});
