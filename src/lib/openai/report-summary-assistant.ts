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

function normalizeSummaryStyle(value: unknown): SummaryStyle {
  return value === "concise" || value === "detailed" ? value : "professional";
}

const OVER_SPECIFIC_COMPONENT_TERMS = [
  "bedroom",
  "bathroom",
  "kitchen",
  "basement",
  "linoleum",
  "carpet",
  "brake",
  "engine",
  "transmission",
  "dpf",
  "tire",
  "vin",
  "pump",
  "compressor",
  "boiler",
  "furnace",
  "humidifier",
] as const;

const ALLOWED_THEME_FALLBACK = "documentation of existing conditions";
const ALLOWED_THEMES = [
  "condition concerns",
  "operational issues",
  "cosmetic wear",
  "material deterioration",
  "moisture-related observations",
  "mechanical concerns",
  "electrical concerns",
  "fluid/leak-related observations",
  ALLOWED_THEME_FALLBACK,
  "supporting reference material",
  "customer-relevant observations",
  "maintenance-related observations",
  "safety-related observations",
] as const;

type SummaryInputs = {
  reportIntent: string;
  subjectLabel: string;
  primaryThemes: string[];
  overallSummary: string;
};

function normalizeTheme(value: unknown) {
  const text = sanitizeSummary(value).toLowerCase();
  if (!text) return null;
  if (/safety|unsafe|protective|ppe|guard|blocked exit|trip|slip|fall|fire|smoke|alarm/.test(text)) return "safety-related observations";
  if (/leak|fluid|oil|coolant|fuel|hydraulic|water intrusion|moisture|mold|mould|mildew|stain|wet|damp/.test(text)) return "fluid/leak-related observations";
  if (/moisture|water|humidity|condensation/.test(text)) return "moisture-related observations";
  if (/electrical|voltage|outlet|switch|breaker|wiring|light|battery|alternator|circuit|sensor|code/.test(text)) return "electrical concerns";
  if (/mechanical|engine|transmission|brake|bearing|pump|compressor|boiler|furnace|motor|hydraulic|pneumatic|hvac|equipment|machine|vehicle|asset|operat/.test(text)) return "mechanical concerns";
  if (/operate|function|performance|service|diagnostic|fault|failure|intermittent|inoperable|issue|concern/.test(text)) return "operational issues";
  if (/deteriorat|corrosion|rust|rot|crack|delaminat|worn|wear|damage|degrad|aged|aging|floor|surface|material/.test(text)) return "material deterioration";
  if (/cosmetic|scuff|scratch|dent|mark|finish|paint|appearance|stain/.test(text)) return "cosmetic wear";
  if (/maintenance|service interval|cleaning|filter|lubrication|upkeep/.test(text)) return "maintenance-related observations";
  if (/photo|image|caption|reference|supporting|document|evidence|record|existing condition/.test(text)) return ALLOWED_THEME_FALLBACK;
  if (/customer|client|tenant|operator|driver|owner|user/.test(text)) return "customer-relevant observations";
  if (/condition|observation|inspection|review|assessment|finding/.test(text)) return "condition concerns";
  return ALLOWED_THEMES.includes(text as (typeof ALLOWED_THEMES)[number]) ? text : null;
}

function normalizeThemes(values: unknown[]) {
  const normalized = uniquePhrases(
    values
      .map((value) => normalizeTheme(value))
      .filter((value): value is string => Boolean(value))
      .filter((value) => value !== "safety-related observations" || values.some((raw) => /safety|unsafe|hazard|protective|ppe|guard|blocked exit|trip|slip|fall|fire|smoke|alarm/i.test(sanitizeSummary(raw)))),
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

function normalizeReportIntent(value: unknown) {
  const text = sanitizeSummary(value).toLowerCase();
  if (/service visit|field service/.test(text)) return "service visit documentation";
  if (/diagnostic|diagnosis/.test(text)) return "diagnostic documentation";
  if (/insurance|claim/.test(text)) return "insurance documentation";
  if (/restoration/.test(text)) return "restoration documentation";
  if (/safety/.test(text)) return "safety documentation";
  if (/inspection|inspect/.test(text)) return "inspection documentation";
  if (/evidence|document|review|report/.test(text)) return "evidence documentation";
  return "inspection documentation";
}

function normalizeSubjectLabel(value: unknown, sessionTitle: string | null, reportContext?: Record<string, unknown> | null) {
  const source = `${sanitizeSummary(value)} ${sanitizeSummary(sessionTitle)} ${sanitizeSummary(reportContext?.subject)} ${sanitizeSummary(reportContext?.asset)} ${sanitizeSummary(reportContext?.vehicle)} ${sanitizeSummary(reportContext?.equipment)}`.toLowerCase();
  if (/vehicle|truck|trailer|fleet|automotive|vin\b|engine|transmission/.test(source)) return "inspected vehicle";
  if (/equipment|machine|asset|pump|compressor|boiler|generator/.test(source)) return "documented equipment";
  if (/service visit|work order|field service/.test(source)) return "service visit";
  if (/claim|loss|insurance/.test(source)) return "documented claim";
  if (/property|building|unit|site|facility|home|house|rental/.test(source)) return "inspected subject";
  const text = sanitizeSummary(value).replace(/^(?:the|a|an)\s+/i, "").toLowerCase();
  if (text && !hasOverSpecificComponentLanguage(text) && !/property|house|rental/.test(text)) return text.slice(0, 80);
  return "inspected subject";
}

function normalizeOverallSummary(value: unknown, themes: string[]) {
  const text = sanitizeSummary(value).toLowerCase();
  if (text && !hasOverSpecificComponentLanguage(text) && !/repair|replace|recommend|severe|urgent|hazard|liability|requires attention/.test(text)) {
    return text.slice(0, 160);
  }
  if (themes.includes(ALLOWED_THEME_FALLBACK)) return "a factual record of documented conditions at the time of capture";
  return "multiple observed conditions requiring review";
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
    ...(input.summaryInputs?.primaryThemes ?? []),
    ...getThemePhrases(input),
  ]).slice(0, 4);
  const reportIntent = normalizeReportIntent(input.summaryInputs?.reportIntent ?? input.sessionTitle);
  const subjectLabel = normalizeSubjectLabel(input.summaryInputs?.subjectLabel, input.sessionTitle, input.reportContext);
  const overallSummary = normalizeOverallSummary(input.summaryInputs?.overallSummary, themes);
  const openingNoun = reportIntent.includes("service visit") ? "service visit" : subjectLabel;
  const summary = `This report summarizes documented observations for the ${openingNoun}. The documentation primarily relates to ${formatPhraseList(themes)} captured during review. Overall, the report provides ${overallSummary}. Detailed observations and supporting evidence are provided in the following sections.`;
  if (countOverSpecificTerms(summary) > 1) {
    return `This report summarizes documented observations for the inspected subject. The documentation primarily relates to ${formatPhraseList(themes)} captured during review. Overall, the report provides ${overallSummary}. Detailed observations and supporting evidence are provided in the following sections.`;
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
              reportIntent: { type: "string" },
              subjectLabel: { type: "string" },
              primaryThemes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
              overallSummary: { type: "string" },
            },
            required: ["reportIntent", "subjectLabel", "primaryThemes", "overallSummary"],
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
    reportIntent: typeof parsed.reportIntent === "string" ? parsed.reportIntent : undefined,
    subjectLabel: typeof parsed.subjectLabel === "string" ? parsed.subjectLabel : undefined,
    primaryThemes: Array.isArray(parsed.primaryThemes) ? parsed.primaryThemes.filter((theme): theme is string => typeof theme === "string") : undefined,
    overallSummary: typeof parsed.overallSummary === "string" ? parsed.overallSummary : undefined,
  };
}

export async function improveReportSummaryWriting(summary: string) {
  const currentSummary = sanitizeSummary(summary);
  if (!currentSummary)
    throw new Error("Enter a summary before improving writing.");
  const improved = await requestSummaryAssistant(
    `You improve a CRED report Executive Summary so it reads like the opening paragraph of a professional, customer-facing evidence documentation report across any industry. Return JSON only. The Executive Summary must prepare the customer for the documented observations, not compress every individual finding. Write one paragraph, ${PROFESSIONAL_SUMMARY_WORD_RANGE}. Answer only these four questions when the current text supports them: what subject, asset, visit, or evidence set is documented; the primary broad themes; the overall documented condition; and where the reader can find the details. Think like an editor: determine the report type, the collective story, and the overall documented condition before writing, but do not assume property, vehicle, equipment, or any other industry unless the current text clearly says so. Reorganize and consolidate factual content into broad themes such as condition concerns, operational issues, cosmetic wear, material deterioration, moisture-related observations, mechanical concerns, electrical concerns, fluid/leak-related observations, documentation of existing conditions, supporting reference material, customer-relevant observations, and maintenance-related observations. Do not mention every finding. Only mention a specific component when the entire summary is about that component. Do not use phrases such as "Key findings include", "Notable observations include", "Additionally", "Further observations include", "The inspection identified", "The report found", or "The technician observed". Do not add findings, recommendations, severity, urgency, causes, liability language, repair instructions, replacement instructions, remediation language, dates, names, numbers, measurements, IDs, VINs, codes, or technical values. Avoid individual component lists; consolidate component-heavy language into broad themes. Do not remove factual qualifiers or source limitations. Words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, and liability may appear only when already present in the current summary.`,
    `Improve this executive summary by reorganizing and consolidating the existing factual content without adding action language:
${currentSummary}`,
  );
  const cleaned = removeUnsupportedActionLanguage(improved, currentSummary);
  if (countOverSpecificTerms(cleaned) > 1) {
    return deterministicEvidenceOnlySummary({
      sessionTitle: null,
      evidence: [{ title: null, body: currentSummary }],
      summaryInputs: { primaryThemes: getThemePhrases({ evidence: [{ title: null, body: currentSummary }] }) },
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
    `Extract structured inputs for a CRED Executive Summary. Identify report intent, subject label, broad themes, and overall documented condition. Return structured JSON only; do not write the final Executive Summary paragraph. Do not assume industry. Use the report context to infer the domain only when obvious. Classify evidence into broad customer-facing categories only; use broad categories, not individual defects. Allowed theme examples include: condition concerns, operational issues, cosmetic wear, material deterioration, moisture-related observations, mechanical concerns, electrical concerns, fluid/leak-related observations, documentation of existing conditions, supporting reference material, customer-relevant observations, maintenance-related observations, and safety-related observations only if explicitly documented. Domain-specific words may help classify a theme, but must not force property-only, vehicle-only, or equipment-only output. Do not return room names, component names, photo captions, VINs, IDs, codes, or individual defects as themes unless the whole report is specifically about one component. Do not include observation counts, recommendations, severity, urgency, liability language, repair instructions, replacement instructions, remediation language, or unsupported conclusions.`,
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
