/**
 * IncomingCallModal 來電狀態轉換屬性測試
 *
 * **Feature: character-incoming-call, Property 5: 狀態轉換正確性**
 * **Validates: Requirements 2.3, 2.4, 2.5**
 *
 * Property: For any incoming call, accepting should transition to connected state,
 * declining should remove the pending call, and timeout should mark as missed.
 */

import type { PendingCall } from "@/types/incomingCall";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

/**
 * 來電狀態類型
 */
type IncomingCallState = "ringing" | "accepted" | "declined" | "missed";

/**
 * 來電動作類型
 */
type IncomingCallAction = "accept" | "decline" | "timeout";

/**
 * 來電狀態機
 * 模擬 IncomingCallModal 的狀態轉換邏輯
 */
class IncomingCallStateMachine {
  private state: IncomingCallState = "ringing";
  private remainingSeconds: number = 30;
  private isEnding: boolean = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_pendingCall: PendingCall) {}

  getState(): IncomingCallState {
    return this.state;
  }

  getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  isCallEnding(): boolean {
    return this.isEnding;
  }

  /**
   * 執行動作並返回結果
   */
  performAction(action: IncomingCallAction): {
    success: boolean;
    newState: IncomingCallState;
    emittedEvent: IncomingCallAction | null;
  } {
    // 如果已經結束，不能再執行動作
    if (this.isEnding) {
      return {
        success: false,
        newState: this.state,
        emittedEvent: null,
      };
    }

    // 只有在 ringing 狀態才能執行動作
    if (this.state !== "ringing") {
      return {
        success: false,
        newState: this.state,
        emittedEvent: null,
      };
    }

    this.isEnding = true;

    switch (action) {
      case "accept":
        this.state = "accepted";
        return {
          success: true,
          newState: "accepted",
          emittedEvent: "accept",
        };

      case "decline":
        this.state = "declined";
        return {
          success: true,
          newState: "declined",
          emittedEvent: "decline",
        };

      case "timeout":
        this.state = "missed";
        return {
          success: true,
          newState: "missed",
          emittedEvent: "timeout",
        };

      default:
        return {
          success: false,
          newState: this.state,
          emittedEvent: null,
        };
    }
  }

  /**
   * 模擬時間流逝
   */
  tick(seconds: number = 1): void {
    if (this.isEnding || this.state !== "ringing") {
      return;
    }

    this.remainingSeconds = Math.max(0, this.remainingSeconds - seconds);

    // 30 秒超時自動標記為未接
    if (this.remainingSeconds <= 0) {
      this.performAction("timeout");
    }
  }
}

describe("IncomingCallModal - State Transitions", () => {
  // Arbitrary for valid PendingCall objects
  const pendingCallArb = fc.record({
    id: fc.uuid(),
    characterId: fc.uuid(),
    characterName: fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0),
    characterAvatar: fc.option(fc.webUrl(), { nil: undefined }),
    chatId: fc.uuid(),
    triggerTime: fc.integer({
      min: Date.now() - 60000,
      max: Date.now() + 60000,
    }),
    reason: fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    opening: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: undefined,
    }),
    createdAt: fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now(),
    }),
  });

  // Arbitrary for valid actions
  const actionArb = fc.constantFrom<IncomingCallAction>(
    "accept",
    "decline",
    "timeout",
  );

  describe("Property 5: State transition correctness", () => {
    /**
     * 接聽來電應該轉換到 accepted 狀態
     * Validates: Requirement 2.3
     */
    it("accepting should transition to accepted state", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const machine = new IncomingCallStateMachine(pendingCall);

          // Initial state should be ringing
          expect(machine.getState()).toBe("ringing");

          // Accept the call
          const result = machine.performAction("accept");

          // Should succeed and transition to accepted
          expect(result.success).toBe(true);
          expect(result.newState).toBe("accepted");
          expect(result.emittedEvent).toBe("accept");
          expect(machine.getState()).toBe("accepted");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 拒接來電應該轉換到 declined 狀態
     * Validates: Requirement 2.4
     */
    it("declining should transition to declined state", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const machine = new IncomingCallStateMachine(pendingCall);

          // Initial state should be ringing
          expect(machine.getState()).toBe("ringing");

          // Decline the call
          const result = machine.performAction("decline");

          // Should succeed and transition to declined
          expect(result.success).toBe(true);
          expect(result.newState).toBe("declined");
          expect(result.emittedEvent).toBe("decline");
          expect(machine.getState()).toBe("declined");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 30 秒無回應應該自動標記為未接
     * Validates: Requirement 2.5
     */
    it("timeout should transition to missed state", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const machine = new IncomingCallStateMachine(pendingCall);

          // Initial state should be ringing
          expect(machine.getState()).toBe("ringing");

          // Timeout the call
          const result = machine.performAction("timeout");

          // Should succeed and transition to missed
          expect(result.success).toBe(true);
          expect(result.newState).toBe("missed");
          expect(result.emittedEvent).toBe("timeout");
          expect(machine.getState()).toBe("missed");
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 30 秒倒計時結束應該自動觸發 timeout
     * Validates: Requirement 2.5
     */
    it("should auto-timeout after 30 seconds of no response", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const machine = new IncomingCallStateMachine(pendingCall);

          // Initial remaining seconds should be 30
          expect(machine.getRemainingSeconds()).toBe(30);

          // Simulate 30 seconds passing
          machine.tick(30);

          // Should have transitioned to missed
          expect(machine.getState()).toBe("missed");
          expect(machine.getRemainingSeconds()).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 狀態轉換後不能再執行其他動作
     */
    it("should not allow actions after state transition", () => {
      fc.assert(
        fc.property(
          pendingCallArb,
          actionArb,
          actionArb,
          (pendingCall, firstAction, secondAction) => {
            const machine = new IncomingCallStateMachine(pendingCall);

            // Perform first action
            const firstResult = machine.performAction(firstAction);
            expect(firstResult.success).toBe(true);

            const stateAfterFirst = machine.getState();

            // Try to perform second action
            const secondResult = machine.performAction(secondAction);

            // Second action should fail
            expect(secondResult.success).toBe(false);
            expect(secondResult.emittedEvent).toBeNull();

            // State should remain unchanged
            expect(machine.getState()).toBe(stateAfterFirst);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * 每個動作只能執行一次
     */
    it("each action can only be performed once", () => {
      fc.assert(
        fc.property(pendingCallArb, actionArb, (pendingCall, action) => {
          const machine = new IncomingCallStateMachine(pendingCall);

          // First attempt should succeed
          const firstResult = machine.performAction(action);
          expect(firstResult.success).toBe(true);

          // Second attempt should fail
          const secondResult = machine.performAction(action);
          expect(secondResult.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 倒計時在狀態轉換後應該停止
     */
    it("countdown should stop after state transition", () => {
      fc.assert(
        fc.property(
          pendingCallArb,
          actionArb,
          fc.integer({ min: 1, max: 29 }),
          (pendingCall, action, ticksBefore) => {
            const machine = new IncomingCallStateMachine(pendingCall);

            // Tick some time before action
            machine.tick(ticksBefore);
            const remainingBefore = machine.getRemainingSeconds();

            // Perform action
            machine.performAction(action);

            // Tick more time after action
            machine.tick(10);

            // Remaining seconds should not change after action
            // (countdown stops when isEnding becomes true)
            expect(machine.getRemainingSeconds()).toBe(remainingBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * 初始狀態應該是 ringing
     */
    it("initial state should always be ringing", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const machine = new IncomingCallStateMachine(pendingCall);
          expect(machine.getState()).toBe("ringing");
          expect(machine.isCallEnding()).toBe(false);
          expect(machine.getRemainingSeconds()).toBe(30);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * 狀態轉換應該是確定性的
     */
    it("state transitions should be deterministic", () => {
      fc.assert(
        fc.property(pendingCallArb, actionArb, (pendingCall, action) => {
          // Create two identical state machines
          const machine1 = new IncomingCallStateMachine({ ...pendingCall });
          const machine2 = new IncomingCallStateMachine({ ...pendingCall });

          // Perform same action on both
          const result1 = machine1.performAction(action);
          const result2 = machine2.performAction(action);

          // Results should be identical
          expect(result1.success).toBe(result2.success);
          expect(result1.newState).toBe(result2.newState);
          expect(result1.emittedEvent).toBe(result2.emittedEvent);
          expect(machine1.getState()).toBe(machine2.getState());
        }),
        { numRuns: 100 },
      );
    });
  });
});
