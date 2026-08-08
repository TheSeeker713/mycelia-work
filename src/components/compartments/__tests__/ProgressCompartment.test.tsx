import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProgressCompartment } from "../ProgressCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import { LEVEL_CAP } from "../../../services/gamification";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function renderProgress() {
  return render(
    <StoreProvider repositories={repos}>
      <ProgressCompartment />
    </StoreProvider>,
  );
}

describe("ProgressCompartment", () => {
  it("shows level 1 and 0 XP for a fresh, never-played profile", async () => {
    renderProgress();
    expect(await screen.findByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("0 XP total")).toBeInTheDocument();
    expect(screen.getByText("Badges (0/25)")).toBeInTheDocument();
    expect(screen.getByText("None earned yet.")).toBeInTheDocument();
  });

  it("shows the level cap message once level 111 is reached", async () => {
    await repos.gamification.updateStats({ total_xp: 200_000, level: LEVEL_CAP });
    renderProgress();

    expect(await screen.findByText(`Level ${LEVEL_CAP} reached — the journey's complete.`)).toBeInTheDocument();
  });

  it("shows unlocked badges highlighted and reflected in the count", async () => {
    await repos.gamification.updateStats({ total_xp: 100, level: 2 });
    await repos.gamification.unlockAchievement("badge_level_1", "badge");
    await repos.gamification.unlockAchievement("badge_level_2", "badge");
    renderProgress();

    expect(await screen.findByText("Badges (2/25)")).toBeInTheDocument();
  });

  it("lists earned stickers, with a repeat count for repeatable ones", async () => {
    await repos.gamification.logXpEvent("project_finished", 40, "sticker_project_finished");
    await repos.gamification.logXpEvent("project_finished", 40, "sticker_project_finished");
    renderProgress();

    expect(await screen.findByText("Project Finished")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("the disclosure explanation is collapsed by default and expands on click", async () => {
    const user = userEvent.setup();
    renderProgress();
    await screen.findByText("Level 1");

    expect(screen.queryByText(/Nothing here ever takes XP away/)).not.toBeInTheDocument();

    await user.click(screen.getByText("How XP & rewards work"));
    expect(screen.getByText(/Nothing here ever takes XP away/)).toBeInTheDocument();

    await user.click(screen.getByText("Hide"));
    expect(screen.queryByText(/Nothing here ever takes XP away/)).not.toBeInTheDocument();
  });
});
