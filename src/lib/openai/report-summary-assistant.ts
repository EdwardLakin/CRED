import { AI_REPORT_DRAFT_MODEL } from "@/lib/openai/report-draft-generator";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_SUMMARY_LENGTH = 1200;
const PROFESSIONAL_SUMMARY_WORD_RANGE = "90–130 words";
const UNSUPPORTED_PROCESS_PATTERNS = [
  /\b(?:technician notes?|supporting photographic evidence|photographic evidence provided|evidence provided|based on .*evidence|source material|provided in the report)\b/i,
  /\b(?:observations are based on|findings are based on)\b/i,
] as const;

const UNSUPPORTED_ACTION_TERMS = [
  "recommend",
  "recommended",
  "repair",
  "replacement",
  "remediate",
  "remediation",
  "required",
  "requires",
  "severe",
  "severity",
  "urgent",
  "hazard",
  "liability",
] as const;

export type SummaryStyle = "concise" | "professional" | "detailed";

export type SummaryAssistantEvidence = {
  title: string | null;
  body: string | null;
  status?: string | null;
  source_capture_ids?: string[] | null;
};

export type SummaryAssistantCaptureEvidence = {
  source: "included_capture_item";
  capture_id: string;
  observation_group_id?: string | null;
  group_order?: number | null;
  title?: string | null;
  technician_note?: string | null;
  transcript?: string | null;
  caption?: string | null;
  evidence_category?: string | null;
  media_kind?: string | null;
  captured_at?: string | null;
};

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractOutputText(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (typeof body.output_text === "string") return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (isRecord(part) && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function sanitizeSummary(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actionTermPattern(term: string) {
  if (term === "recommend") return /\brecommend(?:s|ing|ation|ations)?\b/i;
  if (term === "repair") return /\brepairs?\b/i;
  if (term === "remediate") return /\bremediat(?:e|es|ed|ing)\b/i;
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
}

function sourceContainsActionTerm(sourceText: string, term: string) {
  return actionTermPattern(term).test(sourceText);
}

function getUnsupportedActionTerms(summary: string, sourceText: string) {
  return UNSUPPORTED_ACTION_TERMS.filter(
    (term) =>
      actionTermPattern(term).test(summary) &&
      !sourceContainsActionTerm(sourceText, term),
  );
}

function removeUnsupportedProcessLanguage(summary: string) {
  const sentences = sanitizeSummary(summary)
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim()) ?? [summary];
  return sanitizeSummary(
    sentences
      .filter((sentence) => !UNSUPPORTED_PROCESS_PATTERNS.some((pattern) => pattern.test(sentence)))
      .join(" "),
  );
}

function removeUnsupportedActionLanguage(summary: string, sourceText: string) {
  const unsupportedTerms = getUnsupportedActionTerms(summary, sourceText);
  if (!unsupportedTerms.length) return removeUnsupportedProcessLanguage(summary);

  const unsafePatterns = unsupportedTerms.map(actionTermPattern);
  const sentences = summary
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim()) ?? [summary];
  const safeSentences = sentences.filter(
    (sentence) => !unsafePatterns.some((pattern) => pattern.test(sentence)),
  );
  return removeUnsupportedProcessLanguage(safeSentences.join(" "));
}

function pushText(target: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) target.push(value.trim());
}

function collectStringValues(value: unknown, target: string[]) {
  if (typeof value === "string") {
    pushText(target, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, target));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach((item) => collectStringValues(item, target));
}

function getSummarySourceText(input: {
  reportContext?: Record<string, unknown> | null;
  captures?: SummaryAssistantCaptureEvidence[];
  evidenceGroups?: unknown;
  evidence?: SummaryAssistantEvidence[];
}) {
  const parts: string[] = [];
  for (const capture of input.captures ?? []) {
    pushText(parts, capture.title);
    pushText(parts, capture.technician_note);
    pushText(parts, capture.transcript);
  }
  collectStringValues(input.evidenceGroups ?? null, parts);
  for (const item of input.evidence ?? []) {
    pushText(parts, item.title);
    pushText(parts, item.body);
  }
  return parts.join(" ");
}

function uniquePhrases(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPhraseList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function getLocationHint(reportContext?: Record<string, unknown> | null) {
  const candidates: string[] = [];
  collectStringValues(reportContext?.header_fields ?? null, candidates);
  collectStringValues(reportContext ?? null, candidates);
  return (
    candidates.find((value) =>
      /\b(?:located at|\d+\s+[A-Za-z].*(?:close|street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|se|sw|ne|nw))\b/i.test(
        value,
      ),
    ) ?? null
  );
}

function normalizeSummaryStyle(value: unknown): SummaryStyle {
  return value === "concise" || value === "detailed" ? value : "professional";
}

const OVER_SPECIFIC_COMPONENT_TERMS = [
  "linoleum",
  "carpet",
  "fireplace",
  "stove",
  "humidifier",
  "bedroom",
  "bathroom",
  "kitchen",
  "basement",
  "ceiling",
  "door",
] as const;

const ALLOWED_THEME_FALLBACK = "documentation of existing conditions";
const ALLOWED_THEMES = [
  "flooring deterioration",
  "moisture-related conditions",
  "interior finish wear",
  "cosmetic wear",
  "equipment or fixture deficiencies",
  "plumbing concerns",
  "electrical deficiencies",
  "exterior maintenance concerns",
  ALLOWED_THEME_FALLBACK,
] as const;

type SummaryInputs = {
  propertyType: string;
  themes: string[];
  overallCondition: string;
};

function normalizeTheme(value: unknown) {
  const text = sanitizeSummary(value).toLowerCase();
  if (!text) return null;
  if (/linoleum|carpet|floor|flooring|vinyl|tile|hardwood|basement floor/.test(text)) return "flooring deterioration";
  if (/moisture|water|leak|intrusion|stain|bathroom ceiling|kitchen ceiling|basement|mold|mould|mildew/.test(text)) return "moisture-related conditions";
  if (/ceiling|wall|drywall|paint|finish|trim|cabinet|counter|aging interior/.test(text)) return "interior finish wear";
  if (/cosmetic|wear|scuff|scratch|mark|stain/.test(text)) return "cosmetic wear";
  if (/fireplace|humidifier|stove|fixture|equipment|appliance|oven|dishwasher|furnace|hvac|heater|mechanical/.test(text)) return "equipment or fixture deficiencies";
  if (/plumbing|pipe|drain|faucet|toilet|sink/.test(text)) return "plumbing concerns";
  if (/electrical|outlet|switch|breaker|wiring|light/.test(text)) return "electrical deficiencies";
  if (/exterior|roof|gutter|siding|deck|porch|yard|driveway/.test(text)) return "exterior maintenance concerns";
  return ALLOWED_THEMES.includes(text as (typeof ALLOWED_THEMES)[number]) ? text : null;
}

function normalizeThemes(values: unknown[]) {
  const normalized = uniquePhrases(
    values
      .map((value) => normalizeTheme(value))
      .filter((value): value is string => Boolean(value)),
  );
  return (normalized.length ? normalized : [ALLOWED_THEME_FALLBACK]).slice(0, 4);
}

function getThemePhrases(input: { captures?: SummaryAssistantCaptureEvidence[]; evidence: SummaryAssistantEvidence[] }) {
  const raw = [
    ...(input.captures ?? []).flatMap((capture) => [capture.evidence_category, capture.title, capture.technician_note, capture.transcript, capture.caption]),
    ...input.evidence.flatMap((item) => [item.title, item.body]),
  ];
  return normalizeThemes(raw);
}

function normalizePropertyType(value: unknown, sessionTitle: string | null) {
  const text = sanitizeSummary(value).replace(/^(?:the|a|an)\s+/i, "");
  if (/rental/i.test(text) || /rental/i.test(sessionTitle ?? "")) return "Rental property";
  if (/commercial/i.test(text) || /commercial/i.test(sessionTitle ?? "")) return "Commercial property";
  if (/residential|home|house/i.test(text) || /residential|home|house/i.test(sessionTitle ?? "")) return "Residential property";
  if (/property|building|unit|suite/i.test(text)) return text.slice(0, 80);
  return "property";
}

function normalizeOverallCondition(value: unknown, themes: string[]) {
  const text = sanitizeSummary(value).toLowerCase();
  if (text && !hasOverSpecificComponentLanguage(text) && !/repair|replace|recommend|severe|urgent|hazard|liability/.test(text)) {
    return text.slice(0, 140);
  }
  if (themes.includes("moisture-related conditions") && themes.includes("flooring deterioration")) {
    return "localized interior condition concerns";
  }
  if (themes.includes(ALLOWED_THEME_FALLBACK)) return "documented existing conditions";
  return "condition concerns within the documented scope";
}

function countOverSpecificTerms(value: string) {
  return OVER_SPECIFIC_COMPONENT_TERMS.filter((term) => new RegExp(`\\b${escapeRegExp(term)}s?\\b`, "i").test(value)).length;
}

function hasOverSpecificComponentLanguage(value: string) {
  return countOverSpecificTerms(value) > 0;
}

function deterministicEvidenceOnlySummary(input: {
  sessionTitle: string | null;
  reportContext?: Record<string, unknown> | null;
  captures?: SummaryAssistantCaptureEvidence[];
  evidence: SummaryAssistantEvidence[];
  style?: SummaryStyle;
  summaryInputs?: Partial<SummaryInputs> | null;
}) {
  const themes = normalizeThemes([
    ...(input.summaryInputs?.themes ?? []),
    ...getThemePhrases(input),
  ]).slice(0, 4);
  const propertyType = normalizePropertyType(input.summaryInputs?.propertyType, input.sessionTitle);
  const location = sanitizeSummary(getLocationHint(input.reportContext) ?? input.reportContext?.location) || "the documented location";
  const overallCondition = normalizeOverallCondition(input.summaryInputs?.overallCondition, themes);
  const summary = `This report summarizes the documented condition of the ${propertyType} located at ${location}. The inspection identified documented conditions primarily related to ${formatPhraseList(themes)}. Overall, the documentation reflects ${overallCondition}. Detailed observations and supporting photographic evidence are provided in the following sections.`;
  if (countOverSpecificTerms(summary) > 1) {
    return `This report summarizes the documented condition of the property located at ${location}. The inspection identified documented conditions primarily related to ${formatPhraseList(themes)}. Overall, the documentation reflects ${overallCondition}. Detailed observations and supporting photographic evidence are provided in the following sections.`;
  }
  return sanitizeSummary(summary);
}

async function requestSummaryAssistant(systemPrompt: string, userText: string) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_REPORT_DRAFT_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        { role: "user", content: [{ type: "input_text", text: userText }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "report_summary_assistant",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { summary: { type: "string" } },
            required: ["summary"],
          },
        },
      },
      max_output_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === "string"
        ? body.error.message
        : `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const outputText = extractOutputText(await response.json());
  if (!outputText)
    throw new Error("AI summary assistant returned an empty response.");
  const parsed = JSON.parse(outputText) as unknown;
  const summary = sanitizeSummary(isRecord(parsed) ? parsed.summary : null);
  if (!summary)
    throw new Error("AI summary assistant returned an empty summary.");
  return summary;
}


async function requestSummaryInputs(systemPrompt: string, userText: string): Promise<Partial<SummaryInputs>> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_REPORT_DRAFT_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userText }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "report_summary_inputs",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              propertyType: { type: "string" },
              themes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
              overallCondition: { type: "string" },
            },
            required: ["propertyType", "themes", "overallCondition"],
          },
        },
      },
      max_output_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      isRecord(body) &&
      isRecord(body.error) &&
      typeof body.error.message === "string"
        ? body.error.message
        : `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const outputText = extractOutputText(await response.json());
  if (!outputText) throw new Error("AI summary assistant returned empty summary inputs.");
  const parsed = JSON.parse(outputText) as unknown;
  if (!isRecord(parsed)) throw new Error("AI summary assistant returned invalid summary inputs.");
  return {
    propertyType: typeof parsed.propertyType === "string" ? parsed.propertyType : undefined,
    themes: Array.isArray(parsed.themes) ? parsed.themes.filter((theme): theme is string => typeof theme === "string") : undefined,
    overallCondition: typeof parsed.overallCondition === "string" ? parsed.overallCondition : undefined,
  };
}

export async function improveReportSummaryWriting(summary: string) {
  const currentSummary = sanitizeSummary(summary);
  if (!currentSummary)
    throw new Error("Enter a summary before improving writing.");
  const improved = await requestSummaryAssistant(
    `You improve a CRED report Executive Summary so it reads like the opening paragraph of a professional property inspection, commercial engineering, insurance documentation, or forensic investigation report. Return JSON only. The Executive Summary must prepare the customer for the documented observations, not compress every individual finding. Write one paragraph, ${PROFESSIONAL_SUMMARY_WORD_RANGE}. Answer only these four questions when the current text supports them: what was inspected; the primary broad themes; the overall condition those themes suggest; and where the reader can find the details. Think like an editor: determine the report type, the collective story, and the overall documented condition before writing. Reorganize and consolidate factual content into broad themes such as flooring deterioration, moisture intrusion, aging finishes, cosmetic wear, mechanical deficiencies, documentation of existing conditions, exterior damage, or electrical deficiencies. Do not mention every finding. Only mention a specific component when the entire summary is about that component. Do not use phrases such as "Key findings include", "Notable observations include", "Additionally", "Further observations include", "The inspection identified", "The report found", or "The technician observed". Do not add findings, recommendations, severity, urgency, causes, liability language, repair instructions, replacement instructions, remediation language, dates, names, numbers, measurements, IDs, VINs, codes, or technical values. Avoid individual component lists; consolidate component-heavy language into broad themes. Do not remove factual qualifiers or source limitations. Words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, and liability may appear only when already present in the current summary.`,
    `Improve this executive summary by reorganizing and consolidating the existing factual content without adding action language:
${currentSummary}`,
  );
  const cleaned = removeUnsupportedActionLanguage(improved, currentSummary);
  if (countOverSpecificTerms(cleaned) > 1) {
    return deterministicEvidenceOnlySummary({
      sessionTitle: null,
      evidence: [{ title: null, body: currentSummary }],
      summaryInputs: { themes: getThemePhrases({ evidence: [{ title: null, body: currentSummary }] }) },
    });
  }
  return cleaned || currentSummary;
}

export async function regenerateReportSummaryFromEvidence(input: {
  sessionTitle: string | null;
  style?: SummaryStyle;
  reportContext?: Record<string, unknown> | null;
  captures?: SummaryAssistantCaptureEvidence[];
  evidenceGroups?: unknown;
  evidence: SummaryAssistantEvidence[];
}) {
  const captures = (input.captures ?? [])
    .filter(
      (item) =>
        item.caption?.trim() ||
        item.technician_note?.trim() ||
        item.transcript?.trim() ||
        item.title?.trim(),
    )
    .slice(0, 80);
  const evidence = input.evidence
    .filter((item) => item.body?.trim() || item.title?.trim())
    .slice(0, 40)
    .map((item) => ({
      title: item.title,
      body: item.body,
      status: item.status,
      source_capture_ids: item.source_capture_ids ?? [],
    }));

  if (!captures.length && !evidence.length)
    throw new Error(
      "No documented observations are available for summary regeneration.",
    );

  const sourceText = getSummarySourceText({
    reportContext: input.reportContext,
    captures,
    evidenceGroups: input.evidenceGroups,
    evidence,
  });
  const fallbackSummary = removeUnsupportedActionLanguage(
    deterministicEvidenceOnlySummary({
      sessionTitle: input.sessionTitle,
      reportContext: input.reportContext,
      captures,
      evidence,
      style: normalizeSummaryStyle(input.style),
    }),
    sourceText,
  );

  const summaryInputs = await requestSummaryInputs(
    `Extract structured inputs for a CRED Executive Summary. Return structured JSON only; do not write the final paragraph. Classify the evidence into broad customer-facing categories only. Allowed theme examples include: flooring deterioration, moisture-related conditions, interior finish wear, cosmetic wear, equipment or fixture deficiencies, plumbing concerns, electrical deficiencies, exterior maintenance concerns, and documentation of existing conditions. Map specific components into broad themes: linoleum and carpet map to flooring deterioration; fireplace, humidifier, and stove map to equipment or fixture deficiencies; bathroom ceiling, kitchen ceiling, and basement floor map to moisture-related conditions, interior finish wear, or flooring deterioration as supported. Do not return room names or individual component names as themes unless the whole report is specifically room-focused. Do not include observation counts, repairs, replacement, recommendations, severity, urgency, hazard, liability language, or unsupported facts.`,
    `Report title: ${input.sessionTitle ?? "Untitled report"}
Report context JSON:
${JSON.stringify(input.reportContext ?? {})}
Included capture items JSON:
${JSON.stringify(captures).slice(0, 22000)}
Grouped observation data JSON:
${JSON.stringify(input.evidenceGroups ?? null).slice(0, 6000)}
Report sections JSON (secondary source; ignore blank/informational sections that conflict with included captures):
${JSON.stringify(evidence).slice(0, 12000)}`,
  );

  const rendered = deterministicEvidenceOnlySummary({
    sessionTitle: input.sessionTitle,
    reportContext: input.reportContext,
    captures,
    evidence,
    style: normalizeSummaryStyle(input.style),
    summaryInputs,
  });
  return removeUnsupportedActionLanguage(rendered, sourceText) || fallbackSummary;

}
