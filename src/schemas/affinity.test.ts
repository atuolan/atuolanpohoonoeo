import { describe, expect, it } from "vitest";

import { safeParseAffinityConfig } from "./affinity";

describe("safeParseAffinityConfig", () => {
  it("一個指標沒填名稱，其他指標和設定照樣讀得出來", () => {
    const config = safeParseAffinityConfig(
      {
        characterId: "c1",
        enabled: true,
        statKey: "譚堯",
        metrics: [
          { id: "m1", name: "好感度", type: "number", min: "", max: 100, initial: 50, stages: [] },
          { id: "m2", name: "", type: "number", min: 0, max: 100, initial: 50, stages: [] },
          {
            id: "m3",
            name: "信任",
            type: "number",
            min: 0,
            max: 100,
            initial: 10,
            stages: [
              { name: "陌生", minValue: "" },
              { name: "", minValue: 50 },
            ],
          },
        ],
      },
      "c1",
    );

    expect(config.enabled).toBe(true);
    expect(config.statKey).toBe("譚堯");
    expect(config.metrics.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(config.metrics[0].min).toBe(0);
    expect(config.metrics[1].stages).toEqual([{ name: "陌生", minValue: 0 }]);
  });
});
