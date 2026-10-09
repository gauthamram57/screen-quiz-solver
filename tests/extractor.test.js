const test = require('node:test');
const assert = require('node:assert');
const { extractQuestionAlone } = require('../lib/extractor.js');

test('extractQuestionAlone - identifies standard MCQ question', () => {
  const pageText = `
Home  Menu  Dashboard
Time Remaining 12:45
Question 4 of 20
Which algorithm is used for asymmetric key cryptography in TLS 1.3?
A. AES-GCM
B. RSA / ECDSA
C. ChaCha20
D. MD5
Submit Answer
  `;
  const result = extractQuestionAlone(pageText);
  assert.strictEqual(result, 'Which algorithm is used for asymmetric key cryptography in TLS 1.3?');
});

test('extractQuestionAlone - strips question prefix and trailing whitespace', () => {
  const pageText = `
Time Remaining 04:30
Q12: What is the primary purpose of an API Gateway in microservices architecture?
Option 1: Database replication
Option 2: Centralized request routing and rate limiting
Option 3: CSS stylesheet compilation
  `;
  const result = extractQuestionAlone(pageText);
  assert.strictEqual(result, 'What is the primary purpose of an API Gateway in microservices architecture?');
});

test('extractQuestionAlone - detects fill in the blank question pattern', () => {
  const pageText = `
University Exam Portal
Time Remaining 23:10
Question 7
In Python, _____ is the built-in function used to determine the memory identity of an object.
Reset Selection
Next Question
  `;
  const result = extractQuestionAlone(pageText);
  assert.strictEqual(
    result,
    'In Python, _____ is the built-in function used to determine the memory identity of an object.'
  );
});

test('extractQuestionAlone - handles empty or non-string inputs safely', () => {
  assert.strictEqual(extractQuestionAlone(''), '');
  assert.strictEqual(extractQuestionAlone(null), '');
  assert.strictEqual(extractQuestionAlone(undefined), '');
});

test('extractQuestionAlone - filters out navigation and copyright boilerplate', () => {
  const pageText = `
Copyright © 2026 Educational Testing Corp
Login to your account
Previous Question
Which HTTP response status code indicates Unauthorized access?
401 Unauthorized
403 Forbidden
404 Not Found
500 Internal Error
  `;
  const result = extractQuestionAlone(pageText);
  assert.strictEqual(result, 'Which HTTP response status code indicates Unauthorized access?');
});
