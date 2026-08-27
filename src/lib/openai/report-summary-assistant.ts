import { AI_REPORT_DRAFT_MODEL } from "@/lib/openai/report-draft-generator";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_SUMMARY_LENGTH = 1200;
const PROFESSIONAL_SUMMARY_WORD_RANGE = "90–140 words";

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

const PLACEHOLDER_LABEL_PATTERNS = [
  /^photo(?:\s+\d+)?$/i,
  /^image(?:\s+\d+)?$/i,
  /^documented condition\s*\d+$/i,
  /^observation\s*\d+$/i,
  /^capture\s*\d+$/i,
  /^untitled$/i,
] as const;

const UNSUPPORTED_SEVERITY_PATTERNS = [
  /\b(?:minor|moderate|major|significant|critical|severe|urgent|immediate)\b/i,
  /\b(?:high|medium|low)\s+(?:risk|priority|severity)\b/i,
] as const;

export type SummaryStyle = "concise" | "professional" | "detailed";

type ConfidenceLevel = "low" | "medium" | "high";

type DocumentationMode =
  | "inventory"
  | "inspection"
  | "diagnostic"
  | "service documentation"
  | "condition assessment"
  | "evidence collection"
  | "field service"
  | "audit"
  | "quality assurance"
  | "investigation"
  | "progress documentation"
  | "general documentation"
  | "unknown";

export type ReportUnderstanding = {
  reportType: string;
  subject: string;
  purpose: string;
  intendedAudience: string;
  documentationMode: DocumentationMode;
  overallFinding: string;
  confidence: ConfidenceLevel;
};

export type EvidenceUnderstanding = {
  majorThemes: string[];
  notableEvidenceTypes: string[];
  summaryFacts: string[];
  unsupportedOrWeakAreas: string[];
  confidence: ConfidenceLevel;
};

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

type SummaryAssistantInput = {
  sessionTitle: string | null;
  style?: SummaryStyle;
  reportContext?: Record<string, unknown> | null;
  captures?: SummaryAssistantCaptureEvidence[];
  evidenceGroups?: unknown;
  evidence: SummaryAssistantEvidence[];
};

type PreparedSummaryInput = Required<Pick<SummaryAssistantInput, "captures" | "evidence">> &
  Omit<SummaryAssistantInput, "captures" | "evidence">;

type SummaryValidationResult = { valid: true } | { valid: false; reasons: string[] };

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
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, MAX_SUMMARY_LENGTH);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actionTermPattern(term: string) {
  if (term === "recommend") return /\brecommend(?:s|ing|ation|ations)?\b/i;
  if (term === "repair") return /\brepairs?\b/i;
  if (term === "remediate") return /\bremediat(?:e|es|ed|ing|ion)\b/i;
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
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

function getSummarySourceText(input: Pick<SummaryAssistantInput, "reportContext" | "captures" | "evidenceGroups" | "evidence">) {
  const parts: string[] = [];
  collectStringValues(input.reportContext ?? null, parts);
  for (const capture of input.captures ?? []) {
    pushText(parts, capture.title);
    pushText(parts, capture.technician_note);
    pushText(parts, capture.transcript);
    pushText(parts, capture.caption);
    pushText(parts, capture.evidence_category);
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
  return values
    .map((value) => sanitizeSummary(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function cleanEvidenceLabel(value: unknown) {
  const text = sanitizeSummary(value).replace(/[_-]+/g, " ");
  if (!text || PLACEHOLDER_LABEL_PATTERNS.some((pattern) => pattern.test(text))) return "";
  if (/^misc(?:ellaneous)?(?:\s+tool)?\s+photos?$/i.test(text)) return "miscellaneous tools";
  return text;
}

function formatPhraseList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function normalizeSummaryStyle(value: unknown): SummaryStyle {
  return value === "concise" || value === "detailed" ? value : "professional";
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeDocumentationMode(value: unknown): DocumentationMode {
  const text = sanitizeSummary(value).toLowerCase();
  const allowed: DocumentationMode[] = [
    "inventory",
    "inspection",
    "diagnostic",
    "service documentation",
    "condition assessment",
    "evidence collection",
    "field service",
    "audit",
    "quality assurance",
    "investigation",
    "progress documentation",
    "general documentation",
    "unknown",
  ];
  return allowed.includes(text as DocumentationMode) ? (text as DocumentationMode) : "unknown";
}

function hasInventorySignals(sourceText: string) {
  return /\b(?:inventory|toolbox|tool box|tool cart|ratchets?|sockets?|cordless tools?|hand tools?|specialty tools?|12v|18v|18volt)\b/i.test(sourceText);
}

function hasPropertySignals(sourceText: string) {
  return /\b(?:property|rental|tenant|unit|home|house|building|flooring|fixture|interior|exterior|room|kitchen|bathroom)\b/i.test(sourceText);
}

function inferSubjectLabel(input: Pick<SummaryAssistantInput, "sessionTitle" | "reportContext">, fallback = "") {
  const context = input.reportContext ?? {};
  const candidates = [
    context.subject,
    context.asset,
    context.location,
    context.address,
    context.customerName,
    input.sessionTitle,
    fallback,
  ];
  const subject = candidates.map(sanitizeSummary).find(Boolean);
  return subject?.replace(/^report\s*[:-]?\s*/i, "").slice(0, 120) ?? "";
}

function deterministicUnderstandReport(input: PreparedSummaryInput): ReportUnderstanding {
  const sourceText = getSummarySourceText(input);
  const subject = inferSubjectLabel(input, sourceText) || "documented items";
  const title = sanitizeSummary(input.sessionTitle);
  const mode: DocumentationMode = hasInventorySignals(`${title} ${sourceText}`)
    ? "inventory"
    : /\bdiagnostic|fault code|test reading|scan|diagnosis\b/i.test(`${title} ${sourceText}`)
      ? "diagnostic"
      : /\bservice|work performed|parts used|work order|field service\b/i.test(`${title} ${sourceText}`)
        ? "service documentation"
        : hasPropertySignals(`${title} ${sourceText}`)
          ? "condition assessment"
          : "general documentation";
  return {
    reportType: title || (mode === "inventory" ? "Inventory Report" : "Documentation Report"),
    subject,
    purpose: mode === "inventory" ? "document the captured items and storage shown" : "document the available items for review",
    intendedAudience: "customer or internal reviewer",
    documentationMode: mode,
    overallFinding: mode === "inventory" ? "the report documents an inventory record based on the captured items" : "the report provides a factual record based on the available items",
    confidence: sourceText.trim() ? "medium" : "low",
  };
}

function evidenceTypeForCapture(capture: SummaryAssistantCaptureEvidence) {
  if (capture.technician_note?.trim()) return "notes";
  if (capture.transcript?.trim()) return "transcripts";
  if (capture.caption?.trim()) return "captions";
  if (capture.media_kind?.trim()) return `${capture.media_kind.trim()} records`;
  return "captured items";
}

function deterministicUnderstandEvidence(input: PreparedSummaryInput): EvidenceUnderstanding {
  const rawLabels = [
    ...input.captures.flatMap((capture) => [capture.technician_note, capture.transcript, capture.caption, capture.title, capture.evidence_category]),
    ...input.evidence.flatMap((item) => [item.title, item.body]),
  ];
  const cleaned = uniquePhrases(rawLabels.map(cleanEvidenceLabel)).slice(0, 6);
  const types = uniquePhrases(input.captures.map(evidenceTypeForCapture).concat(input.evidence.length ? ["reviewed sections"] : [])).slice(0, 4);
  return {
    majorThemes: cleaned.slice(0, 5),
    notableEvidenceTypes: types.length ? types : ["captured items"],
    summaryFacts: cleaned.slice(0, 4).map((label) => `The record references ${label}.`),
    unsupportedOrWeakAreas: cleaned.length ? [] : ["Limited notes or captions were available."],
    confidence: cleaned.length >= 3 ? "high" : cleaned.length ? "medium" : "low",
  };
}

const reportUnderstandingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reportType: { type: "string" },
    subject: { type: "string" },
    purpose: { type: "string" },
    intendedAudience: { type: "string" },
    documentationMode: { type: "string" },
    overallFinding: { type: "string" },
    confidence: { type: "string" },
  },
  required: ["reportType", "subject", "purpose", "intendedAudience", "documentationMode", "overallFinding", "confidence"],
} as const;

const evidenceUnderstandingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    majorThemes: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
    notableEvidenceTypes: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 6 },
    summaryFacts: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
    unsupportedOrWeakAreas: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 6 },
    confidence: { type: "string" },
  },
  required: ["majorThemes", "notableEvidenceTypes", "summaryFacts", "unsupportedOrWeakAreas", "confidence"],
} as const;

async function requestStructuredOutput<T>(name: string, schema: unknown, systemPrompt: string, userText: string): Promise<T> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_REPORT_DRAFT_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userText }] },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
      max_output_tokens: 1400,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === "string" ? body.error.message : `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }
  const outputText = extractOutputText(await response.json());
  if (!outputText) throw new Error("AI summary assistant returned an empty response.");
  return JSON.parse(outputText) as T;
}

function buildUserPayload(input: PreparedSummaryInput) {
  return `Report title: ${input.sessionTitle ?? "Untitled report"}\nReport context JSON:\n${JSON.stringify(input.reportContext ?? {})}\nIncluded capture items JSON:\n${JSON.stringify(input.captures).slice(0, 22000)}\nGrouped observation data JSON:\n${JSON.stringify(input.evidenceGroups ?? null).slice(0, 6000)}\nReviewed report sections JSON:\n${JSON.stringify(input.evidence).slice(0, 12000)}`;
}

export async function understandReport(input: PreparedSummaryInput): Promise<ReportUnderstanding> {
  try {
    const parsed = await requestStructuredOutput<Record<string, unknown>>(
      "report_understanding",
      reportUnderstandingSchema,
      `Understand the report before any writing. Return structured JSON only. Infer reportType, subject, purpose, intendedAudience, documentationMode, overallFinding, and confidence only when supported by the title, metadata, notes, captions, transcripts, grouped observations, or reviewed sections. Documentation mode examples include inventory, inspection, diagnostic, service documentation, condition assessment, evidence collection, field service, audit, quality assurance, investigation, progress documentation, general documentation, and unknown. Do not assume inspection, defects, deficiencies, property, equipment failure, recommendations, severity, urgency, or liability.`,
      buildUserPayload(input),
    );
    return {
      reportType: sanitizeSummary(parsed.reportType) || "Documentation Report",
      subject: sanitizeSummary(parsed.subject) || "documented items",
      purpose: sanitizeSummary(parsed.purpose) || "document the available items for review",
      intendedAudience: sanitizeSummary(parsed.intendedAudience) || "customer or internal reviewer",
      documentationMode: normalizeDocumentationMode(parsed.documentationMode),
      overallFinding: sanitizeSummary(parsed.overallFinding) || "the report provides a factual documentation record",
      confidence: normalizeConfidence(parsed.confidence),
    };
  } catch {
    return deterministicUnderstandReport(input);
  }
}

export async function understandEvidence(input: PreparedSummaryInput, report: ReportUnderstanding): Promise<EvidenceUnderstanding> {
  try {
    const parsed = await requestStructuredOutput<Record<string, unknown>>(
      "evidence_understanding",
      evidenceUnderstandingSchema,
      `Understand the evidence for a multi-industry CRED report. Return structured JSON only; do not write customer-facing prose. Identify naturally occurring themes from actual technician notes, transcripts, captions, evidence labels, grouped observations, reviewed sections, and metadata. Use the notes/captions. Do not force predefined inspection buckets. Do not invent context, severity, recommendations, damage, defects, or deficiencies unless documented. Do not repeat every evidence item. Do not include placeholder labels like "photo" or "Documented condition 07" as meaningful themes.`,
      `${buildUserPayload(input)}\nInternal report understanding JSON:\n${JSON.stringify(report)}`,
    );
    return {
      majorThemes: uniquePhrases(Array.isArray(parsed.majorThemes) ? parsed.majorThemes.filter((item): item is string => typeof item === "string").map(cleanEvidenceLabel) : []).slice(0, 8),
      notableEvidenceTypes: uniquePhrases(Array.isArray(parsed.notableEvidenceTypes) ? parsed.notableEvidenceTypes.filter((item): item is string => typeof item === "string") : []).slice(0, 6),
      summaryFacts: uniquePhrases(Array.isArray(parsed.summaryFacts) ? parsed.summaryFacts.filter((item): item is string => typeof item === "string") : []).slice(0, 8),
      unsupportedOrWeakAreas: uniquePhrases(Array.isArray(parsed.unsupportedOrWeakAreas) ? parsed.unsupportedOrWeakAreas.filter((item): item is string => typeof item === "string") : []).slice(0, 6),
      confidence: normalizeConfidence(parsed.confidence),
    };
  } catch {
    return deterministicUnderstandEvidence(input);
  }
}

function safeFallbackSummary(report: ReportUnderstanding, input: PreparedSummaryInput) {
  const subjectLabel = sanitizeSummary(report.subject) || inferSubjectLabel(input);
  if (subjectLabel) {
    return `This report summarizes the documented items for ${subjectLabel}. The available records provide a factual reference of the items, observations, or conditions captured during the documentation process. Detailed observations and supporting photos are provided in the following sections.`;
  }
  return "This report summarizes the documented items captured for review. The available records provide a factual reference of the items, observations, or conditions captured during the documentation process. Detailed observations and supporting photos are provided in the following sections.";
}

function deterministicExecutiveSummary(report: ReportUnderstanding, evidence: EvidenceUnderstanding, input: PreparedSummaryInput) {
  const themes = evidence.majorThemes.filter(Boolean).slice(0, report.documentationMode === "inventory" ? 6 : 4);
  const subject = sanitizeSummary(report.subject) || inferSubjectLabel(input) || "the documented subject";
  if (!themes.length) return safeFallbackSummary(report, input);
  if (report.documentationMode === "inventory") {
    return sanitizeSummary(`This report documents an inventory record for ${subject}. The captured records show documented items and storage areas, including ${formatPhraseList(themes)}. The report provides a factual record of the documented inventory at the time of capture. Detailed item notes and supporting photos are included in the following sections.`);
  }
  const modePhrase = report.documentationMode === "diagnostic" ? "diagnostic documentation" : report.documentationMode === "service documentation" || report.documentationMode === "field service" ? "service documentation" : report.documentationMode === "condition assessment" || report.documentationMode === "inspection" ? "documented condition" : "documentation record";
  return sanitizeSummary(`This report summarizes the ${modePhrase} for ${subject}. The available records describe ${formatPhraseList(themes)}, providing a factual picture of what was captured during the documentation process. Overall, ${report.overallFinding}. Detailed observations and supporting photos are provided in the following sections.`);
}

function validateSummary(summary: string, report: ReportUnderstanding, evidence: EvidenceUnderstanding, sourceText: string): SummaryValidationResult {
  const reasons: string[] = [];
  if (!summary || summary.split(/\s+/).length < 20) reasons.push("summary is too short");
  if (report.documentationMode === "inventory" && /\binspection\b/i.test(summary)) reasons.push("calls an inventory an inspection");
  if (report.documentationMode === "inventory" && /\b(?:deficienc|defect|deteriorat|electrical deficiencies)\b/i.test(summary) && !/\b(?:deficienc|defect|deteriorat|electrical deficiencies)\b/i.test(sourceText)) reasons.push("calls inventory items deficiencies");
  if (!hasPropertySignals(`${report.subject} ${report.reportType} ${sourceText}`) && /\bproperty\b/i.test(summary)) reasons.push("calls generic evidence a property report");
  for (const term of UNSUPPORTED_ACTION_TERMS) {
    if (actionTermPattern(term).test(summary) && !actionTermPattern(term).test(sourceText)) reasons.push(`unsupported action term: ${term}`);
  }
  if (UNSUPPORTED_SEVERITY_PATTERNS.some((pattern) => pattern.test(summary)) && !UNSUPPORTED_SEVERITY_PATTERNS.some((pattern) => pattern.test(sourceText))) reasons.push("unsupported severity");
  if (PLACEHOLDER_LABEL_PATTERNS.some((pattern) => evidence.majorThemes.some((theme) => pattern.test(theme)) || pattern.test(summary))) reasons.push("placeholder caption used as theme");
  const commaCount = (summary.match(/,/g) ?? []).length;
  if (commaCount > 5 && report.documentationMode !== "inventory") reasons.push("over-lists individual observations");
  if (/\b(?:material deterioration|mechanical concerns|operational issues|property condition|inspection deficiencies)\b/i.test(summary) && !/\b(?:deteriorat|mechanical|operat|property|inspection|deficienc)\b/i.test(sourceText)) reasons.push("irrelevant hardcoded industry language");
  return reasons.length ? { valid: false, reasons } : { valid: true };
}

async function generateSummaryWithAi(report: ReportUnderstanding, evidence: EvidenceUnderstanding, input: PreparedSummaryInput, retryReasons: string[] = []) {
  const parsed = await requestStructuredOutput<{ summary: string }>(
    "executive_summary",
    { type: "object", additionalProperties: false, properties: { summary: { type: "string" } }, required: ["summary"] },
    `Write one customer-facing CRED Executive Summary using only the internal structured report and item understanding. Return JSON only. The summary must be one paragraph, ${PROFESSIONAL_SUMMARY_WORD_RANGE} when enough content exists, shorter for limited notes, premium and professional, and it must summarize what was documented, the overall picture, only the most important themes, and direct the reader to detailed observations that follow. In customer-facing prose, call captures items, photos, documents, or records; never use the term evidence. Do not list every finding, repeat every caption, mention observation count unless needed, mention photos unless necessary, use canned wording, assign severity, urgency, or liability, or add recommendations. Do not mention inspection unless documentationMode supports inspection. Do not mention property unless the report is actually about property. Do not mention deficiencies, repairs, or replacement unless documented. ${retryReasons.length ? `Previous validation failed for: ${retryReasons.join("; ")}. Retry with stricter factual neutrality.` : ""}`,
    `Report understanding JSON:\n${JSON.stringify(report)}\nEvidence understanding JSON:\n${JSON.stringify(evidence)}\nOriginal input excerpt JSON:\n${JSON.stringify({ title: input.sessionTitle, reportContext: input.reportContext }).slice(0, 4000)}`,
  );
  return sanitizeSummary(parsed.summary);
}

export async function generateExecutiveSummary(report: ReportUnderstanding, evidence: EvidenceUnderstanding, input: PreparedSummaryInput) {
  const sourceText = getSummarySourceText(input);
  const deterministic = deterministicExecutiveSummary(report, evidence, input);
  try {
    const first = await generateSummaryWithAi(report, evidence, input);
    const firstValidation = validateSummary(first, report, evidence, sourceText);
    if (firstValidation.valid) return first;
    const second = await generateSummaryWithAi(report, evidence, input, firstValidation.reasons);
    const secondValidation = validateSummary(second, report, evidence, sourceText);
    if (secondValidation.valid) return second;
  } catch {
    // Fall through to deterministic validation and safe fallback.
  }
  const deterministicValidation = validateSummary(deterministic, report, evidence, sourceText);
  return deterministicValidation.valid ? deterministic : safeFallbackSummary(report, input);
}

export async function improveExecutiveSummary(summary: string) {
  const currentSummary = sanitizeSummary(summary);
  if (!currentSummary) throw new Error("Enter a summary before improving writing.");
  try {
    const improved = await requestStructuredOutput<{ summary: string }>(
      "improved_executive_summary",
      { type: "object", additionalProperties: false, properties: { summary: { type: "string" } }, required: ["summary"] },
      `Improve Writing for an existing CRED Executive Summary. Return JSON only. Do not regenerate from scratch. Improve grammar, flow, clarity, remove repetition, and improve executive tone. Preserve all factual meaning and user edits. Do not add facts, recommendations, severity, urgency, liability, repairs, replacement, or remediation. Do not change the documentation mode unless the current text clearly supports it. If the current text is poor or over-specific, consolidate repeated details into one better executive paragraph without inventing facts.`,
      `Current Executive Summary:\n${currentSummary}`,
    );
    const cleaned = sanitizeSummary(improved.summary);
    const validation = validateSummary(cleaned, deterministicUnderstandReport({ sessionTitle: null, reportContext: null, evidenceGroups: null, captures: [], evidence: [{ title: null, body: currentSummary }] }), deterministicUnderstandEvidence({ sessionTitle: null, reportContext: null, evidenceGroups: null, captures: [], evidence: [{ title: null, body: currentSummary }] }), currentSummary);
    return validation.valid ? cleaned : currentSummary;
  } catch {
    return currentSummary;
  }
}

export async function improveReportSummaryWriting(summary: string) {
  return improveExecutiveSummary(summary);
}

function prepareSummaryInput(input: SummaryAssistantInput): PreparedSummaryInput {
  const captures = (input.captures ?? [])
    .filter((item) => item.caption?.trim() || item.technician_note?.trim() || item.transcript?.trim() || item.title?.trim() || item.evidence_category?.trim())
    .slice(0, 80);
  const evidence = input.evidence
    .filter((item) => item.body?.trim() || item.title?.trim())
    .slice(0, 40)
    .map((item) => ({ title: item.title, body: item.body, status: item.status, source_capture_ids: item.source_capture_ids ?? [] }));
  return { ...input, style: normalizeSummaryStyle(input.style), captures, evidence };
}

export async function regenerateReportSummaryFromEvidence(input: SummaryAssistantInput) {
  const prepared = prepareSummaryInput(input);
  if (!prepared.captures.length && !prepared.evidence.length) {
    throw new Error("No documented observations are available for summary regeneration.");
  }
  const report = await understandReport(prepared);
  const evidence = await understandEvidence(prepared, report);
  return generateExecutiveSummary(report, evidence, prepared);
}
