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
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        console.error('IndexedDB error:', event)
        reject('Database error')
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
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

  // 保存佈局數據
  async saveLayout(widgets: any[]) {
    if (!this.db) await this.init()

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

  // 讀取佈局數據
  async loadLayout() {
    if (!this.db) await this.init()

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
