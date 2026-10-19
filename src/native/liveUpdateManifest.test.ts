/// <reference types="vitest/globals" />

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LIVE_UPDATE_VERSION_FILE,
  buildLiveUpdateManifest,
  decideLiveUpdate,
  isLiveUpdateManifest,
  toDownloadEntries,
  type LiveUpdateManifest,
} from "./liveUpdateManifest";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("buildLiveUpdateManifest", () => {
  const files = [
    { file_name: "index.html", file_hash: "aa" },
    { file_name: "assets/index-1.js", file_hash: "bb" },
  ];

  it("內容一樣版本就一樣，跟檔案順序無關", () => {
    const a = buildLiveUpdateManifest(files, sha256);
    const b = buildLiveUpdateManifest([...files].reverse(), sha256);
    expect(a.manifest.version).toBe(b.manifest.version);
    expect(a.manifest.version).toHaveLength(16);
  });

  it("任何一個檔案變了，版本就變", () => {
    const a = buildLiveUpdateManifest(files, sha256);
    const b = buildLiveUpdateManifest([files[0], { file_name: "assets/index-1.js", file_hash: "cc" }], sha256);
    expect(a.manifest.version).not.toBe(b.manifest.version);
  });

  it("version.json 列在清單最後，指紋對得上寫出去的內容", () => {
    const { manifest, versionFileContent } = buildLiveUpdateManifest(files, sha256);
    expect(JSON.parse(versionFileContent)).toEqual({ version: manifest.version });
    expect(manifest.files[manifest.files.length - 1]).toEqual({
      file_name: LIVE_UPDATE_VERSION_FILE,
      file_hash: sha256(versionFileContent),
    });
  });

  it("不收舊的 live-update 檔案和 Cloudflare 不提供下載的設定檔", () => {
    const { manifest } = buildLiveUpdateManifest(
      [
        ...files,
        { file_name: "live-update/manifest.json", file_hash: "x" },
        { file_name: "live-update/version.json", file_hash: "y" },
        { file_name: "_headers", file_hash: "z" },
        { file_name: "_redirects", file_hash: "z" },
      ],
      sha256,
    );
    expect(manifest.files.map((f) => f.file_name)).toEqual([
      "assets/index-1.js",
      "index.html",
      LIVE_UPDATE_VERSION_FILE,
    ]);
  });
});

describe("decideLiveUpdate", () => {
  const remote: LiveUpdateManifest = {
    version: "v2",
    minNativeBuild: 2,
    files: [{ file_name: "index.html", file_hash: "aa" }],
  };

  it("版本相同就不用更新", () => {
    expect(decideLiveUpdate({ remote, localVersion: "v2", nativeBuild: 2 })).toBe("up-to-date");
  });

  it("App 外殼太舊時不更新，免得換上用不了的網頁", () => {
    expect(decideLiveUpdate({ remote, localVersion: "v1", nativeBuild: 1 })).toBe("needs-newer-app");
    expect(decideLiveUpdate({ remote, localVersion: "v1", nativeBuild: Number.NaN })).toBe(
      "needs-newer-app",
    );
  });

  it("開不起來被退回的版本不再下載", () => {
    expect(
      decideLiveUpdate({ remote, localVersion: "v1", nativeBuild: 2, failedVersions: ["v2"] }),
    ).toBe("failed-before");
    expect(
      decideLiveUpdate({ remote, localVersion: "v1", nativeBuild: 2, failedVersions: ["v0"] }),
    ).toBe("update");
  });

  it("版本不同、外殼夠新就更新；讀不到目前版本也更新", () => {
    expect(decideLiveUpdate({ remote, localVersion: "v1", nativeBuild: 2 })).toBe("update");
    expect(decideLiveUpdate({ remote, localVersion: null, nativeBuild: 3 })).toBe("update");
  });
});

describe("toDownloadEntries", () => {
  it("每段路徑都編碼，網域結尾的斜線不重複", () => {
    const manifest: LiveUpdateManifest = {
      version: "v",
      minNativeBuild: 2,
      files: [{ file_name: "shortcuts/203 Phone 日曆.shortcut", file_hash: "aa" }],
    };
    expect(toDownloadEntries(manifest, "https://example.com/")).toEqual([
      {
        file_name: "shortcuts/203 Phone 日曆.shortcut",
        file_hash: "aa",
        download_url: "https://example.com/shortcuts/203%20Phone%20%E6%97%A5%E6%9B%86.shortcut",
      },
    ]);
  });
});

describe("isLiveUpdateManifest", () => {
  it("擋掉格式不對的回應（例如 Cloudflare 回首頁 HTML）", () => {
    expect(isLiveUpdateManifest("<!doctype html>")).toBe(false);
    expect(isLiveUpdateManifest({ version: "v", minNativeBuild: 2, files: [] })).toBe(false);
    expect(
      isLiveUpdateManifest({ version: "v", minNativeBuild: 2, files: [{ file_name: "a", file_hash: "b" }] }),
    ).toBe(true);
  });
});
