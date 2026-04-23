/**
 * Peer sync hash 計算
 *
 * 用 FNV-1a 64-bit 產生每個 entityType 的快照指紋。
 * Hash 的輸入是**排序過**的「entityId|updatedAt|deletedAt」行。
 * 只要兩端該類別所有 entry 的這三個欄位一致，hash 就相同。
 *
 * 注意：server 端（self-hosted-sync-server/src/server.js）必須使用**完全相同**
 * 的輸入編碼與 FNV-1a 算法才能比對，見該檔的 computeBucketHashes。
 */

import type {
  PeerBucketHash,
  PeerManifestEntry,
  SelfHostedSyncEntityType,
} from "@/types/selfHostedSync";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

export function fnv1a64Hex(input: string): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ BigInt(input.charCodeAt(i))) & FNV_MASK;
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

function lineFor(entry: PeerManifestEntry): string {
  const d = entry.deletedAt ?? 0;
  return `${entry.entityId}|${entry.updatedAt}|${d}\n`;
}

export function computeBucketHashes(
  entries: PeerManifestEntry[],
): { buckets: PeerBucketHash[]; rootHash: string; totalCount: number } {
  const grouped = new Map<SelfHostedSyncEntityType, PeerManifestEntry[]>();
  for (const entry of entries) {
    let list = grouped.get(entry.entityType);
    if (!list) {
      list = [];
      grouped.set(entry.entityType, list);
    }
    list.push(entry);
  }

  const buckets: PeerBucketHash[] = [];
  for (const [entityType, list] of grouped) {
    list.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
    const combined = list.map(lineFor).join("");
    buckets.push({
      entityType,
      count: list.length,
      hash: fnv1a64Hex(combined),
    });
  }

  // 固定順序以利 rootHash 穩定
  buckets.sort((a, b) => (a.entityType < b.entityType ? -1 : a.entityType > b.entityType ? 1 : 0));
  const rootInput = buckets
    .map((b) => `${b.entityType}|${b.count}|${b.hash}\n`)
    .join("");
  const rootHash = fnv1a64Hex(rootInput);

  return { buckets, rootHash, totalCount: entries.length };
}

/** 比對兩側 bucket hash，回傳哪些 entityType 需要後續完整 manifest 交換 */
export function diffBuckets(
  local: PeerBucketHash[],
  remote: PeerBucketHash[],
): {
  differingTypes: SelfHostedSyncEntityType[];
  matchedTypes: SelfHostedSyncEntityType[];
} {
  const localMap = new Map(local.map((b) => [b.entityType, b]));
  const remoteMap = new Map(remote.map((b) => [b.entityType, b]));
  const allTypes = new Set<SelfHostedSyncEntityType>([
    ...localMap.keys(),
    ...remoteMap.keys(),
  ]);

  const differingTypes: SelfHostedSyncEntityType[] = [];
  const matchedTypes: SelfHostedSyncEntityType[] = [];
  for (const t of allTypes) {
    const l = localMap.get(t);
    const r = remoteMap.get(t);
    if (l && r && l.hash === r.hash && l.count === r.count) {
      matchedTypes.push(t);
    } else {
      differingTypes.push(t);
    }
  }
  return { differingTypes, matchedTypes };
}
