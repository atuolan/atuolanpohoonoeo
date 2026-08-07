Task 5 verification

- Focused: `npx vitest run src/api/OpenAICompatible.request.test.ts src/services/toolCalling/protocolAdapters.test.ts`
- Result: 2 files passed, 10 tests passed.
- Type check: `npm run type-check` remains blocked by pre-existing errors in `src/composables/useChatMessageActions.ts` and `src/utils/fixGroupChatSenderNames.ts`; no OpenAICompatible errors remain.
- Full `npm test` was not run because the repository-wide type baseline is already failing.
