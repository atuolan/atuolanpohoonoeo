/**
 * LRU 記憶體快取
 * 用於快取聊天訊息，避免每次切換聊天都要從 IndexedDB 重新讀取
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  /**
   * 取得快取值，命中時會將該項移到最新位置
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined
    const value = this.cache.get(key)!
    // 刪除再重新插入，讓它變成最新
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  /**
   * 設定快取值，超過容量時淘汰最久未使用的項目
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Map 的第一個 key 就是最久未使用的
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, value)
  }

  /**
   * 刪除指定 key 的快取
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * 清空所有快取
   */
  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }
}
