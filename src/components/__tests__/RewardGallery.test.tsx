import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RewardGallery } from "../RewardGallery";
import { ProgressCompartment } from "../compartments/ProgressCompartment";
import { StoreProvider, useGamificationStore } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({ installed: false, expected_path: "D:\\fake\\path.exe" }),
}));

let repos: Repositories;

/** Loads real gamification stats, the way the app does on mount. */
function LoadGamification() {
  const load = useGamificationStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return null;
}

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function renderGallery(onClose = vi.fn()) {
  render(
    <StoreProvider repositories={repos}>
      <RewardGallery onClose={onClose} />
    </StoreProvider>,
  );
  return { onClose, user: userEvent.setup() };
}

describe("RewardGallery", () => {
  it("says plainly when nothing has been earned yet", async () => {
    renderGallery();
    expect(await screen.findByText(/Nothing earned yet/)).toBeInTheDocument();
  });

  it("shows earned badge art once stats confirm a level has been reached", async () => {
    render(
      <StoreProvider repositories={repos}>
        <LoadGamification />
        <RewardGallery onClose={vi.fn()} />
      </StoreProvider>,
    );

    // Level-1 art is in the pool, so at least one thumbnail renders once
    // the real level is known.
    const images = await screen.findAllByRole("img");
    expect(images.length).toBeGreaterThan(0);
  });

  it("Exit closes the gallery", async () => {
    const { onClose, user } = renderGallery();
    await user.click(await screen.findByRole("button", { name: "Exit" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the gallery when no artwork is open", async () => {
    const { onClose, user } = renderGallery();
    await screen.findByText(/Nothing earned yet/);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opening a piece shows the three actions, with upscale disabled while the tool is missing", async () => {
    const user = userEvent.setup();
    render(
      <StoreProvider repositories={repos}>
        <LoadGamification />
        <RewardGallery onClose={vi.fn()} />
      </StoreProvider>,
    );

    const thumbnails = await screen.findAllByRole("button", { name: /Level/ });
    await user.click(thumbnails[0]);

    expect(await screen.findByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Animate" })).toBeInTheDocument();
    // Real-ESRGAN isn't installed in this environment, so the button
    // has to be visibly unavailable rather than failing on click.
    expect(await screen.findByRole("button", { name: "Upscale" })).toBeDisabled();
  });
});

describe("ProgressCompartment — Gallery entry point", () => {
  it("hides the Gallery button entirely in pocket mode", async () => {
    render(
      <StoreProvider repositories={repos}>
        <ProgressCompartment />
      </StoreProvider>,
    );

    await screen.findByText("Progress");
    expect(screen.queryByRole("button", { name: "Gallery" })).not.toBeInTheDocument();
  });

  it("shows it in zen mode, where there's room for a grid of artwork", async () => {
    const onOpenGallery = vi.fn();
    render(
      <StoreProvider repositories={repos}>
        <ProgressCompartment onOpenGallery={onOpenGallery} />
      </StoreProvider>,
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: "Gallery" }));
    expect(onOpenGallery).toHaveBeenCalledTimes(1);
  });
});
