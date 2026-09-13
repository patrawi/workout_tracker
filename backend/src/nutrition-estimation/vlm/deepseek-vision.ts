// DeepSeek Vision adapter for Nutrition Estimation V1 (ADR 0025) behind a
// provider-neutral `interpret` contract (design spec §2, ADR 0017).
//
// The VLM is an evidence proposer, NOT a calculator: it never performs nutrition
// arithmetic. The adapter strips/rejects any macronutrient-like fields the model
// may emit, drops low-confidence fields (anti-anchoring), and validates weight
// ranges and consumed fractions. Failure states (no_food / unreadable /
// transport errors) are returned as outcomes, never thrown.
//
// DeepSeek API notes (2026-09): images are accepted only in USER messages as
// image_url data-URL parts of the OpenAI-compatible chat format; JSON output is
// requested via response_format { type: "json_object" }.
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_VISION_MODEL,
  DEEPSEEK_TEMPERATURE,
} from "../../constants";
import {
  CONFIDENCE_LEVELS,
  COMPONENT_KINDS,
  HINT_KINDS,
  HINT_LEVELS,
  type ConfidenceLevel,
  type ComponentKind,
  type LatentHint,
  type MassRange,
} from "../types";

export interface VlmComponent {
  name: string;
  kind: ComponentKind;
  weight_g: MassRange;
  /** Per-field confidence (spec §2). A low-confidence weight drops the component. */
  weight_confidence?: ConfidenceLevel;
  consumed_fraction?: number;
  /** A low-confidence consumed_fraction drops just the fraction, not the component. */
  consumed_fraction_confidence?: ConfidenceLevel;
  component_confidence: ConfidenceLevel;
  latent_hints?: LatentHint[];
}

export interface VlmProposal {
  dish_name: string;
  dish_name_confidence: ConfidenceLevel;
  components: VlmComponent[];
}

export type InterpretOutcome =
  | { status: "ok"; proposal: VlmProposal }
  | { status: "failed"; reason: "no_food" | "unreadable" }
  | { status: "unavailable" };

export interface InterpretInput {
  menuName: string;
  beforeImageBase64?: string;
  afterImageBase64?: string;
}

export interface DeepSeekVisionInterpreter {
  interpret(input: InterpretInput): Promise<InterpretOutcome>;
}

/** Macronutrient-like field names the VLM must never output (ADR 0017). */
const FORBIDDEN_MACRO_FIELDS = new Set([
  "protein",
  "carbs",
  "fat",
  "alcohol",
  "calories",
  "per100",
  "macros",
  "nutrition",
  "nutrients",
  "kcal",
]);

const SYSTEM_PROMPT = `You are a meal photo evidence proposer for a nutrition estimation app. You propose coarse structure ONLY — you NEVER calculate or output nutrition values (no protein, carbs, fat, calories), never rank reference candidates, and never alter measured facts.

Return ONLY a JSON object, no prose, in exactly this contract:
{
  "dish_name": string,                    // ONE suggestion for the dish name
  "dish_name_confidence": "high" | "medium" | "low",
  "components": [
    {
      "name": string,                     // coarse observable part (e.g. rice, curry, broth)
      "kind": "rice" | "main" | "side" | "broth" | "other",
      "weight_g": { "low": number, "central": number, "high": number },  // grams, 0 < low <= central <= high
      "weight_confidence": "high" | "medium" | "low",   // confidence in weight_g, evaluated per field
      "consumed_fraction": number,        // ONLY include when an after image was provided; 0 < f <= 1
      "consumed_fraction_confidence": "high" | "medium" | "low",  // ONLY with consumed_fraction
      "component_confidence": "high" | "medium" | "low",
      "latent_hints": [                   // coarse levels only, from what is visible
        { "kind": "visible_oil" | "dryness" | "remaining_broth", "level": "none" | "low" | "medium" | "high" }
      ]
    }
  ]
}

Rules:
- The image contains no food -> return {"status": "no_food"} instead.
- Food is present but portions are unreadable -> return {"status": "unreadable"} instead.
- Never invent nutrition values; component weights are visual estimates in grams only.`;

function dataUrl(base64: string, mime = "image/jpeg"): string {
  return `data:${mime};base64,${base64}`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isConfidence(value: unknown): value is "high" | "medium" | "low" {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function isPositiveRange(value: unknown): value is MassRange {
  if (!value || typeof value !== "object") return false;
  const { low, central, high } = value as Record<string, unknown>;
  return (
    typeof low === "number" && Number.isFinite(low) &&
    typeof central === "number" && Number.isFinite(central) &&
    typeof high === "number" && Number.isFinite(high) &&
    low > 0 && low <= central && central <= high
  );
}

/** Strip any macronutrient-like fields (recursively) — ADR 0017 guard. */
function stripMacroFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMacroFields);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_MACRO_FIELDS.has(key.toLowerCase())) continue;
      out[key] = stripMacroFields(v);
    }
    return out;
  }
  return value;
}

function parseLatentHints(raw: unknown): LatentHint[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const hints: LatentHint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kind = rec["kind"];
    const level = rec["level"];
    if (typeof kind !== "string" || !(HINT_KINDS as readonly string[]).includes(kind)) continue;
    if (typeof level !== "string" || !(HINT_LEVELS as readonly string[]).includes(level)) continue;
    // Low-confidence hints are dropped too (anti-anchoring).
    if ("confidence" in rec && rec["confidence"] === "low") continue;
    hints.push({ kind: kind as LatentHint["kind"], level: level as LatentHint["level"] });
  }
  return hints.length > 0 ? hints : undefined;
}

function parseComponents(raw: unknown, hasAfterImage: boolean): VlmComponent[] {
  if (!Array.isArray(raw)) return [];
  const components: VlmComponent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec["name"] === "string" ? rec["name"].trim() : "";
    const kind = rec["kind"];
    // Low-confidence components are DROPPED from the proposal (hidden from the
    // user so they fill the field manually without anchoring — ADR 0017).
    if (rec["component_confidence"] === "low") continue;
    if (!name || !isConfidence(rec["component_confidence"])) continue;
    if (typeof kind !== "string" || !COMPONENT_KINDS.includes(kind as ComponentKind)) continue;
    if (!isPositiveRange(rec["weight_g"])) continue;
    const weightConfidence = isConfidence(rec["weight_confidence"])
      ? rec["weight_confidence"]
      : undefined;
    // Weight is the required portion evidence: a low-confidence weight drops
    // the whole component (spec §2 per-field confidence, ADR 0017).
    if (weightConfidence === "low") continue;

    let consumedFraction: number | undefined;
    let fractionConfidence: ConfidenceLevel | undefined;
    if (hasAfterImage && typeof rec["consumed_fraction"] === "number") {
      const f = rec["consumed_fraction"];
      const confidence = isConfidence(rec["consumed_fraction_confidence"])
        ? rec["consumed_fraction_confidence"]
        : undefined;
      // A low-confidence fraction drops just the fraction; the component stays.
      if (Number.isFinite(f) && f > 0 && f <= 1 && confidence !== "low") {
        consumedFraction = f;
        fractionConfidence = confidence;
      }
    }
    // Without an after image the VLM may not propose consumed fractions at all.

    components.push({
      name,
      kind: kind as ComponentKind,
      weight_g: rec["weight_g"] as MassRange,
      ...(weightConfidence !== undefined ? { weight_confidence: weightConfidence } : {}),
      ...(consumedFraction !== undefined ? { consumed_fraction: consumedFraction } : {}),
      ...(fractionConfidence !== undefined
        ? { consumed_fraction_confidence: fractionConfidence }
        : {}),
      component_confidence: rec["component_confidence"] as ConfidenceLevel,
      latent_hints: parseLatentHints(rec["latent_hints"]),
    });
  }
  return components;
}

function parseProposal(json: Record<string, unknown>, hasAfterImage: boolean): VlmProposal | null {
  const dishName = typeof json["dish_name"] === "string" ? json["dish_name"].trim() : "";
  const dishConfidence = json["dish_name_confidence"];
  if (!dishName || !isConfidence(dishConfidence)) return null;
  // Low-confidence dish name is dropped (empty) — the user types it manually.
  const dishNameOut = dishConfidence === "low" ? "" : dishName;
  return {
    dish_name: dishNameOut,
    dish_name_confidence: dishConfidence,
    components: parseComponents(json["components"], hasAfterImage),
  };
}

export function createDeepSeekVisionInterpreter(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): DeepSeekVisionInterpreter {
  const apiKey = options.apiKey?.trim();
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async interpret(input: InterpretInput): Promise<InterpretOutcome> {
      if (!apiKey) {
        return { status: "unavailable" };
      }

      const hasAfterImage = Boolean(input.afterImageBase64);
      const textParts: string[] = [
        `Menu name given by the user: "${input.menuName}".`,
        hasAfterImage
          ? "A before and an after photo are provided; propose consumed_fraction per component."
          : "Only a before photo is provided; do NOT propose consumed_fraction.",
        "Inspect the photo(s) and respond with the JSON contract only.",
      ];

      // Images go ONLY in the user message (DeepSeek vision requirement).
      const userContent: Array<Record<string, unknown>> = [
        { type: "text", text: textParts.join("\n") },
      ];
      if (input.beforeImageBase64) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl(input.beforeImageBase64) } });
      }
      if (input.afterImageBase64) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl(input.afterImageBase64) } });
      }

      let response: Response;
      try {
        response = await doFetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_VISION_MODEL,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            temperature: DEEPSEEK_TEMPERATURE,
            response_format: { type: "json_object" },
          }),
        });
      } catch {
        // Transport failure — the VLM could not be used at all.
        return { status: "unavailable" };
      }

      if (!response.ok) {
        return { status: "unavailable" };
      }

      let payload: { choices?: { message?: { content?: string } }[] };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        return { status: "failed", reason: "unreadable" };
      }
      const content = payload.choices?.[0]?.message?.content ?? "";
      const json = extractJsonObject(content);
      if (!json) {
        return { status: "failed", reason: "unreadable" };
      }

      // Model-signalled failure states.
      const modelStatus = json["status"];
      if (modelStatus === "no_food") return { status: "failed", reason: "no_food" };
      if (modelStatus === "unreadable") return { status: "failed", reason: "unreadable" };

      // Strip any macronutrient-like fields the model emitted despite the ban.
      const cleaned = stripMacroFields(json) as Record<string, unknown>;
      const proposal = parseProposal(cleaned, hasAfterImage);
      if (!proposal) {
        return { status: "failed", reason: "unreadable" };
      }
      return { status: "ok", proposal };
    },
  };
}
