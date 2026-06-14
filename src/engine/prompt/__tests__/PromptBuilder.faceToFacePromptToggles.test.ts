import type { StoredCharacter } from "@/types/character";
import type { PromptDefinition, PromptManagerConfig } from "@/types/promptManager";
import { PromptInjectionPosition } from "@/types/promptManager";
import { describe, expect, it } from "vitest";
import type { PromptBuilderOptions } from "../PromptBuilder";
import { PromptBuilder } from "../PromptBuilder";

const FACE_TO_FACE_CUSTOM_PROMPT_ID = "f2f_custom_test_toggle";
const FACE_TO_FACE_CUSTOM_PROMPT_CONTENT = "__F2F_CUSTOM_TOGGLE_SENTINEL__";

function createMockCharacter(): StoredCharacter {
  return {
    id: "test-character-id",
    nickname: "",
    avatar: "",
    data: {
      name: "Test Character",
      description: "A test character",
      personality: "Friendly and helpful",
      scenario: "Testing scenario",
      first_mes: "Hello!",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "Test",
      character_version: "1.0",
      extensions: {
        talkativeness: 0.5,
        fav: false,
        world: "",
        depth_prompt: { prompt: "", depth: 0, role: "system" },
        regex_scripts: [],
      },
      character_book: undefined,
    },
    lorebookIds: [],
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createFaceToFaceCustomPrompt(): PromptDefinition {
  return {
    identifier: FACE_TO_FACE_CUSTOM_PROMPT_ID,
    name: "Face-to-face custom toggle sentinel",
    description: "",
    category: "custom",
    role: "assistant",
    content: FACE_TO_FACE_CUSTOM_PROMPT_CONTENT,
    system_prompt: true,
    marker: false,
    injection_position: PromptInjectionPosition.RELATIVE,
    injection_depth: 0,
    injection_order: 100,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
  };
}

function createPromptManagerConfig(): PromptManagerConfig {
  return {
    version: 4,
    prompts: [],
    globalPromptOrder: [],
    characterConfigs: {},
    faceToFacePrompts: [createFaceToFaceCustomPrompt()],
    faceToFacePromptOrder: [
      { identifier: FACE_TO_FACE_CUSTOM_PROMPT_ID, enabled: true },
    ],
    deletedDefaultPromptIds: [],
    deletedFaceToFacePromptIds: [],
    deletedGroupChatPromptIds: [],
    deletedDiaryPromptIds: [],
    deletedSummaryPromptIds: [],
    deletedEventsPromptIds: [],
    deletedPlurkPostPromptIds: [],
    deletedPlurkCommentPromptIds: [],
  };
}

function createOptions(
  overrides: Partial<PromptBuilderOptions> = {},
): PromptBuilderOptions {
  return {
    character: createMockCharacter(),
    lorebooks: [],
    messages: [],
    settings: {
      maxContextLength: 4096,
      maxResponseLength: 1024,
      temperature: 0.7,
      topP: 1,
      topK: 0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: false,
      useStreamingWindow: false,
    },
    userName: "User",
    faceToFaceMode: true,
    promptManagerConfig: createPromptManagerConfig(),
    tokenCounter: async (text) => text.length,
    ...overrides,
  };
}

function getAllMessageContent(messages: Array<{ content: string }>): string {
  return messages.map((message) => message.content).join("\n");
}

describe("PromptBuilder - face-to-face chat prompt toggles", () => {
  it("applies chatPromptToggles when using promptManagerConfig.faceToFacePromptOrder", async () => {
    const enabledBuilder = new PromptBuilder(
      createOptions({
        chatPromptToggles: {
          [FACE_TO_FACE_CUSTOM_PROMPT_ID]: true,
        },
      }),
    );
    const enabledResult = await enabledBuilder.build();
    expect(getAllMessageContent(enabledResult.messages)).toContain(
      FACE_TO_FACE_CUSTOM_PROMPT_CONTENT,
    );

    const disabledBuilder = new PromptBuilder(
      createOptions({
        chatPromptToggles: {
          [FACE_TO_FACE_CUSTOM_PROMPT_ID]: false,
        },
      }),
    );
    const disabledResult = await disabledBuilder.build();
    expect(getAllMessageContent(disabledResult.messages)).not.toContain(
      FACE_TO_FACE_CUSTOM_PROMPT_CONTENT,
    );
  });
});
