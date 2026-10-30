// 與 App 端、HF／Docker 版同步伺服器的 peer hash 保持完全相同的算法
const PEER_HASH_FNV_OFFSET = 0xcbf29ce484222325n;
const PEER_HASH_FNV_PRIME = 0x100000001b3n;
const PEER_HASH_FNV_MASK = 0xffffffffffffffffn;

function peerFnv1a64Hex(input) {
  let h = PEER_HASH_FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ BigInt(input.charCodeAt(i))) & PEER_HASH_FNV_MASK;
    h = (h * PEER_HASH_FNV_PRIME) & PEER_HASH_FNV_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

export function peerComputeBucketHashes(entries) {
  const grouped = new Map();
  for (const e of entries) {
    let list = grouped.get(e.entityType);
    if (!list) {
      list = [];
      grouped.set(e.entityType, list);
    }
    list.push(e);
  }
  const buckets = [];
  for (const [entityType, list] of grouped) {
    list.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
    const combined = list
      .map((e) => `${e.entityId}|${e.updatedAt}|${e.deletedAt ?? 0}\n`)
      .join("");
    buckets.push({
      entityType,
      count: list.length,
      hash: peerFnv1a64Hex(combined),
    });
  }
  buckets.sort((a, b) => (a.entityType < b.entityType ? -1 : a.entityType > b.entityType ? 1 : 0));
  const rootInput = buckets
    .map((b) => `${b.entityType}|${b.count}|${b.hash}\n`)
    .join("");
  return {
    buckets,
    rootHash: peerFnv1a64Hex(rootInput),
    totalCount: entries.length,
  };
}
