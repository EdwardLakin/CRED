import { AI_REPORT_DRAFT_MODEL } from "@/lib/openai/report-draft-generator";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_SUMMARY_LENGTH = 1200;
const PROFESSIONAL_SUMMARY_WORD_RANGE = "100–150 words";
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

function cleanObservationPhrase(value: unknown) {
  return sanitizeSummary(value)
    .replace(
      /^(?:observation|note|caption|transcript|technician note)\s*:\s*/i,
      "",
    )
    .replace(/\.$/, "");
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

function getObservationCount(input: { captures?: SummaryAssistantCaptureEvidence[]; evidence: SummaryAssistantEvidence[] }) {
  const groupIds = new Set<string>();
  for (const capture of input.captures ?? []) {
    if (capture.observation_group_id) groupIds.add(capture.observation_group_id);
  }
  if (groupIds.size) return groupIds.size;
  return uniquePhrases([
    ...(input.captures ?? []).map((capture) => cleanObservationPhrase(capture.technician_note ?? capture.transcript ?? capture.caption ?? capture.title)),
    ...input.evidence.map((item) => cleanObservationPhrase(item.body ?? item.title)),
  ].filter(Boolean)).length;
}

function themeLabel(value: string) {
  const text = value.toLowerCase();
  if (/floor|carpet|vinyl|tile|hardwood|baseboard/.test(text)) return "flooring damage";
  if (/water|leak|moisture|intrusion|stain/.test(text)) return "water intrusion";
  if (/mold|mould|mildew/.test(text)) return "mold";
  if (/appliance|fridge|refrigerator|stove|oven|dishwasher|washer|dryer/.test(text)) return "appliance condition";
  if (/mechanical|hvac|furnace|plumbing|electrical|heater|boiler/.test(text)) return "mechanical deficiencies";
  if (/wall|ceiling|drywall|paint/.test(text)) return "interior finish conditions";
  if (/door|window|lock|hardware/.test(text)) return "door and window conditions";
  if (/roof|gutter|siding|exterior/.test(text)) return "exterior conditions";
  return sanitizeSummary(value).toLowerCase().slice(0, 60);
}

function getThemePhrases(input: { captures?: SummaryAssistantCaptureEvidence[]; evidence: SummaryAssistantEvidence[] }) {
  const raw = [
    ...(input.captures ?? []).flatMap((capture) => [capture.evidence_category, capture.title, capture.technician_note ?? capture.transcript ?? capture.caption]),
    ...input.evidence.flatMap((item) => [item.title, item.body]),
  ];
  return uniquePhrases(raw.map((item) => themeLabel(String(item ?? ""))).filter((item) => item && item !== "null" && item !== "undefined")).slice(0, 6);
}

function countWord(count: number) {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  return words[count] ?? String(count);
}

function deterministicEvidenceOnlySummary(input: {
  sessionTitle: string | null;
  reportContext?: Record<string, unknown> | null;
  captures?: SummaryAssistantCaptureEvidence[];
  evidence: SummaryAssistantEvidence[];
  style?: SummaryStyle;
}) {
  const count = getObservationCount(input);
  const themes = getThemePhrases(input);
  const subject = sanitizeSummary(input.sessionTitle) || "the documented subject";
  const location = getLocationHint(input.reportContext);
  const countText = count ? `${countWord(count)} documented observation${count === 1 ? "" : "s"}` : "documented observations";
  const opening = location
    ? `This report documents ${countText} at ${location}.`
    : `This report documents ${countText} for ${subject}.`;
  if (!themes.length) return opening;
  const themeSentence = `The documented observations primarily relate to ${formatPhraseList(themes)}.`;
  const conditionSentence = "Overall, the documented observations indicate localized condition issues and maintenance concerns that should be reviewed in context with the detailed observations.";
  const detailSentence = "Detailed observations and supporting evidence are provided in the following sections.";
  if (input.style === "concise") return sanitizeSummary(`${opening} ${themeSentence}`);
  return sanitizeSummary(`${opening} ${themeSentence} ${conditionSentence} ${detailSentence}`);
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

export async function improveReportSummaryWriting(summary: string) {
  const currentSummary = sanitizeSummary(summary);
  if (!currentSummary)
    throw new Error("Enter a summary before improving writing.");
  const improved = await requestSummaryAssistant(
    `You improve a CRED report executive summary for grammar, clarity, flow, and professionalism only. Return JSON only. Preserve every fact exactly. Do not add findings, severity, urgency, causes, liability language, recommendations, repair instructions, replacement instructions, remediation language, dates, names, numbers, measurements, IDs, VINs, codes, or technical values. Do not remove factual qualifiers or source limitations. Words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, and liability may appear only when already present in the current summary.`,
    `Improve this executive summary without changing its facts or adding action language:
${currentSummary}`,
  );
  const cleaned = removeUnsupportedActionLanguage(improved, currentSummary);
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

  const style = normalizeSummaryStyle(input.style);
  const styleInstruction = style === "concise"
    ? "Concise style: write one polished paragraph, about 80–120 words."
    : style === "detailed"
      ? `Detailed style: still write one polished paragraph, ${PROFESSIONAL_SUMMARY_WORD_RANGE}; do not create multiple paragraphs.`
      : `Professional style: write one polished paragraph, ${PROFESSIONAL_SUMMARY_WORD_RANGE}.`;

  const summary = await requestSummaryAssistant(
    `${styleInstruction} Summarize documented observations only as an executive-level overview for a professional commercial inspection or property condition report. Follow this flow: first state what the report documents; then mention the observation count when available; then group the documented observations into broad themes such as flooring deterioration, moisture-related damage, aging finishes, cosmetic wear, non-operational equipment, maintenance concerns, or structural observations when those themes are supported; then describe the overall documented condition and overall impression in calm, neutral language; finish by directing the reader to the detailed observations. Do not rewrite every observation. Do not list Observation 1, Observation 2, or similar. Do not start with or use the phrase "Key issues include". Do not repeat room names or the property address unnecessarily. Do not add recommendations, repair instructions, replacement instructions, remediation language, severity, urgency, hazard, liability language, or sales language. Never invent findings. Never invent severity. Never invent recommendations. Never invent causes. Never assign liability. Leave item-specific details for the Documented Observations section. Do not include source/process language such as references to technician notes, supporting photographic evidence, source material, or evidence provided in the report. Sound like an engineering consultant or commercial inspection company, not ChatGPT. Return JSON only. Treat included_capture_items as the primary customer-facing source of truth. Technician notes are more authoritative than transcripts, and transcripts are more authoritative than AI captions/summaries. Use approved/suggested observation titles only when supported by the note/caption. Do not add dates, names, numbers, measurements, IDs, VINs, codes, or technical values unless that exact concept is explicitly present in the provided documented text. Do not use words such as recommend, recommended, repair, replacement, remediate, remediation, required, requires, severe, severity, urgent, hazard, or liability unless those words already appear in the documented source text.`,
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
  const cleaned = removeUnsupportedActionLanguage(summary, sourceText);
  const processLanguageRemoved = cleaned !== sanitizeSummary(summary);
  return (
    (!processLanguageRemoved && cleaned) ||
    fallbackSummary ||
    "This report documents observed conditions from the included evidence."
  );
}
