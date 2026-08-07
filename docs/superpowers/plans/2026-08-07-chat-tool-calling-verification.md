# Chat Tool Calling Verification

## Automated Checks

| Command | Result |
|---|---|
| `npm test` | 52 tests passed |
| `npm run type-check` | Existing baseline errors remain in `useChatMessageActions.ts` and `fixGroupChatSenderNames.ts`; no feature-specific errors after fixes |
| `npm run build` | Pending final run |

## Manual Matrix

| Case | Provider | Protocol | Prompt Mode | Tool | Decision | Result | Evidence |
|---|---|---|---|---|---|---|---|
| Low-risk automatic execution | local fixture | native/auto | merge_tools | `get_current_time` | automatic | Automated coverage passed | `useChatGeneration.tools.test.ts` |
| High-risk confirmation | local fixture | native/auto | merge_tools | `create_calendar_event` | approve/reject | Engine lifecycle covered | `toolExecutionEngine.test.ts` |
| Character permission denial | local fixture | native/auto | merge_tools | `search_music` | denied | Permission tests passed | `permissions.test.ts` |
| Text fallback | local fixture | auto -> text | merge_tools | tool call block | automatic | Fallback regression passed | `OpenAICompatible.request.test.ts` |

## Known Limitations

- 群聊尚未啟用工具呼叫者驗證。
- `npm run type-check` 保留專案原有 6 個基線錯誤，詳見命令輸出。
- 實際第三方 API 與手機瀏覽器確認視窗仍需在部署環境以不含 API key 的手動紀錄補充。
