/**
 * IndexedDB 封裝服務
 * 用於畫布佈局存儲
 */
const DB_NAME = 'Aguaphone_V2'
const DB_VERSION = 1
const STORE_LAYOUT = 'canvas_layout'

// 重新導出核心服務
export { getCharacterService, CharacterService } from './CharacterService'
export { getLorebookService, LorebookService } from './LorebookService'
export { getImportExportService, ImportExportService, convertCharacterBookToLorebook } from './ImportExportService'

export const storageService = {
  db: null as IDBDatabase | null,

  // 初始化數據庫
  async init() {
    // 如果已有連線且仍可用，直接返回
    if (this.db) {
      try {
        // 嘗試一個輕量操作來驗證連線是否仍然有效
        this.db.transaction([STORE_LAYOUT], 'readonly');
        return;
      } catch {
        // 連線已斷開，重新初始化
        console.warn('[StorageService] 連線已斷開，重新初始化');
        this.db = null;
      }
    }

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        console.error('IndexedDB error:', event)
        reject('Database error')
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result

        // 監聯連線意外關閉，自動重置以便下次操作重新連接
        this.db.onclose = () => {
          console.warn('[StorageService] 連線意外關閉，將在下次操作時重新連接');
          this.db = null;
        };

        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // 創建佈局存儲空間
        if (!db.objectStoreNames.contains(STORE_LAYOUT)) {
          db.createObjectStore(STORE_LAYOUT, { keyPath: 'id' })
        }
      }
    })
  },

  // 保存佈局數據（帶重試）
  async saveLayout(widgets: any[]) {
    if (!this.db) await this.init()

    try {
      return await this._saveLayoutInner(widgets);
    } catch (e) {
      // 連線可能已斷開，重新連接後重試一次
      console.warn('[StorageService] saveLayout 失敗，嘗試重新連接:', e);
      this.db = null;
      await this.init();
      return this._saveLayoutInner(widgets);
    }
  },

  _saveLayoutInner(widgets: any[]) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_LAYOUT], 'readwrite')
      const store = transaction.objectStore(STORE_LAYOUT)
      
      const data = {
        id: 'main_layout',
        widgets: JSON.parse(JSON.stringify(widgets)), // 深拷貝以確保數據純淨
        updatedAt: Date.now()
      }

      const request = store.put(data)

      request.onsuccess = () => resolve()
      request.onerror = () => reject('Save failed')
    })
  },

  // 讀取佈局數據（帶重試）
  async loadLayout() {
    if (!this.db) await this.init()

    try {
      return await this._loadLayoutInner();
    } catch (e) {
      // 連線可能已斷開，重新連接後重試一次
      console.warn('[StorageService] loadLayout 失敗，嘗試重新連接:', e);
      this.db = null;
      await this.init();
      return this._loadLayoutInner();
    }
  },

  _loadLayoutInner() {
    return new Promise<any[]>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_LAYOUT], 'readonly')
      const store = transaction.objectStore(STORE_LAYOUT)
      const request = store.get('main_layout')

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.widgets : [])
      }
      
      request.onerror = () => reject('Load failed')
    })
  }
}
