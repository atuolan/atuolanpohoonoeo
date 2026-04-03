<template>
  <div class="qzone-screen" :class="{ 'dark-mode': isDarkMode }">
    <!-- 評論詳情頁面 -->
    <div v-if="selectedPost" class="plurk-detail-view">
      <!-- 詳情頁導航欄 -->
      <div class="detail-navigation">
        <button class="detail-back-btn" @click="closeDetailView">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="detail-user-info">
          <img :src="selectedPost.avatar" class="detail-nav-avatar" />
          <span class="detail-nav-username">{{ selectedPost.username }}</span>
        </div>
        <div class="detail-nav-spacer"></div>
      </div>

      <!-- 可滾動內容區域 -->
      <div class="detail-scroll-content">
        <!-- 原始噗文 -->
        <div class="detail-plurk">
          <div class="detail-plurk-content">
            <span class="detail-qualifier">{{
              selectedPost.qualifier || "說"
            }}</span>
            <div
              class="detail-text"
              v-html="renderContentWithMentions(selectedPost.content || '')"
            ></div>
          </div>
          <!-- 媒體 -->
          <div v-if="selectedPost.images?.length" class="detail-media">
            <img
              v-for="(img, i) in selectedPost.images"
              :key="i"
              :src="img"
              class="detail-media-img"
            />
          </div>
        </div>

        <!-- 統計信息 -->
        <div class="detail-stats">
          <span class="detail-stat-item"
            >{{ getTotalEmoticons(selectedPost.id) }} 喜歡</span
          >
          <span class="detail-stat-item"
            >{{ selectedPost.repostCount || 0 }} 轉噗</span
          >
        </div>
        <div class="detail-response-status">
          <span>{{ selectedPost.comments?.length || 0 }} 則回應</span>
        </div>

        <!-- 回應列表 -->
        <div class="detail-responses">
          <div
            v-for="comment in sortedDetailComments"
            :key="comment.id"
            class="detail-response-item"
            :class="{ 'is-reply': comment.replyToId }"
          >
            <!-- 回覆引用 -->
            <div
              v-if="comment.replyToId && comment.replyToUsername"
              class="detail-reply-quote"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5l-5 5v-5z"
                />
              </svg>
              <span>回覆 @{{ comment.replyToUsername }}</span>
            </div>
            <div class="detail-response-user">
              <img
                :src="getAvatarByAuthorId(comment.authorId, comment.avatar)"
                class="detail-response-avatar"
              />
              <span class="detail-response-username">{{
                comment.username
              }}</span>
              <span class="detail-response-qualifier">說</span>
            </div>
            <div
              class="detail-response-content"
              v-html="renderContentWithMentions(comment.content || '')"
            ></div>
            <div class="detail-response-actions">
              <button
                class="detail-response-btn"
                @click="replyToComment(comment)"
              >
                回覆
              </button>
              <button
                class="detail-response-btn detail-delete-btn"
                @click="deleteComment(selectedPost.id, comment.id)"
              >
                刪除
              </button>
            </div>
          </div>
          <div
            v-if="!selectedPost.comments?.length"
            class="detail-no-responses"
          >
            還沒有回應，來說點什麼吧！
          </div>
        </div>
      </div>

      <!-- 底部輸入框 -->
      <div class="detail-input-holder">
        <!-- 回覆指示器 -->
        <div v-if="replyingToComment" class="detail-reply-indicator">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5l-5 5v-5z"
            />
          </svg>
          <span>回覆 @{{ replyingToComment.username }}</span>
          <button class="detail-reply-cancel" @click="replyingToComment = null">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- @ 提及角色列表 -->
        <div v-if="showDetailMentionList" class="detail-mention-list">
          <div class="detail-mention-header">
            <span>選擇要提及的角色</span>
            <button
              class="detail-mention-close"
              @click="showDetailMentionList = false"
            >
              ✕
            </button>
          </div>
          <div class="detail-mention-items">
            <div
              v-for="char in mentionSuggestions"
              :key="char.id"
              class="detail-mention-item"
              @click="selectDetailMention(char)"
            >
              <img
                :src="char.avatar || getDefaultAvatar(char.id)"
                class="detail-mention-avatar"
              />
              <span class="detail-mention-name">{{
                char.nickname || char.data?.name
              }}</span>
            </div>
          </div>
        </div>

        <div class="detail-input-box">
          <!-- 可點擊切換用戶的頭像 -->
          <div
            class="detail-avatar-switcher"
            @click="showDetailPersonaSwitcher = !showDetailPersonaSwitcher"
            title="點擊切換身份"
          >
            <img :src="detailCommentAvatar" class="detail-input-avatar" />
            <svg
              class="detail-avatar-chevron"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>

            <!-- 詳情頁用戶切換下拉選單 -->
            <div
              v-if="showDetailPersonaSwitcher"
              class="detail-persona-dropdown"
              @click.stop
            >
              <div class="detail-persona-header">
                <span>切換身份</span>
                <button
                  class="detail-persona-close"
                  @click.stop="showDetailPersonaSwitcher = false"
                >
                  ✕
                </button>
              </div>
              <div class="detail-persona-items">
                <div
                  v-for="persona in userStore.personas"
                  :key="persona.id"
                  class="detail-persona-item"
                  :class="{ active: persona.id === detailCommentPersonaId }"
                  @click.stop="selectDetailPersona(persona.id)"
                >
                  <img
                    :src="persona.avatar || getDefaultAvatar(persona.id)"
                    class="detail-persona-avatar"
                  />
                  <div class="detail-persona-info">
                    <span class="detail-persona-name">{{ persona.name }}</span>
                    <span
                      v-if="persona.groupName"
                      class="detail-persona-group"
                      >{{ persona.groupName }}</span
                    >
                  </div>
                  <svg
                    v-if="persona.id === detailCommentPersonaId"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                  >
                    <path
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div class="detail-input-wrapper">
            <input
              v-model="detailCommentInput"
              type="text"
              class="detail-input"
              :placeholder="
                replyingToComment
                  ? `回覆 @${replyingToComment.username}...`
                  : '回應...'
              "
              @keyup.enter="submitDetailComment"
              @input="handleDetailInputChange"
            />
            <div class="detail-input-actions">
              <button
                class="detail-action-btn"
                title="@ 提及角色"
                @click="showDetailMentionList = !showDetailMentionList"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
                </svg>
              </button>
              <button
                class="detail-action-btn"
                title="表情包"
                @click="openCommentStickerPanel"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              <button
                class="detail-action-btn"
                :class="{ active: detailAnonymousMode }"
                title="匿名模式"
                @click="toggleDetailAnonymous"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <button
            class="detail-submit-btn"
            :disabled="!detailCommentInput?.trim()"
            @click="submitDetailComment"
          >
            送出
          </button>
        </div>
      </div>
    </div>

    <!-- 主列表視圖 -->
    <template v-else>
      <!-- Plurk 風格頭部 -->
      <div class="x-header">
        <button class="back-btn" @click="goBack">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="header-title">PLURK</h1>

        <!-- 搜索框 -->
        <div class="header-search-wrapper">
          <div class="header-search-input-box">
            <svg
              class="header-search-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              class="header-search-input"
              placeholder="搜索噗文..."
            />
            <button
              v-if="searchQuery"
              class="header-clear-btn"
              @click="searchQuery = ''"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div class="header-spacer"></div>

        <!-- AI 掃描空間按鈕 -->
        <button
          class="ai-scan-btn"
          :disabled="isAIScanning"
          title="AI 掃描空間"
          @click="showScanModeSelect = true"
        >
          <svg
            v-if="!isAIScanning"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg
            v-else
            class="loading-spinner"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>

        <!-- 自動互動配置按鈕 -->
        <button
          class="ai-scan-btn auto-interaction-btn"
          :class="{ active: qzoneStore.autoInteractionConfig.enabled }"
          title="自動互動設置"
          @click="openAutoInteractionConfig"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6" />
            <path d="M4.22 4.22l4.24 4.24m7.08 0l4.24-4.24" />
            <path d="M1 12h6m6 0h6" />
            <path d="M4.22 19.78l4.24-4.24m7.08 0l4.24 4.24" />
          </svg>
          <span
            v-if="qzoneStore.autoInteractionConfig.enabled"
            class="active-indicator"
          ></span>
        </button>

        <!-- 小劇場按鈕 -->
        <button
          class="ai-scan-btn"
          title="小劇場"
          @click="$emit('navigate-theater')"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            />
          </svg>
        </button>

        <button
          class="settings-btn"
          title="空間設定"
          @click="showUserSettings = true"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            />
          </svg>
        </button>
      </div>

      <!-- 主容器 -->
      <div ref="mainContainer" class="x-main-container" @scroll="handleScroll">
        <!-- 發布框 -->
        <div class="compose-box">
          <!-- 身份切換器 -->
          <div class="persona-switcher-wrapper">
            <div
              class="persona-switcher-trigger"
              @click="showPersonaSwitcher = !showPersonaSwitcher"
            >
              <img
                :src="userStore.currentAvatar || userAvatar"
                class="compose-avatar"
              />
              <div class="persona-info">
                <span class="persona-name">{{ userStore.currentName }}</span>
                <span v-if="userStore.currentGroupName" class="persona-group">{{
                  userStore.currentGroupName
                }}</span>
              </div>
              <svg
                class="persona-chevron"
                :class="{ open: showPersonaSwitcher }"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>

            <!-- 身份下拉選單 -->
            <div v-if="showPersonaSwitcher" class="persona-dropdown">
              <div
                v-for="persona in userStore.personas"
                :key="persona.id"
                class="persona-option"
                :class="{ active: persona.id === userStore.currentPersonaId }"
                @click="switchPersona(persona.id)"
              >
                <img
                  :src="persona.avatar || getDefaultAvatar(persona.id)"
                  class="persona-option-avatar"
                />
                <div class="persona-option-info">
                  <span class="persona-option-name">{{ persona.name }}</span>
                  <span v-if="persona.groupName" class="persona-option-group"
                    >{{ persona.groupName }} ({{
                      persona.boundCharacterIds?.length || 0
                    }}人)</span
                  >
                </div>
                <svg
                  v-if="persona.id === userStore.currentPersonaId"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
            </div>
          </div>

          <div class="compose-content">
            <div class="textarea-wrapper">
              <textarea
                ref="postTextarea"
                v-model="newPostContent"
                class="compose-textarea"
                placeholder="你在做什麼？"
                maxlength="360"
                @input="handlePostInput"
                @keydown="handlePostKeydown"
              ></textarea>

              <!-- @ 提及建議列表 -->
              <div
                v-if="showMentionSuggestions && mentionSuggestions.length > 0"
                class="mention-suggestions"
              >
                <div
                  v-for="(char, index) in mentionSuggestions"
                  :key="char.id"
                  class="mention-item"
                  :class="{ active: mentionSelectedIndex === index }"
                  @click="selectMention(char)"
                >
                  <img
                    :src="char.avatar || getDefaultAvatar(char.id)"
                    class="mention-avatar"
                  />
                  <span class="mention-name">{{
                    char.nickname || char.data?.name
                  }}</span>
                </div>
              </div>
            </div>

            <!-- 媒體預覽 -->
            <div v-if="selectedImages.length > 0" class="image-preview-grid">
              <div
                v-for="(media, index) in selectedImages"
                :key="index"
                class="preview-item"
              >
                <img
                  v-if="media.type === 'image'"
                  :src="media.url"
                  alt="预览"
                />
                <video
                  v-else-if="media.type === 'video'"
                  :src="media.url"
                  class="video-preview"
                  controls
                ></video>
                <button class="remove-image-btn" @click="removeImage(index)">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 工具欄 -->
            <div class="compose-toolbar">
              <div class="toolbar-icons">
                <!-- Qualifier 選擇器 -->
                <div class="qualifier-selector">
                  <button
                    class="qualifier-btn"
                    @click="qualifierPickerVisible = !qualifierPickerVisible"
                  >
                    <span class="qualifier-text">{{ selectedQualifier }}</span>
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <div v-if="qualifierPickerVisible" class="qualifier-dropdown">
                    <button
                      v-for="q in qualifiers"
                      :key="q"
                      class="qualifier-option"
                      :class="{ active: selectedQualifier === q }"
                      @click="selectQualifier(q)"
                    >
                      {{ q }}
                    </button>
                  </div>
                </div>

                <input
                  ref="imageInput"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style="display: none"
                  @change="handleMediaSelect"
                />
                <button
                  class="toolbar-btn"
                  title="圖片/影片"
                  @click="triggerImageSelect"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </button>
                <button
                  class="toolbar-btn mention-picker-btn"
                  title="@ 提及角色"
                  @click="showMentionPicker"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
                  </svg>
                </button>
                <button
                  class="toolbar-btn"
                  title="表情包"
                  @click="openStickerPanel"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
              </div>

              <div class="compose-actions">
                <!-- 可見性選擇器 -->
                <div class="visibility-selector">
                  <button
                    class="visibility-btn"
                    :class="{
                      'group-only': postVisibilityMode === 'group-only',
                    }"
                    @click="showVisibilityPicker = !showVisibilityPicker"
                  >
                    <svg
                      v-if="postVisibilityMode === 'public'"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path
                        d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                      />
                    </svg>
                    <svg
                      v-else
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span class="visibility-text">{{
                      postVisibilityMode === "public"
                        ? "全員"
                        : userStore.currentGroupName || "群組"
                    }}</span>
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  <!-- 可見性下拉選單 -->
                  <div v-if="showVisibilityPicker" class="visibility-dropdown">
                    <div
                      class="visibility-option"
                      :class="{ active: postVisibilityMode === 'public' }"
                      @click="selectVisibility('public')"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path
                          d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                        />
                      </svg>
                      <div class="visibility-option-info">
                        <span class="visibility-option-title">全員可見</span>
                        <span class="visibility-option-desc"
                          >所有角色都可以看見並留言</span
                        >
                      </div>
                    </div>
                    <div
                      class="visibility-option"
                      :class="{ active: postVisibilityMode === 'group-only' }"
                      @click="selectVisibility('group-only')"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                          ry="2"
                        />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <div class="visibility-option-info">
                        <span class="visibility-option-title">{{
                          userStore.currentGroupName || "僅群組成員"
                        }}</span>
                        <span class="visibility-option-desc"
                          >{{
                            userStore.currentBoundCharacterIds.length
                          }}
                          位成員可見</span
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  class="char-counter"
                  :class="{ warning: charCount > 340, error: charCount > 360 }"
                >
                  <span v-if="charCount > 0" class="char-count"
                    >{{ charCount }}/360</span
                  >
                </div>
                <button
                  class="post-btn"
                  :disabled="!canPost"
                  @click="publishPost"
                >
                  發出噗浪
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 時間線分隔 -->
        <div class="timeline-divider"></div>

        <!-- 河道時間軸 -->
        <div
          v-if="filteredPosts.length > 0"
          ref="riverTimeline"
          class="plurk-river-timeline"
        >
          <div class="horizontal-timeline" :style="{ width: timelineWidth }">
            <div class="timeline-track"></div>
            <div
              v-for="(post, index) in riverPosts"
              :key="post.id"
              class="timeline-node"
              :class="{ 'node-own': post.authorType === 'user' }"
              :style="{ left: getNodePosition(index) }"
              @click="scrollToPost(post.id)"
            >
              <div class="node-dot"></div>
              <div class="river-bubble">
                <img :src="post.avatar" class="river-avatar" />
                <div class="river-content">
                  <div class="river-qualifier">
                    {{ post.qualifier || "說" }}
                  </div>
                  <div class="river-text">
                    {{ (post.content || "").substring(0, 25)
                    }}{{ (post.content || "").length > 25 ? "..." : "" }}
                  </div>
                </div>
              </div>
              <div class="node-timestamp">
                {{ formatRiverTime(post.timestamp) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 噗文列表 -->
        <div class="posts-timeline">
          <div
            v-for="post in filteredPosts"
            :id="'post-' + post.id"
            :key="post.id"
            class="plurk-card"
            @click="openDetailView(post)"
          >
            <!-- 回應數徽章 -->
            <div
              v-if="(post.commentCount || 0) > 0"
              class="plurk-response-badge"
            >
              <span class="response-count">{{ post.commentCount }}</span>
            </div>

            <!-- 用戶區域 -->
            <div class="plurk-user">
              <img :src="post.avatar" class="plurk-avatar" />
              <span class="plurk-username">{{
                post.username || "未知用戶"
              }}</span>
              <!-- 群組限定標記 -->
              <span
                v-if="post.visibilityMode === 'group-only'"
                class="plurk-group-badge"
                :title="`僅 ${post.groupName || '群組成員'} 可見`"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span class="group-badge-name">{{
                  post.groupName || "群組"
                }}</span>
              </span>
              <span class="plurk-time">{{ formatTime(post.timestamp) }}</span>
              <!-- 操作按鈕 -->
              <div class="plurk-actions-top" @click.stop>
                <button
                  class="plurk-action-btn"
                  title="重新生成所有 AI 評論"
                  :disabled="isAIScanning"
                  @click.stop="regenerateAllAIComments(post.id)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path
                      d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                    />
                  </svg>
                </button>
                <button
                  class="plurk-action-btn"
                  title="刪除動態"
                  @click.stop="handleDeletePost(post.id)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 噗文內容 -->
            <div class="plurk-content">
              <span class="plurk-qualifier-inline">{{
                post.qualifier || selectedQualifier
              }}</span>
              <div
                class="plurk-text-content"
                v-html="renderContentWithMentions(post.content || '')"
              ></div>

              <!-- 轉噗原文 -->
              <div
                v-if="post.type === 'repost' && post.originalPost"
                class="repost-quote"
              >
                <div class="repost-quote-header">
                  <img
                    :src="post.originalPost.avatar"
                    class="repost-quote-avatar"
                  />
                  <span class="repost-quote-username">{{
                    post.originalPost.username
                  }}</span>
                  <span class="repost-quote-qualifier">{{
                    post.originalPost.qualifier || "說"
                  }}</span>
                </div>
                <div class="repost-quote-content">
                  {{ post.originalPost.content }}
                </div>
                <div
                  v-if="post.originalPost.images?.length"
                  class="repost-quote-images"
                >
                  <img
                    v-for="(img, i) in post.originalPost.images.slice(0, 2)"
                    :key="i"
                    :src="img"
                    class="repost-quote-img"
                  />
                </div>
              </div>

              <!-- 媒體網格 -->
              <div v-if="post.images?.length" class="plurk-media" @click.stop>
                <img
                  v-for="(img, index) in post.images.slice(0, 4)"
                  :key="index"
                  :src="img"
                  class="plurk-media-img"
                  @click="previewImage(post.images!, index)"
                />
              </div>
            </div>

            <!-- 互動按鈕 -->
            <div class="plurk-manager" @click.stop>
              <div
                class="plurk-manager-button"
                @click.stop="openDetailView(post)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  />
                </svg>
                <span>{{ post.commentCount || 0 }}</span>
              </div>
              <div
                class="plurk-manager-button"
                :class="{ active: post.reposted }"
                @click.stop="toggleRepost(post.id)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                  />
                </svg>
                <span>{{ post.repostCount || 0 }}</span>
              </div>
              <!-- 表情回應按鈕 -->
              <div
                class="plurk-manager-button plurk-like-btn"
                @click.stop="toggleEmoticonPicker(post.id)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
                <span>{{
                  post.emoticons
                    ? Object.values(post.emoticons).reduce((a, b) => a + b, 0)
                    : 0
                }}</span>
              </div>
              <div
                class="plurk-manager-button"
                :class="{ active: post.bookmarked }"
                @click.stop="handleToggleBookmark(post.id)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </div>

              <!-- 表情選擇器 -->
              <div
                v-if="showEmoticonPicker === post.id"
                class="emoticon-picker"
              >
                <button
                  v-for="emoji in emoticons"
                  :key="emoji"
                  class="emoticon-option"
                  @click="handleAddEmoticon(post.id, emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>

            <!-- 表情統計 -->
            <div
              v-if="post.emoticons && Object.keys(post.emoticons).length > 0"
              class="plurk-emoticon-stats"
            >
              <span
                v-for="(count, emoji) in post.emoticons"
                :key="emoji"
                class="emoticon-stat-item"
              >
                {{ emoji }}×{{ count }}
              </span>
            </div>
          </div>
        </div>

        <!-- 空狀態 -->
        <div
          v-if="filteredPosts.length === 0 && !searchQuery"
          class="empty-state"
        >
          <div class="empty-icon">✨</div>
          <div class="empty-title">歡迎來到你的空間</div>
          <div class="empty-text">在這裡分享你的想法和生活</div>
        </div>

        <!-- 搜索無結果 -->
        <div
          v-if="filteredPosts.length === 0 && searchQuery"
          class="empty-state"
        >
          <div class="empty-icon">🔍</div>
          <div class="empty-title">沒有找到相關噗文</div>
          <div class="empty-text">試試其他關鍵詞</div>
        </div>
      </div>

      <!-- 回到頂部按鈕 -->
      <transition name="fade">
        <button
          v-if="showBackToTop"
          class="back-to-top-btn"
          title="回到頂部"
          @click="backToTop"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </transition>
    </template>

    <!-- 用戶設定模態框 (Pop Theme) -->
    <transition name="modal-fade">
      <div
        v-if="showUserSettings"
        class="modal-overlay pop-overlay"
        @click="showUserSettings = false"
      >
        <div class="pop-card" @click.stop>
          <div class="pop-title">USER SETTINGS</div>

          <div class="pop-avatar-section">
            <div class="pop-avatar-wrapper">
              <img
                :src="tempUserAvatar || userAvatar"
                class="pop-avatar"
                alt="Avatar Preview"
              />
              <button
                class="pop-avatar-refresh-btn"
                @click="randomizeUserAvatar"
                title="隨機生成新頭像"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path
                    d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Avatar Style Selector -->
          <div class="pop-avatar-style-selector">
            <button
              v-for="style in avatarStyles"
              :key="style.value"
              class="pop-style-mini-btn"
              :class="{ active: currentAvatarStyle === style.value }"
              @click="changeAvatarStyle(style.value)"
              :title="style.label"
            >
              {{ style.emoji }}
            </button>
          </div>

          <div class="pop-section-title"><span>🎨</span> 風格主題</div>
          <div class="pop-theme-opts">
            <button
              class="pop-theme-btn"
              :class="{ active: themeMode === 'light' }"
              @click="setThemeMode('light')"
            >
              ☀️ Day
            </button>
            <button
              class="pop-theme-btn"
              :class="{ active: themeMode === 'dark' }"
              @click="setThemeMode('dark')"
            >
              🌙 Night
            </button>
            <button
              class="pop-theme-btn"
              :class="{ active: themeMode === 'auto' }"
              @click="setThemeMode('auto')"
            >
              🤖 Auto
            </button>
          </div>

          <div class="pop-section-title" style="margin-top: 1.5rem">
            <span>🤖</span> AI 助手
          </div>
          <div
            style="
              background: var(--pop-bg-secondary, rgba(0, 0, 0, 0.05));
              border: 3px solid currentColor;
              border-radius: 12px;
              padding: 1rem;
              display: flex;
              align-items: center;
              justify-content: space-between;
            "
          >
            <span style="font-weight: 700">發布動態後自動互動</span>
            <div
              class="pop-switch-wrapper"
              :class="{ active: autoAIReply }"
              @click="
                autoAIReply = !autoAIReply;
                saveAutoAIReplySetting();
              "
            >
              <div class="pop-switch-knob"></div>
            </div>
          </div>

          <button class="pop-action-btn" @click="saveUserSettings">
            YES! 保存設定
          </button>
          <div class="cancel-link" @click="showUserSettings = false">
            不改了，返回
          </div>
        </div>
      </div>
    </transition>

    <!-- AI 掃描模式選擇模態框 -->
    <transition name="modal-fade">
      <div
        v-if="showScanModeSelect"
        class="modal-overlay"
        @click="showScanModeSelect = false"
      >
        <div class="modal-content scan-mode-selector" @click.stop>
          <div class="modal-header">
            <h3>選擇掃描模式</h3>
            <button class="modal-close-btn" @click="showScanModeSelect = false">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="scan-mode-options">
            <!-- AI 發布動態 -->
            <button
              class="scan-mode-option ai-post-option"
              :disabled="isAIScanning"
              @click="handleAIPost"
            >
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 5v14m-7-7h14" />
              </svg>
              <div class="scan-mode-text">
                <div class="scan-mode-title">✨ AI 發布動態</div>
                <div class="scan-mode-desc">讓 AI 角色發布新動態</div>
              </div>
              <svg
                v-if="isAIScanning"
                class="loading-spinner-inline"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </button>

            <!-- 自由調用模式 -->
            <button
              class="scan-mode-option"
              :disabled="isAIScanning"
              @click="startAutoScan"
            >
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div class="scan-mode-text">
                <div class="scan-mode-title">自由調用模式</div>
                <div class="scan-mode-desc">AI 智能選擇角色回應動態</div>
              </div>
            </button>

            <!-- 指定角色模式 -->
            <button
              class="scan-mode-option"
              :disabled="isAIScanning"
              @click="startManualScan"
            >
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <div class="scan-mode-text">
                <div class="scan-mode-title">指定角色模式</div>
                <div class="scan-mode-desc">手動選擇特定角色回應</div>
              </div>
            </button>

            <!-- 黑名單管理 -->
            <button
              class="scan-mode-option blacklist-option"
              @click="openBlacklistManager"
            >
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M4.93 4.93l14.14 14.14" />
              </svg>
              <div class="scan-mode-text">
                <div class="scan-mode-title">黑名單管理</div>
                <div class="scan-mode-desc">管理自動發文/評論的角色黑名單</div>
              </div>
            </button>

            <!-- 自動互動設定 -->
            <div class="ai-interaction-settings">
              <div class="settings-divider"></div>
              <div class="toggle-option-inline">
                <div class="toggle-option-info">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>自動 AI 回覆</span>
                </div>
                <label class="toggle-switch">
                  <input
                    v-model="autoAIReply"
                    type="checkbox"
                    @change="saveAutoAIReplySetting"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <p class="setting-status">
                <span v-if="autoAIReply" class="status-enabled"
                  >已開啟：AI 會自動回應你的動態</span
                >
                <span v-else class="status-disabled"
                  >已關閉：AI 不會自動回應</span
                >
              </p>

              <!-- 對話上下文設定 -->
              <div class="settings-divider"></div>
              <div class="toggle-option-inline">
                <div class="toggle-option-info">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    />
                  </svg>
                  <span>讀取對話記錄</span>
                </div>
                <label class="toggle-switch">
                  <input
                    v-model="enableChatContext"
                    type="checkbox"
                    @change="saveChatContextSetting"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div v-if="enableChatContext" class="context-count-setting">
                <label>讀取最近</label>
                <input
                  v-model.number="chatContextCount"
                  type="number"
                  min="1"
                  max="50"
                  class="context-count-input"
                  @change="saveChatContextSetting"
                />
                <span>條對話</span>
              </div>
              <p class="setting-status">
                <span v-if="enableChatContext" class="status-enabled"
                  >AI 會參考聊天記錄來生成更連貫的內容</span
                >
                <span v-else class="status-disabled">AI 不會讀取聊天記錄</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 黑名單管理模態框 -->
    <transition name="modal-fade">
      <div
        v-if="showBlacklistManager"
        class="modal-overlay"
        @click="showBlacklistManager = false"
      >
        <div class="modal-content blacklist-modal" @click.stop>
          <div class="modal-header">
            <h3>黑名單管理</h3>
            <button
              class="modal-close-btn"
              @click="showBlacklistManager = false"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p class="blacklist-desc">黑名單中的角色不會參與自動發文和評論</p>

            <div class="blacklist-section">
              <h4>可用角色</h4>
              <div class="character-grid">
                <div
                  v-for="char in nonBlacklistedCharacters"
                  :key="char.id"
                  class="blacklist-char-item"
                  @click="addToBlacklist(char.id)"
                >
                  <img
                    :src="char.avatar || getDefaultAvatar(char.id)"
                    class="blacklist-char-avatar"
                  />
                  <span class="blacklist-char-name">{{
                    char.nickname || char.data?.name
                  }}</span>
                  <button class="blacklist-add-btn" title="加入黑名單">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M4.93 4.93l14.14 14.14" />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                v-if="nonBlacklistedCharacters.length === 0"
                class="empty-list"
              >
                所有角色都在黑名單中
              </div>
            </div>

            <div class="blacklist-section">
              <h4>黑名單 ({{ blacklistedCharacters.length }})</h4>
              <div class="character-grid">
                <div
                  v-for="char in blacklistedCharacters"
                  :key="char.id"
                  class="blacklist-char-item blacklisted"
                  @click="removeFromBlacklist(char.id)"
                >
                  <img
                    :src="char.avatar || getDefaultAvatar(char.id)"
                    class="blacklist-char-avatar"
                  />
                  <span class="blacklist-char-name">{{
                    char.nickname || char.data?.name
                  }}</span>
                  <button class="blacklist-remove-btn" title="移出黑名單">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div v-if="blacklistedCharacters.length === 0" class="empty-list">
                黑名單為空
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="clearBlacklist">
              清空黑名單
            </button>
            <button class="btn-primary" @click="showBlacklistManager = false">
              完成
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 自動互動配置模態框 -->
    <transition name="modal-fade">
      <div
        v-if="showAutoInteractionConfig"
        class="modal-overlay"
        @click="showAutoInteractionConfig = false"
      >
        <div class="modal-content auto-interaction-modal" @click.stop>
          <div class="modal-header">
            <h3>自動互動設置</h3>
            <button
              class="modal-close-btn"
              @click="showAutoInteractionConfig = false"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <!-- 啟用開關 -->
            <div class="config-section">
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">啟用自動互動</span>
                  <span class="config-desc">AI 角色會定時自動發文和評論</span>
                </div>
                <label class="toggle-switch">
                  <input v-model="tempAutoConfig.enabled" type="checkbox" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <!-- 時間間隔設定 -->
            <div class="config-section">
              <h4>時間間隔</h4>
              <div class="config-row">
                <label class="config-label">發文間隔（分鐘）</label>
                <input
                  v-model.number="tempAutoConfig.postInterval"
                  type="number"
                  min="5"
                  max="1440"
                  class="config-input"
                />
              </div>
              <div class="config-row">
                <label class="config-label">評論間隔（分鐘）</label>
                <input
                  v-model.number="tempAutoConfig.commentInterval"
                  type="number"
                  min="1"
                  max="60"
                  class="config-input"
                />
              </div>
            </div>

            <!-- 每日限制 -->
            <div class="config-section">
              <h4>每日限制</h4>
              <div class="config-row">
                <label class="config-label">最大發文數</label>
                <input
                  v-model.number="tempAutoConfig.maxPostsPerDay"
                  type="number"
                  min="1"
                  max="50"
                  class="config-input"
                />
              </div>
              <div class="config-row">
                <label class="config-label">最大評論數</label>
                <input
                  v-model.number="tempAutoConfig.maxCommentsPerDay"
                  type="number"
                  min="1"
                  max="100"
                  class="config-input"
                />
              </div>
            </div>

            <!-- 角色選擇模式 -->
            <div class="config-section">
              <h4>角色選擇模式</h4>
              <div class="mode-selector">
                <button
                  class="mode-option"
                  :class="{
                    active: tempAutoConfig.characterSelection.mode === 'random',
                  }"
                  @click="tempAutoConfig.characterSelection.mode = 'random'"
                >
                  隨機
                </button>
                <button
                  class="mode-option"
                  :class="{
                    active:
                      tempAutoConfig.characterSelection.mode === 'rotation',
                  }"
                  @click="tempAutoConfig.characterSelection.mode = 'rotation'"
                >
                  輪流
                </button>
                <button
                  class="mode-option"
                  :class="{
                    active:
                      tempAutoConfig.characterSelection.mode === 'weighted',
                  }"
                  @click="tempAutoConfig.characterSelection.mode = 'weighted'"
                >
                  權重
                </button>
              </div>
            </div>

            <!-- @ 提及回應 -->
            <div class="config-section">
              <h4>@ 提及回應</h4>
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">啟用提及回應</span>
                  <span class="config-desc">被 @ 提及時自動回覆</span>
                </div>
                <label class="toggle-switch">
                  <input
                    v-model="
                      tempAutoConfig.conversation.mentionResponse.enabled
                    "
                    type="checkbox"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button
              class="btn-secondary"
              @click="showAutoInteractionConfig = false"
            >
              取消
            </button>
            <button class="btn-primary" @click="saveAutoInteractionConfig">
              保存設定
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 角色選擇模態框 -->
    <transition name="modal-fade">
      <div
        v-if="showCharacterSelect"
        class="modal-overlay"
        @click="showCharacterSelect = false"
      >
        <div class="modal-content character-select-modal" @click.stop>
          <div class="modal-header">
            <h3>
              {{
                characterSelectMode === "post"
                  ? "選擇角色發布動態"
                  : "選擇角色回應"
              }}
            </h3>
            <button
              class="modal-close-btn"
              @click="showCharacterSelect = false"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="character-list">
            <div
              v-for="char in availableCharacters"
              :key="char.id"
              class="character-item"
              :class="{
                selected: selectedCharacterIds.includes(char.id),
                'group-member': userStore.isCharacterBound(
                  userStore.currentPersonaId || '',
                  char.id,
                ),
              }"
              @click="
                characterSelectMode === 'post'
                  ? executeAIPost(char.id)
                  : toggleCharacterSelection(char.id)
              "
            >
              <img
                :src="char.avatar || getDefaultAvatar(char.id)"
                class="character-avatar"
              />
              <div class="character-info">
                <span class="character-name">{{
                  char.nickname || char.data?.name
                }}</span>
                <span
                  v-if="
                    userStore.isCharacterBound(
                      userStore.currentPersonaId || '',
                      char.id,
                    )
                  "
                  class="group-member-badge"
                  >群組成員</span
                >
              </div>
              <div
                v-if="
                  characterSelectMode === 'comment' &&
                  selectedCharacterIds.includes(char.id)
                "
                class="check-mark"
              >
                ✓
              </div>
            </div>
          </div>
          <div v-if="characterSelectMode === 'comment'" class="modal-footer">
            <button class="btn-secondary" @click="showCharacterSelect = false">
              取消
            </button>
            <button
              class="btn-primary"
              :disabled="selectedCharacterIds.length === 0 || isAIScanning"
              @click="executeManualScan"
            >
              確認 ({{ selectedCharacterIds.length }})
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 圖片預覽 Lightbox -->
    <transition name="lightbox-fade">
      <div
        v-if="showImagePreview"
        class="image-lightbox"
        @click="closeImagePreview"
      >
        <button class="lightbox-close" @click="closeImagePreview">
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <button
          v-if="previewImages.length > 1"
          class="lightbox-nav lightbox-prev"
          @click.stop="prevImage"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div class="lightbox-content" @click.stop>
          <img
            :src="previewImages[currentPreviewIndex]"
            class="lightbox-image"
          />
        </div>

        <button
          v-if="previewImages.length > 1"
          class="lightbox-nav lightbox-next"
          @click.stop="nextImage"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <div v-if="previewImages.length > 1" class="lightbox-counter">
          {{ currentPreviewIndex + 1 }} / {{ previewImages.length }}
        </div>
      </div>
    </transition>

    <!-- 轉噗模態框 -->
    <transition name="modal-fade">
      <div
        v-if="showRepostModal"
        class="modal-overlay"
        @click="showRepostModal = false"
      >
        <div class="modal-content repost-modal" @click.stop>
          <div class="modal-header">
            <h3>轉噗</h3>
            <button class="modal-close-btn" @click="showRepostModal = false">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <!-- 原始動態預覽 -->
            <div v-if="repostTargetPost" class="repost-original">
              <div class="repost-original-header">
                <img
                  :src="repostTargetPost.avatar"
                  class="repost-original-avatar"
                />
                <span class="repost-original-username">{{
                  repostTargetPost.username
                }}</span>
                <span class="repost-original-qualifier">{{
                  repostTargetPost.qualifier || "說"
                }}</span>
              </div>
              <div class="repost-original-content">
                {{ repostTargetPost.content }}
              </div>
              <div
                v-if="repostTargetPost.images?.length"
                class="repost-original-images"
              >
                <img
                  v-for="(img, i) in repostTargetPost.images.slice(0, 2)"
                  :key="i"
                  :src="img"
                  class="repost-original-img"
                />
              </div>
            </div>

            <!-- 轉噗評論 -->
            <div class="repost-comment-section">
              <textarea
                v-model="repostComment"
                class="repost-comment-input"
                placeholder="說點什麼... (可選)"
                maxlength="200"
              ></textarea>
              <div class="repost-char-count">
                {{ repostComment.length }}/200
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showRepostModal = false">
              取消
            </button>
            <button class="btn-primary" @click="confirmRepost">確認轉噗</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 發文表情包面板 -->
    <transition name="modal-fade">
      <div
        v-if="showStickerPanel"
        class="modal-overlay sticker-overlay"
        @click="showStickerPanel = false"
      >
        <div class="sticker-panel-wrapper" @click.stop>
          <div class="sticker-panel-header">
            <h4>選擇表情包</h4>
            <button class="close-btn" @click="showStickerPanel = false">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <StickerPanel @select="insertStickerToPost" />
        </div>
      </div>
    </transition>

    <!-- 評論表情包面板 -->
    <transition name="modal-fade">
      <div
        v-if="showCommentStickerPanel"
        class="modal-overlay sticker-overlay"
        @click="
          showCommentStickerPanel = false;
          currentStickerCommentPostId = null;
        "
      >
        <div class="sticker-panel-wrapper" @click.stop>
          <div class="sticker-panel-header">
            <h4>選擇表情包</h4>
            <button
              class="close-btn"
              @click="
                showCommentStickerPanel = false;
                currentStickerCommentPostId = null;
              "
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <StickerPanel @select="insertStickerToComment" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import StickerPanel from "@/components/common/StickerPanel.vue";
import { useBatchComments } from "@/composables/useBatchComments";
import { getDatabase } from "@/db/database";
import { useUserStore } from "@/stores";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { useChatStore } from "@/stores/chat";
import { usePromptManagerStore } from "@/stores/promptManager";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useStickerStore } from "@/stores/sticker";
import type { StoredCharacter } from "@/types/character";
import type {
    AutoInteractionConfig,
    MediaItem,
    QZoneComment,
    QZonePost,
} from "@/types/qzone";
import { DEFAULT_AUTO_INTERACTION_CONFIG } from "@/types/qzone";
import { compressImage, compressionPresets } from "@/utils/imageCompression";
import { shouldHideFromQZone } from "@/services/BlockService";
import { computed, nextTick, onMounted, ref, watch } from "vue";

// ============================================================
// Emits
// ============================================================

const emit = defineEmits<{
  (e: "back"): void;
  (e: "navigate-theater", theaterPostId?: string): void;
}>();

// ============================================================
// Stores
// ============================================================

const qzoneStore = useQzoneStore();
const charactersStore = useCharactersStore();
const settingsStore = useSettingsStore();
const stickerStore = useStickerStore();
const chatStore = useChatStore();
const promptManagerStore = usePromptManagerStore();
const userStore = useUserStore();
const aiGenerationStore = useAIGenerationStore();

// 封鎖角色 ID 集合（用於過濾 QZone 動態）
const blockedCharacterIds = ref<Set<string>>(new Set());

/** 從 IndexedDB 載入被用戶封鎖的角色 ID */
async function loadBlockedCharacterIds() {
  try {
    const database = await getDatabase();
    const allChats = await database.getAll('chats');
    const ids = new Set<string>();
    for (const chat of allChats) {
      if (shouldHideFromQZone(chat as any)) {
        ids.add((chat as any).characterId);
      }
    }
    blockedCharacterIds.value = ids;
  } catch (err) {
    console.warn('[QZone] 載入封鎖角色失敗:', err);
  }
}

// 批量評論 Composable
const {
  generateCommentsForPost: batchGenerateComments,
  regenerateAllComments: batchRegenerateComments,
} = useBatchComments();

// 評論生成狀態（從全局 store 獲取）
const isBatchGenerating = computed(() =>
  aiGenerationStore.isTaskGenerating("qzone", "qzone-comments"),
);

// ============================================================
// 狀態
// ============================================================

// 發布相關
const newPostContent = ref("");
const selectedImages = ref<MediaItem[]>([]);
const selectedQualifier = ref("說");
const qualifierPickerVisible = ref(false);
const postTextarea = ref<HTMLTextAreaElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);

// 身份切換和可見性
const showPersonaSwitcher = ref(false);
const postVisibilityMode = ref<"public" | "group-only">("public");
const showVisibilityPicker = ref(false);

// 搜索
const searchQuery = ref("");

// UI 狀態
const showUserSettings = ref(false);
const showBackToTop = ref(false);
const mainContainer = ref<HTMLElement | null>(null);
const riverTimeline = ref<HTMLElement | null>(null);

// 詳情頁
const selectedPost = ref<QZonePost | null>(null);
const detailCommentInput = ref("");
const replyingToComment = ref<QZoneComment | null>(null);

// 將評論按回覆關係排序：回覆評論緊接在被回覆的評論後面
const sortedDetailComments = computed(() => {
  const comments = selectedPost.value?.comments ?? [];
  if (!comments.length) return comments;

  const result: typeof comments = [];
  const placed = new Set<string>();

  // 先放入所有頂層評論（沒有 replyToId 的），並在每條後面插入它的回覆
  function placeComment(comment: (typeof comments)[0]) {
    if (placed.has(comment.id)) return;
    placed.add(comment.id);
    result.push(comment);
    // 找出所有直接回覆這條的評論，按時間順序插入
    const replies = comments.filter((c) => c.replyToId === comment.id);
    replies.sort((a, b) => a.timestamp - b.timestamp);
    replies.forEach(placeComment);
  }

  const topLevel = comments.filter((c) => !c.replyToId);
  topLevel.sort((a, b) => a.timestamp - b.timestamp);
  topLevel.forEach(placeComment);

  // 防止有孤立回覆（replyToId 指向不存在的評論）漏掉
  comments.forEach((c) => {
    if (!placed.has(c.id)) result.push(c);
  });

  return result;
});

// 表情選擇器
const showEmoticonPicker = ref<string | null>(null);

// 主題
type ThemeMode = "light" | "dark" | "auto";
const themeMode = ref<ThemeMode>("auto");
const isDarkMode = ref(false);

// 設定臨時值
const tempUserAvatar = ref("");
const tempUserName = ref("");

// AI 掃描相關
const isAIScanning = ref(false);
const showScanModeSelect = ref(false);
const showCharacterSelect = ref(false);
const selectedCharacterIds = ref<string[]>([]);
const autoAIReply = ref(true);
const characterSelectMode = ref<"post" | "comment">("comment"); // 角色選擇模式：發文或評論

// 黑名單和自動互動
const showBlacklistManager = ref(false);
const showAutoInteractionConfig = ref(false);
const tempAutoConfig = ref<AutoInteractionConfig>({
  ...DEFAULT_AUTO_INTERACTION_CONFIG,
});

// @ 提及相關
const showMentionSuggestions = ref(false);
const mentionSelectedIndex = ref(0);
const mentionSearchText = ref("");
const showDetailMentionList = ref(false);

// 圖片預覽相關
const showImagePreview = ref(false);
const previewImages = ref<string[]>([]);
const currentPreviewIndex = ref(0);

// 匿名模式
const anonymousMode = ref<Record<string, boolean>>({});
const detailAnonymousMode = ref(false);

// 詳情頁用戶切換
const showDetailPersonaSwitcher = ref(false);
const detailCommentPersonaId = ref<string | null>(null); // null 表示使用當前 persona

// 詳情頁評論用的頭像和名稱（根據選擇的 persona）
const detailCommentAvatar = computed(() => {
  if (detailAnonymousMode.value) {
    return "https://api.dicebear.com/7.x/shapes/svg?seed=anonymous&backgroundColor=666666";
  }
  if (detailCommentPersonaId.value) {
    const persona = userStore.personas.find(
      (p) => p.id === detailCommentPersonaId.value,
    );
    return persona?.avatar || getDefaultAvatar(detailCommentPersonaId.value);
  }
  return userStore.currentAvatar || userAvatar.value;
});

const detailCommentUsername = computed(() => {
  if (detailAnonymousMode.value) {
    return "匿名噴友";
  }
  if (detailCommentPersonaId.value) {
    const persona = userStore.personas.find(
      (p) => p.id === detailCommentPersonaId.value,
    );
    return persona?.name || "未知用戶";
  }
  return userStore.currentName || userName.value;
});

// 選擇詳情頁評論用的 persona
function selectDetailPersona(personaId: string) {
  detailCommentPersonaId.value = personaId;
  showDetailPersonaSwitcher.value = false;
}

// 表情包面板
const showStickerPanel = ref(false);
const showCommentStickerPanel = ref(false);
const currentStickerCommentPostId = ref<string | null>(null);

// 轉噗相關
const showRepostModal = ref(false);
const repostTargetPost = ref<QZonePost | null>(null);
const repostComment = ref("");

// 對話上下文設定
const enableChatContext = ref(true);
const chatContextCount = ref(10);

// ============================================================
// 常量
// ============================================================

const qualifiers = [
  "說",
  "想",
  "愛",
  "覺得",
  "會",
  "需要",
  "希望",
  "喜歡",
  "is",
  "has",
  "wants",
  "needs",
];
const emoticons = ["👍", "❤️", "😂", "😮", "😢", "😠", "🎉", "👏", "🤔", "😊"];

const avatarStyles = [
  { label: "日系", value: "lorelei", emoji: "🌸" },
  { label: "冒險", value: "adventurer", emoji: "⚔️" },
  { label: "簡約", value: "micah", emoji: "🎨" },
  { label: "像素", value: "pixel-art", emoji: "👾" },
  { label: "Notion", value: "notionists", emoji: "📝" },
  { label: "機器", value: "bottts", emoji: "🤖" },
];

// ============================================================
// 計算屬性
// ============================================================

const charCount = computed(() => newPostContent.value.length);

const canPost = computed(() => {
  return newPostContent.value.trim().length > 0 && charCount.value <= 360;
});

const userAvatar = computed(() => {
  return (
    qzoneStore.settings.avatar ||
    "https://api.dicebear.com/7.x/avataaars/svg?seed=user"
  );
});

const userName = computed(() => {
  return qzoneStore.settings.nickname || "我";
});

// 過濾後的動態
const filteredPosts = computed(() => {
  let result = qzoneStore.sortedPosts;

  // 過濾被用戶封鎖的角色動態
  if (blockedCharacterIds.value.size > 0) {
    result = result.filter((post) => !blockedCharacterIds.value.has(post.authorId));
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    result = result.filter((post) => {
      const contentMatch = post.content?.toLowerCase().includes(query);
      const usernameMatch = post.username?.toLowerCase().includes(query);
      const qualifierMatch = post.qualifier?.toLowerCase().includes(query);
      return contentMatch || usernameMatch || qualifierMatch;
    });
  }

  // 動態獲取最新頭像
  return result.map((post) => ({
    ...post,
    avatar: getAvatarByAuthorId(post.authorId, post.avatar),
    username: getUsernameByAuthorId(post.authorId, post.username),
  }));
});

// 河道時間軸動態（最近 20 條）
const riverPosts = computed(() => filteredPosts.value.slice(0, 20));

// 時間軸寬度
const timelineWidth = computed(
  () => `${Math.max(riverPosts.value.length * 120, 600)}px`,
);

// 可用角色列表
const availableCharacters = computed(() => charactersStore.characters);

// 黑名單角色列表
const blacklistedCharacters = computed(() => {
  const blacklist =
    qzoneStore.autoInteractionConfig.characterSelection.blacklist;
  return availableCharacters.value.filter((char) =>
    blacklist.includes(char.id),
  );
});

// 非黑名單角色列表
const nonBlacklistedCharacters = computed(() => {
  const blacklist =
    qzoneStore.autoInteractionConfig.characterSelection.blacklist;
  return availableCharacters.value.filter(
    (char) => !blacklist.includes(char.id),
  );
});

// 獲取可以回覆特定貼文的角色列表（根據可見性過濾）
function getEligibleCharactersForPost(post: QZonePost): StoredCharacter[] {
  const blacklist =
    qzoneStore.autoInteractionConfig.characterSelection.blacklist;

  // 先過濾黑名單
  let eligible = availableCharacters.value.filter(
    (char) => !blacklist.includes(char.id),
  );

  // 如果是群組限定貼文，只有群組成員可以回覆
  if (post.visibilityMode === "group-only" && post.groupMemberIds?.length) {
    eligible = eligible.filter((char) =>
      post.groupMemberIds!.includes(char.id),
    );
  }

  return eligible;
}

// 獲取與指定 Persona 列表相關的所有角色 ID（用於角色發文時的可見性）
function getRelatedCharacterIds(personaIds: string[]): string[] {
  const characterIds = new Set<string>();

  for (const personaId of personaIds) {
    const persona = userStore.personas.find((p) => p.id === personaId);
    if (persona?.boundCharacterIds) {
      for (const charId of persona.boundCharacterIds) {
        characterIds.add(charId);
      }
    }
  }

  return Array.from(characterIds);
}

// @ 提及建議列表
const mentionSuggestions = computed(() => {
  if (!mentionSearchText.value) {
    return availableCharacters.value;
  }
  const search = mentionSearchText.value.toLowerCase();
  return availableCharacters.value.filter((char) => {
    const name = (char.nickname || char.data?.name || "").toLowerCase();
    return name.includes(search);
  });
});

// ============================================================
// 方法
// ============================================================

function goBack() {
  emit("back");
}

// 格式化時間
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return "剛剛";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 河道時間格式
function formatRiverTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// 獲取節點位置
function getNodePosition(index: number): string {
  return `${index * 120 + 60}px`;
}

// 滾動到指定動態
function scrollToPost(postId: string) {
  const element = document.getElementById(`post-${postId}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("highlight");
    setTimeout(() => element.classList.remove("highlight"), 2000);
  }
}

// 獲取默認頭像
function getDefaultAvatar(seed: string): string {
  // 使用更美觀的 Lorelei 風格代替 Bottts
  return `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

// 根據作者 ID 獲取頭像
function getAvatarByAuthorId(authorId: string, fallback?: string): string {
  if (authorId === "user") {
    return userAvatar.value;
  }

  const character = charactersStore.getCharacterById(authorId);
  if (character) {
    return character.avatar || fallback || getDefaultAvatar(authorId);
  }

  return (
    fallback ||
    "https://api.dicebear.com/7.x/lorelei/svg?seed=default&backgroundColor=ffdfbf"
  );
}

// 根據作者 ID 獲取用戶名
function getUsernameByAuthorId(authorId: string, fallback?: string): string {
  if (authorId === "user") {
    return userName.value;
  }

  const character = charactersStore.getCharacterById(authorId);
  if (character) {
    return character.nickname || character.data?.name || fallback || "未知角色";
  }

  return fallback || "未知用戶";
}

// 獲取表情總數
function getTotalEmoticons(postId: string): number {
  const post = qzoneStore.posts.find((p) => p.id === postId);
  if (!post?.emoticons) return 0;
  return Object.values(post.emoticons).reduce((sum, count) => sum + count, 0);
}

// 渲染內容（處理 @ 提及和表情包）
function renderContentWithMentions(content: string): string {
  if (!content) return "";

  // 移除可能殘留的 [REACTIONS]...[/REACTIONS] 標籤
  let rendered = content
    .replace(/\[REACTIONS\][\s\S]*?\[\/REACTIONS\]/gi, "")
    .trim();

  // 先處理換行符
  rendered = rendered.replace(/\n/g, "<br>");

  // 處理表情包
  rendered = renderContentWithStickers(rendered);

  // 處理 @ 提及 - 將 @角色名 轉換為高亮樣式
  rendered = rendered.replace(
    /@(\S+)/g,
    '<span class="mention-highlight">@$1</span>',
  );

  // 處理圖片描述標籤（舊格式）
  rendered = rendered.replace(
    /<圖片描述>([\s\S]*?)<\/圖片描述>/g,
    (_, desc) => {
      return `<div class="image-description-block">📷 ${desc.trim()}</div>`;
    },
  );

  function renderPolaroidImage(chineseDesc: string): string {
    const safeDesc = chineseDesc.trim() || "圖片";
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const formattedDate = `${year}.${month}.${day}`;

    return `<div class="qzone-polaroid-container">
      <div class="qzone-polaroid-overlay"></div>
      <div class="qzone-polaroid-frame"></div>
      <div class="qzone-polaroid-content">${safeDesc}</div>
      <div class="qzone-polaroid-date">${formattedDate}</div>
    </div>`;
  }

  // 處理 [IMAGE]...[/IMAGE] 標籤 - 轉換為拍立得樣式
  // 格式：[IMAGE]中文描述｜英文提示詞[/IMAGE]
  rendered = rendered.replace(
    /\[IMAGE\]([\s\S]*?)\[\/IMAGE\]/gi,
    (_, imageContent) => {
      const parts = imageContent.trim().split(/[|｜]/);
      const chineseDesc = parts[0]?.trim() || "圖片";
      return renderPolaroidImage(chineseDesc);
    },
  );

  // 處理 <pic prompt="..."></pic> 標籤 - 與 [IMAGE] 使用相同拍立得樣式
  rendered = rendered.replace(
    /<pic(?:\s+prompt=["'][^"']*["'])?\s*>([\s\S]*?)<\/pic>/gi,
    (_, imageDescription) => {
      return renderPolaroidImage(imageDescription);
    },
  );

  return rendered;
}

// ============================================================
// 發布相關
// ============================================================

function selectQualifier(q: string) {
  selectedQualifier.value = q;
  qualifierPickerVisible.value = false;
}

// 切換用戶身份
async function switchPersona(personaId: string) {
  userStore.switchPersona(personaId);
  await userStore.saveUserData();
  showPersonaSwitcher.value = false;

  // 根據新身份的默認設定更新可見性
  const persona = userStore.personas.find((p) => p.id === personaId);
  if (persona?.qzoneSettings?.defaultVisibility) {
    postVisibilityMode.value = persona.qzoneSettings.defaultVisibility;
  }
}

// 選擇可見性
function selectVisibility(mode: "public" | "group-only") {
  postVisibilityMode.value = mode;
  showVisibilityPicker.value = false;
}

function triggerImageSelect() {
  imageInput.value?.click();
}

async function handleMediaSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;

  for (const file of Array.from(input.files)) {
    try {
      if (file.type.startsWith("video/")) {
        // 視頻不壓縮，直接讀取
        const reader = new FileReader();
        reader.onload = (e) => {
          const url = e.target?.result as string;
          selectedImages.value.push({ type: "video", url });
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("image/")) {
        // 圖片壓縮
        const compressedUrl = await compressImage(
          file,
          compressionPresets.chatImage,
        );
        selectedImages.value.push({ type: "image", url: compressedUrl });
      }
    } catch (error) {
      console.error("處理媒體文件失敗:", error);
      // 壓縮失敗時使用原始文件
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        const type = file.type.startsWith("video/") ? "video" : "image";
        selectedImages.value.push({ type, url });
      };
      reader.readAsDataURL(file);
    }
  }

  input.value = "";
}

function removeImage(index: number) {
  selectedImages.value.splice(index, 1);
}

async function publishPost() {
  if (!canPost.value) return;

  const images = selectedImages.value
    .filter((m) => m.type === "image")
    .map((m) => m.url);

  // 準備群組資訊
  const currentPersona = userStore.currentPersona;
  const isGroupOnly = postVisibilityMode.value === "group-only";

  // 使用當前 Persona 的名稱和頭像，如果沒有則回退到 qzoneStore 的設定
  const postUsername = currentPersona?.name || userName.value;
  const postAvatar = currentPersona?.avatar || userAvatar.value;

  // 轉換 reactive 陣列為純陣列（避免 DataCloneError）
  const mediaItems =
    selectedImages.value.length > 0
      ? selectedImages.value.map((m) => ({ type: m.type, url: m.url }))
      : undefined;
  const groupMembers =
    isGroupOnly && currentPersona?.boundCharacterIds
      ? [...currentPersona.boundCharacterIds]
      : undefined;

  const newPost = await qzoneStore.addPost({
    authorId: currentPersona?.id || "user",
    username: postUsername,
    avatar: postAvatar,
    type: images.length > 0 ? "text_image" : "shuoshuo",
    content: newPostContent.value.trim(),
    qualifier: selectedQualifier.value,
    images: images.length > 0 ? [...images] : undefined,
    media: mediaItems,
    visibility: "public",
    authorType: "user",
    // 新增：群組可見性相關
    authorPersonaId: currentPersona?.id,
    visibilityMode: postVisibilityMode.value,
    groupName: isGroupOnly ? currentPersona?.groupName : undefined,
    groupMemberIds: groupMembers,
  });

  // 重置
  newPostContent.value = "";
  selectedImages.value = [];
  selectedQualifier.value = "說";

  // 聚焦回輸入框
  postTextarea.value?.focus();

  // 自動 AI 回覆：發布後自動生成評論
  if (autoAIReply.value && newPost) {
    // 延遲一點再生成，讓 UI 先更新
    setTimeout(async () => {
      console.log("[QZone] 自動 AI 回覆已開啟，開始生成評論...");
      const allCharIds = charactersStore.characters.map((c) => c.id);
      const chatCtx = await buildChatContextForComments(allCharIds);
      const result = await batchGenerateComments(newPost.id, undefined, {
        useStreaming: false,
        chatContext: chatCtx,
      });
      if (result.success) {
        console.log(`[QZone] 自動生成了 ${result.addedCount} 條評論`);
      } else {
        console.warn("[QZone] 自動評論生成失敗:", result.error);
      }
    }, 500);
  }
}

// ============================================================
// 互動相關
// ============================================================

function toggleEmoticonPicker(postId: string) {
  showEmoticonPicker.value =
    showEmoticonPicker.value === postId ? null : postId;
}

async function handleAddEmoticon(postId: string, emoji: string) {
  await qzoneStore.addEmoticon(postId, emoji);
  showEmoticonPicker.value = null;
}

async function handleToggleBookmark(postId: string) {
  await qzoneStore.toggleBookmark(postId);
}

async function handleToggleLike(postId: string) {
  await qzoneStore.toggleLike(postId, "user");
}

function toggleRepost(postId: string) {
  const post = qzoneStore.posts.find((p) => p.id === postId);
  if (!post) return;

  // 打開轉噗模態框
  repostTargetPost.value = post;
  repostComment.value = "";
  showRepostModal.value = true;
}

// 確認轉噗
async function confirmRepost() {
  if (!repostTargetPost.value) return;

  const originalPost = repostTargetPost.value;

  // 創建轉噗動態
  await qzoneStore.addPost({
    authorId: "user",
    username: userName.value,
    avatar: userAvatar.value,
    type: "repost",
    content: repostComment.value.trim() || undefined,
    qualifier: "轉噗",
    visibility: "public",
    authorType: "user",
    originalPost: {
      id: originalPost.id,
      authorId: originalPost.authorId,
      username: originalPost.username,
      avatar: originalPost.avatar,
      type: originalPost.type,
      content: originalPost.content,
      images: originalPost.images,
      timestamp: originalPost.timestamp,
      comments: [],
      likes: [],
      visibility: originalPost.visibility,
      qualifier: originalPost.qualifier,
    },
  });

  // 更新原動態的轉噗數
  await qzoneStore.updatePost(originalPost.id, {
    reposted: true,
    repostCount: (originalPost.repostCount || 0) + 1,
  });

  // 關閉模態框
  showRepostModal.value = false;
  repostTargetPost.value = null;
  repostComment.value = "";
}

async function handleDeletePost(postId: string) {
  if (confirm("確定要刪除這條動態嗎？")) {
    await qzoneStore.deletePost(postId);
  }
}

// 圖片預覽功能
function previewImage(images: string[], index: number) {
  previewImages.value = images;
  currentPreviewIndex.value = index;
  showImagePreview.value = true;
}

function closeImagePreview() {
  showImagePreview.value = false;
  previewImages.value = [];
  currentPreviewIndex.value = 0;
}

function prevImage() {
  if (currentPreviewIndex.value > 0) {
    currentPreviewIndex.value--;
  } else {
    currentPreviewIndex.value = previewImages.value.length - 1;
  }
}

function nextImage() {
  if (currentPreviewIndex.value < previewImages.value.length - 1) {
    currentPreviewIndex.value++;
  } else {
    currentPreviewIndex.value = 0;
  }
}

// ============================================================
// 詳情頁相關
// ============================================================

function openDetailView(post: QZonePost) {
  // 檢查是否為小劇場連結貼文 — 點擊直接跳轉到小劇場內文
  if (post.emoticons) {
    const theaterKey = Object.keys(post.emoticons).find((k) =>
      k.startsWith("theater:"),
    );
    if (theaterKey) {
      const theaterPostId = theaterKey.replace("theater:", "");
      emit("navigate-theater", theaterPostId);
      return;
    }
  }
  selectedPost.value = post;
  detailCommentInput.value = "";
  detailAnonymousMode.value = false;
}

function closeDetailView() {
  selectedPost.value = null;
  detailAnonymousMode.value = false;
}

async function submitDetailComment() {
  if (!selectedPost.value || !detailCommentInput.value.trim()) return;

  const isAnonymous = detailAnonymousMode.value;
  const postId = selectedPost.value.id;
  const commentContent = detailCommentInput.value.trim();

  // 解析評論中 @ 提及的角色
  const mentionedCharacterIds = extractMentionedCharacterIds(commentContent);

  // 獲取當前選擇的 persona（用於評論）
  const selectedPersonaId =
    detailCommentPersonaId.value || userStore.currentPersonaId;

  await qzoneStore.addComment(postId, {
    authorId: isAnonymous ? "anonymous" : selectedPersonaId || "user",
    username: isAnonymous ? "匿名噴友" : detailCommentUsername.value,
    avatar: isAnonymous
      ? "https://api.dicebear.com/7.x/shapes/svg?seed=anonymous&backgroundColor=666666"
      : detailCommentAvatar.value,
    content: commentContent,
    authorType: "user",
    // 如果是回覆某條評論，記錄回覆關係
    replyToId: replyingToComment.value?.id,
    replyToUsername: replyingToComment.value?.username,
  });

  // 保存回覆對象的引用（用於 AI 回覆判斷）
  const savedReplyingToComment = replyingToComment.value;

  detailCommentInput.value = "";
  detailAnonymousMode.value = false;
  replyingToComment.value = null;

  // 更新 selectedPost
  const updatedPost = qzoneStore.posts.find((p) => p.id === postId);
  if (updatedPost) {
    selectedPost.value = updatedPost;
  }

  // 自動 AI 回覆：用戶評論後觸發 AI 回應（無論有沒有 @ 人）
  if (autoAIReply.value) {
    setTimeout(async () => {
      // 確定要優先參與的角色 ID（被 @ 的角色或被回覆的角色）
      let priorityCharacterId: string | undefined;

      // 優先使用被 @ 的角色
      if (mentionedCharacterIds.length > 0) {
        priorityCharacterId = mentionedCharacterIds[0];
      }
      // 其次使用被回覆評論的作者（如果是 AI 角色）
      else if (
        savedReplyingToComment?.authorType === "ai" &&
        savedReplyingToComment?.authorId
      ) {
        priorityCharacterId = savedReplyingToComment.authorId;
      }

      console.log(
        `[QZone] 用戶評論後觸發 AI 回覆，優先角色: ${priorityCharacterId || "無"}`,
      );

      const allCharIds = charactersStore.characters.map((c) => c.id);
      const chatCtx = await buildChatContextForComments(allCharIds);

      const result = await batchGenerateComments(postId, undefined, {
        useStreaming: false,
        includeExistingComments: true, // 帶上歷史對話
        replyToCharacterId: priorityCharacterId,
        chatContext: chatCtx,
      });

      if (result.success) {
        console.log(`[QZone] AI 回覆生成了 ${result.addedCount} 條評論`);
        // 更新 selectedPost 以顯示新評論
        const refreshedPost = qzoneStore.posts.find((p) => p.id === postId);
        if (refreshedPost) {
          selectedPost.value = refreshedPost;
        }
      } else {
        console.warn("[QZone] AI 回覆生成失敗:", result.error);
      }
    }, 500);
  }
}

/**
 * 從評論內容中提取被 @ 的角色 ID
 */
function extractMentionedCharacterIds(content: string): string[] {
  const mentionedIds: string[] = [];
  // 匹配 @角色名 格式
  const mentionRegex = /@([^\s@]+)/g;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionedName = match[1];
    // 在角色列表中查找匹配的角色
    const character = charactersStore.characters.find(
      (c) =>
        c.data?.name === mentionedName ||
        c.nickname === mentionedName ||
        c.data?.name?.includes(mentionedName) ||
        mentionedName.includes(c.data?.name || ""),
    );
    if (character && !mentionedIds.includes(character.id)) {
      mentionedIds.push(character.id);
    }
  }

  return mentionedIds;
}

/**
 * 構建每個角色各自的聊天記錄上下文（從 IndexedDB 按 characterId 查詢）
 * @param characterIds 參與評論的角色 ID 列表（可選，不傳則返回空）
 */
async function buildChatContextForComments(
  characterIds?: string[],
): Promise<Record<string, string>> {
  if (!enableChatContext.value) return {};

  const ids = characterIds ?? [];
  if (ids.length === 0) return {};

  const result: Record<string, string> = {};
  const count = chatContextCount.value;

  try {
    const db = await getDatabase();

    for (const charId of ids) {
      // 用 by-character 索引查該角色的所有聊天
      const chats = await db.getAllFromIndex("chats", "by-character", charId);
      if (!chats || chats.length === 0) continue;

      // 按 updatedAt 降序排列，取最新的聊天
      chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const latestChat = chats[0];

      if (!latestChat.messages || latestChat.messages.length === 0) continue;

      // 取最近 N 條消息
      const recentMsgs = latestChat.messages.slice(-count);
      const charName =
        charactersStore.characters.find((c) => c.id === charId)?.data?.name ||
        latestChat.name ||
        "角色";

      const contextStr = recentMsgs
        .map((msg) => {
          const role =
            msg.sender === "user" ? userName.value : msg.name || charName;
          return `${role}: ${msg.content}`;
        })
        .join("\n");

      if (contextStr) {
        result[charId] = contextStr;
      }
    }
  } catch (e) {
    console.warn("[QZone] 讀取角色聊天記錄失敗:", e);
  }

  return result;
}

async function deleteComment(postId: string, commentId: string) {
  if (confirm("確定要刪除這條評論嗎？")) {
    await qzoneStore.deleteComment(postId, commentId);

    // 更新 selectedPost
    const updatedPost = qzoneStore.posts.find((p) => p.id === postId);
    if (updatedPost) {
      selectedPost.value = updatedPost;
    }
  }
}

// 回覆評論
function replyToComment(comment: QZoneComment) {
  replyingToComment.value = comment;
  // 不自動填入 @xxx，避免用戶清空後 replyingToComment 狀態不一致
  // focus 輸入框讓用戶直接輸入
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(".detail-input");
    input?.focus();
  });
}

// 處理詳情頁輸入變化
function handleDetailInputChange() {
  // 檢測 @ 符號
  const text = detailCommentInput.value;
  const lastAtIndex = text.lastIndexOf("@");
  if (lastAtIndex !== -1 && lastAtIndex === text.length - 1) {
    showDetailMentionList.value = true;
  }
}

// 選擇詳情頁提及
function selectDetailMention(char: StoredCharacter) {
  const name = char.nickname || char.data?.name || "";
  // 替換最後的 @ 為 @角色名
  const text = detailCommentInput.value;
  const lastAtIndex = text.lastIndexOf("@");
  if (lastAtIndex !== -1) {
    detailCommentInput.value = text.substring(0, lastAtIndex) + `@${name} `;
  } else {
    detailCommentInput.value += `@${name} `;
  }
  showDetailMentionList.value = false;
}

// ============================================================
// 匿名模式
// ============================================================

function toggleDetailAnonymous() {
  detailAnonymousMode.value = !detailAnonymousMode.value;
  console.log("🎭 匿名模式:", detailAnonymousMode.value ? "開啟" : "關閉");
}

// ============================================================
// 表情包功能
// ============================================================

// 打開發文表情包面板
function openStickerPanel() {
  showStickerPanel.value = true;
}

// 打開評論表情包面板
function openCommentStickerPanel() {
  if (selectedPost.value) {
    currentStickerCommentPostId.value = selectedPost.value.id;
    showCommentStickerPanel.value = true;
  }
}

// 插入表情包到發文框
function insertStickerToPost(content: string) {
  newPostContent.value += content;
  // 不自動關閉，讓用戶可以連續選擇
}

// 插入表情包到評論框
function insertStickerToComment(content: string) {
  if (
    selectedPost.value &&
    currentStickerCommentPostId.value === selectedPost.value.id
  ) {
    detailCommentInput.value += content;
  }
  // 不自動關閉，讓用戶可以連續選擇
}

// 渲染內容（處理表情包標籤）
function renderContentWithStickers(content: string): string {
  if (!content) return "";

  let result = content;

  // 處理表情包標籤 [sticker:name] 或 [sticker:name|url]
  const stickerPattern = /\[sticker:([^\]]+)\]/g;
  result = result.replace(stickerPattern, (match, stickerData) => {
    const [name, providedUrl] = stickerData.split("|");
    const cleanName = name.trim();

    let url = providedUrl?.trim();

    if (!url) {
      // 在所有分類中查找匹配名稱的表情包
      for (const category of stickerStore.allCategories) {
        const sticker = category.stickers.find(
          (e) => e.name === cleanName && e.url,
        );
        if (sticker) {
          url = sticker.url;
          break;
        }
      }
    }

    if (url) {
      const escapedName = cleanName.replace(/"/g, "&quot;");
      const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
      return `<img src="${proxiedUrl}" alt="${escapedName}" class="inline-sticker" style="width: 50px; height: 50px; vertical-align: middle; display: inline-block; margin: 0 4px;" onerror="this.style.display='none';" />`;
    }

    return match;
  });

  return result;
}

// ============================================================
// @ 提及相關
// ============================================================

// 處理發文輸入
function handlePostInput() {
  const text = newPostContent.value;
  const cursorPos = postTextarea.value?.selectionStart || text.length;

  // 找到游標前最近的 @
  const beforeCursor = text.substring(0, cursorPos);
  const lastAtIndex = beforeCursor.lastIndexOf("@");

  if (lastAtIndex !== -1) {
    const afterAt = beforeCursor.substring(lastAtIndex + 1);
    // 如果 @ 後面沒有空格，顯示建議
    if (!afterAt.includes(" ")) {
      mentionSearchText.value = afterAt;
      showMentionSuggestions.value = true;
      mentionSelectedIndex.value = 0;
      return;
    }
  }

  showMentionSuggestions.value = false;
  mentionSearchText.value = "";
}

// 處理發文按鍵
function handlePostKeydown(e: KeyboardEvent) {
  if (!showMentionSuggestions.value) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    mentionSelectedIndex.value = Math.min(
      mentionSelectedIndex.value + 1,
      mentionSuggestions.value.length - 1,
    );
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    mentionSelectedIndex.value = Math.max(mentionSelectedIndex.value - 1, 0);
  } else if (e.key === "Enter" && mentionSuggestions.value.length > 0) {
    e.preventDefault();
    selectMention(mentionSuggestions.value[mentionSelectedIndex.value]);
  } else if (e.key === "Escape") {
    showMentionSuggestions.value = false;
  }
}

// 選擇提及
function selectMention(char: StoredCharacter) {
  const name = char.nickname || char.data?.name || "";
  const text = newPostContent.value;
  const cursorPos = postTextarea.value?.selectionStart || text.length;

  // 找到游標前最近的 @
  const beforeCursor = text.substring(0, cursorPos);
  const lastAtIndex = beforeCursor.lastIndexOf("@");

  if (lastAtIndex !== -1) {
    const afterCursor = text.substring(cursorPos);
    newPostContent.value =
      text.substring(0, lastAtIndex) + `@${name} ` + afterCursor;
  }

  showMentionSuggestions.value = false;
  mentionSearchText.value = "";
  postTextarea.value?.focus();
}

// 顯示提及選擇器
function showMentionPicker() {
  // 在游標位置插入 @
  const cursorPos =
    postTextarea.value?.selectionStart || newPostContent.value.length;
  const text = newPostContent.value;
  newPostContent.value =
    text.substring(0, cursorPos) + "@" + text.substring(cursorPos);

  // 觸發輸入處理
  handlePostInput();
  postTextarea.value?.focus();
}

// ============================================================
// AI 掃描相關
// ============================================================

// 解析 AI 發文輸出格式
function parseAIPostOutput(rawOutput: string): {
  qualifier: string;
  content: string;
  reactions: Record<string, number>;
  images: string[];
} {
  const result = {
    qualifier: "說",
    content: "",
    reactions: {} as Record<string, number>,
    images: [] as string[],
  };

  // 解析 QUALIFIER
  const qualifierMatch = rawOutput.match(/\[QUALIFIER\](.*?)\[\/QUALIFIER\]/i);
  if (qualifierMatch) {
    result.qualifier = qualifierMatch[1].trim();
  }

  // 解析 PLURKPOST
  const plurkPostMatch = rawOutput.match(
    /\[PLURKPOST\]([\s\S]*?)\[\/PLURKPOST\]/i,
  );
  if (plurkPostMatch) {
    let postContent = plurkPostMatch[1].trim();

    // 解析並移除 IMAGE 標籤，保留描述
    const imageMatches = postContent.matchAll(/\[IMAGE\](.*?)\[\/IMAGE\]/gi);
    for (const match of imageMatches) {
      // 可以在這裡處理圖片生成，目前先移除標籤
      result.images.push(match[1]);
    }
    postContent = postContent.replace(/\[IMAGE\].*?\[\/IMAGE\]/gi, "").trim();

    // 移除可能混入的 [REACTIONS] 標籤
    postContent = postContent
      .replace(/\[REACTIONS\].*?\[\/REACTIONS\]/gi, "")
      .trim();

    result.content = postContent;
  } else {
    // 如果沒有標籤，嘗試清理原始輸出
    let cleanContent = rawOutput
      .replace(/\[QUALIFIER\].*?\[\/QUALIFIER\]/gi, "")
      .replace(/\[REACTIONS\].*?\[\/REACTIONS\]/gi, "")
      .replace(/`/g, "")
      .replace(/<output>|<\/output>/gi, "")
      .trim();
    result.content = cleanContent;
  }

  // 解析 REACTIONS
  const reactionsMatch = rawOutput.match(/\[REACTIONS\](.*?)\[\/REACTIONS\]/i);
  if (reactionsMatch) {
    const reactionsStr = reactionsMatch[1].trim();
    // 支援兩種分隔格式: 🤔:3,❤️:2 或 🎉:3|❤️:5|😊:2
    const reactionPairs = reactionsStr.split(/[,|]/);
    for (const pair of reactionPairs) {
      const [emoji, countStr] = pair.split(":");
      if (emoji && countStr) {
        const count = parseInt(countStr.trim(), 10);
        if (!isNaN(count) && count > 0) {
          result.reactions[emoji.trim()] = count;
        }
      }
    }
  }

  return result;
}

// AI 發布動態
async function handleAIPost() {
  if (isAIScanning.value) return;

  // 檢查是否有可用角色
  if (nonBlacklistedCharacters.value.length === 0) {
    if (availableCharacters.value.length === 0) {
      alert("請先導入角色卡");
    } else {
      alert("所有角色都在黑名單中，請先調整黑名單設定");
    }
    return;
  }

  // 檢查 API 配置
  if (
    !settingsStore.api.endpoint ||
    !settingsStore.api.apiKey ||
    !settingsStore.api.model
  ) {
    alert("請先配置 API 才能使用 AI 發布功能");
    return;
  }

  // 打開角色選擇器，設定為發文模式
  showScanModeSelect.value = false;
  characterSelectMode.value = "post";
  selectedCharacterIds.value = [];
  showCharacterSelect.value = true;
}

// 選擇角色後執行發文
async function executeAIPost(characterId: string) {
  const character = availableCharacters.value.find((c) => c.id === characterId);
  if (!character) return;

  showCharacterSelect.value = false;
  isAIScanning.value = true;

  try {
    const rawContent = await generateAIContent(character, "post");
    console.log("[QZone AI Post] rawContent:", rawContent, "length:", rawContent?.length);

    if (rawContent) {
      // 解析 AI 輸出
      const parsed = parseAIPostOutput(rawContent);

      console.log("[QZone AI Post] 原始輸出:", rawContent);
      console.log("[QZone AI Post] 解析結果:", parsed);
      console.log("[QZone AI Post] 表情:", parsed.reactions);

      // 如果解析後內容為空，使用原始輸出作為內容
      const finalContent = parsed.content || rawContent.replace(/\[.*?\].*?\[\/.*?\]/gi, '').trim() || rawContent;
      console.log("[QZone AI Post] 最終內容:", finalContent);

      // 獲取綁定了此角色的所有用戶 Persona ID
      const boundPersonaIds =
        userStore.getPersonasByBoundCharacter(characterId);

      // 角色發文：所有綁定該角色的用戶都能看見
      // 如果沒有任何用戶綁定此角色，則設為公開
      const isGroupPost = boundPersonaIds.length > 0;

      const newPost = await qzoneStore.addPost({
        authorId: character.id,
        username: character.nickname || character.data?.name,
        avatar: character.avatar || getDefaultAvatar(character.id),
        type: "shuoshuo",
        content: finalContent,
        qualifier:
          parsed.qualifier ||
          qualifiers[Math.floor(Math.random() * qualifiers.length)],
        visibility: "public",
        authorType: "ai",
        emoticons: parsed.reactions,
        // 角色發文的可見性：綁定該角色的用戶可見
        visibilityMode: isGroupPost ? "group-only" : "public",
        groupName: isGroupPost
          ? `${character.nickname || character.data?.name} 的粉絲`
          : undefined,
        // 記錄可以看見此貼文的角色 ID（包含發文角色本身，以及同群組的其他角色）
        groupMemberIds: isGroupPost
          ? getRelatedCharacterIds(boundPersonaIds)
          : undefined,
      });
      console.log("[QZone AI Post] 發文成功:", newPost.id, "目前動態數:", qzoneStore.posts.length);
    } else {
      console.warn("[QZone AI Post] generateAIContent 返回空內容，未發文");
    }
  } catch (error) {
    console.error("AI 發布動態失敗:", error);
    alert("AI 發布動態失敗，請檢查 API 配置");
  } finally {
    isAIScanning.value = false;
  }
}

// 自動掃描模式（使用批量評論系統）
async function startAutoScan() {
  if (isAIScanning.value || isBatchGenerating.value) return;

  // 檢查是否有動態
  if (filteredPosts.value.length === 0) {
    alert("目前沒有動態可以回應，請先發布一條動態");
    return;
  }

  // 選擇最近的動態
  const recentPost = filteredPosts.value[0];

  // 根據貼文可見性獲取可回覆的角色
  const eligibleCharacters = getEligibleCharactersForPost(recentPost);

  // 檢查是否有可用角色
  if (eligibleCharacters.length === 0) {
    if (availableCharacters.value.length === 0) {
      alert("請先導入角色卡");
    } else if (recentPost.visibilityMode === "group-only") {
      alert("此貼文為群組限定，但群組內沒有可用的角色");
    } else {
      alert("所有角色都在黑名單中，請先調整黑名單設定");
    }
    return;
  }

  // 檢查 API 配置
  if (!settingsStore.api.apiKey) {
    alert("請先配置 API 才能使用 AI 功能");
    return;
  }

  showScanModeSelect.value = false;
  isAIScanning.value = true;

  try {
    // 隨機選擇 1-3 個符合條件的角色
    const numCharacters = Math.min(
      Math.floor(Math.random() * 3) + 1,
      eligibleCharacters.length,
    );
    const shuffled = [...eligibleCharacters].sort(() => Math.random() - 0.5);
    const selectedChars = shuffled.slice(0, numCharacters);
    const characterIds = selectedChars.map((c) => c.id);

    // 使用批量評論系統生成
    const chatCtx = await buildChatContextForComments(characterIds);
    const result = await batchGenerateComments(recentPost.id, characterIds, {
      minComments: characterIds.length,
      maxComments: characterIds.length * 2,
      includeExistingComments: true,
      useStreaming: false,
      chatContext: chatCtx,
    });

    if (!result.success) {
      console.error("批量評論生成失敗:", result.error);
    } else {
      console.log(`✅ 成功生成 ${result.addedCount} 條評論`);
    }

    // 更新 selectedPost
    if (selectedPost.value?.id === recentPost.id) {
      const updatedPost = qzoneStore.posts.find((p) => p.id === recentPost.id);
      if (updatedPost) selectedPost.value = updatedPost;
    }
  } catch (error) {
    console.error("AI 掃描失敗:", error);
  } finally {
    isAIScanning.value = false;
  }
}

// 手動選擇角色模式
function startManualScan() {
  // 檢查是否有動態
  if (filteredPosts.value.length === 0) {
    alert("目前沒有動態可以回應，請先發布一條動態");
    return;
  }

  // 檢查是否有可用角色
  if (availableCharacters.value.length === 0) {
    alert("請先導入角色卡");
    return;
  }

  showScanModeSelect.value = false;
  characterSelectMode.value = "comment";
  selectedCharacterIds.value = [];
  showCharacterSelect.value = true;
}

// 切換角色選擇
function toggleCharacterSelection(charId: string) {
  const index = selectedCharacterIds.value.indexOf(charId);
  if (index === -1) {
    selectedCharacterIds.value.push(charId);
  } else {
    selectedCharacterIds.value.splice(index, 1);
  }
}

// 執行手動掃描（使用批量評論系統）
async function executeManualScan() {
  if (isAIScanning.value || isBatchGenerating.value) return;

  if (selectedCharacterIds.value.length === 0) {
    alert("請選擇至少一個角色");
    return;
  }

  if (filteredPosts.value.length === 0) {
    alert("目前沒有動態可以回應");
    return;
  }

  // 檢查 API 配置
  if (!settingsStore.api.apiKey) {
    alert("請先配置 API 才能使用 AI 功能");
    return;
  }

  showCharacterSelect.value = false;
  isAIScanning.value = true;

  try {
    const recentPost = filteredPosts.value[0];

    // 使用批量評論系統生成
    const chatCtx = await buildChatContextForComments([
      ...selectedCharacterIds.value,
    ]);
    const result = await batchGenerateComments(
      recentPost.id,
      [...selectedCharacterIds.value],
      {
        minComments: selectedCharacterIds.value.length,
        maxComments: selectedCharacterIds.value.length * 2,
        includeExistingComments: true,
        useStreaming: false,
        chatContext: chatCtx,
      },
    );

    if (!result.success) {
      console.error("批量評論生成失敗:", result.error);
      alert(`生成失敗: ${result.error}`);
    } else {
      console.log(`✅ 成功生成 ${result.addedCount} 條評論`);
    }

    // 更新 selectedPost
    if (selectedPost.value?.id === recentPost.id) {
      const updatedPost = qzoneStore.posts.find((p) => p.id === recentPost.id);
      if (updatedPost) selectedPost.value = updatedPost;
    }
  } catch (error) {
    console.error("AI 掃描失敗:", error);
    alert("AI 掃描失敗，請檢查 API 配置");
  } finally {
    isAIScanning.value = false;
    selectedCharacterIds.value = [];
  }
}

// 重新生成所有 AI 評論（使用批量評論系統）
async function regenerateAllAIComments(postId: string) {
  if (isAIScanning.value || isBatchGenerating.value) return;

  const post = qzoneStore.posts.find((p) => p.id === postId);
  if (!post) return;

  // 根據貼文可見性獲取可回覆的角色
  const eligibleCharacters = getEligibleCharactersForPost(post);

  if (eligibleCharacters.length === 0) {
    if (post.visibilityMode === "group-only") {
      alert("此貼文為群組限定，但群組內沒有可用的角色");
    } else {
      alert("沒有可用的角色來生成評論");
    }
    return;
  }

  // 檢查 API 配置
  if (!settingsStore.api.apiKey) {
    alert("請先配置 API 才能使用 AI 功能");
    return;
  }

  isAIScanning.value = true;

  try {
    // 使用批量評論系統重新生成
    const characterIds = eligibleCharacters.map((c) => c.id);
    const result = await batchRegenerateComments(postId, characterIds);

    if (!result.success) {
      console.error("批量評論生成失敗:", result.error);
      alert(`生成失敗: ${result.error}`);
    } else {
      console.log(`✅ 成功生成 ${result.addedCount} 條評論`);
    }

    // 更新 selectedPost
    if (selectedPost.value?.id === postId) {
      const updatedPost = qzoneStore.posts.find((p) => p.id === postId);
      if (updatedPost) selectedPost.value = updatedPost;
    }
  } catch (error) {
    console.error("重新生成評論失敗:", error);
    alert("重新生成評論失敗，請檢查 API 配置");
  } finally {
    isAIScanning.value = false;
  }
}

// 生成 AI 內容
async function generateAIContent(
  character: StoredCharacter,
  type: "post" | "comment",
  targetPost?: QZonePost,
): Promise<string | null> {
  // 根據類型選擇備用 API 任務
  const taskType = type === "post" ? "plurkPost" : "plurkComment";
  const taskConfig = settingsStore.getAPIForTask(taskType);

  if (
    !taskConfig.api.endpoint ||
    !taskConfig.api.apiKey ||
    !taskConfig.api.model
  ) {
    console.warn("API 未配置");
    return null;
  }

  const charName = character.nickname || character.data?.name || "角色";
  const charPersonality = character.data?.personality || "";
  const charDescription = character.data?.description || "";

  // 獲取對話上下文
  let chatContextStr = "";
  if (enableChatContext.value && chatStore.messages.length > 0) {
    const recentMessages = chatStore.messages.slice(-chatContextCount.value);
    chatContextStr = recentMessages
      .map((msg) => {
        const role = msg.sender === "user" ? userName.value : charName;
        return `${role}: ${msg.content}`;
      })
      .join("\n");

    if (chatContextStr) {
      chatContextStr = `\n\n以下是你與用戶最近的對話記錄，可以參考但不必完全依賴：\n${chatContextStr}`;
    }
  }

  // 組裝原始 messages 陣列
  const rawMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  // 角色資訊作為第一個 system message
  if (charDescription || charPersonality) {
    rawMessages.push({
      role: "system",
      content: `【角色資訊】
角色名稱：${charName}
${charDescription ? `角色描述：${charDescription}` : ""}
${charPersonality ? `角色性格：${charPersonality}` : ""}`,
    });
  }

  if (type === "post") {
    // 使用 promptManagerStore 的噗浪發文提示詞
    const plurkPostPrompts = promptManagerStore.plurkPostPrompts;
    const plurkPostPromptOrder = promptManagerStore.plurkPostPromptOrder;

    // 按順序組裝啟用的提示詞，根據 role 分組
    for (const orderEntry of plurkPostPromptOrder) {
      if (!orderEntry.enabled) continue;
      const prompt = plurkPostPrompts.find(
        (p) => p.identifier === orderEntry.identifier,
      );
      if (prompt && prompt.content) {
        // 替換 {{char}} 宏
        let content = prompt.content
          .replace(/\{\{char\}\}/gi, charName)
          .replace(/\{\{user\}\}/gi, userName.value);

        // 根據提示詞的 role 設定
        const role = prompt.role === "user" ? "user" : "system";
        rawMessages.push({ role, content });
      }
    }

    // 加入對話上下文
    if (chatContextStr) {
      rawMessages.push({ role: "system", content: chatContextStr });
    }

    // 獲取最近的動態作為參考（避免重複）
    const recentPosts = qzoneStore.sortedPosts.slice(0, 5);
    if (recentPosts.length > 0) {
      const recentPostsStr = recentPosts
        .map((p) => `- ${p.username}: ${p.content}`)
        .join("\n");
      rawMessages.push({
        role: "system",
        content: `【最近動態（請勿重複類似內容）】\n${recentPostsStr}`,
      });
    }

    // 最後的 user prompt
    rawMessages.push({
      role: "user",
      content: `請以 ${charName} 的身份發一條動態，分享你的想法、心情或日常。`,
    });
  } else if (type === "comment" && targetPost) {
    // 使用 promptManagerStore 的噗浪評論提示詞
    const plurkCommentPrompts = promptManagerStore.plurkCommentPrompts;
    const plurkCommentPromptOrder = promptManagerStore.plurkCommentPromptOrder;

    // 按順序組裝啟用的提示詞
    for (const orderEntry of plurkCommentPromptOrder) {
      if (!orderEntry.enabled) continue;
      const prompt = plurkCommentPrompts.find(
        (p) => p.identifier === orderEntry.identifier,
      );
      if (prompt && prompt.content) {
        let content = prompt.content
          .replace(/\{\{char\}\}/gi, charName)
          .replace(/\{\{user\}\}/gi, userName.value);

        const role = prompt.role === "user" ? "user" : "system";
        rawMessages.push({ role, content });
      }
    }

    if (chatContextStr) {
      rawMessages.push({ role: "system", content: chatContextStr });
    }

    const postAuthor = targetPost.username || "某人";
    const postContent = targetPost.content || "";
    rawMessages.push({
      role: "user",
      content: `${postAuthor} 發了一條動態：「${postContent}」
請以 ${charName} 的身份回覆這條動態。只輸出評論內容，不要包含任何格式標籤。`,
    });
  }

  // 整合相連的相同 role 的訊息
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];
  for (const msg of rawMessages) {
    if (
      messages.length > 0 &&
      messages[messages.length - 1].role === msg.role
    ) {
      // 相同 role，合併內容
      messages[messages.length - 1].content += "\n\n" + msg.content;
    } else {
      // 不同 role，新增訊息
      messages.push({ ...msg });
    }
  }

  try {
    // 使用備用 API 配置（如果有設定的話）
    const apiConfig = taskConfig.api;
    const genConfig = taskConfig.generation || settingsStore.generation;
    const client = new OpenAICompatibleClient(apiConfig);

    // 使用 settings 中的 maxTokens
    const maxTokens = genConfig?.maxTokens || 8192;

    let result = "";
    const streamGenerator = client.generateStream({
      messages,
      settings: {
        maxContextLength: genConfig?.maxContextLength || 128000,
        maxResponseLength: maxTokens,
        temperature: genConfig?.temperature || 0.9,
        topP: genConfig?.topP || 0.95,
        topK: 0,
        frequencyPenalty: genConfig?.frequencyPenalty || 0,
        presencePenalty: genConfig?.presencePenalty || 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: true,
        useStreamingWindow: false,
      },
      apiSettings: apiConfig,
    });

    for await (const event of streamGenerator) {
      if (event.type === "token" && event.token) {
        result += event.token;
      } else if (event.type === "done" && event.content) {
        result = event.content;
      }
    }

    return result.trim();
  } catch (error) {
    console.error("生成 AI 內容失敗:", error);
    return null;
  }
}

// 保存自動 AI 回覆設定
async function saveAutoAIReplySetting() {
  await qzoneStore.updateSettings({ autoAIReply: autoAIReply.value });
}

// 保存對話上下文設定
async function saveChatContextSetting() {
  await qzoneStore.updateSettings({
    enableChatContext: enableChatContext.value,
    chatContextCount: chatContextCount.value,
  });
}

// ============================================================
// 黑名單管理
// ============================================================

// 打開黑名單管理
function openBlacklistManager() {
  showScanModeSelect.value = false;
  showBlacklistManager.value = true;
}

// 添加到黑名單
async function addToBlacklist(charId: string) {
  const blacklist = [
    ...qzoneStore.autoInteractionConfig.characterSelection.blacklist,
  ];
  if (!blacklist.includes(charId)) {
    blacklist.push(charId);
    await qzoneStore.updateAutoInteractionConfig({
      characterSelection: {
        ...qzoneStore.autoInteractionConfig.characterSelection,
        blacklist,
      },
    });
  }
}

// 從黑名單移除
async function removeFromBlacklist(charId: string) {
  const blacklist =
    qzoneStore.autoInteractionConfig.characterSelection.blacklist.filter(
      (id) => id !== charId,
    );
  await qzoneStore.updateAutoInteractionConfig({
    characterSelection: {
      ...qzoneStore.autoInteractionConfig.characterSelection,
      blacklist,
    },
  });
}

// 清空黑名單
async function clearBlacklist() {
  if (confirm("確定要清空黑名單嗎？")) {
    await qzoneStore.updateAutoInteractionConfig({
      characterSelection: {
        ...qzoneStore.autoInteractionConfig.characterSelection,
        blacklist: [],
      },
    });
  }
}

// ============================================================
// 自動互動配置
// ============================================================

// 打開自動互動配置
function openAutoInteractionConfig() {
  tempAutoConfig.value = JSON.parse(
    JSON.stringify(qzoneStore.autoInteractionConfig),
  );
  showAutoInteractionConfig.value = true;
}

// 保存自動互動配置
async function saveAutoInteractionConfig() {
  await qzoneStore.updateAutoInteractionConfig(tempAutoConfig.value);
  showAutoInteractionConfig.value = false;
}

// ============================================================
// 設定相關
// ============================================================

function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode;
  updateDisplayTheme();
  qzoneStore.updateSettings({ themeMode: mode });
}

function updateDisplayTheme() {
  if (themeMode.value === "auto") {
    isDarkMode.value = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
  } else {
    isDarkMode.value = themeMode.value === "dark";
  }
}

async function saveUserSettings() {
  await qzoneStore.updateSettings({
    avatar: tempUserAvatar.value || qzoneStore.settings.avatar,
    nickname: tempUserName.value || qzoneStore.settings.nickname,
  });
  showUserSettings.value = false;
}

const currentAvatarStyle = ref("lorelei");

function changeAvatarStyle(style: string) {
  currentAvatarStyle.value = style;
  randomizeUserAvatar();
}

function randomizeUserAvatar() {
  const seed = Math.random().toString(36).substring(7);
  let url = `https://api.dicebear.com/7.x/${currentAvatarStyle.value}/svg?seed=user-${seed}`;

  // Add background color for better aesthetics on certain styles
  if (["lorelei", "notionists", "micah"].includes(currentAvatarStyle.value)) {
    url += "&backgroundColor=b6e3f4,c0aede,d1d4f9,ffdfbf,ffd5dc";
  }

  tempUserAvatar.value = url;
}

// ============================================================
// 滾動相關
// ============================================================

function backToTop() {
  mainContainer.value?.scrollTo({ top: 0, behavior: "smooth" });
}

function handleScroll() {
  if (mainContainer.value) {
    showBackToTop.value = mainContainer.value.scrollTop > 300;
  }
}

// ============================================================
// 生命週期
// ============================================================

onMounted(async () => {
  await qzoneStore.init();
  await stickerStore.init();
  await charactersStore.loadCharacters(); // 載入角色列表
  await promptManagerStore.loadConfig(); // 載入提示詞配置
  await userStore.loadUserData(); // 載入用戶資料
  await loadBlockedCharacterIds(); // 載入封鎖角色列表

  // 根據當前用戶的默認設定初始化可見性
  if (userStore.currentPersona?.qzoneSettings?.defaultVisibility) {
    postVisibilityMode.value =
      userStore.currentPersona.qzoneSettings.defaultVisibility;
  }

  // 載入設定
  themeMode.value = qzoneStore.settings.themeMode || "auto";
  tempUserAvatar.value = qzoneStore.settings.avatar;
  tempUserName.value = qzoneStore.settings.nickname;
  autoAIReply.value = qzoneStore.settings.autoAIReply ?? true;
  enableChatContext.value = qzoneStore.settings.enableChatContext ?? true;
  chatContextCount.value = qzoneStore.settings.chatContextCount ?? 10;
  updateDisplayTheme();

  // 監聽滾動
  mainContainer.value?.addEventListener("scroll", handleScroll);

  // 監聯系統主題變化
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (themeMode.value === "auto") {
        updateDisplayTheme();
      }
    });

  console.log("[QZone] 已載入角色:", charactersStore.characters.length, "個");
  console.log("[QZone] 當前用戶:", userStore.currentName);
});

// 監聽設定變化
watch(
  () => qzoneStore.settings,
  (newSettings) => {
    tempUserAvatar.value = newSettings.avatar;
    tempUserName.value = newSettings.nickname;
  },
  { deep: true },
);
</script>

<style scoped lang="scss">
.qzone-screen {
  position: fixed;
  inset: 0;
  background: #f5f5f5;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: var(--safe-top, 0px);

  &.dark-mode {
    background: #1a1a2e;
    color: #e0e0e0;

    // 滾動條夜間模式
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    }

    .x-header {
      background: rgba(22, 33, 62, 0.95);
      border-color: #0f3460;
    }

    .back-btn,
    .settings-btn,
    .ai-scan-btn {
      color: #e0e0e0;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .header-title {
      color: #ff574d;
    }

    .header-search-input-box {
      background: #0f3460;
    }

    .header-search-icon {
      color: #888;
    }

    .header-search-input {
      color: #e0e0e0;
      &::placeholder {
        color: #666;
      }
    }

    .header-clear-btn {
      background: #555;
      color: #e0e0e0;
    }

    .compose-box {
      background: #16213e;
      border-color: #0f3460;
    }

    .compose-textarea {
      background: transparent;
      color: #e0e0e0;

      &::placeholder {
        color: #666;
      }
    }

    .toolbar-btn {
      color: #888;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
      }
    }

    .qualifier-btn {
      background: #0f3460;
      border-color: #1a3a6e;
      color: #e0e0e0;
    }

    .qualifier-dropdown {
      background: #16213e;
      border-color: #0f3460;
    }

    .qualifier-option {
      color: #e0e0e0;
      &:hover {
        background: #0f3460;
      }
      &.active {
        background: #1a3a6e;
      }
    }

    .post-btn {
      &:disabled {
        opacity: 0.5;
      }
    }

    .timeline-divider {
      background: #0f3460;
      border-color: #1a3a6e;
    }

    .plurk-river-timeline {
      background: #0f3460;
      border-color: #1a3a6e;
    }

    .timeline-track {
      background: #1a3a6e;
    }

    .node-dot {
      background: #3498db;
      border-color: #16213e;
    }

    .river-bubble {
      background: #16213e;
      border-color: #0f3460;
    }

    .river-text {
      color: #ccc;
    }

    .node-timestamp {
      color: #888;
    }

    .posts-timeline {
      background: #1a1a2e;
    }

    .plurk-card {
      background: #16213e;
      border-color: #0f3460;
    }

    .plurk-response-badge {
      background: #c0392b;
    }

    .plurk-username {
      color: #e0e0e0;
    }

    .plurk-time {
      color: #888;
    }

    .plurk-action-btn {
      color: #888;
      &:hover {
        color: #e0e0e0;
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .plurk-content {
      color: #e0e0e0;
    }

    .plurk-qualifier-inline {
      color: #e74c3c;
    }

    .plurk-text-content {
      color: #e0e0e0;
    }

    .plurk-media-img {
      border-color: #0f3460;
    }

    .plurk-manager {
      border-top-color: #0f3460;
    }

    .plurk-manager-button {
      color: #888;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      &.active {
        color: #3498db;
      }
    }

    .emoticon-picker {
      background: #16213e;
      border-color: #0f3460;
    }

    .emoticon-option {
      &:hover {
        background: #0f3460;
      }
    }

    .plurk-emoticon-stats {
      .emoticon-stat-item {
        background: #0f3460;
        color: #e0e0e0;
      }
    }

    .empty-state {
      color: #888;
    }

    .empty-title {
      color: #e0e0e0;
    }

    .empty-text {
      color: #888;
    }

    // 詳情頁夜間模式
    .plurk-detail-view {
      background: #1a1a2e;
    }

    .detail-navigation {
      background: rgba(22, 33, 62, 0.95);
      border-color: #0f3460;
    }

    .detail-back-btn {
      color: #e0e0e0;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .detail-nav-username {
      color: #e0e0e0;
    }

    .detail-scroll-content {
      background: #1a1a2e;
    }

    .detail-plurk {
      border-color: #0f3460;
    }

    .detail-qualifier {
      color: #e74c3c;
    }

    .detail-text {
      color: #e0e0e0;
    }

    .detail-stats {
      color: #888;
      border-color: #0f3460;
    }

    .detail-response-status {
      color: #888;
      border-color: #0f3460;
    }

    .detail-response-item {
      border-color: #0f3460;

      &.is-reply {
        border-left-color: #0f3460;
      }
    }

    .detail-reply-quote {
      color: #666;
    }

    .detail-response-username {
      color: #e0e0e0;
    }

    .detail-response-qualifier {
      color: #888;
    }

    .detail-response-content {
      color: #e0e0e0;
    }

    .detail-response-btn {
      color: #888;
      &:hover {
        color: #3498db;
      }
    }

    .detail-delete-btn {
      &:hover {
        color: #e74c3c;
      }
    }

    .detail-no-responses {
      color: #666;
    }

    .detail-input-holder {
      background: #16213e;
      border-color: #0f3460;
    }

    .detail-reply-indicator {
      background: rgba(255, 255, 255, 0.08);
      color: #aaa;
    }

    .detail-mention-list {
      background: #16213e;
      border-color: #0f3460;
    }

    .detail-mention-header {
      border-color: #0f3460;
      color: #e0e0e0;
    }

    .detail-mention-close {
      color: #888;
    }

    .detail-mention-item {
      &:hover {
        background: #0f3460;
      }
    }

    .detail-mention-name {
      color: #e0e0e0;
    }

    // 詳情頁用戶切換暗色模式
    .detail-persona-dropdown {
      background: #16213e;
      border-color: #0f3460;
    }

    .detail-persona-header {
      border-color: #0f3460;
      color: #e0e0e0;
    }

    .detail-persona-close {
      color: #888;
    }

    .detail-persona-item {
      &:hover {
        background: #0f3460;
      }
      &.active {
        background: #1a3a6e;
      }
    }

    .detail-persona-name {
      color: #e0e0e0;
    }

    .detail-persona-group {
      color: #888;
    }

    .detail-avatar-chevron {
      background: #16213e;
    }

    .detail-input-box {
      background: #16213e;
    }

    .detail-input-wrapper {
      background: #0f3460;
      border-color: #1a3a6e;
    }

    .detail-input {
      background: transparent;
      color: #e0e0e0;
      &::placeholder {
        color: #666;
      }
    }

    .detail-action-btn {
      color: #888;
      &:hover {
        color: #e0e0e0;
        background: rgba(255, 255, 255, 0.1);
      }
      &.active {
        color: #3498db;
      }
    }

    .detail-submit-btn {
      &:disabled {
        opacity: 0.5;
      }
    }

    // 模態框夜間模式
    .modal-overlay {
      background: rgba(0, 0, 0, 0.7);
    }

    .modal-content {
      background: #16213e;
      color: #e0e0e0;
    }

    .modal-header {
      border-color: #0f3460;
      h3 {
        color: #e0e0e0;
      }
    }

    .modal-close-btn {
      color: #e0e0e0;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .setting-label {
      color: #e0e0e0;
    }

    .setting-input {
      background: #1a1a2e;
      border-color: #0f3460;
      color: #e0e0e0;
      &:focus {
        border-color: #3498db;
      }
      &::placeholder {
        color: #666;
      }
    }

    .scan-mode-option {
      background: #1a1a2e;
      border-color: #0f3460;
      color: #e0e0e0;
      &:hover {
        background: #0f3460;
        border-color: #1a3a6e;
      }
    }

    .scan-mode-title {
      color: #e0e0e0;
    }

    .scan-mode-desc {
      color: #888;
    }

    .character-item {
      background: #1a1a2e;
      border-color: #0f3460;
      &:hover {
        background: #0f3460;
      }
      &.selected {
        border-color: #3498db;
        background: rgba(52, 152, 219, 0.1);
      }
    }

    .character-name {
      color: #e0e0e0;
    }

    .btn-primary {
      background: #3498db;
      &:hover {
        background: #2980b9;
      }
    }

    .btn-secondary {
      background: transparent;
      border-color: #0f3460;
      color: #e0e0e0;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    // 回到頂部按鈕
    .back-to-top-btn {
      background: #16213e;
      border-color: #0f3460;
      color: #e0e0e0;
      &:hover {
        background: #0f3460;
      }
    }

    // 提及建議列表
    .mention-suggestions {
      background: #16213e;
      border-color: #0f3460;
    }

    .mention-item {
      &:hover,
      &.active {
        background: #0f3460;
      }
    }

    .mention-name {
      color: #e0e0e0;
    }

    // 圖片預覽
    .image-preview-grid {
      .preview-item {
        border-color: #0f3460;
      }
    }

    .remove-image-btn {
      background: rgba(0, 0, 0, 0.7);
    }
  }
}

// ============================================================
// Header
// ============================================================

.x-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.back-btn,
.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: inherit;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
}

.header-title {
  font-size: 18px;
  font-weight: 700;
  color: #ff574d;
  margin: 0;
}

.header-search-wrapper {
  flex: 1;
  max-width: 300px;
}

.header-search-input-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f0f0f0;
  border-radius: 20px;
}

.header-search-icon {
  color: #666;
  flex-shrink: 0;
}

.header-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
}

.header-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: #ccc;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
}

.header-spacer {
  flex: 1;
}

// 手機自適應
@media (max-width: 480px) {
  .x-header {
    gap: 6px;
    padding: 8px 10px;
  }

  .header-title {
    font-size: 15px;
    white-space: nowrap;
  }

  .header-search-wrapper {
    max-width: none;
    min-width: 0;
  }

  .header-search-input-box {
    padding: 6px 10px;
  }

  .header-search-input {
    font-size: 13px;
    min-width: 0;
  }

  .header-spacer {
    display: none;
  }

  .back-btn,
  .settings-btn,
  .ai-scan-btn {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }
}

// ============================================================
// Main Container
// ============================================================

.x-main-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
}

// ============================================================
// Compose Box
// ============================================================

.compose-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  margin-bottom: 16px;
  width: 100%;
  box-sizing: border-box;
}

// 身份切換器
.persona-switcher-wrapper {
  position: relative;
}

.persona-switcher-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 24px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #e8e8e8;
  }

  .compose-avatar {
    width: 36px;
    height: 36px;
  }
}

.persona-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.persona-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.persona-group {
  font-size: 11px;
  color: #666;
}

.persona-chevron {
  color: #999;
  transition: transform 0.2s;

  &.open {
    transform: rotate(180deg);
  }
}

.persona-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.persona-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    background: rgba(125, 211, 168, 0.1);
  }
}

.persona-option-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.persona-option-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.persona-option-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.persona-option-group {
  font-size: 12px;
  color: #666;
}

.compose-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.compose-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

// 可見性選擇器
.visibility-selector {
  position: relative;
}

.visibility-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #e8f5e9;
  border: none;
  border-radius: 16px;
  font-size: 12px;
  color: #388e3c;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #c8e6c9;
  }

  &.group-only {
    background: #fff3e0;
    color: #f57c00;

    &:hover {
      background: #ffe0b2;
    }
  }
}

.visibility-text {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visibility-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  min-width: 220px;
  overflow: hidden;
}

.visibility-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;

  svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: #666;
  }

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    background: rgba(125, 211, 168, 0.1);

    svg {
      color: var(--color-primary, #7dd3a8);
    }
  }
}

.visibility-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.visibility-option-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.visibility-option-desc {
  font-size: 12px;
  color: #999;
}

.textarea-wrapper {
  position: relative;
}

.compose-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 40vh;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  resize: none;
  font-size: 15px;
  line-height: 1.5;
  outline: none;
  overflow-y: auto;

  &:focus {
    border-color: #ff574d;
  }

  &::placeholder {
    color: #999;
  }
}

.image-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.preview-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.remove-image-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compose-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-icons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
}

.qualifier-selector {
  position: relative;
}

.qualifier-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: #f5f5f5;
  }
}

.qualifier-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 100;
  max-width: 200px;
}

.qualifier-option {
  padding: 6px 12px;
  border: none;
  background: #f5f5f5;
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: #e0e0e0;
  }

  &.active {
    background: #ff574d;
    color: #fff;
  }
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #666;

  &:hover {
    background: #f0f0f0;
    color: #ff574d;
  }
}

.compose-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.char-counter {
  font-size: 13px;
  color: #999;

  &.warning {
    color: #f59e0b;
  }

  &.error {
    color: #ef4444;
  }
}

.post-btn {
  padding: 8px 20px;
  border: none;
  background: #ff574d;
  color: #fff;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #e04a40;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ============================================================
// Timeline
// ============================================================

.timeline-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 16px 0;
}

.posts-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// ============================================================
// Plurk Card
// ============================================================

.plurk-card {
  position: relative;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  cursor: pointer;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.plurk-response-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #ff574d;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.plurk-user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.plurk-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.plurk-username {
  font-weight: 600;
  font-size: 14px;
}

.plurk-time {
  font-size: 12px;
  color: #999;
  margin-left: auto;
}

.plurk-group-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(125, 211, 168, 0.15);
  border-radius: 12px;
  font-size: 11px;
  color: #7dd3a8;

  svg {
    flex-shrink: 0;
  }

  .group-badge-name {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.plurk-actions-top {
  display: flex;
  gap: 4px;
  margin-left: 8px;
}

.plurk-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #999;

  &:hover {
    background: #f0f0f0;
    color: #ff574d;
  }
}

.plurk-content {
  margin-bottom: 12px;
}

.plurk-qualifier-inline {
  color: #ff574d;
  font-weight: 600;
  margin-right: 6px;
}

.plurk-text-content {
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
}

.plurk-media {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.plurk-media-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
}

// ============================================================
// Plurk Manager (互動按鈕)
// ============================================================

.plurk-manager {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  position: relative;
}

.plurk-manager-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  transition: all 0.2s;

  &:hover {
    background: #f5f5f5;
    color: #ff574d;
  }

  &.active {
    color: #ff574d;
  }
}

.emoticon-picker {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  gap: 4px;
  z-index: 100;
}

.emoticon-option {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 20px;

  &:hover {
    background: #f5f5f5;
  }
}

.plurk-emoticon-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
}

.emoticon-stat-item {
  font-size: 13px;
  color: #666;
}

// ============================================================
// Empty State
// ============================================================

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #666;
}

.empty-text {
  font-size: 14px;
}

// ============================================================
// Back to Top
// ============================================================

.back-to-top-btn {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 48px;
  height: 48px;
  border: none;
  background: #ff574d;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 87, 77, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;

  &:hover {
    background: #e04a40;
  }
}

// ============================================================
// Detail View
// ============================================================

.plurk-detail-view {
  position: fixed;
  inset: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  z-index: 200;
  padding-top: var(--safe-top, 0px);
}

.detail-navigation {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.detail-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
}

.detail-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-nav-username {
  font-weight: 600;
  font-size: 15px;
}

.detail-nav-spacer {
  flex: 1;
}

.detail-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.detail-plurk {
  margin-bottom: 16px;
}

.detail-plurk-content {
  font-size: 16px;
  line-height: 1.6;
}

.detail-qualifier {
  color: #ff574d;
  font-weight: 600;
  margin-right: 6px;
}

.detail-media {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.detail-media-img {
  width: 100%;
  border-radius: 8px;
}

.detail-stats {
  display: flex;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
  color: #666;
}

.detail-response-status {
  padding: 12px 0;
  font-size: 14px;
  color: #666;
  border-bottom: 1px solid #f0f0f0;
}

.detail-responses {
  padding-top: 12px;
}

.detail-response-item {
  padding: 12px 0;
  border-bottom: 1px solid #f5f5f5;

  &.is-reply {
    padding-left: 16px;
    border-left: 2px solid #e0e0e0;
    margin-left: 16px;
  }
}

.detail-reply-quote {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
  padding-left: 40px;

  svg {
    opacity: 0.6;
  }
}

.detail-response-user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.detail-response-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-response-username {
  font-weight: 600;
  font-size: 14px;
}

.detail-response-qualifier {
  color: #ff574d;
  font-size: 13px;
}

.detail-response-content {
  font-size: 14px;
  line-height: 1.5;
  padding-left: 40px;
}

.detail-response-actions {
  display: flex;
  gap: 8px;
  padding-left: 40px;
  margin-top: 8px;
}

.detail-response-btn {
  padding: 4px 12px;
  border: none;
  background: #f5f5f5;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #e0e0e0;
  }
}

.detail-no-responses {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

.detail-input-holder {
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
  background: #fff;
  flex-shrink: 0;
  position: relative; // 讓下拉選單可以相對定位
  z-index: 10;
}

.detail-reply-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #888);

  span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-reply-cancel {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: inherit;
    display: flex;
    align-items: center;
    opacity: 0.7;

    &:hover {
      opacity: 1;
    }
  }
}

.detail-input-box {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

.detail-input-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.detail-input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  outline: none;
  font-size: 14px;

  &:focus {
    border-color: #ff574d;
  }
}

.detail-submit-btn {
  padding: 8px 16px;
  border: none;
  background: #ff574d;
  color: #fff;
  border-radius: 16px;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #e04a40;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ============================================================
// Modal
// ============================================================

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 400px;
  max-height: calc(100dvh - 40px);
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.modal-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
}

.modal-body {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

.setting-input {
  padding: 10px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: #ff574d;
  }
}

.avatar-preview-large {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.theme-selector {
  display: flex;
  gap: 8px;
}

.theme-option {
  flex: 1;
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    border-color: #ff574d;
    background: #fff5f4;
    color: #ff574d;
  }
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid #e0e0e0;
  background: #fff;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
}

.btn-primary {
  padding: 10px 20px;
  border: none;
  background: #ff574d;
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: #e04a40;
  }
}

// ============================================================
// Transitions
// ============================================================

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

// ============================================================
// AI Scan Button
// ============================================================

.ai-scan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: inherit;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    color: #ff574d;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-spinner {
  animation: spin 1s linear infinite;
}

.loading-spinner-inline {
  animation: spin 1s linear infinite;
  margin-left: auto;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// ============================================================
// Scan Mode Selector
// ============================================================

.scan-mode-selector {
  max-width: 360px;
}

.scan-mode-options {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scan-mode-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;

  &:hover:not(:disabled) {
    border-color: #ff574d;
    background: #fff5f4;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.ai-post-option {
    border-color: #ff574d;
    background: linear-gradient(135deg, #fff5f4 0%, #fff 100%);
  }
}

.scan-mode-text {
  flex: 1;
}

.scan-mode-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.scan-mode-desc {
  font-size: 13px;
  color: #666;
}

// ============================================================
// Character Select Modal
// ============================================================

.character-select-modal {
  max-width: 400px;
}

.character-list {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.character-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  cursor: pointer;
  position: relative;

  &:hover {
    border-color: #ff574d;
  }

  &.selected {
    border-color: #ff574d;
    background: #fff5f4;
  }

  &.group-member {
    border-color: #7dd3a8;
    background: rgba(125, 211, 168, 0.08);

    &:hover {
      border-color: #5bc090;
    }

    &.selected {
      border-color: #ff574d;
      background: #fff5f4;
    }
  }
}

.character-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.character-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.character-name {
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.group-member-badge {
  font-size: 10px;
  color: #7dd3a8;
  background: rgba(125, 211, 168, 0.15);
  padding: 2px 6px;
  border-radius: 8px;
}

.check-mark {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: #ff574d;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

// ============================================================
// Mention Suggestions
// ============================================================

.mention-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;

  &:hover,
  &.active {
    background: #f5f5f5;
  }
}

.mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.mention-name {
  font-size: 14px;
  font-weight: 500;
}

.mention-highlight {
  color: #ff574d;
  font-weight: 500;
}

// ============================================================
// Detail Mention List
// ============================================================

.detail-mention-list {
  position: absolute;
  bottom: 100%;
  left: 16px;
  right: 16px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow: hidden;
  z-index: 100;
}

.detail-mention-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 13px;
  color: #666;
}

.detail-mention-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
}

.detail-mention-items {
  max-height: 150px;
  overflow-y: auto;
}

.detail-mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }
}

.detail-mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-mention-name {
  font-size: 14px;
  font-weight: 500;
}

// 詳情頁用戶切換下拉選單
.detail-persona-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 250px;
  overflow: hidden;
  z-index: 1000;
  min-width: 200px;
}

.detail-persona-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 13px;
  color: #666;
}

.detail-persona-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
}

.detail-persona-items {
  max-height: 200px;
  overflow-y: auto;
}

.detail-persona-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    background: #fff0f0;
  }
}

.detail-persona-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-persona-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-persona-name {
  font-size: 14px;
  font-weight: 500;
}

.detail-persona-group {
  font-size: 11px;
  color: #888;
}

// 詳情頁頭像切換器
.detail-avatar-switcher {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;

  &:hover {
    .detail-avatar-chevron {
      opacity: 1;
    }
  }
}

.detail-avatar-chevron {
  position: absolute;
  bottom: -2px;
  right: -2px;
  background: #fff;
  border-radius: 50%;
  padding: 1px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.detail-input-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;

  &:focus-within {
    border-color: #ff574d;
  }

  .detail-input {
    flex: 1;
    border: none;
    padding: 10px 0;
  }
}

.detail-input-actions {
  display: flex;
  gap: 4px;
}

.detail-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #666;

  &:hover {
    background: #f0f0f0;
    color: #ff574d;
  }
}

// ============================================================
// River Timeline
// ============================================================

.plurk-river-timeline {
  overflow-x: auto;
  padding: 20px 0;
  margin-bottom: 16px;

  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f0f0f0;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 3px;
  }
}

.horizontal-timeline {
  position: relative;
  height: 100px;
  min-width: 100%;
}

.timeline-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  background: #e0e0e0;
  transform: translateY(-50%);
}

.timeline-node {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;

  &:hover .river-bubble {
    opacity: 1;
    transform: translateY(-10px);
  }
}

.node-dot {
  width: 12px;
  height: 12px;
  background: #ff574d;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .node-own & {
    background: #4caf50;
  }
}

.river-bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  opacity: 0.8;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.river-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.river-content {
  max-width: 150px;
}

.river-qualifier {
  font-size: 11px;
  color: #ff574d;
  font-weight: 600;
}

.river-text {
  font-size: 12px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-timestamp {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  font-size: 11px;
  color: #999;
  white-space: nowrap;
}

// ============================================================
// Toggle Switch
// ============================================================

.toggle-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-label {
  font-size: 14px;
  color: #666;
}

.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 26px;
  transition: 0.3s;

  &::before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.3s;
  }

  input:checked + & {
    background: #ff574d;
  }

  input:checked + &::before {
    transform: translateX(22px);
  }
}

// ============================================================
// Image Description Block
// ============================================================

.image-description-block {
  display: inline-block;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
  border-radius: 8px;
  font-size: 13px;
  color: #666;
  margin: 4px 0;
}

// ============================================================
// Highlight Animation
// ============================================================

.plurk-card.highlight {
  animation: highlight-pulse 2s ease-out;
}

@keyframes highlight-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 87, 77, 0.4);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(255, 87, 77, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 87, 77, 0);
  }
}

// ============================================================
// Auto Interaction Button
// ============================================================

.auto-interaction-btn {
  position: relative;

  &.active {
    color: #ff574d;
  }
}

.active-indicator {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: #4caf50;
  border-radius: 50%;
  border: 2px solid #fff;
}

// ============================================================
// Blacklist Option
// ============================================================

.blacklist-option {
  border-color: #e57373 !important;

  &:hover:not(:disabled) {
    background: #ffebee !important;
  }
}

// ============================================================
// AI Interaction Settings (in scan mode modal)
// ============================================================

.ai-interaction-settings {
  margin-top: 8px;
}

.settings-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 12px 0;
}

.toggle-option-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}

.toggle-option-info {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .toggle-option-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .toggle-option-desc {
    font-size: 12px;
    color: #666;
  }
}

.setting-status {
  font-size: 12px;
  margin: 0;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 8px;

  .status-enabled {
    color: #4caf50;
  }

  .status-disabled {
    color: #999;
  }
}

// ============================================================
// Blacklist Modal
// ============================================================

.blacklist-modal {
  max-width: 450px;
}

.blacklist-desc {
  font-size: 13px;
  color: #666;
  margin: 0 0 16px 0;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.blacklist-section {
  margin-bottom: 20px;

  h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
  }
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.blacklist-char-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;

  &:hover {
    border-color: #ff574d;
    background: #fff5f4;

    .blacklist-add-btn,
    .blacklist-remove-btn {
      opacity: 1;
    }
  }

  &.blacklisted {
    border-color: #e57373;
    background: #ffebee;
  }
}

.blacklist-char-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.blacklist-char-name {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blacklist-add-btn,
.blacklist-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.blacklist-add-btn {
  background: #e57373;
  color: #fff;
}

.blacklist-remove-btn {
  background: #4caf50;
  color: #fff;
}

.empty-list {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 13px;
}

// ============================================================
// Auto Interaction Config Modal
// ============================================================

.auto-interaction-modal {
  max-width: 450px;
}

.config-section {
  margin-bottom: 20px;

  h4 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #333;
    padding-bottom: 8px;
    border-bottom: 1px solid #e0e0e0;
  }
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;

  &:not(:last-child) {
    border-bottom: 1px solid #f0f0f0;
  }
}

.config-info {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .config-label {
    font-size: 14px;
    font-weight: 500;
  }

  .config-desc {
    font-size: 12px;
    color: #666;
  }
}

.config-label {
  font-size: 14px;
  color: #333;
}

.config-input {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
  outline: none;

  &:focus {
    border-color: #ff574d;
  }
}

.mode-selector {
  display: flex;
  gap: 8px;
}

.mode-option {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    border-color: #ff574d;
  }

  &.active {
    border-color: #ff574d;
    background: #fff5f4;
    color: #ff574d;
    font-weight: 500;
  }
}

// ============================================================
// Image Lightbox
// ============================================================

.image-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}

.lightbox-close {
  position: absolute;
  top: max(16px, var(--safe-top, 0px));
  right: 16px;
  width: 44px;
  height: 44px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 10;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 10;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.lightbox-prev {
  left: 16px;
}

.lightbox-next {
  right: 16px;
}

.lightbox-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.lightbox-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 20px;
  font-size: 14px;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.3s;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}
/* Pop Theme Modal Styles */
.pop-overlay {
  background-color: rgba(255, 240, 245, 0.95);
  background-image: radial-gradient(#ffc2d4 2px, transparent 2px);
  background-size: 30px 30px;
  backdrop-filter: blur(5px);
}

.dark-mode .pop-overlay {
  background-color: rgba(40, 30, 40, 0.95);
  background-image: radial-gradient(#603040 2px, transparent 2px);
}

.pop-card {
  background: white;
  border: 4px solid #111;
  border-radius: 24px;
  padding: 2.5rem;
  width: 90%;
  max-width: 440px;
  box-shadow: 12px 12px 0 #111;
  color: #111;
  transform: rotate(-2deg);
  transition: all 0.3s;
  position: relative;
  max-height: 90vh;
  overflow-y: auto;
}

.dark-mode .pop-card {
  background: #222;
  border-color: #eee;
  box-shadow: 12px 12px 0 #eee;
  color: #eee;
}

.pop-card:hover {
  transform: rotate(0deg) scale(1.02);
}

.pop-title {
  text-align: center;
  font-weight: 900;
  font-size: 1.8rem;
  text-transform: uppercase;
  background: #ffeb3b;
  display: inline-block;
  padding: 0.5rem 1.5rem;
  border: 3px solid #111;
  border-radius: 12px;
  margin: -4rem auto 1.5rem auto;
  position: relative;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  z-index: 10;
  color: #111;
  min-width: 200px;
}

.dark-mode .pop-title {
  border-color: #eee;
}

.pop-avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
}

.pop-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid #111;
  background: #a5f3fc;
  object-fit: cover;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
}

.pop-avatar-wrapper {
  position: relative;
  display: inline-block;
}

.pop-avatar-refresh-btn {
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid #111;
  background: #fff;
  color: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 2px 2px 0 #111;
  z-index: 5;
}

.pop-avatar-refresh-btn:hover {
  transform: scale(1.1) rotate(15deg);
  background: #ffe600;
}

.pop-avatar-refresh-btn:active {
  transform: scale(0.9);
}

.pop-avatar-style-selector {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: -1.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.pop-style-mini-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #111;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: all 0.2s;
  box-shadow: 2px 2px 0 #bbb;
}

.pop-style-mini-btn:hover {
  transform: translateY(-2px);
  background: #f0f0f0;
}

.pop-style-mini-btn.active {
  background: #a5f3fc;
  box-shadow: 2px 2px 0 #111;
  transform: translateY(1px);
}

.dark-mode .pop-avatar-refresh-btn {
  border-color: #eee;
  box-shadow: 2px 2px 0 #eee;
}

.dark-mode .pop-style-mini-btn {
  border-color: #eee;
  background: #333;
  box-shadow: 2px 2px 0 #555;
}

.dark-mode .pop-style-mini-btn.active {
  background: #4a9eff;
  color: #111;
  box-shadow: 2px 2px 0 #eee;
}

.dark-mode .pop-avatar {
  border-color: #eee;
}

.pop-input {
  width: 100%;
  border: 3px solid #111;
  border-radius: 12px;
  padding: 14px;
  font-weight: 700;
  margin-bottom: 1rem;
  font-family: inherit;
  transition: 0.2s;
  font-size: 1rem;
  background: #fff;
  color: #111;
}

.dark-mode .pop-input {
  background: #333;
  border-color: #eee;
  color: #fff;
}

.pop-input:focus {
  transform: translate(-4px, -4px);
  box-shadow: 6px 6px 0 #ff6b6b;
  outline: none;
}

.pop-section-title {
  font-weight: 800;
  font-size: 1.2rem;
  margin: 1.5rem 0 0.8rem 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
}

.pop-theme-opts {
  display: flex;
  gap: 12px;
  margin-bottom: 1rem;
}

.pop-theme-btn {
  flex: 1;
  border: 3px solid #111;
  background: white;
  padding: 12px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 4px 4px 0 #ccc;
  transition: 0.1s;
  color: #111;
  font-size: 0.95rem;
}

.dark-mode .pop-theme-btn {
  background: #333;
  border-color: #eee;
  color: #eee;
  box-shadow: 4px 4px 0 #555;
}

.pop-theme-btn:active {
  transform: translate(3px, 3px);
  box-shadow: none;
}

.pop-theme-btn.active {
  background: #a5f3fc;
  box-shadow: 4px 4px 0 #111;
  color: #111;
  border-color: #111;
}

.dark-mode .pop-theme-btn.active {
  background: #a5f3fc;
  color: #111;
  border-color: #eee;
  box-shadow: 4px 4px 0 #eee;
}

.pop-action-btn {
  width: 100%;
  background: #ff6b6b;
  color: white;
  border: 3px solid #111;
  padding: 1.2rem;
  border-radius: 16px;
  font-size: 1.3rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 6px 6px 0 #111;
  margin-top: 2rem;
  transition: 0.2s;
  text-transform: uppercase;
}

.dark-mode .pop-action-btn {
  border-color: #eee;
  box-shadow: 6px 6px 0 #eee;
}

.pop-action-btn:hover {
  transform: translate(-3px, -3px);
  box-shadow: 9px 9px 0 #111;
}

.dark-mode .pop-action-btn:hover {
  box-shadow: 9px 9px 0 #eee;
}

.pop-action-btn:active {
  transform: translate(6px, 6px);
  box-shadow: 0 0 0 #111;
}

.cancel-link {
  display: block;
  text-align: center;
  margin-top: 1.5rem;
  font-weight: 700;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.cancel-link:hover {
  opacity: 1;
}

/* Custom Checkbox Switch for Pop Theme */
.pop-switch-wrapper {
  width: 52px;
  height: 28px;
  border: 3px solid currentColor;
  background: #ddd;
  border-radius: 20px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}

.dark-mode .pop-switch-wrapper {
  background: #555;
}

.pop-switch-wrapper.active {
  background: #4ade80;
}

.pop-switch-knob {
  position: absolute;
  left: 2px;
  top: 1px;
  width: 18px;
  height: 18px;
  background: white;
  border: 2px solid #111;
  border-radius: 50%;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.dark-mode .pop-switch-knob {
  border-color: #111;
}

.pop-switch-wrapper.active .pop-switch-knob {
  transform: translateX(24px);
}

/* Enhancements meant for cleaner z-index handling if needed */
.pop-overlay {
  z-index: 2000;
}

// ============================================================
// 轉噗模態框樣式
// ============================================================

.repost-modal {
  max-width: 480px;
}

.repost-original {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.dark-mode .repost-original {
  background: #1a1a2e;
  border-color: #0f3460;
}

.repost-original-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.repost-original-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.repost-original-username {
  font-weight: 600;
  font-size: 14px;
}

.repost-original-qualifier {
  color: #ff574d;
  font-size: 13px;
}

.repost-original-content {
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  margin-bottom: 8px;
}

.dark-mode .repost-original-content {
  color: #ccc;
}

.repost-original-images {
  display: flex;
  gap: 8px;
}

.repost-original-img {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
}

.repost-comment-section {
  position: relative;
}

.repost-comment-input {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  font-size: 14px;
  resize: none;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #ff574d;
  }
}

.dark-mode .repost-comment-input {
  background: #1a1a2e;
  border-color: #0f3460;
  color: #e0e0e0;
}

.repost-char-count {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 12px;
  color: #999;
}

// ============================================================
// 表情包面板樣式
// ============================================================

.sticker-overlay {
  align-items: flex-end;
}

.sticker-panel-wrapper {
  background: #fff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dark-mode .sticker-panel-wrapper {
  background: #16213e;
}

.sticker-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;

  h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    color: inherit;

    &:hover {
      background: rgba(0, 0, 0, 0.05);
    }
  }
}

.dark-mode .sticker-panel-header {
  border-color: #0f3460;
}

// ============================================================
// 匿名模式按鈕樣式
// ============================================================

.detail-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #333;
  }

  &.active {
    background: #ff574d;
    color: #fff;
  }
}

.dark-mode .detail-action-btn {
  color: #999;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  &.active {
    background: #ff574d;
    color: #fff;
  }
}

// ============================================================
// 對話上下文設定樣式
// ============================================================

.context-count-setting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  font-size: 14px;

  label,
  span {
    color: #666;
  }
}

.dark-mode .context-count-setting {
  background: rgba(255, 255, 255, 0.05);

  label,
  span {
    color: #999;
  }
}

.context-count-input {
  width: 60px;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;

  &:focus {
    outline: none;
    border-color: #ff574d;
  }
}

.dark-mode .context-count-input {
  background: #1a1a2e;
  border-color: #0f3460;
  color: #e0e0e0;
}

// ============================================================
// 內聯表情包樣式
// ============================================================

:deep(.inline-sticker) {
  width: 50px;
  height: 50px;
  vertical-align: middle;
  display: inline-block;
  margin: 0 4px;
  border-radius: 4px;
}

// ============================================================
// 轉噗引用樣式
// ============================================================

.repost-quote {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-left: 3px solid #ff574d;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 10px 0;
}

.dark-mode .repost-quote {
  background: rgba(255, 255, 255, 0.05);
  border-color: #333;
  border-left-color: #ff574d;
}

.repost-quote-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.repost-quote-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.repost-quote-username {
  font-weight: 600;
  font-size: 13px;
  color: #333;
}

.dark-mode .repost-quote-username {
  color: #ddd;
}

.repost-quote-qualifier {
  color: #ff574d;
  font-size: 12px;
}

.repost-quote-content {
  font-size: 13px;
  line-height: 1.4;
  color: #555;
  margin-bottom: 6px;
}

.dark-mode .repost-quote-content {
  color: #aaa;
}

.repost-quote-images {
  display: flex;
  gap: 6px;
}

.repost-quote-img {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
}

// ============================================================
// 拍立得圖片樣式（用於 [IMAGE] 標籤）
// ============================================================

:deep(.qzone-polaroid-container) {
  position: relative;
  width: 280px;
  max-width: 100%;
  aspect-ratio: 1/1.15;
  background: #fff;
  border-radius: 4px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 4px 16px rgba(0, 0, 0, 0.1);
  padding: 12px 12px 40px 12px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;

  // 輕微傾斜效果
  transform: rotate(-1deg);
  transition: transform 0.3s ease;

  &:hover {
    transform: rotate(0deg) scale(1.02);
  }
}

:deep(.qzone-polaroid-overlay) {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  bottom: 52px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
  pointer-events: none;
  z-index: 1;
  border-radius: 2px;
}

:deep(.qzone-polaroid-frame) {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  bottom: 52px;
  background: #1a1a1a;
  border-radius: 2px;
}

:deep(.qzone-polaroid-content) {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  bottom: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  line-height: 1.5;
  z-index: 2;
  background: #1a1a1a;
  border-radius: 2px;
}

:deep(.qzone-polaroid-date) {
  position: absolute;
  bottom: 12px;
  right: 16px;
  font-family: "Caveat", "Comic Sans MS", cursive;
  font-size: 14px;
  color: #888;
  font-style: italic;
}

// 夜間模式拍立得
.dark-mode :deep(.qzone-polaroid-container) {
  background: #2a2a3e;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.2);
}

.dark-mode :deep(.qzone-polaroid-frame) {
  background: #0a0a0a;
}

.dark-mode :deep(.qzone-polaroid-content) {
  background: #0a0a0a;
  color: rgba(255, 255, 255, 0.6);
}

.dark-mode :deep(.qzone-polaroid-date) {
  color: #666;
}

// ============================================================
// 評論生成指示器
// ============================================================

.comment-generating-indicator {
  position: fixed;
  bottom: 80px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 10px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  z-index: 1000;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }
}

.dark-mode .comment-generating-indicator {
  background: rgba(40, 40, 50, 0.95);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.indicator-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.generating-dots {
  display: flex;
  gap: 4px;
}

.generating-dots .dot {
  width: 6px;
  height: 6px;
  background: #ff574d;
  border-radius: 50%;
  animation: dotPulse 1.4s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
}

@keyframes dotPulse {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.indicator-text {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.dark-mode .indicator-text {
  color: #ddd;
}

.generating-detail-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.dark-mode .generating-detail-panel {
  background: rgba(35, 35, 45, 0.98);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.generating-detail-panel .detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255, 87, 77, 0.1);
  border-bottom: 1px solid rgba(255, 87, 77, 0.2);
  font-size: 13px;
  font-weight: 600;
  color: #ff574d;
}

.generating-detail-panel .close-detail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #666;
  }
}

.dark-mode .generating-detail-panel .close-detail-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.generating-detail-panel .detail-content {
  padding: 14px;

  p {
    margin: 0 0 8px;
    font-size: 13px;
    color: #555;
    line-height: 1.5;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .detail-hint {
    font-size: 12px;
    color: #999;
  }
}

.dark-mode .generating-detail-panel .detail-content p {
  color: #bbb;
}

.dark-mode .generating-detail-panel .detail-content .detail-hint {
  color: #777;
}

// 指示器動畫
.indicator-pop-enter-active {
  animation: indicatorPopIn 0.3s ease-out;
}

.indicator-pop-leave-active {
  animation: indicatorPopOut 0.2s ease-in;
}

@keyframes indicatorPopIn {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes indicatorPopOut {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
}

// 詳情面板滑入動畫
.slide-up-enter-active {
  animation: slideUpIn 0.25s ease-out;
}

.slide-up-leave-active {
  animation: slideUpOut 0.2s ease-in;
}

@keyframes slideUpIn {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUpOut {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
