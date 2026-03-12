<script setup lang="ts">
import { useSettingsStore } from "@/stores";
import { computed, ref, watch } from "vue";

// Props
const props = defineProps<{
  show: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "created", character: any): void;
}>();

// Store
const settingsStore = useSettingsStore();

// 狀態
const isGenerating = ref(false);
const error = ref("");
const generatedCharacter = ref<any>(null);

// 用戶輸入
const userPrompt = ref("");
const uploadedImage = ref<string | null>(null);
const imageFile = ref<File | null>(null);

// 圖片上傳 ref
const imageInput = ref<HTMLInputElement | null>(null);

// 是否有有效的 API 配置
const hasValidAPI = computed(() => settingsStore.hasValidConfig);

// 嘗試修復不完整的 JSON
function tryFixIncompleteJSON(jsonStr: string): string {
  // 移除尾部不完整的內容
  let str = jsonStr.trim();

  // 計算括號平衡
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
      } else if (char === "[") bracketCount++;
      else if (char === "]") bracketCount--;
    }
  }

  // 如果 JSON 完整，直接返回
  if (braceCount === 0 && bracketCount === 0) {
    return str;
  }

  // 嘗試截斷到最後一個完整的值
  // 找到最後一個逗號或冒號後的完整值
  if (inString) {
    // 在字串中被截斷，嘗試閉合字串
    str += '"';
  }

  // 閉合所有未閉合的括號
  while (bracketCount > 0) {
    str += "]";
    bracketCount--;
  }
  while (braceCount > 0) {
    str += "}";
    braceCount--;
  }

  return str;
}

// 重置狀態
function resetState() {
  userPrompt.value = "";
  uploadedImage.value = null;
  imageFile.value = null;
  generatedCharacter.value = null;
  error.value = "";
  isGenerating.value = false;
}

// 監聽顯示狀態
watch(
  () => props.show,
  (newVal) => {
    if (!newVal) {
      resetState();
    }
  },
);

// 觸發圖片上傳
function triggerImageUpload() {
  imageInput.value?.click();
}

// 處理圖片上傳
function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    error.value = "請選擇圖片檔案";
    return;
  }

  // 檢查檔案大小（限制 10MB）
  if (file.size > 10 * 1024 * 1024) {
    error.value = "圖片大小不能超過 10MB";
    return;
  }

  imageFile.value = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImage.value = e.target?.result as string;
    error.value = "";
  };
  reader.readAsDataURL(file);
}

// 移除圖片
function removeImage() {
  uploadedImage.value = null;
  imageFile.value = null;
  if (imageInput.value) {
    imageInput.value.value = "";
  }
}

// 生成角色
async function generateCharacter() {
  if (!hasValidAPI.value) {
    error.value = "請先在設定中配置 API";
    return;
  }

  if (!userPrompt.value.trim() && !uploadedImage.value) {
    error.value = "請輸入角色描述或上傳圖片";
    return;
  }

  isGenerating.value = true;
  error.value = "";

  try {
    // 構建提示詞
    const systemPrompt = `你是一個專業的角色卡創建助手。根據用戶的描述或圖片，創建一個詳細的角色卡。

請以 JSON 格式回覆，包含以下欄位：
{
  "name": "角色名稱",
  "description": "角色的外觀、背景故事等詳細描述（200-500字）",
  "personality": "角色的秘密或內心世界（100-200字）",
  "scenario": "角色的說話方式、語氣特點（100-200字）",
  "character_atmosphere": "角色散發的氛圍、給人的感覺，描述這個角色身上散發出的氣場、情緒色彩和存在感（50-100字）",
  "first_mes": "角色的開場白，以角色的口吻說話（50-150字）",
  "mes_example": "角色的對話範例，用來展現角色獨特的說話風格和個性。格式為多組 {{user}}: 和 {{char}}: 的簡短對話。每組對話要簡短有力，凸顯角色的語氣、口頭禪和態度。3-5組對話，每句話控制在一行內。範例格式：\n{{user}}: 你這個人很難相處\n{{char}}: 關你屁事，知道我在關心你就好\n{{user}}: 你是笨蛋嗎\n{{char}}: 你喜歡的那種",
  "tags": ["標籤1", "標籤2", "標籤3"]
}

注意：
- 所有內容使用繁體中文
- 角色要有深度和個性
- 開場白要符合角色的說話方式
- 標籤要能概括角色特點
- character_atmosphere 要描述角色的氣場和存在感，例如「帶著淡淡菸草味的疏離感，像深夜街角的路燈，冷冽卻讓人忍不住靠近」
- mes_example 的對話要簡短、口語化，能一眼看出角色的個性和說話風格，不要寫長篇大論的對話`;

    // 構建消息內容
    let userMessage: any;

    // 添加文字描述
    let textPrompt = "";
    if (uploadedImage.value && userPrompt.value.trim()) {
      textPrompt = `請根據這張圖片和以下描述創建角色：\n${userPrompt.value}`;
    } else if (uploadedImage.value) {
      textPrompt =
        "請根據這張圖片創建一個角色，分析圖片中人物的外觀、氣質，並想像其性格和背景。";
    } else {
      textPrompt = `請根據以下描述創建角色：\n${userPrompt.value}`;
    }

    // 如果有圖片，使用 vision 格式
    if (uploadedImage.value) {
      userMessage = [
        {
          type: "image_url",
          image_url: {
            url: uploadedImage.value,
          },
        },
        {
          type: "text",
          text: textPrompt,
        },
      ];
    } else {
      // 純文字格式
      userMessage = textPrompt;
    }

    // 取得 API 設定（優先使用備用 API）
    const taskConfig = settingsStore.getAPIForTask("characterGen");
    const apiConfig = taskConfig.api;

    // 調用 API
    const response = await fetch(getEndpoint(apiConfig.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 2000000,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 錯誤: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log("AI 回覆原始內容:", content);

    // 解析 JSON - 支援多種格式
    let jsonStr = "";

    // 嘗試提取 markdown 代碼塊中的 JSON（支援未閉合的代碼塊）
    const codeBlockMatch = content.match(
      /```(?:json)?\s*(\{[\s\S]*?)(?:```|$)/,
    );
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // 嘗試直接匹配 JSON 對象
      const jsonMatch = content.match(/\{[\s\S]*/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    if (!jsonStr || !jsonStr.includes("{")) {
      console.error("無法從回覆中提取 JSON:", content);
      throw new Error("AI 回覆格式不正確，請重試");
    }

    // 嘗試修復不完整的 JSON
    jsonStr = tryFixIncompleteJSON(jsonStr);

    let characterData;
    try {
      characterData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON 解析失敗:", jsonStr, parseError);
      throw new Error("AI 回覆被截斷，請重試（建議使用較短的描述）");
    }

    // 構建角色對象
    const atmosphere = characterData.character_atmosphere || "";
    generatedCharacter.value = {
      id: `char_${Date.now()}`,
      nickname: "",
      avatar: uploadedImage.value || "",
      data: {
        name: characterData.name || "未命名角色",
        description: characterData.description || "",
        personality: characterData.personality || "",
        scenario: characterData.scenario || "",
        character_atmosphere: atmosphere,
        first_mes: characterData.first_mes || "",
        mes_example: characterData.mes_example || "",
        system_prompt: "",
        post_history_instructions: "",
        creator: "AI 生成",
        creator_notes: "",
        tags: characterData.tags || [],
        extensions: {
          character_atmosphere: atmosphere,
        },
      },
      lorebookIds: [],
      source: "manual",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (e) {
    console.error("生成角色失敗:", e);
    error.value = e instanceof Error ? e.message : "生成失敗，請重試";
  } finally {
    isGenerating.value = false;
  }
}

// 獲取 API 端點
function getEndpoint(endpoint: string): string {
  if (!endpoint.endsWith("/chat/completions")) {
    if (!endpoint.endsWith("/")) {
      endpoint += "/";
    }
    if (endpoint.includes("/v1/")) {
      endpoint = endpoint.replace(/\/v1\/$/, "/v1/chat/completions");
    } else if (endpoint.endsWith("/")) {
      endpoint += "v1/chat/completions";
    }
  }
  return endpoint;
}

// 確認創建
function confirmCreate() {
  if (generatedCharacter.value) {
    // 使用 JSON 序列化來創建純對象，避免 IndexedDB 克隆錯誤
    const plainObject = JSON.parse(JSON.stringify(generatedCharacter.value));
    emit("created", plainObject);
    emit("close");
  }
}

// 重新生成
function regenerate() {
  generatedCharacter.value = null;
  generateCharacter();
}

// 關閉
function handleClose() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="handleClose">
        <div class="modal-container">
          <!-- 標題 -->
          <header class="modal-header">
            <h2>✨ AI 生成角色</h2>
            <button class="close-btn" @click="handleClose">×</button>
          </header>

          <!-- 內容 -->
          <main class="modal-content">
            <!-- 未生成時：輸入區 -->
            <template v-if="!generatedCharacter">
              <!-- API 警告 -->
              <div v-if="!hasValidAPI" class="warning-box">
                <span class="warning-icon">⚠️</span>
                <span>請先在設定中配置 API 才能使用 AI 生成功能</span>
              </div>

              <!-- 圖片上傳區 -->
              <div class="upload-section">
                <label class="section-label">上傳參考圖片（可選）</label>
                <div
                  class="upload-area"
                  :class="{ 'has-image': uploadedImage }"
                  @click="!uploadedImage && triggerImageUpload()"
                >
                  <template v-if="uploadedImage">
                    <img
                      :src="uploadedImage"
                      alt="參考圖片"
                      class="preview-image"
                    />
                    <button class="remove-image-btn" @click.stop="removeImage">
                      ×
                    </button>
                  </template>
                  <template v-else>
                    <div class="upload-placeholder">
                      <span class="upload-icon">🖼️</span>
                      <span class="upload-text">點擊上傳圖片</span>
                      <span class="upload-hint">支援 JPG、PNG，最大 10MB</span>
                    </div>
                  </template>
                </div>
                <input
                  ref="imageInput"
                  type="file"
                  accept="image/*"
                  class="hidden-input"
                  @change="handleImageUpload"
                />
              </div>

              <!-- 描述輸入 -->
              <div class="input-section">
                <label class="section-label">角色描述</label>
                <textarea
                  v-model="userPrompt"
                  class="prompt-input"
                  placeholder="描述你想要的角色，例如：&#10;- 一個溫柔的圖書館管理員&#10;- 性格內向但很有才華的畫家&#10;- 外冷內熱的劍術高手"
                  rows="5"
                ></textarea>
              </div>

              <!-- 錯誤提示 -->
              <div v-if="error" class="error-box">
                {{ error }}
              </div>

              <!-- 生成按鈕 -->
              <button
                class="generate-btn"
                :disabled="isGenerating || !hasValidAPI"
                @click="generateCharacter"
              >
                <span v-if="isGenerating" class="loading-spinner"></span>
                <span>{{ isGenerating ? "生成中..." : "🪄 開始生成" }}</span>
              </button>
            </template>

            <!-- 已生成：預覽區 -->
            <template v-else>
              <div class="preview-section">
                <!-- 頭像預覽 -->
                <div class="avatar-preview">
                  <img
                    v-if="generatedCharacter.avatar"
                    :src="generatedCharacter.avatar"
                    alt="角色頭像"
                  />
                  <div v-else class="avatar-placeholder">
                    <span>{{ generatedCharacter.data.name?.[0] || "?" }}</span>
                  </div>
                </div>

                <!-- 角色信息 -->
                <div class="character-info">
                  <h3 class="character-name">
                    {{ generatedCharacter.data.name }}
                  </h3>

                  <div class="info-group">
                    <label>描述</label>
                    <p>{{ generatedCharacter.data.description }}</p>
                  </div>

                  <div class="info-group">
                    <label>秘密</label>
                    <p>{{ generatedCharacter.data.personality }}</p>
                  </div>

                  <div class="info-group">
                    <label>說話方式</label>
                    <p>{{ generatedCharacter.data.scenario }}</p>
                  </div>

                  <div class="info-group">
                    <label>氛圍</label>
                    <p>{{ generatedCharacter.data.character_atmosphere }}</p>
                  </div>

                  <div class="info-group" v-if="generatedCharacter.data.mes_example">
                    <label>對話範例</label>
                    <pre class="mes-example">{{ generatedCharacter.data.mes_example }}</pre>
                  </div>

                  <div class="info-group">
                    <label>開場白</label>
                    <p class="first-message">
                      「{{ generatedCharacter.data.first_mes }}」
                    </p>
                  </div>

                  <div class="tags-row">
                    <span
                      v-for="tag in generatedCharacter.data.tags"
                      :key="tag"
                      class="tag"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 操作按鈕 -->
              <div class="action-buttons">
                <button class="btn secondary" @click="regenerate">
                  🔄 重新生成
                </button>
                <button class="btn primary" @click="confirmCreate">
                  ✓ 確認創建
                </button>
              </div>
            </template>
          </main>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
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
  z-index: 1000;
  padding: 16px;
}

.modal-container {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #eee);

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    font-size: 24px;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #666);

    &:hover {
      background: var(--color-background, #f5f5f5);
    }
  }
}

.modal-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.warning-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fff3cd;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #856404;
}

.section-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin-bottom: 8px;
}

.upload-section {
  margin-bottom: 16px;
}

.upload-area {
  border: 2px dashed var(--color-border, #ddd);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  &:hover:not(.has-image) {
    border-color: var(--color-primary, #f093fb);
    background: var(--color-primary-light, #fff0f8);
  }

  &.has-image {
    padding: 0;
    cursor: default;
  }
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;

  .upload-icon {
    font-size: 32px;
  }

  .upload-text {
    font-size: 14px;
    color: var(--color-text, #333);
  }

  .upload-hint {
    font-size: 12px;
    color: var(--color-text-secondary, #999);
  }
}

.preview-image {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 10px;
}

.remove-image-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
}

.hidden-input {
  display: none;
}

.input-section {
  margin-bottom: 16px;
}

.prompt-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;

  &:focus {
    outline: none;
    border-color: var(--color-primary, #f093fb);
  }

  &::placeholder {
    color: var(--color-text-muted, #aaa);
  }
}

.error-box {
  padding: 12px 16px;
  background: #fee;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #c00;
}

.generate-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 預覽區
.preview-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.avatar-preview {
  width: 100px;
  height: 100px;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--color-primary, #f093fb);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    color: white;
    font-weight: bold;
  }
}

.character-info {
  .character-name {
    text-align: center;
    font-size: 20px;
    margin: 0 0 16px;
  }
}

.info-group {
  margin-bottom: 12px;

  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary, #666);
    margin-bottom: 4px;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text, #333);
  }

  .first-message {
    font-style: italic;
    color: var(--color-primary, #f093fb);
  }
}

.mes-example {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text, #333);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  background: var(--color-background, #f9f9f9);
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--color-primary, #f093fb);
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;

  .tag {
    padding: 4px 10px;
    background: var(--color-primary-light, #fff0f8);
    color: var(--color-primary, #f093fb);
    border-radius: 12px;
    font-size: 12px;
  }
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;

  .btn {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &.secondary {
      background: var(--color-background, #f5f5f5);
      color: var(--color-text, #333);

      &:hover {
        background: var(--color-border, #e0e0e0);
      }
    }

    &.primary {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(240, 147, 251, 0.4);
      }
    }
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;

  .modal-container {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal-container {
    transform: scale(0.9) translateY(20px);
  }
}
</style>
