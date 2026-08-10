import type { AiBackendId } from "../data";

const BACKEND_LABEL: Record<AiBackendId, string> = {
  openclaw: "OpenClaw",
  ollama: "Ollama",
};

/** `xai/grok-4.5` reads better as `Grok 4.5`, and `ollama/hermes3:8b` as `hermes3:8b`. */
function friendlyModel(modelUsed: string): string {
  const [providerOrName, ...rest] = modelUsed.split("/");
  const bare = rest.length > 0 ? rest.join("/") : providerOrName;
  if (/^grok/i.test(bare)) return bare.replace(/^grok-?/i, "Grok ");
  return bare;
}

/**
 * Says which model actually answered. `model_used` has been recorded
 * since Phase 6 and shown nowhere, which is exactly how a request could
 * silently land on a local fallback instead of the cloud model and just
 * look slow rather than look wrong.
 *
 * Renders nothing when there's no model recorded — a manual report, or
 * a row written before any of this existed.
 */
export function ModelBadge({
  modelUsed,
  backendUsed,
  usedFallback = false,
}: {
  modelUsed: string | null;
  backendUsed?: AiBackendId | null;
  usedFallback?: boolean;
}) {
  if (!modelUsed) return null;

  const backend = backendUsed ? BACKEND_LABEL[backendUsed] : null;
  const title = backend ? `Answered by ${friendlyModel(modelUsed)} via ${backend}` : `Answered by ${friendlyModel(modelUsed)}`;

  return (
    <span
      title={usedFallback ? `${title} (fallback, not your preferred model)` : title}
      className={
        "rounded-full px-1.5 py-0.5 text-[0.6rem] " +
        (usedFallback ? "border border-dashed" : "border border-transparent")
      }
      style={
        usedFallback
          ? { borderColor: "var(--amber)", color: "var(--amber)", background: "var(--amber-pale)" }
          : { color: "var(--ink-faint)", background: "var(--line-soft)" }
      }
    >
      {friendlyModel(modelUsed)}
      {backend && <span className="opacity-70"> · {backend}</span>}
    </span>
  );
}
