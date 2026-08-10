import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Checking for a new build.
 *
 * The feed is a public bucket with no connection to the source repo, so
 * nothing here carries a token and nothing needs one. The repo stays
 * private; two release artifacts are public. See
 * `docs/reference/packaging-and-updates.md` for why that shape.
 *
 * Everything here fails soft. An update check is not something the
 * person asked to think about, and a bucket that doesn't exist yet, a
 * dropped connection, or a machine that's simply offline should all read
 * as "couldn't check" rather than an error worth interrupting anyone
 * over. The only loud outcome is a successful one.
 */

export type UpdateStatus =
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; version: string; notes: string | null; update: Update }
  | { kind: "unreachable"; reason: string };

/** Injectable so tests don't need a Tauri host. */
export type CheckFn = typeof check;

export async function checkForUpdate(checkFn: CheckFn = check): Promise<UpdateStatus> {
  try {
    const update = await checkFn();
    if (!update) return { kind: "up-to-date" };
    return {
      kind: "available",
      version: update.version,
      notes: update.body?.trim() ? update.body.trim() : null,
      update,
    };
  } catch (err) {
    return { kind: "unreachable", reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Downloads, installs, and restarts into the new build.
 *
 * The relaunch is deliberate rather than optional: on Windows the
 * installer replaces files the running process is holding, so carrying
 * on in the old process afterwards is a state nobody should be left in.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (downloaded: number, total: number | null) => void,
  relaunchFn: () => Promise<void> = relaunch,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      onProgress?.(0, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    } else if (event.event === "Finished") {
      onProgress?.(total ?? downloaded, total);
    }
  });

  await relaunchFn();
}
