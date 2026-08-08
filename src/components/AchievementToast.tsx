import { useEffect, useRef, useState } from "react";
import { useGamificationStore } from "../store/StoreProvider";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import type { AchievementToastItem } from "../store/gamificationStore";
import {
  BADGE_IMAGE_POOL_BY_LEVEL,
  STICKER_IMAGE_POOL_BY_KEY,
  pickPoolImage,
} from "../services/gamificationAssets";

/** Rolls a random image from the achievement's pool — this is the actual "rotating reward, never the same twice" moment, so it's picked fresh per toast rather than reading a fixed canonical image. */
function rollImage(toast: AchievementToastItem): string | undefined {
  if (toast.kind === "badge") {
    const level = Number(toast.key.replace("badge_level_", ""));
    return pickPoolImage(BADGE_IMAGE_POOL_BY_LEVEL[level]);
  }
  return pickPoolImage(STICKER_IMAGE_POOL_BY_KEY[toast.key]);
}

/** Matches ShortIdleToast's "auto-dismiss after a few seconds" language, per the plan's "~4-5 seconds, then fades" spec. */
const AUTO_DISMISS_MS = 4500;

const KIND_LABEL: Record<AchievementToastItem["kind"], string> = {
  badge: "Badge unlocked",
  sticker: "Sticker earned",
  welcome_back: "Welcome back",
};

function Toast({ toast, onDismiss }: { toast: AchievementToastItem; onDismiss: (id: string) => void }) {
  const selfVoicing = useSelfVoicing();
  const spoken = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  useEffect(() => {
    if (toast.voiceLine && !spoken.current) {
      spoken.current = true;
      selfVoicing.speak(toast.voiceLine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  // Rolled once when this toast first mounts, then stable — re-rolling on
  // every re-render would make the pop-up's art flicker between variants.
  const [imageUrl] = useState(() => rollImage(toast));

  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-[10px] border p-2.5 text-[0.8rem] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)]"
      style={{ background: "var(--moss-pale)", borderColor: "var(--moss)", color: "var(--moss-deep)" }}
    >
      {imageUrl && (
        <img src={imageUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
      )}
      <div>
        <div className="text-[0.68rem] tracking-wide uppercase opacity-80">
          {KIND_LABEL[toast.kind]}
        </div>
        <div className="font-medium">{toast.label}</div>
      </div>
    </div>
  );
}

/** No-hidden-gate, ordinary feature — fires from any real action (Dashboard, both pocket and full-screen) whenever gamificationStore queues a badge/sticker/welcome-back toast. */
export function AchievementToastStack() {
  const toasts = useGamificationStore((s) => s.pendingToasts);
  const dismissToast = useGamificationStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="absolute top-3 right-9 left-3 z-20 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
