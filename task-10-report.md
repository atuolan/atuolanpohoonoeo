# Task 10 Report

- Added explicit unsupported-tools detection for only HTTP 400/422 responses whose message names unsupported/unknown tools fields.
- OpenAI-compatible `auto` protocol now retries once with text tool protocol; native, text, Claude native cache, DeepSeek reasoning, cache, and unrelated HTTP errors keep existing behavior.
- Added OpenAI request fallback regression coverage plus Claude/text adapter parsing coverage.
- Focused tests: `npx vitest run src/services/toolCalling/protocolAdapters.test.ts src/api/OpenAICompatible.request.test.ts` (32 passed).
