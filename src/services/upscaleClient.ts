import { invoke } from "@tauri-apps/api/core";

export interface UpscalerStatus {
  installed: boolean;
  /** Where the binary was looked for, so a "not installed" message can say where to put it. */
  expectedPath: string;
}

export type UpscaleFactor = 2 | 4;

/**
 * Local image upscaling via Real-ESRGAN's portable ncnn-vulkan build.
 * Same shape as the other local-tool clients: injectable, and fails
 * soft on the status check so a missing binary reads as "not installed
 * yet" rather than an error.
 *
 * Images go across as bytes rather than a path. The reward art is
 * bundled by Vite, so at runtime it's a webview URL with nothing on
 * disk behind it, and the first version of this passed that URL
 * straight to a subprocess that could only ever have rejected it.
 */
export interface UpscaleClient {
  status(): Promise<UpscalerStatus>;
  /** Resolves to the path the upscaled file was written to. */
  upscale(args: {
    imageBase64: string;
    fileStem: string;
    sourceExt: string;
    scale: UpscaleFactor;
  }): Promise<string>;
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
    upscale({ imageBase64, fileStem, sourceExt, scale }) {
      return invoke<string>("upscale_image", { imageBase64, fileStem, sourceExt, scale });
    },
  };
}
