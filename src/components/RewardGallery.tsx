import { useEffect, useMemo, useState } from "react";
import { useGamificationStore, useSettingsStore } from "../store/StoreProvider";
import { BADGE_IMAGE_POOL_BY_LEVEL, STICKER_IMAGE_POOL_BY_KEY } from "../services/gamificationAssets";
import { createTauriUpscaleClient, type UpscaleFactor, type UpscalerStatus } from "../services/upscaleClient";
import { generateVideo, VIDEO_GEN_CONNECTORS } from "../services/videoGen";
import { runAiJob } from "../services/aiQueue";

interface GalleryItem {
  key: string;
  label: string;
  url: string;
  kind: "badge" | "sticker";
}

/**
 * Everything actually earned, as one flat list. Locked rewards are
 * deliberately absent: this is a gallery of what you have, not a
 * checklist of what you don't. The Progress tab's own grid already
 * shows locked ones.
 *
 * Each concept contributes every image in its pool rather than one
 * representative, since the pools are the point — the whole reason
 * repeat rewards rotate art is so there's more than one to look at.
 */
function collectEarned(unlockedKeys: string[], level: number): GalleryItem[] {
  const items: GalleryItem[] = [];

  for (const [levelStr, pool] of Object.entries(BADGE_IMAGE_POOL_BY_LEVEL)) {
    if (Number(levelStr) > level) continue;
    pool.forEach((url, i) => {
      items.push({
        key: `badge-${levelStr}-${i}`,
        label: `Level ${levelStr}`,
        url,
        kind: "badge",
      });
    });
  }

  for (const key of unlockedKeys) {
    const pool = STICKER_IMAGE_POOL_BY_KEY[key];
    if (!pool) continue;
    pool.forEach((url, i) => {
      items.push({
        key: `${key}-${i}`,
        label: key.replace(/^sticker_/, "").replace(/_/g, " "),
        url,
        kind: "sticker",
      });
    });
  }

  return items;
}

/**
 * Full-screen view of one piece of art, with the three things you can
 * do to it. Same "obvious way out" rule as zen mode and the Journal.
 */
function ArtView({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  const [upscaler, setUpscaler] = useState<UpscalerStatus | null>(null);
  const [scale, setScale] = useState<UpscaleFactor>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const settings = useSettingsStore((s) => s);

  useEffect(() => {
    void createTauriUpscaleClient().status().then(setUpscaler);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleExport() {
    setBusy("export");
    setMessage(null);
    try {
      // The bundled art is a hashed asset URL, so this re-fetches its
      // bytes rather than trying to reach for a source file that has no
      // stable path at runtime.
      const res = await fetch(item.url);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${item.label.replace(/\s+/g, "-")}.webp`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage("Saved.");
    } catch {
      setMessage("Couldn't export that one.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpscale() {
    if (!upscaler?.installed) return;
    setBusy("upscale");
    setMessage(null);
    try {
      // Through the app-wide AI lock like every other model call, so a
      // slow CPU upscale can't run alongside a journal generation.
      await runAiJob({ kind: "upscale", label: `Upscaling ${item.label}` }, async () => {
        const client = createTauriUpscaleClient();
        return client.upscale(item.url, `${item.label}-${scale}x.png`, scale);
      });
      setMessage(`Upscaled ${scale}x.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upscale failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAnimate() {
    setBusy("animate");
    setMessage(null);
    try {
      const res = await fetch(item.url);
      const buffer = await res.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const result = await runAiJob(
        { kind: "animate", label: `Animating ${item.label}` },
        () =>
          generateVideo(
            { imageBase64: base64, prompt: `Gently animate this ${item.kind}, subtle motion` },
            Object.fromEntries(
              VIDEO_GEN_CONNECTORS.map((c) => [
                c.apiKeySetting,
                (settings as unknown as Record<string, string | null>)[c.apiKeySetting] ?? null,
              ]),
            ),
          ),
      );
      setVideoUrl(result.videoUrl);
      setMessage(`Animated via ${result.provider}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Animate failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`${item.label} artwork`}
      className="absolute inset-0 z-40 flex flex-col p-6"
      style={{ background: "var(--paper)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[0.95rem] font-semibold text-[var(--ink)] capitalize">{item.label}</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink-soft)]"
        >
          Close
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {videoUrl ? (
          <video src={videoUrl} controls autoPlay loop className="max-h-full max-w-full rounded-xl" />
        ) : (
          <img src={item.url} alt={item.label} className="max-h-full max-w-full rounded-xl object-contain" />
        )}
      </div>

      {message && <p className="mt-2 text-center text-[0.78rem] text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy !== null}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)] disabled:opacity-50"
        >
          {busy === "export" ? "Exporting…" : "Export"}
        </button>

        <div className="flex items-center gap-1">
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value) as UpscaleFactor)}
            aria-label="Upscale factor"
            className="rounded-lg border border-[var(--line)] bg-[var(--paper-card)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
          >
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
          <button
            type="button"
            onClick={() => void handleUpscale()}
            disabled={busy !== null || !upscaler?.installed}
            title={
              upscaler && !upscaler.installed
                ? `Real-ESRGAN isn't installed. Put it at ${upscaler.expectedPath}`
                : "Runs on CPU so it stays out of the way of the voice services"
            }
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)] disabled:opacity-50"
          >
            {busy === "upscale" ? "Upscaling…" : "Upscale"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleAnimate()}
          disabled={busy !== null}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)] disabled:opacity-50"
        >
          {busy === "animate" ? "Animating…" : "Animate"}
        </button>
      </div>
    </div>
  );
}

/**
 * The Reward Gallery — every earned badge and sticker as thumbnails,
 * click one for a full-screen look at the art with export, upscale, and
 * animate. Zen-mode only, like the rest of the app's roomier surfaces;
 * a grid of artwork in the pocket card would be unreadable.
 */
export function RewardGallery({ onClose }: { onClose: () => void }) {
  const unlocked = useGamificationStore((s) => s.unlockedAchievements);
  const stats = useGamificationStore((s) => s.stats);
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  // Level 0 until stats actually load — defaulting to 1 would show the
  // level-1 badge for a moment before we know whether it's been earned.
  const items = useMemo(
    () => collectEarned(unlocked.map((u) => u.achievement_key), stats?.level ?? 0),
    [unlocked, stats?.level],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only closes the gallery when no art is open — the art view owns
      // Escape while it's up, same two-stage rule the Journal uses.
      if (e.key === "Escape" && !selected) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);

  return (
    <div className="relative flex h-full flex-col p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">Gallery</div>
          <div className="text-[1rem] font-semibold text-[var(--ink)]">
            {items.length} earned {items.length === 1 ? "piece" : "pieces"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink-soft)]"
        >
          Exit
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[0.85rem] text-[var(--ink-faint)]">
          Nothing earned yet. Clock in, finish something, come back.
        </p>
      ) : (
        <ul className="grid flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="w-full overflow-hidden rounded-xl border transition-transform hover:scale-105"
                style={{ borderColor: "var(--line)" }}
                title={item.label}
              >
                <img src={item.url} alt={item.label} className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <ArtView item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
