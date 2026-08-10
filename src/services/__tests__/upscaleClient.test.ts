// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createTauriUpscaleClient } from "../upscaleClient";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

describe("upscaleClient", () => {
  it("reports a missing binary as not installed rather than throwing", async () => {
    invokeMock.mockRejectedValueOnce(new Error("command not found"));

    await expect(createTauriUpscaleClient().status()).resolves.toEqual({
      installed: false,
      expectedPath: "",
    });
  });

  it("renames the Rust snake_case status field for the UI", async () => {
    invokeMock.mockResolvedValueOnce({ installed: true, expected_path: "D:\\tool.exe" });

    await expect(createTauriUpscaleClient().status()).resolves.toEqual({
      installed: true,
      expectedPath: "D:\\tool.exe",
    });
  });

  /**
   * The bug this replaced: the gallery handed over a Vite asset URL and
   * Rust tried to open it as a file. Bytes cross the boundary now, and
   * nothing that looks like a path should appear in the payload.
   */
  it("sends image bytes rather than a path", async () => {
    invokeMock.mockResolvedValueOnce("C:\\Users\\me\\Downloads\\Mycelia Time\\Level-10-2x.png");

    const written = await createTauriUpscaleClient().upscale({
      imageBase64: "aGk=",
      fileStem: "Level 10",
      sourceExt: "webp",
      scale: 2,
    });

    expect(written).toContain("Level-10-2x.png");
    expect(invokeMock).toHaveBeenCalledWith("upscale_image", {
      imageBase64: "aGk=",
      fileStem: "Level 10",
      sourceExt: "webp",
      scale: 2,
    });
  });

  it("passes the scale through untouched so Rust can reject a bad one", async () => {
    invokeMock.mockResolvedValueOnce("out.png");

    await createTauriUpscaleClient().upscale({
      imageBase64: "aGk=",
      fileStem: "x",
      sourceExt: "png",
      scale: 4,
    });

    expect(invokeMock.mock.calls[0][1]).toMatchObject({ scale: 4 });
  });
});
