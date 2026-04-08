import type { CharacterAffinityConfig, ChatAffinityState } from "@/schemas/affinity";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import {
  affinityTemplateService,
  DEFAULT_UPDATE_INSTRUCTION,
} from "../AffinityTemplateService";

describe("AffinityTemplateService MVU template views", () => {
  it("renders stat_data, display_data, and delta_data in EJS templates", () => {
    setActivePinia(createPinia());

    const config: CharacterAffinityConfig = {
      characterId: "char-1",
      enabled: true,
      statKey: "黎靖青",
      mvuEnabled: true,
      mvuInitialData: {
        黎靖青: {
          亲密值: 10,
        },
      },
      mvuPromptTemplate: [
        `<%= stat_data['黎靖青']?.['亲密值'] %>`,
        `<%= display_data['黎靖青']?.['亲密值'] %>`,
        `<%= delta_data['黎靖青']?.['亲密值'] %>`,
      ].join("|"),
      mvuUpdateInstruction: "",
      postMutationRules: [],
      metrics: [
        {
          id: "intimacy",
          name: "亲密值",
          path: "黎靖青.亲密值",
          type: "number",
          min: 0,
          max: 100,
          initial: 10,
          options: [],
          stages: [],
        },
      ],
      promptTemplate: "",
      updateInstruction: "",
      lastUpdated: 0,
    };

    const state: ChatAffinityState = {
      chatId: "chat-1",
      characterId: "char-1",
      values: { intimacy: 12 },
      mvuState: {
        statData: { 黎靖青: { 亲密值: 12 } },
        displayData: { 黎靖青: { 亲密值: 12 } },
        deltaData: { 黎靖青: { 亲密值: 2 } },
      },
      history: [],
      snapshots: {},
      lastUpdated: 0,
    };

    const rendered = affinityTemplateService.renderAffinityPrompt(config, state);
    expect(rendered).toBe("12|12|2");
  });

  it("default prompt template shows current-turn delta values", () => {
    setActivePinia(createPinia());

    const config: CharacterAffinityConfig = {
      characterId: "char-2",
      enabled: true,
      statKey: "黎靖青",
      mvuEnabled: false,
      mvuInitialData: {},
      mvuPromptTemplate: "",
      mvuUpdateInstruction: "",
      postMutationRules: [],
      metrics: [
        {
          id: "intimacy",
          name: "亲密值",
          path: "黎靖青.亲密值",
          type: "number",
          min: 0,
          max: 100,
          initial: 10,
          options: [],
          stages: [],
        },
      ],
      promptTemplate: "",
      updateInstruction: "",
      lastUpdated: 0,
    };

    const state: ChatAffinityState = {
      chatId: "chat-2",
      characterId: "char-2",
      values: { intimacy: 12 },
      mvuState: {
        statData: { 黎靖青: { 亲密值: 12 } },
        displayData: { 黎靖青: { 亲密值: 12 } },
        deltaData: { 黎靖青: { 亲密值: 2 } },
      },
      history: [],
      snapshots: {},
      lastUpdated: 0,
    };

    const rendered = affinityTemplateService.renderAffinityPrompt(config, state);
    expect(rendered).toContain("亲密值：12/100");
    expect(rendered).toContain("〔本輪：2〕");
  });

  it("default update instruction documents all MVU template views", () => {
    expect(DEFAULT_UPDATE_INSTRUCTION).toContain("stat_data");
    expect(DEFAULT_UPDATE_INSTRUCTION).toContain("display_data");
    expect(DEFAULT_UPDATE_INSTRUCTION).toContain("delta_data");
  });
});
