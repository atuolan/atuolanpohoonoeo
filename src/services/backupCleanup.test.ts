/// <reference types="vitest/globals" />

/**
 * 保留份數：分包要整組算一份、整組刪，不能刪到別的檔案。
 */
import { describe, expect, it } from "vitest";
import { pickBackupsToDelete } from "@/services/AutoBackupService";

describe("pickBackupsToDelete", () => {
  const names = [
    "aguaphone-backup-2026-10-01_10h00m00s.zip",
    "aguaphone-backup-2026-10-02_10h00m00s.zip",
    "aguaphone-backup-2026-10-02_10h00m00s-part2.zip",
    "aguaphone-backup-2026-10-02_10h00m00s-part3.zip",
    "aguaphone-backup-2026-10-03_10h00m00s.zip",
    "別的檔案.zip",
    "aguaphone-backup-notes.txt",
  ];

  it("刪最舊的幾份，分包整組刪", () => {
    expect(pickBackupsToDelete(names, 1)).toEqual([
      "aguaphone-backup-2026-10-01_10h00m00s.zip",
      "aguaphone-backup-2026-10-02_10h00m00s.zip",
      "aguaphone-backup-2026-10-02_10h00m00s-part2.zip",
      "aguaphone-backup-2026-10-02_10h00m00s-part3.zip",
    ]);
  });

  it("一份多包的備份只算一份", () => {
    expect(pickBackupsToDelete(names, 2)).toEqual(["aguaphone-backup-2026-10-01_10h00m00s.zip"]);
  });

  it("沒超過保留份數就不刪", () => {
    expect(pickBackupsToDelete(names, 3)).toEqual([]);
    expect(pickBackupsToDelete(names, 10)).toEqual([]);
  });
});
