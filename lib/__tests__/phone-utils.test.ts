/**
 * Unit tests for phone-utils.ts
 * Run with: npx tsx lib/__tests__/phone-utils.test.ts
 */

import {
  normalizeToE164,
  isValidE164,
  validateAndNormalize,
  DEFAULT_CALLER_ID,
} from "../phone-utils";

// Test cases for normalization
const testCases = [
  // Turkish numbers
  { input: "0312 911 40 94", expected: "+903129114094", country: "TR" },
  { input: "03129114094", expected: "+903129114094", country: "TR" },
  { input: "3129114094", expected: "+903129114094", country: "TR" },
  { input: "+90 312 911 40 94", expected: "+903129114094", country: "TR" },
  { input: "+903129114094", expected: "+903129114094", country: "TR" },
  { input: "00903129114094", expected: "+903129114094", country: "TR" },
  
  // International numbers
  { input: "+33 1 23 45 67 89", expected: "+33123456789", country: "TR" },
  { input: "+1 (212) 555-1234", expected: "+12125551234", country: "TR" },
  { input: "+44 20 7946 0958", expected: "+442079460958", country: "TR" },
  { input: "0033123456789", expected: "+33123456789", country: "TR" },
  
  // Invalid cases
  { input: "123", expected: null, country: "TR" },
  { input: "abc", expected: null, country: "TR" },
  { input: "", expected: null, country: "TR" },
];

console.log("Testing normalizeToE164...");
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = normalizeToE164(testCase.input, testCase.country);
  if (result === testCase.expected) {
    console.log(`✓ PASS: "${testCase.input}" -> "${result}"`);
    passed++;
  } else {
    console.error(`✗ FAIL: "${testCase.input}" -> Expected "${testCase.expected}", got "${result}"`);
    failed++;
  }
}

// Test validation
console.log("\nTesting isValidE164...");
const validationTests = [
  { input: "+903129114094", expected: true },
  { input: "+33123456789", expected: true },
  { input: "+12125551234", expected: true },
  { input: "03129114094", expected: false },
  { input: "+", expected: false },
  { input: "+0", expected: false }, // Cannot start with +0
];

for (const test of validationTests) {
  const result = isValidE164(test.input);
  if (result === test.expected) {
    console.log(`✓ PASS: "${test.input}" -> ${result}`);
    passed++;
  } else {
    console.error(`✗ FAIL: "${test.input}" -> Expected ${test.expected}, got ${result}`);
    failed++;
  }
}

// Test validateAndNormalize (should throw on invalid)
console.log("\nTesting validateAndNormalize...");
try {
  validateAndNormalize("+903129114094");
  console.log("✓ PASS: Valid number passed");
  passed++;
} catch (e) {
  console.error("✗ FAIL: Valid number threw error");
  failed++;
}

try {
  validateAndNormalize("invalid");
  console.error("✗ FAIL: Invalid number did not throw");
  failed++;
} catch (e) {
  console.log("✓ PASS: Invalid number correctly threw error");
  passed++;
}

// Test DEFAULT_CALLER_ID
console.log("\nTesting DEFAULT_CALLER_ID...");
if (isValidE164(DEFAULT_CALLER_ID)) {
  console.log(`✓ PASS: DEFAULT_CALLER_ID is valid E.164: ${DEFAULT_CALLER_ID}`);
  passed++;
} else {
  console.error(`✗ FAIL: DEFAULT_CALLER_ID is invalid: ${DEFAULT_CALLER_ID}`);
  failed++;
}

console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
