import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const limitsSource = readFileSync("src/features/usage/limits.ts", "utf8");
const usageCardSource = readFileSync("src/features/usage/components/UsageSummaryCard.tsx", "utf8");
const workerSource = readFileSync("src/lib/capture-processing/worker.ts", "utf8");
const captureActionsSource = readFileSync("src/features/capture/actions.ts", "utf8");
const reportsActionsSource = readFileSync("src/features/reports/actions.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

function isAiUsageLimitExemptForTest(organizationId) {
  const configuredOrganizationIds = process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS;

  if (!configuredOrganizationIds) {
    return false;
  }

  return configuredOrganizationIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(organizationId);
}

function withBypassEnv(value, callback) {
  const original = process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS;
  try {
    if (value === undefined) {
      delete process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS;
    } else {
      process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS = value;
    }
    callback();
  } finally {
    if (original === undefined) {
      delete process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS;
    } else {
      process.env.AI_USAGE_BYPASS_ORGANIZATION_IDS = original;
    }
  }
}

test("missing environment variable means no AI usage exemption", () => {
  withBypassEnv(undefined, () => {
    assert.equal(isAiUsageLimitExemptForTest("org-a"), false);
  });
});

test("matching organization ID is exempt", () => {
  withBypassEnv("org-a", () => {
    assert.equal(isAiUsageLimitExemptForTest("org-a"), true);
  });
});

test("nonmatching organization remains capped", () => {
  withBypassEnv("org-a", () => {
    assert.equal(isAiUsageLimitExemptForTest("org-b"), false);
  });
});

test("multiple comma-separated organization IDs work", () => {
  withBypassEnv("org-a,org-b,org-c", () => {
    assert.equal(isAiUsageLimitExemptForTest("org-b"), true);
  });
});

test("whitespace and empty bypass entries are ignored", () => {
  withBypassEnv(" org-a, ,\t,org-b  ,", () => {
    assert.equal(isAiUsageLimitExemptForTest("org-b"), true);
    assert.equal(isAiUsageLimitExemptForTest(""), false);
  });
});

test("central helper reads only the server-side bypass environment variable safely", () => {
  assert.match(limitsSource, /export function isAiUsageLimitExempt\(organizationId: string\): boolean/);
  assert.match(limitsSource, /process\.env\.AI_USAGE_BYPASS_ORGANIZATION_IDS/);
  assert.match(limitsSource, /\.split\(',\'\)/);
  assert.match(limitsSource, /\.map\(\(id\) => id\.trim\(\)\)/);
  assert.match(limitsSource, /\.filter\(Boolean\)/);
  assert.doesNotMatch(limitsSource, /edwardlakin35@icloud\.com/);
  assert.doesNotMatch(envExample, /organization-uuid-1|edwardlakin35@icloud\.com/);
});

test("AI classification allowance is exempt when the organization is allowlisted", () => {
  assert.match(limitsSource, /'ai_classification'/);
  assert.match(limitsSource, /const aiLimitExempt = isAiLimitedEventType\(eventType\) && isAiUsageLimitExempt\(organizationId\)/);
  assert.match(limitsSource, /!aiLimitExempt && usage\.aiActionsThisMonth \+ quantity > limits\.aiActionsPerMonth/);
});

test("AI extraction allowance is exempt when the organization is allowlisted", () => {
  assert.match(limitsSource, /'ai_extraction'/);
  assert.match(workerSource, /eventType: UsageEventType = operation === 'extract_capture' \? 'ai_extraction' : 'ai_classification'/);
});

test("AI report generation allowance is exempt when the organization is allowlisted", () => {
  assert.match(limitsSource, /'ai_report_draft_generation'/);
  assert.match(reportsActionsSource, /eventType: 'ai_report_draft_generation'/);
});

test("storage limits still apply", () => {
  assert.match(limitsSource, /eventType === 'storage_bytes_added' && usage\.storageBytes \+ quantity > limits\.storageBytes/);
  assert.match(limitsSource, /Storage limit reached for your plan/);
});

test("email limits still apply", () => {
  assert.match(limitsSource, /eventType === 'email_report_sent' && usage\.emailSendsThisMonth \+ quantity > limits\.emailSendsPerMonth/);
  assert.match(limitsSource, /Email send limit reached for this month/);
});

test("share-link limits still apply", () => {
  assert.match(limitsSource, /eventType === 'share_link_created' && usage\.activeShareLinks \+ quantity > limits\.activeShareLinks/);
  assert.match(limitsSource, /Share link limit reached for this plan/);
});

test("AI usage remains counted and cost/model usage remains recorded", () => {
  assert.match(captureActionsSource, /eventType: 'ai_classification'/);
  assert.match(captureActionsSource, /eventType: 'ai_extraction'/);
  assert.match(reportsActionsSource, /eventType: 'ai_report_draft_generation'/);
  assert.match(workerSource, /recordUsageEvent\(/);
  assert.match(workerSource, /\.from\('ai_usage_events'\)/);
  assert.match(workerSource, /estimated_cost_cents: result\.usage\.estimatedCostCents/);
});

test("billing UI displays actual AI use plus Unlimited for exempt organizations", () => {
  assert.match(usageCardSource, /const aiLimitExempt = isAiUsageLimitExempt\(organizationId\)/);
  assert.match(usageCardSource, /used=\{usage\.aiActionsThisMonth\.toLocaleString\(\)\}/);
  assert.match(usageCardSource, /limit=\{aiLimitExempt \? 'Unlimited' : limits\.aiActionsPerMonth\.toLocaleString\(\)\}/);
  assert.match(usageCardSource, /percent=\{aiLimitExempt \? null : \(usage\.aiActionsThisMonth \/ limits\.aiActionsPerMonth\) \* 100\}/);
  assert.match(usageCardSource, /`\$\{used\} used · \$\{limit\}`/);
});

test("ordinary organizations still display used / limit", () => {
  assert.match(usageCardSource, /`\$\{used\} \/ \$\{limit\}`/);
  assert.match(usageCardSource, /percent === null \? `\$\{used\} used · \$\{limit\}` : `\$\{used\} \/ \$\{limit\}`/);
});

test("background jobs and upload-triggered flows use organization-scoped centralized allowance", () => {
  assert.match(workerSource, /organizationId: job\.organization_id/);
  assert.match(workerSource, /requireUsageAllowance\(/);
  assert.doesNotMatch(workerSource, /email/i);
  assert.match(captureActionsSource, /organizationId: profile\.organization_id/);
});
