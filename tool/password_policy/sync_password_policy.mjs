#!/usr/bin/env node
/**
 * Generates the client copies of the password policy data (STEP 85).
 *
 *   source : backend/src/domain/passwordPolicy.data.json   (edit only this)
 *   outputs: lib/core/validation/password_policy_data.dart
 *            admin/src/generated/passwordPolicyData.ts
 *            web-store/src/generated/passwordPolicyData.ts
 *
 * Usage (from the repository root):
 *   node tool/password_policy/sync_password_policy.mjs           # write
 *   node tool/password_policy/sync_password_policy.mjs --check   # exit 1 if stale
 *
 * The Dart copy is NOT named *.g.dart on purpose: .gitignore drops *.g.dart
 * (build_runner output), and this file must be committed.
 *
 * Copies exist because no client build can read backend/: Flutter bundles Dart
 * only, the dashboard is built from admin/, and the web store's Docker build
 * sees web-store/ only (STEP 86). Each client has a test that
 * compares its copy with the source, so a stale copy fails CI even if nobody
 * runs this script.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = 'backend/src/domain/passwordPolicy.data.json';
const DART_OUT = 'lib/core/validation/password_policy_data.dart';
const TS_OUT = 'admin/src/generated/passwordPolicyData.ts';
const WEB_STORE_OUT = 'web-store/src/generated/passwordPolicyData.ts';

const policy = JSON.parse(readFileSync(resolve(root, SOURCE), 'utf8'));

/** A Dart single-quoted literal: escapes \, ', $ and control characters. */
function dartString(s) {
  let out = "'";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '$') out += '\\$';
    else if (cp < 0x20) out += `\\u{${cp.toString(16)}}`;
    else out += ch;
  }
  return out + "'";
}

const dartList = (items) => `[\n${items.map((s) => `  ${dartString(s)},`).join('\n')}\n]`;
const dartMap = (obj) => `{\n${Object.entries(obj).map(([k, v]) => `  ${dartString(k)}: ${dartString(v)},`).join('\n')}\n}`;

const header = `GENERATED from ${SOURCE} by tool/password_policy/sync_password_policy.mjs — do not edit.`;

const dart = `// ${header}
// Messages are not here: the app shows them through app_strings.dart
// (passwordMinLength, passwordTooLong, …), checked against the source by
// test/password_policy_test.dart.

const int kPolicyMinLength = ${policy.minLength};
const int kPolicyAdminMinLength = ${policy.adminMinLength};
const int kPolicyMaxBytes = ${policy.maxBytes};
const int kPolicyMinDistinctChars = ${policy.minDistinctChars};
const int kPolicyMinRunLength = ${policy.minRunLength};
const int kPolicyMinCoreLength = ${policy.minCoreLength};
const int kPolicyPhoneTailDigits = ${policy.phoneTailDigits};
const int kPolicyMinUsernameLength = ${policy.minUsernameLength};

const List<String> kPolicySequences = ${dartList(policy.sequences)};

const Set<String> kPolicyCommonWords = {
${policy.commonWords.map((s) => `  ${dartString(s)},`).join('\n')}
};

const Map<String, String> kPolicyLeet = ${dartMap(policy.leet)};
`;

const ts = `// ${header}

export const PASSWORD_POLICY = ${JSON.stringify(
  Object.fromEntries(Object.entries(policy).filter(([key]) => key !== '$comment')),
  null,
  2,
)} as const
`;

const outputs = [
  [DART_OUT, dart],
  [TS_OUT, ts],
  [WEB_STORE_OUT, ts],
];

const check = process.argv.includes('--check');
let stale = 0;
for (const [path, content] of outputs) {
  const full = resolve(root, path);
  let current = null;
  try {
    current = readFileSync(full, 'utf8');
  } catch {
    current = null;
  }
  if (current === content) {
    console.log(`up to date  ${path}`);
    continue;
  }
  if (check) {
    console.error(`STALE       ${path}`);
    stale += 1;
    continue;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`written     ${path}`);
}
if (stale) {
  console.error(`\n${stale} generated file(s) out of date — run: node tool/password_policy/sync_password_policy.mjs`);
  process.exit(1);
}
