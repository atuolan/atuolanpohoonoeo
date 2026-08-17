import {
  hasMoreVisibleMessages,
  nextVisibleMessageCount,
  MAX_RENDERED_MESSAGE_COUNT,
} from "@/utils/chatMessagePagination";

describe("chat message render pagination", () => {
  it("stops growing the rendered window at the hard cap", () => {
    expect(
      nextVisibleMessageCount(400, 800, 100),
    ).toBe(MAX_RENDERED_MESSAGE_COUNT);
    expect(
      nextVisibleMessageCount(MAX_RENDERED_MESSAGE_COUNT, 800, 100),
    ).toBe(MAX_RENDERED_MESSAGE_COUNT);
  });

  it("does not report more messages once the hard cap is reached", () => {
    expect(
      hasMoreVisibleMessages(800, MAX_RENDERED_MESSAGE_COUNT),
    ).toBe(false);
    expect(hasMoreVisibleMessages(800, 400)).toBe(true);
    expect(hasMoreVisibleMessages(300, 300)).toBe(false);
  });
});
