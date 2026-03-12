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
            </div>
          </div>
        </div>

        <!-- 總結設置 Tab -->
        <div v-show="activeTab === 'settings'" class="tab-content">
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
                :min="localSettings.actualMessageMode === 'turn' ? 5 : 10"
                :max="localSettings.actualMessageMode === 'turn' ? 50 : 100"
                :step="localSettings.actualMessageMode === 'turn' ? 1 : 5"
                class="range-input"
              />
              <div class="count-display">
                <span class="count-number">{{
                  localSettings.actualMessageCount
                }}</span>
                <span class="count-label">{{
                  localSettings.actualMessageMode === "turn" ? "輪" : "條"
                }}</span>
              </div>
            </div>
            <div class="count-hint">AI 每次回覆時實際讀取的對話歷史</div>
          </div>

          <div class="section-divider">
            <span class="divider-text">總結讀取設定</span>
          </div>

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
          @click="emit('trigger-manual-diary')"
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

      <!-- 底部按鈕 - 只在設置相關 Tab 顯示 -->
      <div v-if="activeTab === 'settings'" class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')">關閉</button>
        <button class="btn-save" @click="saveAll">保存設置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import {
    createDefaultSummarySettings,
    type SummarySettings,
} from "@/types/chat";
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
import { computed, onMounted, ref } from "vue";

interface ConversationSummary {
  id: string;
  content: string;
  createdAt: number;
  messageCount: number;
  isImportant?: boolean;
  isManual?: boolean;
  isMeta?: boolean;
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
  "trigger-manual-diary": [];
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
}>();

const activeTab = ref<"history" | "settings" | "events" | "diary">("history");

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
  emit("trigger-manual-summary", {
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
}

function deleteEvent(eventId: string) {
  if (!eventsLog.value || !confirm("確定要刪除這個重要事件嗎？")) return;
  eventsLog.value.events = eventsLog.value.events.filter(
    (e) => e.id !== eventId,
  );
  saveEventsLog();
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
  emit("save", { ...localSettings.value });
  saveEventsLog();
  emit("close");
}

onMounted(() => {
  loadEventsLog();
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
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: 600;
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
</style>
