<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <!-- 頭部 -->
      <div class="modal-header">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor" class="header-icon">
            <path
              d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
            />
          </svg>
          AI 記憶管理
        </h3>
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>

      <!-- Tab 切換 -->
      <div class="tab-bar">
        <button
          class="tab-item"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
            />
          </svg>
          總結內容
          <span v-if="summaries.length > 0" class="badge">{{
            summaries.length
          }}</span>
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
          總結設置
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'events' }"
          @click="activeTab = 'events'"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
            />
          </svg>
          重要事件
          <span v-if="events.length > 0" class="badge">{{
            events.length
          }}</span>
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'diary' }"
          @click="activeTab = 'diary'"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
            />
          </svg>
          日記
          <span v-if="diaries.length > 0" class="badge">{{
            diaries.length
          }}</span>
        </button>
      </div>

      <!-- 內容區 -->
      <div class="modal-body">
        <!-- 總結內容 Tab -->
        <div v-show="activeTab === 'history'" class="tab-content history-tab">
          <!-- AI 生成總結中的提示 -->
          <div v-if="isGeneratingSummary" class="generating-summary">
            <div class="loading-spinner"></div>
            <span>AI 正在生成總結...</span>
          </div>

          <input
            ref="importFileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleImportFile"
          />

          <div
            v-if="summaries.length === 0 && !isGeneratingSummary"
            class="empty-state"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="empty-icon">
              <path
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
              />
            </svg>
            <p class="empty-title">還沒有對話總結</p>
            <p class="empty-hint">繼續聊天，系統會自動生成總結</p>
          </div>

          <div v-else-if="summaries.length > 0" class="summaries-list">
            <div
              v-for="(summary, index) in sortedSummaries"
              :key="summary.id"
              class="summary-card"
              :class="{
                important: summary.isImportant,
                selected: selectedSummaryIds.includes(summary.id),
              }"
            >
              <div class="summary-header">
                <label class="summary-checkbox" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selectedSummaryIds.includes(summary.id)"
                    @change="toggleSummarySelection(summary.id)"
                  />
                </label>
                <span class="summary-number"
                  >#{{ sortedSummaries.length - index }}</span
                >
                <span class="summary-date">{{
                  formatDate(summary.createdAt)
                }}</span>
                <span class="summary-count"
                  >{{ summary.messageCount || 0 }} 條對話</span
                >
                <span v-if="summary.isManual" class="summary-tag manual"
                  >手動</span
                >
                <span v-if="summary.isMeta" class="summary-tag meta"
                  >元總結</span
                >
                <div class="summary-actions-inline">
                  <button
                    class="icon-btn"
                    :class="{ active: summary.isImportant }"
                    :title="summary.isImportant ? '取消重要' : '標記重要'"
                    @click="toggleImportant(summary.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      :fill="summary.isImportant ? 'currentColor' : 'none'"
                      :stroke="summary.isImportant ? 'none' : 'currentColor'"
                      stroke-width="2"
                    >
                      <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-btn"
                    title="關鍵詞"
                    @click="openKeywordsPopup(summary)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M7 7h10M7 12h4m1 8l-4-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3l-4 4z" />
                    </svg>
                  </button>
                  <button
                    class="icon-btn"
                    title="編輯"
                    @click="startEditSummary(summary.id, summary.content)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      />
                      <path
                        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-btn delete"
                    title="刪除"
                    @click="deleteSummary(summary.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <!-- 編輯模式 -->
              <div
                v-if="editingSummaryId === summary.id"
                class="edit-content-wrapper"
              >
                <textarea
                  v-model="editingSummaryContent"
                  class="edit-textarea"
                  rows="5"
                ></textarea>
                <div class="edit-actions">
                  <button class="btn-edit-cancel" @click="cancelEditSummary">
                    取消
                  </button>
                  <button
                    class="btn-edit-save"
                    @click="saveEditSummary(summary.id)"
                  >
                    保存
                  </button>
                </div>
              </div>
              <!-- 顯示模式 -->
              <div v-else class="summary-content">{{ summary.content }}</div>
              <!-- 關鍵詞標籤預覽 -->
              <div v-if="summary.keywords && summary.keywords.length > 0" class="keywords-preview">
                <span
                  v-for="kw in summary.keywords.slice(0, 6)"
                  :key="kw"
                  class="keyword-tag-mini"
                >{{ kw }}</span>
                <span v-if="summary.keywords.length > 6" class="keyword-more">+{{ summary.keywords.length - 6 }}</span>
              </div>
              <!-- 向量文件預覽 -->
              <button class="vector-doc-toggle" @click="toggleVectorDocPreview(summary.id, summary.content, summary.keywords)">
                {{ vectorDocPreviews.has(summary.id) ? '▼ 收起向量文件' : '▶ 向量文件預覽' }}
              </button>
              <div v-if="vectorDocPreviews.has(summary.id)" class="vector-doc-preview">
                {{ vectorDocPreviews.get(summary.id) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 總結設置 Tab -->
        <div v-show="activeTab === 'settings'" class="tab-content">
          <!-- 設置子分頁 -->
          <div class="settings-sub-tabs">
            <button
              class="sub-tab-item"
              :class="{ active: settingsSubTab === 'trigger' }"
              @click="settingsSubTab = 'trigger'"
            >觸發設定</button>
            <button
              class="sub-tab-item"
              :class="{ active: settingsSubTab === 'read' }"
              @click="settingsSubTab = 'read'"
            >總結讀取</button>
            <button
              class="sub-tab-item"
              :class="{ active: settingsSubTab === 'vector' }"
              @click="settingsSubTab = 'vector'"
            >向量記憶</button>
            <button
              class="sub-tab-item"
              :class="{ active: settingsSubTab === 'batch' }"
              @click="settingsSubTab = 'batch'"
            >
              批量總結
              <span v-if="batchRunningIndex >= 0" class="badge running mini">{{ batchDoneCount }}/{{ batchItems.length }}</span>
              <span v-else-if="batchItems.length > 0 && batchDoneCount > 0" class="badge mini">{{ batchDoneCount }}/{{ batchItems.length }}</span>
            </button>
          </div>

          <!-- 觸發設定 -->
          <div v-show="settingsSubTab === 'trigger'">
            <p class="description">
              控制總結觸發時機、AI 讀取的歷史總結數量和實際對話消息數量
            </p>

            <div class="setting-section">
              <label class="section-label">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"
                  />
                </svg>
                計算模式
              </label>
              <div class="radio-group horizontal">
                <label
                  class="radio-option compact"
                  :class="{ active: localSettings.intervalMode === 'message' }"
                >
                  <input
                    v-model="localSettings.intervalMode"
                    type="radio"
                    value="message"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">消息數</div>
                  </div>
                </label>
                <label
                  class="radio-option compact"
                  :class="{ active: localSettings.intervalMode === 'turn' }"
                >
                  <input
                    v-model="localSettings.intervalMode"
                    type="radio"
                    value="turn"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">輪次</div>
                  </div>
                </label>
              </div>
            </div>

            <div class="setting-section">
              <label class="section-label">總結間隔</label>
              <div class="count-input-wrapper">
                <input
                  v-model.number="currentSummaryInterval"
                  type="range"
                  :min="localSettings.intervalMode === 'turn' ? 5 : 10"
                  :max="localSettings.intervalMode === 'turn' ? 50 : 100"
                  :step="localSettings.intervalMode === 'turn' ? 1 : 5"
                  class="range-input"
                />
                <div class="count-display">
                  <span class="count-number">{{ currentSummaryInterval }}</span>
                  <span class="count-label">{{
                    localSettings.intervalMode === "turn" ? "輪" : "條"
                  }}</span>
                </div>
              </div>
            </div>

            <div class="setting-section">
              <label class="section-label">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
                  />
                </svg>
                日記生成間隔
              </label>
              <div class="count-input-wrapper">
                <input
                  v-model.number="currentDiaryInterval"
                  type="range"
                  :min="localSettings.intervalMode === 'turn' ? 5 : 10"
                  :max="localSettings.intervalMode === 'turn' ? 50 : 100"
                  :step="localSettings.intervalMode === 'turn' ? 1 : 5"
                  class="range-input"
                />
                <div class="count-display">
                  <span class="count-number">{{ currentDiaryInterval }}</span>
                  <span class="count-label">{{
                    localSettings.intervalMode === "turn" ? "輪" : "條"
                  }}</span>
                </div>
              </div>
              <div class="count-hint">角色自動寫日記的觸發間隔</div>
            </div>

            <div class="setting-section">
              <label class="section-label">實際讀取消息</label>
              <div class="radio-group horizontal" style="margin-bottom: 10px">
                <label
                  class="radio-option compact"
                  :class="{
                    active: localSettings.actualMessageMode === 'message',
                  }"
                >
                  <input
                    v-model="localSettings.actualMessageMode"
                    type="radio"
                    value="message"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">按消息數</div>
                  </div>
                </label>
                <label
                  class="radio-option compact"
                  :class="{ active: localSettings.actualMessageMode === 'turn' }"
                >
                  <input
                    v-model="localSettings.actualMessageMode"
                    type="radio"
                    value="turn"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">按輪次</div>
                  </div>
                </label>
              </div>
              <div class="count-input-wrapper">
                <input
                  v-model.number="localSettings.actualMessageCount"
                  type="range"
                  :min="ACTUAL_MESSAGE_COUNT_MIN"
                  :max="ACTUAL_MESSAGE_COUNT_MAX"
                  step="1"
                  class="range-input"
                />
                <div class="manual-count-control">
                  <input
                    v-model.number="localSettings.actualMessageCount"
                    type="number"
                    :min="ACTUAL_MESSAGE_COUNT_MIN"
                    :max="ACTUAL_MESSAGE_COUNT_MAX"
                    step="1"
                    inputmode="numeric"
                    class="manual-count-input"
                    @blur="clampActualMessageCount"
                  />
                  <span class="count-label">{{
                    localSettings.actualMessageMode === "turn" ? "輪" : "條"
                  }}</span>
                </div>
              </div>
              <div class="count-hint">
                AI 每次回覆時實際讀取的對話歷史，可手動輸入 1～1000
              </div>
            </div>
          </div>

          <!-- 總結讀取 -->
          <div v-show="settingsSubTab === 'read'">
            <div class="setting-section">
              <label class="section-label">讀取模式</label>
              <div class="radio-group">
                <label
                  class="radio-option"
                  :class="{ active: localSettings.summaryReadMode === 'recent' }"
                >
                  <input
                    v-model="localSettings.summaryReadMode"
                    type="radio"
                    value="recent"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">讀取最近 N 條總結</div>
                    <div class="option-desc">節省 tokens，適合長期對話</div>
                  </div>
                </label>
                <label
                  class="radio-option"
                  :class="{ active: localSettings.summaryReadMode === 'all' }"
                >
                  <input
                    v-model="localSettings.summaryReadMode"
                    type="radio"
                    value="all"
                    class="radio-input"
                  />
                  <div class="option-content">
                    <div class="option-title">讀取所有總結</div>
                    <div class="option-desc">記憶更完整，但會消耗更多 tokens</div>
                  </div>
                </label>
              </div>
            </div>

            <Transition name="fade">
              <div
                v-if="localSettings.summaryReadMode === 'recent'"
                class="setting-section"
              >
                <label class="section-label">讀取數量</label>
                <div class="count-input-wrapper">
                  <input
                    v-model.number="localSettings.summaryReadCount"
                    type="range"
                    min="1"
                    max="20"
                    class="range-input"
                  />
                  <div class="count-display">
                    <span class="count-number">{{
                      localSettings.summaryReadCount
                    }}</span>
                    <span class="count-label">條總結</span>
                  </div>
                </div>
              </div>
            </Transition>

            <div class="info-section">
              <div class="info-header">當前對話狀態</div>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">總結數量</span>
                  <span class="info-value">{{ summaries.length }} 條</span>
                </div>
                <div class="info-item">
                  <span class="info-label">將讀取</span>
                  <span class="info-value highlight"
                    >{{
                      localSettings.summaryReadMode === "all"
                        ? summaries.length
                        : Math.min(
                            localSettings.summaryReadCount,
                            summaries.length,
                          )
                    }}
                    條</span
                  >
                </div>
                <div class="info-item">
                  <span class="info-label">預估 tokens</span>
                  <span class="info-value">{{ estimatedTokens }} tokens</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 向量記憶 -->
          <div v-show="settingsSubTab === 'vector'">
            <div class="setting-section">
              <p class="count-hint" style="margin-bottom: 4px;">
                {{ settingsStore.vectorMemoryEnabled ? '✅ 已啟用' : '⚪ 未啟用' }}（全域開關在「設定 → 向量記憶 Embedding」）
              </p>
            </div>

            <div class="setting-section">
              <div class="info-grid" style="margin-bottom: 10px;">
                <div class="info-item">
                  <span class="info-label">嵌入數量</span>
                  <span class="info-value">{{ vectorStats.count }} 條</span>
                </div>
                <div class="info-item">
                  <span class="info-label">預估大小</span>
                  <span class="info-value">{{ vectorStats.sizeText }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">待重建</span>
                  <span class="info-value">{{ vectorStats.outdatedCount }} 條</span>
                </div>
              </div>
              <p v-if="vectorStats.outdatedCount > 0" class="count-hint" style="margin-bottom: 10px; color: #c97a00;">
                偵測到 {{ vectorStats.outdatedCount }} 條舊版或失效向量，建議立即重建。
              </p>
              <button
                class="rebuild-btn"
                :disabled="isRebuilding"
                @click="rebuildVectors"
              >
                <svg v-if="!isRebuilding" viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;">
                  <path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/>
                </svg>
                <span v-if="isRebuilding">重建中... {{ rebuildProgress.processed }}/{{ rebuildProgress.total }}</span>
                <span v-else>重建所有嵌入</span>
              </button>
              <div class="count-hint" style="margin-top: 6px; line-height: 1.5;">
                將此聊天的所有總結重新轉為向量嵌入。<br/>
                適用於：首次啟用向量記憶時補建舊總結、或嵌入資料異常需要修復。
              </div>
            </div>
          </div>

          <!-- 批量總結 -->
          <div v-show="settingsSubTab === 'batch'" class="batch-tab">
            <input
              ref="batchFileInput"
              type="file"
              accept=".jsonl"
              style="display: none"
              @change="handleBatchFileChange"
            />

            <!-- 未載入檔案 -->
            <div v-if="!batchParsed" class="setting-section" style="text-align: center; padding: 40px 20px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--color-text-muted, #9ca3af);margin-bottom:12px;opacity:0.5;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 500; color: var(--color-text, #1f2937);">載入 SillyTavern 聊天紀錄</p>
              <p style="margin: 0 0 20px; font-size: 13px; color: var(--color-text-secondary, #6b7280);">支援從酒館匯出的 .jsonl 格式檔案</p>
              <button class="action-btn import" style="margin: 0 auto; padding: 8px 24px; display: inline-flex;" @click="batchFileInput?.click()">
                選擇檔案
              </button>
            </div>

            <!-- 已載入 -->
            <template v-else>
              <!-- 頂部摘要 -->
              <div class="info-section" style="margin-bottom: 16px;">
                <div class="info-header" style="display: flex; justify-content: space-between;">
                  <span><span style="color: var(--color-primary);">{{ batchCharName }}</span> ↔ {{ batchUserName }}</span>
                  <button class="icon-btn" title="重新選擇檔案" @click="resetBatch" :disabled="batchRunningIndex >= 0" style="margin: -4px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>
                    </svg>
                  </button>
                </div>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">消息數</span>
                    <span class="info-value">{{ batchTotalMessages }} 條</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">對話輪次</span>
                    <span class="info-value">{{ batchTotalTurns }} 輪</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">分批數量</span>
                    <span class="info-value highlight">{{ batchItems.length }} 批</span>
                  </div>
                </div>
              </div>

              <!-- 控制列 -->
              <div class="setting-section">
                <label class="section-label">每批輪次</label>
                <div class="count-input-wrapper">
                  <input
                    v-model.number="batchTurnCount"
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    class="range-input"
                    :disabled="batchRunningIndex >= 0"
                  />
                  <div class="count-display">
                    <span class="count-number">{{ batchTurnCount }}</span>
                    <span class="count-label">輪</span>
                  </div>
                </div>
                <div class="count-hint">較少的輪次可以降低失敗率，但會增加 API 請求次數</div>
              </div>

              <!-- 批次列表 -->
              <div class="setting-section" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-bottom: 4px; margin-bottom: 0;">
                <div class="section-label" style="justify-content: space-between;">
                  <span>批次列表</span>
                  <div v-if="batchDoneCount > 0 || batchRunningIndex >= 0" style="font-size: 12px; font-weight: normal; color: var(--color-text-secondary);">
                    進度: <strong style="color: var(--color-primary);">{{ batchDoneCount }}</strong> / {{ batchItems.length }}
                    <span v-if="batchItems.filter(b => b.status === 'failed').length > 0" style="color: #f87171; margin-left: 8px; font-weight: 500;">
                      (失敗 {{ batchItems.filter(b => b.status === 'failed').length }})
                    </span>
                  </div>
                </div>
                
                <div v-if="batchDoneCount > 0 || batchRunningIndex >= 0" class="batch-progress-bar-track" style="margin-bottom: 10px;">
                  <div class="batch-progress-bar-fill" :style="{ width: (batchDoneCount / batchItems.length * 100) + '%' }"></div>
                </div>

                <div class="batch-list" style="margin-top: 0; max-height: 38vh;">
                  <div
                    v-for="item in batchItems"
                    :key="item.index"
                    class="batch-item"
                    :class="'status-' + item.status"
                  >
                    <div class="batch-item-left">
                      <span class="batch-item-num">{{ item.index + 1 }}</span>
                      <div class="batch-item-meta">
                        <span class="batch-item-range">
                          第 {{ item.startTurn }}–{{ item.endTurn }} 輪
                        </span>
                        <span class="batch-item-size" :class="{ oversize: item.estimatedChars > 30000 }">
                          {{ item.messageCount }}條 · ~{{ (item.estimatedChars / 1000).toFixed(1) }}k字
                        </span>
                      </div>
                    </div>
                    <div class="batch-item-right">
                      <template v-if="item.status === 'done'">
                        <span class="batch-status-badge done">完成</span>
                      </template>
                      <template v-else-if="item.status === 'running'">
                        <span class="batch-status-badge running">
                          <span class="dot-pulse"></span>總結中
                        </span>
                      </template>
                      <template v-else-if="item.status === 'failed'">
                        <button class="batch-status-btn retry" :disabled="batchRunningIndex >= 0" @click="runSingleBatch(item.index)">重試</button>
                      </template>
                      <template v-else>
                        <button class="batch-status-btn start" :disabled="batchRunningIndex >= 0" @click="runSingleBatch(item.index)">總結</button>
                      </template>
                    </div>
                    <div v-if="item.error" class="batch-item-error">
                      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;flex-shrink:0;margin-top:1px">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                      </svg>
                      <span>{{ item.error }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 重要事件 Tab -->
        <div v-show="activeTab === 'events'" class="tab-content">
          <!-- AI 提取中的提示 -->
          <div v-if="isExtractingEvents" class="generating-summary">
            <div class="loading-spinner"></div>
            <span>AI 正在提取重要事件...</span>
          </div>

          <div class="events-settings">
            <label class="setting-item">
              <input
                v-model="eventsSettings.enabled"
                type="checkbox"
                @change="saveEventsLog"
              />
              <span>啟用重要事件記錄本</span>
            </label>
            <label class="setting-item">
              <input
                v-model="eventsSettings.autoSave"
                type="checkbox"
                @change="saveEventsLog"
              />
              <span>自動從對話中提取重要事件</span>
            </label>
            <div class="setting-item slider-setting">
              <span>注入上限</span>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                v-model.number="eventsSettings.maxEvents"
                @change="saveEventsLog"
              />
              <span class="slider-value"
                >{{ eventsSettings.maxEvents }} 筆</span
              >
            </div>
          </div>

          <div class="add-event-section">
            <h4>添加新事件</h4>
            <textarea
              v-model="newEventContent"
              placeholder="例如：{{user}} 答應了周末一起去看電影"
              rows="2"
              class="event-textarea"
            ></textarea>
            <div class="event-meta">
              <select v-model="newEventCategory" class="meta-select">
                <option value="relationship">關係與交往</option>
                <option value="promise">約定與承諾</option>
                <option value="secret">秘密與隱私</option>
                <option value="fact">重要事實</option>
                <option value="custom">其他</option>
              </select>
              <select v-model="newEventPriority" class="meta-select">
                <option :value="1">最重要</option>
                <option :value="2">重要</option>
                <option :value="3">一般</option>
              </select>
            </div>
            <button
              class="btn-add"
              :disabled="!newEventContent.trim()"
              @click="addEvent"
            >
              添加事件
            </button>
          </div>

          <div class="events-list-section">
            <h4>已記錄的事件 ({{ events.length }})</h4>
            <div v-if="events.length === 0" class="empty-state small">
              <p>還沒有記錄任何重要事件</p>
            </div>
            <div v-else class="events-list">
              <div
                v-for="event in events"
                :key="event.id"
                class="event-item"
                :class="`priority-${event.priority || 3}`"
              >
                <div class="event-header">
                  <span class="event-category">{{
                    getCategoryName(event.category)
                  }}</span>
                  <span class="event-time">{{
                    formatTime(event.timestamp)
                  }}</span>
                  <button
                    class="btn-edit"
                    title="編輯"
                    @click.stop="startEditEvent(event)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      />
                      <path
                        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      />
                    </svg>
                  </button>
                  <button
                    class="btn-delete"
                    title="刪除"
                    @click.stop="deleteEvent(event.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
                <!-- 編輯模式 -->
                <div
                  v-if="editingEventId === event.id"
                  class="event-edit-wrapper"
                >
                  <textarea
                    v-model="editingEventContent"
                    class="event-edit-textarea"
                    rows="3"
                  ></textarea>
                  <div class="event-edit-meta">
                    <select v-model="editingEventCategory" class="meta-select">
                      <option value="relationship">關係與交往</option>
                      <option value="promise">約定與承諾</option>
                      <option value="secret">秘密與隱私</option>
                      <option value="fact">重要事實</option>
                      <option value="custom">其他</option>
                    </select>
                    <select v-model="editingEventPriority" class="meta-select">
                      <option :value="1">最重要</option>
                      <option :value="2">重要</option>
                      <option :value="3">一般</option>
                    </select>
                  </div>
                  <div class="event-edit-actions">
                    <button class="btn-edit-cancel" @click="cancelEditEvent">
                      取消
                    </button>
                    <button class="btn-edit-save" @click="saveEditEvent">
                      保存
                    </button>
                  </div>
                </div>
                <!-- 顯示模式 -->
                <div v-else class="event-content">{{ event.content }}</div>
                <!-- 向量關鍵詞預覽 -->
                <div v-if="event.vectorKeywords && event.vectorKeywords.length > 0" class="keywords-preview">
                  <span
                    v-for="kw in event.vectorKeywords.slice(0, 6)"
                    :key="kw"
                    class="keyword-tag-mini"
                  >{{ kw }}</span>
                  <span v-if="event.vectorKeywords.length > 6" class="keyword-more">+{{ event.vectorKeywords.length - 6 }}</span>
                </div>
                <!-- 向量文件預覽 -->
                <button class="vector-doc-toggle" @click="toggleVectorDocPreview(event.id, event.content, event.vectorKeywords)">
                  {{ vectorDocPreviews.has(event.id) ? '▼ 收起向量文件' : '▶ 向量文件預覽' }}
                </button>
                <div v-if="vectorDocPreviews.has(event.id)" class="vector-doc-preview">
                  {{ vectorDocPreviews.get(event.id) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 日記 Tab -->
        <div v-show="activeTab === 'diary'" class="tab-content">
          <div v-if="diaries.length === 0" class="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor" class="empty-icon">
              <path
                d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
              />
            </svg>
            <p class="empty-title">還沒有日記</p>
            <p class="empty-hint">繼續聊天，{{ characterName }} 會自動寫日記</p>
          </div>

          <div v-else class="diaries-list">
            <div
              v-for="diary in sortedDiaries"
              :key="diary.id"
              class="diary-card"
              :class="{
                favorite: diary.isFavorite,
                writing: diary.status === 'writing',
              }"
            >
              <div class="diary-header">
                <div class="diary-icon-wrapper">
                  <svg
                    v-if="diary.status === 'writing'"
                    class="diary-icon writing"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  </svg>
                  <svg
                    v-else
                    class="diary-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
                    />
                  </svg>
                </div>
                <div class="diary-info">
                  <span class="diary-date">{{
                    formatDate(diary.createdAt)
                  }}</span>
                  <span v-if="diary.status === 'writing'" class="diary-status"
                    >正在寫...</span
                  >
                  <span v-else class="diary-count"
                    >{{ diary.messageCount }} 條對話</span
                  >
                </div>
                <div class="diary-actions">
                  <button
                    v-if="diary.status === 'ready'"
                    class="icon-btn"
                    :class="{ active: diary.isFavorite }"
                    :title="diary.isFavorite ? '取消收藏' : '收藏'"
                    @click="toggleDiaryFavorite(diary.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      :fill="diary.isFavorite ? 'currentColor' : 'none'"
                      :stroke="diary.isFavorite ? 'none' : 'currentColor'"
                      stroke-width="2"
                    >
                      <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-btn delete"
                    title="刪除"
                    @click="deleteDiary(diary.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                v-if="diary.status === 'ready'"
                class="diary-preview"
                @click="viewDiary(diary)"
              >
                {{
                  diary.content.length > 100
                    ? diary.content.substring(0, 100) + "..."
                    : diary.content
                }}
              </div>
              <div v-else class="diary-writing-hint">
                <div class="loading-dots">
                  <span></span><span></span><span></span>
                </div>
                <span>{{ characterName }} 正在深度思考...</span>
              </div>
              <button
                v-if="diary.status === 'ready'"
                class="view-btn"
                @click="viewDiary(diary)"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                查看完整日記
              </button>
            </div>
          </div>
        </div>

        <!-- 批量總結 Tab -->
        <div v-show="activeTab === 'batch'" class="tab-content batch-tab">
          <input
            ref="batchFileInput"
            type="file"
            accept=".jsonl"
            style="display: none"
            @change="handleBatchFileChange"
          />

          <!-- 未載入檔案 -->
          <div v-if="!batchParsed" class="batch-upload-area" @click="batchFileInput?.click()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;opacity:0.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <p class="batch-upload-title">點擊上傳 SillyTavern JSONL</p>
            <p class="batch-upload-hint">支援從酒館匯出的 .jsonl 聊天紀錄</p>
          </div>

          <!-- 已載入 -->
          <template v-else>
            <!-- 頂部摘要 -->
            <div class="batch-header">
              <div class="batch-header-title">
                <span class="batch-char-name">{{ batchCharName }}</span>
                <span class="batch-header-sep">↔</span>
                <span class="batch-user-name">{{ batchUserName }}</span>
              </div>
              <div class="batch-header-stats">
                <span class="batch-stat"><strong>{{ batchTotalMessages }}</strong> 條</span>
                <span class="batch-stat-sep">·</span>
                <span class="batch-stat"><strong>{{ batchTotalTurns }}</strong> 輪</span>
                <span class="batch-stat-sep">·</span>
                <span class="batch-stat"><strong>{{ batchItems.length }}</strong> 批</span>
              </div>
            </div>

            <!-- 控制列 -->
            <div class="batch-controls">
              <div class="batch-slider-group">
                <label class="batch-slider-label">每批輪次</label>
                <input
                  v-model.number="batchTurnCount"
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  class="range-input"
                  :disabled="batchRunningIndex >= 0"
                />
                <span class="batch-slider-value">{{ batchTurnCount }}</span>
              </div>
              <button class="batch-reselect-btn" @click="resetBatch" :disabled="batchRunningIndex >= 0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>
                </svg>
                換檔
              </button>
            </div>

            <!-- 進度總覽 -->
            <div v-if="batchDoneCount > 0 || batchRunningIndex >= 0" class="batch-progress-section">
              <div class="batch-progress-bar-track">
                <div class="batch-progress-bar-fill" :style="{ width: (batchDoneCount / batchItems.length * 100) + '%' }"></div>
              </div>
              <div class="batch-progress-text">
                <span>已完成 <strong>{{ batchDoneCount }}</strong> / {{ batchItems.length }}</span>
                <span v-if="batchItems.filter(b => b.status === 'failed').length > 0" class="batch-failed-count">
                  失敗 {{ batchItems.filter(b => b.status === 'failed').length }}
                </span>
              </div>
            </div>

            <!-- 批次列表 -->
            <div class="batch-list">
              <div
                v-for="item in batchItems"
                :key="item.index"
                class="batch-item"
                :class="'status-' + item.status"
              >
                <div class="batch-item-left">
                  <span class="batch-item-num">{{ item.index + 1 }}</span>
                  <div class="batch-item-meta">
                    <span class="batch-item-range">
                      第 {{ item.startTurn }}–{{ item.endTurn }} 輪
                    </span>
                    <span class="batch-item-size" :class="{ oversize: item.estimatedChars > 30000 }">
                      {{ item.messageCount }}條 · ~{{ (item.estimatedChars / 1000).toFixed(1) }}k字
                    </span>
                  </div>
                </div>
                <div class="batch-item-right">
                  <template v-if="item.status === 'done'">
                    <span class="batch-status-badge done">完成</span>
                  </template>
                  <template v-else-if="item.status === 'running'">
                    <span class="batch-status-badge running">
                      <span class="dot-pulse"></span>總結中
                    </span>
                  </template>
                  <template v-else-if="item.status === 'failed'">
                    <button class="batch-status-btn retry" :disabled="batchRunningIndex >= 0" @click="runSingleBatch(item.index)">重試</button>
                  </template>
                  <template v-else>
                    <button class="batch-status-btn start" :disabled="batchRunningIndex >= 0" @click="runSingleBatch(item.index)">總結</button>
                  </template>
                </div>
                <div v-if="item.error" class="batch-item-error">
                  <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;flex-shrink:0;margin-top:1px">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <span>{{ item.error }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 底部按鈕 - 總結內容 Tab -->
      <div v-if="activeTab === 'history'" class="modal-footer summary-footer">
        <button class="btn-cancel" @click="$emit('close')">關閉</button>
        <button
          class="action-btn select"
          :class="{ active: isSelectAll }"
          @click="toggleSelectAll"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path v-if="isSelectAll" d="M9 12l2 2 4-4" />
          </svg>
          全選
        </button>
        <button
          class="action-btn manual"
          :disabled="isGeneratingSummary"
          @click="triggerManualSummary"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          手動總結
        </button>
        <button
          class="action-btn meta"
          :disabled="selectedSummaryIds.length === 0"
          @click="generateMetaSummary"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
            />
          </svg>
          元總結
        </button>
        <button
          class="action-btn delete-selected"
          :disabled="selectedSummaryIds.length === 0"
          @click="deleteSelected"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
          刪除選取{{ selectedSummaryIds.length > 0 ? ` (${selectedSummaryIds.length})` : '' }}
        </button>
        <button class="action-btn import" @click="triggerImport">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
            />
          </svg>
          導入
        </button>
        <button
          class="action-btn export"
          :disabled="summaries.length === 0"
          @click="exportAllSummaries"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            />
          </svg>
          導出全部
        </button>
      </div>

      <!-- 底部按鈕 - 日記 Tab -->
      <div v-if="activeTab === 'diary'" class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')">關閉</button>
        <button
          class="btn-save"
          :disabled="isDiaryWriting"
          @click="triggerManualDiary()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style="width: 16px; height: 16px; margin-right: 6px"
          >
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          </svg>
          {{ isDiaryWriting ? "正在生成..." : "手動生成日記" }}
        </button>
      </div>

      <!-- 底部按鈕 - 重要事件 Tab -->
      <div v-if="activeTab === 'events'" class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')">關閉</button>
        <button
          class="btn-save"
          :disabled="isExtractingEvents"
          @click="emit('trigger-manual-events')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style="width: 16px; height: 16px; margin-right: 6px"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ isExtractingEvents ? "正在提取..." : "手動提取事件" }}
        </button>
      </div>

      <!-- 底部按鈕 - 總結設置 Tab -->
      <div v-if="activeTab === 'settings'" class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')">關閉</button>
        <template v-if="settingsSubTab === 'batch'">
          <button
            v-if="batchRunningIndex >= 0"
            class="btn-abort"
            @click="abortBatch"
          >
            中止
          </button>
          <button
            v-else-if="batchParsed && batchPendingCount > 0"
            class="btn-save"
            @click="runAllBatches"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px">
              <path d="M5 3l14 9-14 9V3z"/>
            </svg>
            全部執行 ({{ batchPendingCount }} 批)
          </button>
        </template>
        <template v-else>
          <button class="btn-save" @click="saveAll">保存設置</button>
        </template>
      </div>
    </div>

    <!-- 關鍵詞編輯彈窗 -->
    <Teleport to="body">
      <div v-if="keywordsSummaryId" class="keywords-overlay" @click="closeKeywordsPopup">
        <div class="keywords-popup" @click.stop>
          <div class="keywords-popup-header">
            <h4>檢索關鍵詞</h4>
            <button class="close-btn" @click="closeKeywordsPopup">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          <p class="keywords-hint">這些關鍵詞用於向量記憶檢索匹配。你可以刪除不需要的或新增自訂關鍵詞。</p>
          <div class="keywords-tags">
            <span
              v-for="(kw, idx) in keywordsEditing"
              :key="idx"
              class="keyword-tag"
            >
              {{ kw }}
              <button class="keyword-remove" @click="removeKeyword(idx)">×</button>
            </span>
            <span v-if="keywordsEditing.length === 0" class="keywords-empty">尚無關鍵詞</span>
          </div>
          <div class="keywords-add-row">
            <input
              v-model="newKeywordInput"
              class="keywords-input"
              placeholder="輸入新關鍵詞..."
              @keydown.enter.prevent="addKeyword"
            />
            <button class="keywords-add-btn" @click="addKeyword">新增</button>
          </div>
          <div class="keywords-popup-footer">
            <button class="btn-cancel" @click="closeKeywordsPopup">取消</button>
            <button class="btn-save" @click="saveKeywords">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import {
    createDefaultSummarySettings,
    type SummarySettings,
} from "@/types/chat";
import { useSettingsStore } from "@/stores/settings";
import type { DiaryData } from "@/types/diary";
import type {
    ImportantEventCategory,
    ImportantEventPriority,
    ImportantEventsLog,
} from "@/types/importantEvents";
import {
    createDefaultImportantEventsLog,
    createImportantEvent,
} from "@/types/importantEvents";
import { computed, onMounted, ref, watch } from "vue";

interface ConversationSummary {
  id: string;
  content: string;
  createdAt: number;
  messageCount: number;
  isImportant?: boolean;
  isManual?: boolean;
  isMeta?: boolean;
  keywords?: string[];
}

interface BatchMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

const props = defineProps<{
  chatId: string;
  characterId: string;
  characterName: string;
  summaries?: ConversationSummary[];
  diaries?: DiaryData[];
  isGeneratingSummary?: boolean;
  isExtractingEvents?: boolean;
  /** 從聊天載入的現有設定 */
  initialSettings?: SummarySettings;
  /** 單批總結函數（由 composable 提供） */
  summarizeBatchFn?: (messages: BatchMessage[], charName: string, userName: string, signal?: AbortSignal) => Promise<{ success: boolean; error?: string }>;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: typeof localSettings.value];
  "toggle-important": [id: string];
  "delete-summary": [id: string];
  "edit-summary": [id: string, content: string];
  "view-diary": [diary: DiaryData];
  "toggle-diary-favorite": [id: string];
  "delete-diary": [id: string];
  "trigger-manual-diary": [
    settings: {
      actualMessageCount: number;
      actualMessageMode: "message" | "turn";
    },
  ];
  "trigger-manual-summary": [
    settings: {
      actualMessageCount: number;
      actualMessageMode: "message" | "turn";
    },
  ];
  "generate-meta-summary": [summaryIds: string[]];
  "import-summaries": [summaries: ConversationSummary[]];
  "trigger-manual-events": [];
  "delete-selected": [ids: string[]];
  "refresh-summaries": [];
}>();

const activeTab = ref<"history" | "settings" | "events" | "diary" | "batch">("history");
const settingsSubTab = ref<'trigger' | 'read' | 'vector' | 'batch'>('trigger');
const settingsStore = useSettingsStore();
const ACTUAL_MESSAGE_COUNT_MIN = 1;
const ACTUAL_MESSAGE_COUNT_MAX = 1000;

// ===== 向量文件預覽 =====
const vectorDocPreviews = ref<Map<string, string>>(new Map());

async function toggleVectorDocPreview(id: string, content?: string, keywords?: string[]) {
  if (vectorDocPreviews.value.has(id)) {
    const next = new Map(vectorDocPreviews.value);
    next.delete(id);
    vectorDocPreviews.value = next;
    return;
  }
  if (!content) return;
  const { buildVectorDocument } = await import('@/utils/vectorDocumentBuilder');
  const doc = buildVectorDocument(content, keywords, [props.characterName]);
  const next = new Map(vectorDocPreviews.value);
  next.set(id, doc || '（空）');
  vectorDocPreviews.value = next;
}

// ===== 總結編輯相關 =====
const editingSummaryId = ref<string | null>(null);
const editingSummaryContent = ref("");

function startEditSummary(id: string, content: string) {
  editingSummaryId.value = id;
  editingSummaryContent.value = content;
}

function cancelEditSummary() {
  editingSummaryId.value = null;
  editingSummaryContent.value = "";
}

async function saveEditSummary(id: string) {
  if (!editingSummaryContent.value.trim()) return;
  try {
    // 從 IndexedDB 讀取現有總結
    const existing = await db.get<ConversationSummary>(DB_STORES.SUMMARIES, id);
    if (existing) {
      existing.content = editingSummaryContent.value.trim();
      await db.put(DB_STORES.SUMMARIES, JSON.parse(JSON.stringify(existing)));
      // 通知父組件刷新數據
      emit("edit-summary", id, editingSummaryContent.value.trim());
    }
  } catch (e) {
    console.error("保存總結失敗:", e);
  }
  cancelEditSummary();
}

// ===== 手動總結相關 =====
const isGeneratingSummary = computed(() => props.isGeneratingSummary || false);
const selectedSummaryIds = ref<string[]>([]);
const importFileInput = ref<HTMLInputElement | null>(null);

// ===== 關鍵詞查看/編輯 =====
const keywordsSummaryId = ref<string | null>(null);
const keywordsEditing = ref<string[]>([]);
const newKeywordInput = ref('');

function openKeywordsPopup(summary: ConversationSummary) {
  keywordsSummaryId.value = summary.id;
  // 若尚無關鍵詞，從內容即時提取
  if (summary.keywords && summary.keywords.length > 0) {
    keywordsEditing.value = [...summary.keywords];
  } else {
    import('@/utils/summaryKeywordExtractor').then(({ extractSummaryKeywords }) => {
      keywordsEditing.value = extractSummaryKeywords(summary.content);
    });
  }
  newKeywordInput.value = '';
}

function closeKeywordsPopup() {
  keywordsSummaryId.value = null;
  keywordsEditing.value = [];
  newKeywordInput.value = '';
}

function removeKeyword(index: number) {
  keywordsEditing.value.splice(index, 1);
}

function addKeyword() {
  const kw = newKeywordInput.value.trim();
  if (kw && !keywordsEditing.value.includes(kw)) {
    keywordsEditing.value.push(kw);
  }
  newKeywordInput.value = '';
}

async function saveKeywords() {
  const id = keywordsSummaryId.value;
  if (!id) return;
  try {
    const existing = await db.get<ConversationSummary>(DB_STORES.SUMMARIES, id);
    if (existing) {
      existing.keywords = [...keywordsEditing.value];
      await db.put(DB_STORES.SUMMARIES, JSON.parse(JSON.stringify(existing)));
    }
    // 同步更新 props 中的資料（透過父組件的 ref）
    const summary = summaries.value.find(s => s.id === id);
    if (summary) {
      (summary as any).keywords = [...keywordsEditing.value];
    }
    console.log(`[AISummaryPanel] 關鍵詞已保存: ${id}，共 ${keywordsEditing.value.length} 個`);
  } catch (e) {
    console.error('保存關鍵詞失敗:', e);
  }
  closeKeywordsPopup();
}

const isSelectAll = computed(
  () =>
    summaries.value.length > 0 &&
    selectedSummaryIds.value.length === summaries.value.length,
);

function toggleSelectAll() {
  if (isSelectAll.value) {
    selectedSummaryIds.value = [];
  } else {
    selectedSummaryIds.value = summaries.value.map((s) => s.id);
  }
}

function toggleSummarySelection(id: string) {
  const index = selectedSummaryIds.value.indexOf(id);
  if (index === -1) {
    selectedSummaryIds.value.push(id);
  } else {
    selectedSummaryIds.value.splice(index, 1);
  }
}

function triggerManualSummary() {
  clampActualMessageCount();
  emit("trigger-manual-summary", {
    actualMessageCount: localSettings.value.actualMessageCount,
    actualMessageMode: localSettings.value.actualMessageMode,
  });
}

function triggerManualDiary() {
  clampActualMessageCount();
  emit("trigger-manual-diary", {
    actualMessageCount: localSettings.value.actualMessageCount,
    actualMessageMode: localSettings.value.actualMessageMode,
  });
}

function generateMetaSummary() {
  if (selectedSummaryIds.value.length === 0) return;
  emit("generate-meta-summary", [...selectedSummaryIds.value]);
  selectedSummaryIds.value = [];
}

function deleteSelected() {
  if (selectedSummaryIds.value.length === 0) return;
  if (!confirm(`確定要刪除選取的 ${selectedSummaryIds.value.length} 條總結嗎？`)) return;
  emit("delete-selected", [...selectedSummaryIds.value]);
  selectedSummaryIds.value = [];
}

function triggerImport() {
  importFileInput.value?.click();
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (Array.isArray(data)) {
        emit("import-summaries", data);
      } else if (data.summaries && Array.isArray(data.summaries)) {
        emit("import-summaries", data.summaries);
      }
    } catch (err) {
      console.error("導入失敗:", err);
      alert("導入失敗：文件格式不正確");
    }
  };
  reader.readAsText(file);
  input.value = "";
}

function exportAllSummaries() {
  if (summaries.value.length === 0) return;
  const exportData = {
    exportedAt: Date.now(),
    characterId: props.characterId,
    chatId: props.chatId,
    summaries: summaries.value,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `summaries_${props.characterName || "export"}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 總結數據 =====
const summaries = computed(() => props.summaries || []);
const sortedSummaries = computed(() =>
  [...summaries.value].sort((a, b) => b.createdAt - a.createdAt),
);

// ===== 日記數據 =====
const diaries = computed(() => props.diaries || []);
const sortedDiaries = computed(() =>
  [...diaries.value].sort((a, b) => b.createdAt - a.createdAt),
);
const isDiaryWriting = computed(() =>
  diaries.value.some((d) => d.status === "writing"),
);

// ===== 總結設置 =====
const localSettings = ref<SummarySettings>(createDefaultSummarySettings());

function normalizeActualMessageCount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return createDefaultSummarySettings().actualMessageCount;
  return Math.min(
    ACTUAL_MESSAGE_COUNT_MAX,
    Math.max(ACTUAL_MESSAGE_COUNT_MIN, Math.round(numeric)),
  );
}

function clampActualMessageCount() {
  localSettings.value.actualMessageCount = normalizeActualMessageCount(
    localSettings.value.actualMessageCount,
  );
}

const currentSummaryInterval = computed({
  get: () =>
    localSettings.value.intervalMode === "turn"
      ? localSettings.value.summaryIntervalTurn
      : localSettings.value.summaryIntervalMessage,
  set: (val: number) => {
    if (localSettings.value.intervalMode === "turn")
      localSettings.value.summaryIntervalTurn = val;
    else localSettings.value.summaryIntervalMessage = val;
  },
});

const currentDiaryInterval = computed({
  get: () =>
    localSettings.value.intervalMode === "turn"
      ? localSettings.value.diaryIntervalTurn
      : localSettings.value.diaryIntervalMessage,
  set: (val: number) => {
    if (localSettings.value.intervalMode === "turn")
      localSettings.value.diaryIntervalTurn = val;
    else localSettings.value.diaryIntervalMessage = val;
  },
});

const estimatedTokens = computed(() => {
  const count =
    localSettings.value.summaryReadMode === "all"
      ? summaries.value.length
      : Math.min(localSettings.value.summaryReadCount, summaries.value.length);
  return count * 150;
});

// ===== 向量記憶設定 =====
const vectorTopK = computed({
  get: () => localSettings.value.vectorTopK ?? 5,
  set: (val: number) => { localSettings.value.vectorTopK = val; },
});
const vectorThreshold = computed({
  get: () => localSettings.value.vectorThreshold ?? 0.3,
  set: (val: number) => { localSettings.value.vectorThreshold = val; },
});
const vectorStats = ref({ count: 0, sizeText: '計算中...', outdatedCount: 0 });
const isRebuilding = ref(false);
const rebuildProgress = ref({ processed: 0, total: 0 });

// ===== 嵌入模式（全域設定，在 SettingsScreen 的 embedding-card 中切換） =====

async function loadVectorStats() {
  try {
    const { getVectorStats } = await import('@/db/vectorStore');
    const stats = await getVectorStats(props.chatId);
    vectorStats.value = {
      count: stats.count,
      sizeText: stats.count === 0 ? '0 KB' : `≈ ${Math.ceil(stats.count * 6 / 1024)} KB`,
      outdatedCount: stats.outdatedCount,
    };
  } catch {
    vectorStats.value = { count: 0, sizeText: '無法計算', outdatedCount: 0 };
  }
}

async function rebuildVectors() {
  if (isRebuilding.value) return;
  if (!confirm('確定要重建所有向量嵌入嗎？這會刪除現有嵌入並重新生成。')) return;
  isRebuilding.value = true;
  rebuildProgress.value = { processed: 0, total: 0 };
  try {
    const { MemoryRetrieverService } = await import('@/services/memoryRetriever');
    const retriever = new MemoryRetrieverService();
    await retriever.rebuildChat(props.chatId, props.characterId, (processed, total) => {
      rebuildProgress.value = { processed, total };
    }, [props.characterName]);
    await loadEventsLog();
    await backfillKeywords();
    emit('refresh-summaries');
    await loadVectorStats();
    alert('重建完成！');
  } catch (err) {
    console.error('[向量記憶] 重建失敗:', err);
    alert('重建失敗，請檢查 Embedding API 設定');
  } finally {
    isRebuilding.value = false;
  }
}

// ===== 重要事件 =====
const eventsLog = ref<ImportantEventsLog | null>(null);
const eventsSettings = ref({ enabled: true, autoSave: true, maxEvents: 50 });
const newEventContent = ref("");
const newEventCategory = ref<ImportantEventCategory>("custom");
const newEventPriority = ref<ImportantEventPriority>(2);
const events = computed(() => eventsLog.value?.events || []);

// 事件編輯狀態
const editingEventId = ref<string | null>(null);
const editingEventContent = ref("");
const editingEventCategory = ref<ImportantEventCategory>("custom");
const editingEventPriority = ref<ImportantEventPriority>(2);

async function loadEventsLog() {
  try {
    await db.init();
    const id = props.chatId || props.characterId;
    const existing = await db.get<ImportantEventsLog>(
      DB_STORES.IMPORTANT_EVENTS,
      id,
    );
    if (existing) {
      eventsLog.value = existing;
      eventsSettings.value = { ...existing.settings };
    } else {
      eventsLog.value = createDefaultImportantEventsLog(
        props.characterId,
        props.chatId,
      );
    }
  } catch (e) {
    console.error("載入重要事件失敗:", e);
    eventsLog.value = createDefaultImportantEventsLog(
      props.characterId,
      props.chatId,
    );
  }
}

async function saveEventsLog() {
  if (!eventsLog.value) return;
  try {
    eventsLog.value.settings = { ...eventsSettings.value };
    eventsLog.value.updatedAt = Date.now();
    await db.put(
      DB_STORES.IMPORTANT_EVENTS,
      JSON.parse(JSON.stringify(eventsLog.value)),
    );
  } catch (e) {
    console.error("保存重要事件失敗:", e);
  }
}

function addEvent() {
  if (!newEventContent.value.trim() || !eventsLog.value) return;
  const event = createImportantEvent(newEventContent.value.trim(), {
    category: newEventCategory.value,
    priority: newEventPriority.value,
    tags: [],
    source: "user",
  });
  eventsLog.value.events.unshift(event);
  saveEventsLog();
  newEventContent.value = "";
  newEventPriority.value = 2;

  // 為新事件生成向量嵌入（背景執行）
  if (settingsStore.vectorMemoryEnabled && props.chatId) {
    import('@/services/memoryRetriever').then(({ MemoryRetrieverService }) => {
      const retriever = new MemoryRetrieverService();
      retriever.generateAndStoreEmbedding(
        event.id,
        'event',
        event.content,
        props.chatId,
        props.characterId,
      ).catch((e) => console.warn('[重要事件] 手動事件嵌入失敗:', e));
    });
  }
}

function deleteEvent(eventId: string) {
  if (!eventsLog.value || !confirm("確定要刪除這個重要事件嗎？")) return;
  eventsLog.value.events = eventsLog.value.events.filter(
    (e) => e.id !== eventId,
  );
  saveEventsLog();

  // 刪除對應的向量嵌入（背景執行）
  import('@/db/vectorStore').then(({ deleteVectorEmbedding }) => {
    deleteVectorEmbedding(`vec_${eventId}`).catch(() => {});
  });
}

function startEditEvent(event: {
  id: string;
  content: string;
  category?: ImportantEventCategory;
  priority?: ImportantEventPriority;
}) {
  editingEventId.value = event.id;
  editingEventContent.value = event.content;
  editingEventCategory.value = event.category || "custom";
  editingEventPriority.value = event.priority || 2;
}

function cancelEditEvent() {
  editingEventId.value = null;
  editingEventContent.value = "";
  editingEventCategory.value = "custom";
  editingEventPriority.value = 2;
}

function saveEditEvent() {
  if (
    !eventsLog.value ||
    !editingEventId.value ||
    !editingEventContent.value.trim()
  )
    return;
  const eventIndex = eventsLog.value.events.findIndex(
    (e) => e.id === editingEventId.value,
  );
  if (eventIndex !== -1) {
    eventsLog.value.events[eventIndex].content =
      editingEventContent.value.trim();
    eventsLog.value.events[eventIndex].category = editingEventCategory.value;
    eventsLog.value.events[eventIndex].priority = editingEventPriority.value;
    saveEventsLog();
  }
  cancelEditEvent();
}

// ===== 總結操作 =====
function toggleImportant(id: string) {
  emit("toggle-important", id);
}
function deleteSummary(id: string) {
  if (confirm("確定要刪除這條總結嗎？")) emit("delete-summary", id);
}

// ===== 日記操作 =====
function viewDiary(diary: DiaryData) {
  emit("view-diary", diary);
}
function toggleDiaryFavorite(id: string) {
  emit("toggle-diary-favorite", id);
}
function deleteDiary(id: string) {
  if (confirm("確定要刪除這篇日記嗎？")) emit("delete-diary", id);
}

// ===== 輔助函數 =====
function getCategoryName(category?: string) {
  const names: Record<string, string> = {
    relationship: "關係",
    promise: "約定",
    secret: "秘密",
    fact: "事實",
    custom: "其他",
  };
  return names[category || "custom"] || "其他";
}

function formatTime(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (days === 0)
    return (
      "今天 " +
      date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
    );
  if (days === 1)
    return (
      "昨天 " +
      date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
    );
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
}

function saveAll() {
  clampActualMessageCount();
  emit("save", { ...localSettings.value });
  saveEventsLog();
  emit("close");
}

// ===== 批量總結 =====
const batchFileInput = ref<HTMLInputElement | null>(null);
const batchParsed = ref(false);
const batchCharName = ref('');
const batchUserName = ref('');
const batchMessages = ref<BatchMessage[]>([]);
const batchTurnCount = ref(15);

const batchTotalMessages = computed(() => batchMessages.value.length);
const batchTotalTurns = computed(() => batchMessages.value.filter(m => m.role === 'user').length);

interface BatchItem {
  index: number;
  messages: BatchMessage[];
  turnCount: number;
  messageCount: number;
  estimatedChars: number;
  startTurn: number;
  endTurn: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
}

const batchItemStatuses = ref<Map<number, 'pending' | 'running' | 'done' | 'failed'>>(new Map());
const batchItemErrors = ref<Map<number, string>>(new Map());
let batchAbortController: AbortController | null = null;

function splitMessagesByTurns(messages: BatchMessage[], turnsPerBatch: number): BatchMessage[][] {
  const batches: BatchMessage[][] = [];
  let currentBatch: BatchMessage[] = [];
  let turnUserCount = 0;
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (turnUserCount > 0 && turnUserCount % turnsPerBatch === 0) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      turnUserCount++;
    }
    currentBatch.push(msg);
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

const batchItems = computed<BatchItem[]>(() => {
  if (!batchParsed.value || batchMessages.value.length === 0) return [];
  const raw = splitMessagesByTurns(batchMessages.value, batchTurnCount.value);
  let globalTurnIdx = 0;
  let msgPtr = 0;
  return raw.map((msgs, i) => {
    // 計算此批在全局的起止輪次
    const startTurn = globalTurnIdx + 1;
    for (const m of msgs) {
      if (m.role === 'user') globalTurnIdx++;
    }
    const endTurn = globalTurnIdx;
    return {
      index: i,
      messages: msgs,
      turnCount: msgs.filter(m => m.role === 'user').length,
      messageCount: msgs.length,
      estimatedChars: msgs.reduce((sum, m) => sum + m.content.length, 0),
      startTurn,
      endTurn,
      status: batchItemStatuses.value.get(i) || 'pending',
      error: batchItemErrors.value.get(i),
    };
  });
});

const batchRunningIndex = computed(() => batchItems.value.findIndex(b => b.status === 'running'));
const batchDoneCount = computed(() => batchItems.value.filter(b => b.status === 'done').length);
const batchPendingCount = computed(() => batchItems.value.filter(b => b.status === 'pending' || b.status === 'failed').length);

watch(batchTurnCount, () => {
  // 調整輪次數時重置所有批次狀態
  batchItemStatuses.value = new Map();
  batchItemErrors.value = new Map();
});

function parseJsonlToMessages(text: string): { messages: BatchMessage[]; charName: string; userName: string } | null {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;

  let metadata: any;
  try { metadata = JSON.parse(lines[0]); } catch { return null; }

  const charName = metadata.character_name || metadata.name || '角色';
  const userName = metadata.user_name || 'User';

  const messages: BatchMessage[] = [];
  for (let i = 1; i < lines.length; i++) {
    let msgData: any;
    try { msgData = JSON.parse(lines[i]); } catch { continue; }

    // 跳過沒有實際訊息內容的行（例如純狀態/metadata 行）
    if (!msgData.mes || typeof msgData.is_user !== 'boolean') continue;

    const isUser = !!msgData.is_user;
    let content = msgData.mes || '';
    if (msgData.swipes && Array.isArray(msgData.swipes) && msgData.swipe_id !== undefined) {
      content = msgData.swipes[msgData.swipe_id] || content;
    }
    
    // 如果包含 <content> 標籤，則只提取 <content> 標籤內的文字
    const contentRegex = /<content>([\s\S]*?)<\/content>/gi;
    let extractedContent = '';
    let match;
    while ((match = contentRegex.exec(content)) !== null) {
      extractedContent += match[1].trim() + '\n\n';
    }
    if (extractedContent) {
      content = extractedContent.trim();
    } else {
      // 如果沒有 <content> 標籤，清除常見的冗長系統標籤，避免 500 錯誤
      content = content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '')
        .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, '')
        .replace(/<StatusPlaceHolderImpl[\s\S]*?>/gi, '')
        .trim();
    }

    content = content
      .replace(/\{\{user\}\}/gi, userName)
      .replace(/<user>/gi, userName);

    let timestamp = 0;
    if (msgData.send_date) {
      // 嘗試直接解析
      let parsed = Date.parse(msgData.send_date);
      if (isNaN(parsed)) {
        // 處理 "March 22, 2026 2:03pm" → 標準格式
        const enMatch = msgData.send_date.match(/(\w+ \d+, \d+) (\d+):(\d+)(am|pm)/i);
        if (enMatch) {
          let h = parseInt(enMatch[2]);
          const m = enMatch[3];
          const ampm = enMatch[4].toLowerCase();
          if (ampm === 'pm' && h < 12) h += 12;
          if (ampm === 'am' && h === 12) h = 0;
          parsed = Date.parse(`${enMatch[1]} ${String(h).padStart(2,'0')}:${m}:00`);
        }
      }
      if (isNaN(parsed)) {
        // 處理中文格式 "2026年3月21日 上午 11:44:46" / "下午"
        const zhMatch = msgData.send_date.match(/(\d+)年(\d+)月(\d+)日\s*(上午|下午)\s*(\d+):(\d+):(\d+)/);
        if (zhMatch) {
          let h = parseInt(zhMatch[5]);
          if (zhMatch[4] === '下午' && h < 12) h += 12;
          if (zhMatch[4] === '上午' && h === 12) h = 0;
          parsed = new Date(parseInt(zhMatch[1]), parseInt(zhMatch[2]) - 1, parseInt(zhMatch[3]), h, parseInt(zhMatch[6]), parseInt(zhMatch[7])).getTime();
        }
      }
      if (!isNaN(parsed)) timestamp = parsed;
    }
    // fallback：使用遞增時間戳確保順序
    if (!timestamp) timestamp = Date.now() + i * 1000;

    messages.push({
      id: `batch_msg_${i}`,
      role: isUser ? 'user' : 'ai',
      content,
      timestamp,
    });
  }

  return messages.length > 0 ? { messages, charName, userName } : null;
}

function handleBatchFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const result = parseJsonlToMessages(text);
    if (!result) {
      alert('無法解析 JSONL 檔案，請確認格式正確');
      return;
    }
    batchMessages.value = result.messages;
    batchCharName.value = result.charName;
    batchUserName.value = result.userName;
    batchParsed.value = true;
  };
  reader.readAsText(file);
  input.value = '';
}

function resetBatch() {
  batchParsed.value = false;
  batchMessages.value = [];
  batchCharName.value = '';
  batchUserName.value = '';
  batchItemStatuses.value = new Map();
  batchItemErrors.value = new Map();
  batchAbortController = null;
}

async function runSingleBatch(index: number) {
  if (!props.summarizeBatchFn) return;
  const item = batchItems.value.find(b => b.index === index);
  if (!item || item.status === 'running') return;

  batchAbortController = new AbortController();
  const statusMap = new Map(batchItemStatuses.value);
  statusMap.set(index, 'running');
  batchItemStatuses.value = statusMap;

  // 清除舊錯誤
  const errMap = new Map(batchItemErrors.value);
  errMap.delete(index);
  batchItemErrors.value = errMap;

  const result = await props.summarizeBatchFn(
    item.messages,
    batchCharName.value,
    batchUserName.value,
    batchAbortController.signal,
  );

  const newStatusMap = new Map(batchItemStatuses.value);
  newStatusMap.set(index, result.success ? 'done' : 'failed');
  batchItemStatuses.value = newStatusMap;

  if (!result.success && result.error) {
    const newErrMap = new Map(batchItemErrors.value);
    newErrMap.set(index, result.error);
    batchItemErrors.value = newErrMap;
  }

  batchAbortController = null;
}

async function runAllBatches() {
  if (!props.summarizeBatchFn) return;

  batchAbortController = new AbortController();

  for (const item of batchItems.value) {
    if (batchAbortController.signal.aborted) break;
    if (item.status === 'done') continue;

    const statusMap = new Map(batchItemStatuses.value);
    statusMap.set(item.index, 'running');
    batchItemStatuses.value = statusMap;

    const result = await props.summarizeBatchFn(
      item.messages,
      batchCharName.value,
      batchUserName.value,
      batchAbortController.signal,
    );

    const newStatusMap = new Map(batchItemStatuses.value);
    newStatusMap.set(item.index, result.success ? 'done' : 'failed');
    batchItemStatuses.value = newStatusMap;

    if (!result.success) {
      if (result.error) {
        const newErrMap = new Map(batchItemErrors.value);
        newErrMap.set(item.index, result.error);
        batchItemErrors.value = newErrMap;
      }
      if (!batchAbortController.signal.aborted) {
        // 失敗時停下，使用者可以決定重試或跳過
        break;
      }
    }

    // 批次間短暫延遲
    if (!batchAbortController.signal.aborted) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  batchAbortController = null;
}

function abortBatch() {
  batchAbortController?.abort();
}

// 回填缺少 vectorKeywords 的事件
async function backfillKeywords() {
  if (!eventsLog.value?.events?.length) return;
  const needBackfill = eventsLog.value.events.filter(
    (e) => !e.vectorKeywords || e.vectorKeywords.length === 0
  );
  if (needBackfill.length === 0) return;

  try {
    const { extractSummaryKeywords } = await import('@/utils/summaryKeywordExtractor');
    let changed = false;
    for (const event of needBackfill) {
      const kws = extractSummaryKeywords(event.content);
      if (kws && kws.length > 0) {
        event.vectorKeywords = kws;
        changed = true;
      }
    }
    if (changed) {
      // 觸發 Vue 響應式更新
      eventsLog.value = { ...eventsLog.value, events: [...eventsLog.value.events] };
      // 保存到 IndexedDB
      await saveEventsLog();
    }
  } catch (e) {
    console.warn('[AISummaryPanel] 回填關鍵詞失敗:', e);
  }
}

onMounted(async () => {
  await loadEventsLog();
  backfillKeywords(); // 背景回填，不阻塞
  loadVectorStats();
  // 從 props 載入現有設定
  if (props.initialSettings) {
    localSettings.value = { ...props.initialSettings };
    console.log("[AISummaryPanel] 載入現有設定:", props.initialSettings);
  }
});
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.modal-content {
  background: var(--color-surface, white);
  border-radius: 20px;
  width: 100%;
  max-width: 520px;
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      width: 20px;
      height: 20px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .close-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--color-background, rgba(0, 0, 0, 0.04));
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #6b7280);
    transition: all 0.2s;

    svg {
      width: 18px;
      height: 18px;
    }
    &:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
}

.tab-bar {
  display: flex;
  padding: 0 12px;
  background: var(--color-surface, white);
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 8px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  .badge {
    background: var(--color-primary, #7dd3a8);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    min-width: 20px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);

    &.running {
      background: #fbbf24;
      box-shadow: 0 1px 2px rgba(251, 191, 36, 0.2);
    }

    &.mini {
      font-size: 10px;
      padding: 1px 6px;
      margin-left: 6px;
    }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--color-primary, #7dd3a8);
    border-radius: 2px 2px 0 0;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    &::after {
      opacity: 1;
    }
  }

  &:hover:not(.active) {
    color: var(--color-text, #1f2937);
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  background: var(--color-background, #f9fafb);
}

.tab-content {
  padding: 16px;
}

// 總結內容 Tab 特殊布局
.tab-content.history-tab {
  display: flex;
  flex-direction: column;
  min-height: 300px;

  .summaries-list {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 12px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}

// 空狀態
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted, #9ca3af);

  .empty-icon {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }
  .empty-title {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }
  .empty-hint {
    margin: 0;
    font-size: 13px;
  }

  &.small {
    padding: 20px;
    .empty-icon {
      display: none;
    }
  }
}

// AI 生成總結中
.generating-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: var(--color-surface, white);
  border-radius: 12px;
  margin-bottom: 12px;
  color: var(--color-primary, #7dd3a8);
  font-size: 14px;
  font-weight: 500;

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border, #e5e7eb);
    border-top-color: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 操作按鈕列 - 固定在底部
.summary-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding: 12px;
  background: var(--color-surface, white);
  border-radius: 12px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  .action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--color-background, #f3f4f6);
    color: var(--color-text, #374151);

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover {
      background: var(--color-border, #e5e7eb);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.select {
      background: #e0f2fe;
      color: #0284c7;
      &.active {
        background: #0284c7;
        color: white;
      }
    }

    &.manual {
      background: #d1fae5;
      color: #059669;
    }

    &.meta {
      background: #e0e7ff;
      color: #4f46e5;
    }

    &.import {
      background: #fef3c7;
      color: #d97706;
    }

    &.export {
      background: #14532d;
      color: white;
    }
  }
}

// 手動總結輸入
.manual-summary-input {
  background: var(--color-surface, white);
  border: 2px dashed var(--color-primary, #7dd3a8);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;

  .summary-textarea {
    width: 100%;
    padding: 10px;
    border: 1.5px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    font-size: 13px;
    resize: vertical;
    font-family: inherit;
    background: var(--color-background, #fafafa);
    color: var(--color-text, #1f2937);
    margin-bottom: 10px;

    &:focus {
      outline: none;
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .manual-summary-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel-manual {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text-secondary, #6b7280);
    }

    .btn-add-manual {
      background: var(--color-primary, #7dd3a8);
      color: white;
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

// 總結列表
.summaries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-card {
  background: var(--color-surface, white);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }
  &.important {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    border-color: #fcd34d;
  }
  &.selected {
    border-color: #0284c7;
    background: #f0f9ff;
  }

  .summary-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--color-text-secondary, #6b7280);

    .summary-checkbox {
      display: flex;
      align-items: center;
      cursor: pointer;
      input {
        width: 16px;
        height: 16px;
        accent-color: #0284c7;
        cursor: pointer;
      }
    }

    .summary-number {
      font-weight: 600;
      color: var(--color-primary, #7dd3a8);
    }
    .summary-count {
      margin-left: auto;
    }

    .summary-tag {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;

      &.manual {
        background: #d1fae5;
        color: #059669;
      }
      &.meta {
        background: #e0e7ff;
        color: #4f46e5;
      }
    }
  }

  .summary-actions-inline {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }

  .summary-content {
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text, #374151);
    white-space: pre-wrap;
  }

  .edit-content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;

    .edit-textarea {
      width: 100%;
      padding: 10px;
      border: 1.5px solid var(--color-primary, #7dd3a8);
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      font-family: inherit;
      background: var(--color-surface, white);
      color: var(--color-text, #1f2937);

      &:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.2);
      }
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;

      .btn-edit-cancel,
      .btn-edit-save {
        padding: 6px 14px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-edit-cancel {
        background: var(--color-background, #f3f4f6);
        color: var(--color-text-secondary, #6b7280);

        &:hover {
          background: var(--color-border, #e5e7eb);
        }
      }

      .btn-edit-save {
        background: var(--color-primary, #7dd3a8);
        color: white;

        &:hover {
          box-shadow: 0 2px 8px rgba(125, 211, 168, 0.4);
        }
      }
    }
  }
}

.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(0, 0, 0, 0.04);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #9ca3af);
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  &.active {
    background: #fcd34d;
    color: white;
  }
  &.delete:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

// 設置樣式
.description {
  margin: 0 0 12px;
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
  background: var(--color-surface, white);
  border-radius: 10px;
  border-left: 3px solid var(--color-primary, #7dd3a8);
}

.setting-section {
  margin-bottom: 12px;
  background: var(--color-surface, white);
  padding: 14px;
  border-radius: 12px;
}

.settings-sub-tabs {
  display: flex;
  gap: 0px;
  margin: 0px 0px 16px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  padding: 3px;
}

.sub-tab-item {
  flex: 1;
  padding: 7px 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    background: var(--color-surface, white);
    color: var(--color-text, #1f2937);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .badge {
    background: var(--color-primary, #7dd3a8);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    min-width: 20px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);

    &.running {
      background: #fbbf24;
      box-shadow: 0 1px 2px rgba(251, 191, 36, 0.2);
    }

    &.mini {
      font-size: 10px;
      padding: 1px 5px;
      margin-left: 4px;
    }
  }
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text, #1f2937);
  margin-bottom: 10px;

  svg {
    width: 16px;
    height: 16px;
    color: var(--color-primary, #7dd3a8);
  }
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &.horizontal {
    flex-direction: row;
    .radio-option {
      flex: 1;
    }
  }
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-background, #fafafa);

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }
  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-surface, white);
  }
  &.compact {
    padding: 8px;
    align-items: center;
  }

  .radio-input {
    width: 14px;
    height: 14px;
    accent-color: var(--color-primary, #7dd3a8);
    flex-shrink: 0;
    cursor: pointer;
  }
  .option-content {
    flex: 1;
  }
  .option-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--color-text, #1f2937);
  }
  .option-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #6b7280);
    margin-top: 2px;
  }
}

.count-input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--color-background, #fafafa);
  border-radius: 8px;

  .range-input {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--color-border, #e5e7eb);
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-primary, #7dd3a8);
      cursor: pointer;
    }
  }

  .count-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 45px;

    .count-number {
      font-size: 18px;
      font-weight: 700;
      color: var(--color-primary, #7dd3a8);
      line-height: 1;
    }
    .count-label {
      font-size: 10px;
      color: var(--color-text-muted, #9ca3af);
      margin-top: 2px;
    }
  }

  .manual-count-control {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 88px;
  }

  .manual-count-input {
    width: 64px;
    padding: 5px 6px;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    background: var(--color-surface, #fff);
    color: var(--color-primary, #7dd3a8);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    outline: none;

    &:focus {
      border-color: var(--color-primary, #7dd3a8);
      box-shadow: 0 0 0 2px rgba(125, 211, 168, 0.18);
    }
  }

  .manual-count-control .count-label {
    font-size: 10px;
    color: var(--color-text-muted, #9ca3af);
    white-space: nowrap;
  }
}

.count-hint {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary, #6b7280);
  padding: 6px 8px;
  background: #fef3c7;
  border-radius: 6px;
  margin-top: 8px;
}

.section-divider {
  display: flex;
  align-items: center;
  margin: 16px 0 12px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border, #e5e7eb);
  }
  .divider-text {
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
  }
}

.info-section {
  background: var(--color-primary, #7dd3a8);
  border-radius: 12px;
  padding: 14px;
  color: white;

  .info-header {
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;

    .info-label {
      font-size: 10px;
      opacity: 0.9;
      margin-bottom: 2px;
    }
    .info-value {
      font-size: 14px;
      font-weight: 700;
      &.highlight {
        color: #fbbf24;
      }
    }
  }
}

// 重要事件樣式
.events-settings {
  background: var(--color-surface, white);
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 12px;

  .setting-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    cursor: pointer;
    &:last-child {
      margin-bottom: 0;
    }

    input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: var(--color-primary, #7dd3a8);
    }
    span {
      font-size: 12px;
      color: var(--color-text, #374151);
    }

    &.slider-setting {
      gap: 8px;

      input[type="range"] {
        flex: 1;
        height: 4px;
        accent-color: var(--color-primary, #7dd3a8);
        cursor: pointer;
      }

      .slider-value {
        min-width: 40px;
        text-align: right;
        font-size: 11px;
        color: var(--color-text-secondary, #6b7280);
      }
    }
  }
}

.add-event-section {
  background: var(--color-surface, white);
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 12px;

  h4 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--color-text, #1f2937);
  }

  .event-textarea {
    width: 100%;
    padding: 8px;
    border: 1.5px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    font-size: 12px;
    resize: vertical;
    margin-bottom: 8px;
    font-family: inherit;
    background: var(--color-surface, white);
    color: var(--color-text, #1f2937);

    &:focus {
      outline: none;
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .event-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 10px;

    .meta-select {
      padding: 6px 8px;
      border: 1.5px solid var(--color-border, #e5e7eb);
      border-radius: 6px;
      font-size: 12px;
      background: var(--color-surface, white);
      color: var(--color-text, #1f2937);

      &:focus {
        outline: none;
        border-color: var(--color-primary, #7dd3a8);
      }
    }
  }

  .btn-add {
    width: 100%;
    padding: 8px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.events-list-section {
  h4 {
    font-size: 13px;
    margin: 0 0 10px;
    color: var(--color-text, #1f2937);
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-item {
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 10px;
    padding: 10px;

    &.priority-1 {
      border-left: 3px solid #ef4444;
    }
    &.priority-2 {
      border-left: 3px solid #f59e0b;
    }
    &.priority-3 {
      border-left: 3px solid var(--color-primary, #7dd3a8);
    }

    .event-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 11px;
      color: var(--color-text-secondary, #6b7280);

      .event-time {
        margin-left: auto;
      }

      .btn-delete {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-muted, #9ca3af);
        padding: 2px;
        display: flex;
        opacity: 0.6;

        svg {
          width: 14px;
          height: 14px;
        }
        &:hover {
          opacity: 1;
          color: #ef4444;
        }
      }
    }

    .event-content {
      font-size: 12px;
      line-height: 1.4;
      color: var(--color-text, #1f2937);
    }

    .keywords-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 5px;

      .keyword-tag-mini {
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 6px;
        background: rgba(var(--color-primary-rgb, 125, 211, 168), 0.15);
        color: var(--color-primary, #7dd3a8);
        line-height: 1.4;
      }

      .keyword-more {
        font-size: 10px;
        color: var(--color-text-muted, #9ca3af);
        padding: 1px 3px;
      }
    }

    .btn-edit {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-muted, #9ca3af);
      padding: 2px;
      display: flex;
      opacity: 0.6;

      svg {
        width: 14px;
        height: 14px;
      }
      &:hover {
        opacity: 1;
        color: var(--color-primary, #7dd3a8);
      }
    }

    .event-edit-wrapper {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .event-edit-textarea {
        width: 100%;
        padding: 8px;
        border: 1.5px solid var(--color-primary, #7dd3a8);
        border-radius: 6px;
        font-size: 12px;
        resize: vertical;
        font-family: inherit;
        background: var(--color-surface, white);
        color: var(--color-text, #1f2937);

        &:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(125, 211, 168, 0.2);
        }
      }

      .event-edit-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;

        .meta-select {
          padding: 6px 8px;
          border: 1.5px solid var(--color-border, #e5e7eb);
          border-radius: 6px;
          font-size: 11px;
          background: var(--color-surface, white);
          color: var(--color-text, #1f2937);

          &:focus {
            outline: none;
            border-color: var(--color-primary, #7dd3a8);
          }
        }
      }

      .event-edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;

        .btn-edit-cancel,
        .btn-edit-save {
          padding: 5px 12px;
          border: none;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-edit-cancel {
          background: var(--color-background, #f3f4f6);
          color: var(--color-text-secondary, #6b7280);

          &:hover {
            background: var(--color-border, #e5e7eb);
          }
        }

        .btn-edit-save {
          background: var(--color-primary, #7dd3a8);
          color: white;

          &:hover {
            box-shadow: 0 2px 6px rgba(125, 211, 168, 0.4);
          }
        }
      }
    }
  }
}

// 日記列表樣式
.diaries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diary-card {
  background: var(--color-surface, white);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }
  &.favorite {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    border-color: #fcd34d;
  }
  &.writing {
    opacity: 0.8;
  }

  .diary-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;

    .diary-icon-wrapper {
      width: 32px;
      height: 32px;
      background: var(--color-primary, #7dd3a8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      .diary-icon {
        width: 18px;
        height: 18px;
        color: white;
        &.writing {
          animation: bounce 1.2s ease-in-out infinite;
        }
      }
    }

    .diary-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      .diary-date {
        font-size: 12px;
        font-weight: 500;
        color: var(--color-text, #1f2937);
      }
      .diary-count,
      .diary-status {
        font-size: 11px;
        color: var(--color-text-secondary, #6b7280);
      }
    }

    .diary-actions {
      display: flex;
      gap: 4px;
    }
  }

  .diary-preview {
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text, #374151);
    padding: 10px;
    background: var(--color-background, #f9fafb);
    border-radius: 8px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: background 0.2s;
    &:hover {
      background: var(--color-border, #e5e7eb);
    }
  }

  .diary-writing-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: var(--color-background, #f9fafb);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text-secondary, #6b7280);
  }

  .view-btn {
    width: 100%;
    padding: 8px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    svg {
      width: 14px;
      height: 14px;
    }
    &:hover {
      box-shadow: 0 2px 8px rgba(125, 211, 168, 0.4);
    }
  }

  .btn-manual-diary {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, var(--color-primary, #7dd3a8), #68cfa0);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
    box-shadow: 0 4px 12px rgba(125, 211, 168, 0.25);
    position: relative;
    overflow: hidden;

    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(rgba(255, 255, 255, 0.2), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    svg {
      width: 18px;
      height: 18px;
      transition: transform 0.3s ease;
    }

    &:hover:not(:disabled) {
      box-shadow: 0 8px 20px rgba(125, 211, 168, 0.4);
      transform: translateY(-2px);

      &::after {
        opacity: 1;
      }

      svg {
        transform: rotate(-10deg) scale(1.1);
      }
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 8px rgba(125, 211, 168, 0.2);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      filter: grayscale(0.5);
      box-shadow: none;
    }

    &.bottom {
      margin-top: 20px;
      background: white;
      color: var(--color-primary, #7dd3a8);
      border: 2px solid rgba(125, 211, 168, 0.3);
      box-shadow: none;

      &:hover:not(:disabled) {
        border-color: var(--color-primary, #7dd3a8);
        background: rgba(125, 211, 168, 0.05);
        color: var(--color-primary, #7dd3a8);
        box-shadow: 0 4px 15px rgba(125, 211, 168, 0.15);
        transform: translateY(-2px);
      }
    }
  }

  .loading-dots {
    display: flex;
    gap: 3px;
    span {
      width: 4px;
      height: 4px;
      background: var(--color-text-muted, #999);
      border-radius: 50%;
      animation: pulse 1.4s ease-in-out infinite;
      &:nth-child(1) {
        animation-delay: 0s;
      }
      &:nth-child(2) {
        animation-delay: 0.2s;
      }
      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background: var(--color-surface, white);

  button {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.2s;

    &.btn-cancel {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text-secondary, #6b7280);
    }
    &.btn-save {
      background: var(--color-primary, #7dd3a8);
      color: white;
    }
  }

  &.summary-footer {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 6px;
    padding: 10px 12px;

    .btn-cancel {
      padding: 6px 12px;
      font-size: 12px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 6px;
      background: var(--color-background, #f3f4f6);
      color: var(--color-text, #374151);
      border: none;
      cursor: pointer;
      transition: all 0.2s;

      svg {
        width: 14px;
        height: 14px;
      }

      &:hover:not(:disabled) {
        background: var(--color-border, #e5e7eb);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.select.active {
        background: var(--color-primary, #7dd3a8);
        color: white;
      }

      &.manual {
        background: var(--color-primary, #7dd3a8);
        color: white;
      }

      &.meta {
        background: #8b5cf6;
        color: white;
      }

      &.import {
        background: #3b82f6;
        color: white;
      }

      &.export {
        background: #f59e0b;
        color: white;
      }

      &.delete-selected {
        background: #e53e3e;
        color: white;
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// 向量記憶 toggle 開關
.toggle-option {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;

  .toggle-checkbox {
    display: none;
  }

  .toggle-slider {
    width: 40px;
    height: 22px;
    background: var(--color-border, #d1d5db);
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }

  .toggle-checkbox:checked + .toggle-slider {
    background: var(--color-primary, #7dd3a8);

    &::after {
      transform: translateX(18px);
    }
  }

  .toggle-text {
    font-size: 13px;
    color: var(--color-text-secondary, #6b7280);
  }
}

.rebuild-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  background: var(--color-background, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  font-size: 13px;
  color: var(--color-text, #1f2937);
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--color-primary, #7dd3a8);
    color: white;
    border-color: var(--color-primary, #7dd3a8);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

// ===== 向量文件預覽 =====
.vector-doc-toggle {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 0;
  font-size: 10px;
  color: var(--color-text-secondary, #6b7280);
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
    color: var(--color-primary, #6366f1);
  }
}

.vector-doc-preview {
  margin-top: 4px;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary, #9ca3af);
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  word-break: break-all;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

// ===== 關鍵詞預覽標籤 =====
.keywords-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
}

.keyword-tag-mini {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 8px;
  background: var(--color-primary, #6366f1);
  color: #fff;
  opacity: 0.7;
  line-height: 1.6;
}

.keyword-more {
  font-size: 10px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.8;
}

// ===== 關鍵詞編輯彈窗 =====
.keywords-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.keywords-popup {
  width: 90%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--color-surface, #1e1e2e);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  .keywords-popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    h4 {
      margin: 0;
      font-size: 16px;
      color: var(--color-text, #e5e7eb);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--color-text-secondary, #6b7280);
      cursor: pointer;
      padding: 4px;
      svg {
        width: 18px;
        height: 18px;
      }
    }
  }

  .keywords-hint {
    font-size: 12px;
    color: var(--color-text-secondary, #6b7280);
    margin: 0 0 12px;
    line-height: 1.5;
  }

  .keywords-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 36px;
    margin-bottom: 12px;
  }

  .keyword-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 13px;
    border-radius: 12px;
    background: var(--color-primary, #6366f1);
    color: #fff;
    line-height: 1.4;

    .keyword-remove {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      font-size: 15px;
      padding: 0 2px;
      line-height: 1;
      &:hover {
        color: #fff;
      }
    }
  }

  .keywords-empty {
    font-size: 13px;
    color: var(--color-text-secondary, #6b7280);
    padding: 8px 0;
  }

  .keywords-add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .keywords-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    background: var(--color-bg, #111);
    color: var(--color-text, #e5e7eb);
    font-size: 13px;
    outline: none;
    &:focus {
      border-color: var(--color-primary, #6366f1);
    }
  }

  .keywords-add-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    background: var(--color-primary, #6366f1);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      opacity: 0.9;
    }
  }

  .keywords-popup-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .btn-cancel, .btn-save {
      padding: 8px 20px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      cursor: pointer;
    }

    .btn-cancel {
      background: var(--color-bg, #111);
      color: var(--color-text-secondary, #6b7280);
      border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    }

    .btn-save {
      background: var(--color-primary, #6366f1);
      color: #fff;
    }
  }
}

// ===== 批量總結 Tab =====
.batch-tab {
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}

.batch-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 36px 20px;
  border: 2px dashed var(--color-border, rgba(0, 0, 0, 0.15));
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary, #6b7280);

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.05);
  }
}

.batch-upload-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
}

.batch-upload-hint {
  margin: 0;
  font-size: 12px;
}

// ===== 批量總結 =====
.batch-progress-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.batch-progress-bar-fill {
  height: 100%;
  background: var(--color-primary, #7dd3a8);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.batch-progress-text {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);

  strong {
    color: var(--color-text, #1f2937);
  }
}

.batch-failed-count {
  color: #f87171;
  font-weight: 500;
}

// ===== 批次列表 =====
.batch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
  margin-top: 4px;
}

.batch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-background, rgba(0, 0, 0, 0.025));
  border: 1px solid transparent;
  transition: all 0.2s;

  &.status-done {
    border-color: rgba(125, 211, 168, 0.2);
    background: rgba(125, 211, 168, 0.04);
  }
  &.status-running {
    border-color: rgba(251, 191, 36, 0.25);
    background: rgba(251, 191, 36, 0.06);
  }
  &.status-failed {
    border-color: rgba(248, 113, 113, 0.2);
    background: rgba(248, 113, 113, 0.04);
  }
}

.batch-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.batch-item-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-secondary, #9ca3af);
  min-width: 22px;
  text-align: right;

  .status-done & { color: var(--color-primary, #7dd3a8); }
  .status-running & { color: #fbbf24; }
  .status-failed & { color: #f87171; }
}

.batch-item-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.batch-item-range {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-item-size {
  font-size: 11px;
  color: var(--color-text-secondary, #9ca3af);

  &.oversize {
    color: #f59e0b;
    font-weight: 600;
  }
}

.batch-item-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

// 狀態 badge
.batch-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;

  &.done {
    background: rgba(125, 211, 168, 0.12);
    color: var(--color-primary, #7dd3a8);
  }
  &.running {
    background: rgba(251, 191, 36, 0.12);
    color: #d97706;
  }
}

.dot-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fbbf24;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

// 操作按鈕
.batch-status-btn {
  padding: 5px 14px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &.start {
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--color-text, #1f2937);

    &:hover:not(:disabled) {
      background: var(--color-primary, #7dd3a8);
      color: white;
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  &.retry {
    border: 1px solid rgba(248, 113, 113, 0.3);
    background: transparent;
    color: #f87171;

    &:hover:not(:disabled) {
      background: #f87171;
      color: white;
      border-color: #f87171;
    }
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// 錯誤訊息
.batch-item-error {
  width: 100%;
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(248, 113, 113, 0.06);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
  word-break: break-word;

  svg { color: #f87171; }
}
</style>
