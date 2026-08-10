import { invoke } from "@tauri-apps/api/core";

export interface UpscalerStatus {
  installed: boolean;
  /** Where the binary was looked for, so a "not installed" message can say where to put it. */
  expectedPath: string;
}

export type UpscaleFactor = 2 | 4;

/**
 * Local image upscaling via Real-ESRGAN's portable ncnn-vulkan build,
 * run CPU-only (see `src-tauri/src/upscale.rs` for why). Same shape as
 * the other local-tool clients: injectable, and fails soft on the
 * status check so a missing binary reads as "not installed yet" rather
 * than an error.
 */
export interface UpscaleClient {
  status(): Promise<UpscalerStatus>;
  upscale(inputPath: string, outputPath: string, scale: UpscaleFactor): Promise<string>;
}

export function createTauriUpscaleClient(): UpscaleClient {
  return {
    async status() {
      try {
        const raw = await invoke<{ installed: boolean; expected_path: string }>("upscaler_status");
        return { installed: raw.installed, expectedPath: raw.expected_path };
      } catch {
        return { installed: false, expectedPath: "" };
      }
    },
    upscale(inputPath, outputPath, scale) {
      return invoke<string>("upscale_image", { inputPath, outputPath, scale });
    },
  };
}
