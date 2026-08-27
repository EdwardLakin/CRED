import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const passwordSignIn = readFileSync("app/sign-in/actions.ts", "utf8");
const authCallback = readFileSync("app/auth/callback/route.ts", "utf8");

test("normal sign-in lands on sessions while explicit callback destinations remain supported", () => {
  assert.match(passwordSignIn, /plan\s*\? `\/dashboard\$\{planQuery\}`\s*: '\/dashboard\/sessions'/);
  assert.match(authCallback, /next \?\? '\/dashboard\/sessions'/);
  assert.doesNotMatch(passwordSignIn, /profile \? `\/dashboard\$\{planQuery\}`/);
});
