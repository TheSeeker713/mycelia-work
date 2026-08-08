import { useEffect, useRef } from "react";
import { useGamificationStore } from "../store/StoreProvider";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import type { AchievementToastItem } from "../store/gamificationStore";

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

  return (
    <div
      role="status"
      className="rounded-[10px] border p-2.5 text-[0.8rem] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)]"
      style={{ background: "var(--moss-pale)", borderColor: "var(--moss)", color: "var(--moss-deep)" }}
    >
      <div className="text-[0.68rem] tracking-wide uppercase opacity-80">
        {KIND_LABEL[toast.kind]}
      </div>
      <div className="font-medium">{toast.label}</div>
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
