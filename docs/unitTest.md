# Testing Architecture & Guidelines

This document outlines the testing architecture, test suites, and instructions for running and adding automated tests for REQ Studio.

---

## 1. Testing Architecture Overview

REQ Studio uses a multi-layered automated testing pipeline powered by **Mocha**, **TypeScript**, and **`@vscode/test-cli`**. Running `npm test` launches a headless VS Code instance, executes unit and integration test suites in the extension host process, and returns instant PASS/FAIL status.

```
                  ┌──────────────────────────────────────────┐
                  │                 npm test                 │
                  └────────────────────┬─────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │ 1. npm run compile (TypeScript Compilation) │
                │ 2. npm run lint    (ESLint Static Analysis) │
                └──────────────────────┬──────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │ 3. @vscode/test-cli (Headless VS Code Test)  │
                └──────────────────────┬──────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ Layer 1:      │              │ Layer 2:      │              │ Layer 3:      │
│ cURL Parser   │              │ Header        │              │ E2E HTTP Wire │
│ Unit Tests    │              │ Normalizer    │              │ Integration   │
└───────────────┘              └───────────────┘              └───────────────┘
```

---

## 2. Test Suites & File Structure

The test files reside in `src/test/` and are compiled to `out/test/`:

| Test Suite File | Layer | Description | Key Coverage Areas |
| :--- | :--- | :--- | :--- |
| [curlParser.test.ts](file:///home/sapan.kumar/workspace/gitpro/reqstudio/src/test/curlParser.test.ts) | Layer 1 | cURL command parsing unit tests | `-b`/`--cookie` flag parsing, `--data-raw`, `-F`/`--form` multipart, Basic Auth (`-u`), complex headers (`sec-ch-ua`, `user-agent`) |
| [headerNormalizer.test.ts](file:///home/sapan.kumar/workspace/gitpro/reqstudio/src/test/headerNormalizer.test.ts) | Layer 2 | Header normalization unit tests | Converts Array headers `[{ key, value, enabled }]`, Record maps, and numeric-index objects (`{ '0': { key, value } }`) into clean key-value maps. Prevents `0: [object Object]` bugs on the wire. |
| [e2e.test.ts](file:///home/sapan.kumar/workspace/gitpro/reqstudio/src/test/e2e.test.ts) | Layer 3 | End-to-End HTTP Wire Integration | Spins up an in-process HTTP echo server on `http://localhost:3456/api/echo`, executes real `POST`/`GET` requests, and verifies that clean headers, cookies, and form bodies arrive on the wire. |

---

## 3. How to Run Tests

### Command Line
Run the entire automated test pipeline from the root directory:

```bash
npm test
```

### What `npm test` Executes Under the Hood
1. **`npm run compile`**: Compiles extension TypeScript files in `src/` into `out/`.
2. **`npm run lint`**: Runs ESLint static analysis on `src/`.
3. **`vscode-test`**: Launches `@vscode/test-cli`, which boots up headless VS Code Electron and runs all test files matching `out/test/**/*.test.js`.

### Sample Terminal Output
```text
  Header Normalizer Unit Test Suite
    ✔ Normalizes Array of header objects [{ key, value, enabled }] cleanly
    ✔ Normalizes object with numeric index keys gracefully ({ 0: { key, value } })
    ✔ Preserves standard Record<string, string> header maps
  Extension Test Suite
    ✔ Sample test
  End-to-End HTTP Wire Test Suite
    ✔ Transmits form-encoded POST requests with clean headers and parsed body to server (54ms)
  cURL Parser Unit Test Suite
    ✔ Parses -b and --cookie flags into headers and importedCookies
    ✔ Parses --data-raw form-encoded payloads into bodyUrlEncoded array
    ✔ Parses -F / --form multipart fields
    ✔ Parses complex headers with quotes, spaces, and semicolons
    ✔ Parses Basic Auth -u flag

  10 passing (87ms)
  Exit Code: 0
```

---

## 4. Guidelines for Writing New Tests

When adding new features or fixing bugs in REQ Studio, follow these guidelines:

1. **File Naming & Location**:
   - Place all new test files inside `src/test/`.
   - Use the `.test.ts` extension (e.g. `src/test/authProvider.test.ts`).

2. **cURL Parser Tests**:
   - When modifying [media/curlParser.js](file:///home/sapan.kumar/workspace/gitpro/reqstudio/media/curlParser.js), add corresponding test cases in [src/test/curlParser.test.ts](file:///home/sapan.kumar/workspace/gitpro/reqstudio/src/test/curlParser.test.ts) to verify imported cookies, body fields, and header arrays.

3. **Wire & Protocol Tests**:
   - For tests making live HTTP calls, use the in-process HTTP server on `http://localhost:3456/api/echo` in [src/test/e2e.test.ts](file:///home/sapan.kumar/workspace/gitpro/reqstudio/src/test/e2e.test.ts).
