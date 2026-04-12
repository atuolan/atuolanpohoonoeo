<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, onUnmounted } from 'vue'
import { useFitnessStore } from '@/stores/fitness'
import { useUserStore } from '@/stores/user'
import type { MealType, FoodItem } from '@/types/fitness'
import dayjs from 'dayjs'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const fitnessStore = useFitnessStore()
const userStore = useUserStore()

// ===== 日期狀態 =====
const today = dayjs()
const selectedYear = ref(today.year())
const selectedMonth = ref(today.month()) // 0-indexed
const selectedDay = ref(today.date())

const selectedDate = computed(() =>
  dayjs().year(selectedYear.value).month(selectedMonth.value).date(selectedDay.value).format('YYYY-MM-DD')
)

const daysInMonth = computed(() =>
  dayjs().year(selectedYear.value).month(selectedMonth.value).daysInMonth()
)

const displayMonthYear = computed(() =>
  dayjs().year(selectedYear.value).month(selectedMonth.value).format('YYYY年M月')
)

// 日期行 ref（用於自動滾動）
const dateRowRef = ref<HTMLElement | null>(null)

function scrollToSelectedDay() {
  nextTick(() => {
    const el = dateRowRef.value
    if (!el) return
    const active = el.querySelector('.date-cell.active') as HTMLElement
    if (active) {
      active.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
    }
  })
}

watch(selectedDay, () => scrollToSelectedDay())

function selectDay(day: number) {
  selectedDay.value = day
}

// ===== 食物紀錄 =====

interface FlatFoodEntry {
  mealType: MealType
  time: string
  food: FoodItem
  foodIndex: number
}

const flatEntries = computed<FlatFoodEntry[]>(() => {
  const log = fitnessStore.mealLogs.find(l => l.date === selectedDate.value)
  if (!log) return []

  const entries: FlatFoodEntry[] = []
  for (const meal of log.meals) {
    meal.foods.forEach((food, idx) => {
      entries.push({
        mealType: meal.type,
        time: food.time || meal.time || mealTypeDefaultTime(meal.type),
        food,
        foodIndex: idx,
      })
    })
  }

  entries.sort((a, b) => a.time.localeCompare(b.time))
  return entries
})

function mealTypeDefaultTime(type: MealType): string {
  switch (type) {
    case 'breakfast': return '08:00'
    case 'lunch': return '12:00'
    case 'dinner': return '18:00'
    case 'snack': return '15:00'
  }
}

// 根據食物名稱推斷使用哪個 SVG icon
function getFoodIconType(name: string): string {
  if (name.includes('豆漿') || name.includes('飲料') || name.includes('水') || name.includes('茶') || name.includes('奶')) return 'drink'
  if (name.includes('漢堡') || name.includes('堡')) return 'burger'
  if (name.includes('飯') || name.includes('粥')) return 'rice'
  if (name.includes('麵') && !name.includes('麵包')) return 'noodle'
  if (name.includes('麵包') || name.includes('吐司') || name.includes('餅')) return 'bread'
  if (name.includes('咖啡')) return 'coffee'
  if (name.includes('沙拉') || name.includes('菜')) return 'salad'
  if (name.includes('果')) return 'apple'
  if (name.includes('蛋')) return 'egg'
  return 'default'
}

// ===== 新增表單 =====
const showAddForm = ref(false)
const addMealType = ref<MealType>('lunch')
const addTime = ref('12:00')
const showTimePicker = ref(false)

const timeHour = computed(() => parseInt(addTime.value.split(':')[0]))
const timeMinute = computed(() => parseInt(addTime.value.split(':')[1]))

function setTimeHour(h: number) {
  const m = timeMinute.value.toString().padStart(2, '0')
  addTime.value = `${String(h).padStart(2, '0')}:${m}`
}

function setTimeMinute(m: number) {
  const h = timeHour.value.toString().padStart(2, '0')
  addTime.value = `${h}:${String(m).padStart(2, '0')}`
}

function adjustHour(delta: number) {
  setTimeHour((timeHour.value + delta + 24) % 24)
}

function adjustMinute(delta: number) {
  setTimeMinute((timeMinute.value + delta + 60) % 60)
}

function displayTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h < 12 ? '上午' : '下午'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${period} ${h12}:${String(m).padStart(2, '0')}`
}
const addFoodName = ref('')
const addFoodPortion = ref('')
const addFoodCalories = ref<number>(0)

const quickFoods = [
  { name: '豆漿', type: 'drink' },
  { name: '咖啡', type: 'coffee' },
  { name: '白飯', type: 'rice' },
  { name: '麵包', type: 'bread' },
  { name: '漢堡', type: 'burger' },
  { name: '沙拉', type: 'salad' },
  { name: '水果', type: 'apple' },
  { name: '雞蛋', type: 'egg' },
]

function openAddForm() {
  showAddForm.value = true
  addFoodName.value = ''
  addFoodPortion.value = ''
  addFoodCalories.value = 0
  const hour = dayjs().hour()
  if (hour < 10) { addMealType.value = 'breakfast'; addTime.value = dayjs().format('HH:mm') }
  else if (hour < 14) { addMealType.value = 'lunch'; addTime.value = dayjs().format('HH:mm') }
  else if (hour < 17) { addMealType.value = 'snack'; addTime.value = dayjs().format('HH:mm') }
  else { addMealType.value = 'dinner'; addTime.value = dayjs().format('HH:mm') }
}

async function addFood() {
  if (!addFoodName.value.trim()) return

  const food: FoodItem = {
    name: addFoodName.value.trim(),
    portion: addFoodPortion.value.trim() || undefined,
    calories: addFoodCalories.value || undefined,
    time: addTime.value,
  }

  await fitnessStore.addFoodToMeal(selectedDate.value, addMealType.value, food)
  showAddForm.value = false
}

function selectQuickFood(food: { name: string }) {
  addFoodName.value = food.name
  searchResults.value = []
}

// ===== 食物搜尋（OFF + USDA）=====
// 更換為正式 key 可得到更高配額：https://fdc.nal.usda.gov/api-guide.html
const USDA_API_KEY = 'DEMO_KEY'

interface FoodSearchResult {
  name: string
  nameEn?: string
  kcalPer100g: number | null
  brand: string
  source: 'off' | 'usda'
}

const searchResults = ref<FoodSearchResult[]>([])
const isSearching = ref(false)
const searchError = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(addFoodName, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchResults.value = []
  searchError.value = false
  if (!val.trim() || val.trim().length < 2) return
  searchTimer = setTimeout(() => searchFood(val.trim()), 650)
})

/** MyMemory：中文 → 英文 */
async function translateToEnglish(text: string): Promise<string> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-TW|en-US`)
    const data = await res.json()
    return data?.responseData?.translatedText || text
  } catch { return text }
}

/** MyMemory：英文 → 繁中 */
async function translateToChinese(text: string): Promise<string> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en-US|zh-TW`)
    const data = await res.json()
    const t = data?.responseData?.translatedText || text
    // MyMemory 有時直接回傳原文或全大寫，視為失敗
    return t === text.toUpperCase() ? text : t
  } catch { return text }
}

/** 判斷是否含中文字 */
function hasChinese(s: string) { return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s) }

/** 過濾掉阿拉伯文、西里爾等無法閱讀的結果 */
function isReadable(s: string) {
  const arabicRatio = (s.match(/[\u0600-\u06ff]/g) || []).length / s.length
  return arabicRatio < 0.15
}

/** Open Food Facts v2，優先取中文名稱，過濾非可讀結果 */
async function searchOFF(name: string): Promise<FoodSearchResult[]> {
  try {
    const fields = 'product_name,product_name_zh,product_name_zh_Hant,product_name_zh_Hans,brands,nutriments'
    const url = `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(name)}&page_size=8&fields=${fields}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = await res.json()
    return ((data.products ?? []) as any[])
      .map((p: any) => {
        const displayName: string =
          p.product_name_zh_Hant || p.product_name_zh || p.product_name_zh_Hans || p.product_name || ''
        return { p, displayName }
      })
      .filter(({ displayName }) => displayName && isReadable(displayName))
      // 中文名稱排前面
      .sort((a, b) => (hasChinese(b.displayName) ? 1 : 0) - (hasChinese(a.displayName) ? 1 : 0))
      .slice(0, 4)
      .map(({ p, displayName }): FoodSearchResult => ({
        name: displayName,
        nameEn: '',
        kcalPer100g: p.nutriments?.['energy-kcal_100g'] ?? p.nutriments?.['energy-kcal'] ?? null,
        brand: p.brands ?? '',
        source: 'off',
      }))
  } catch { return [] }
}

/** USDA 搜尋，並將英文名稱翻譯回繁中 */
async function searchUSDA(englishName: string): Promise<FoodSearchResult[]> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(englishName)}&pageSize=4&api_key=${USDA_API_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    const raw: FoodSearchResult[] = ((data.foods ?? []) as any[]).map((f: any): FoodSearchResult => {
      const kcalNutrient = (f.foodNutrients as any[])?.find(
        (n: any) => n.nutrientName === 'Energy' && n.unitName === 'KCAL'
      )
      return {
        name: f.description as string,
        nameEn: f.description as string,
        kcalPer100g: kcalNutrient?.value ?? null,
        brand: f.brandOwner ?? f.brandName ?? '',
        source: 'usda',
      }
    }).slice(0, 3)
    // 並行翻譯所有 USDA 名稱
    const translated = await Promise.all(raw.map(async (r) => ({
      ...r,
      name: await translateToChinese(r.nameEn ?? r.name),
    })))
    return translated
  } catch { return [] }
}

async function searchFood(name: string) {
  isSearching.value = true
  searchError.value = false
  try {
    // 三個請求完全獨立並行，任一失敗不影響其他
    const [offResults, englishName] = await Promise.all([
      searchOFF(name),
      translateToEnglish(name),
    ])
    const usdaResults = await searchUSDA(englishName)
    searchResults.value = [...offResults, ...usdaResults]
    if (searchResults.value.length === 0) searchError.value = true
  } catch {
    searchError.value = true
  } finally {
    isSearching.value = false
  }
}

function pickSearchResult(result: FoodSearchResult) {
  addFoodName.value = result.name
  if (result.kcalPer100g !== null) {
    addFoodCalories.value = Math.round(result.kcalPer100g)
    addFoodPortion.value = addFoodPortion.value || '100g'
  }
  searchResults.value = []
}

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  closeBarcodeScanner()
})

// ===== 條碼掃描器 =====
const showBarcodeScanner = ref(false)
const barcodeVideoRef = ref<HTMLVideoElement | null>(null)
const scannerReady = ref(false)
const scannerError = ref<'noDetector' | 'noCamera' | 'notFound' | null>(null)
const scannerSuccess = ref(false)
const manualBarcode = ref('')
const hasBarcodeDetector = typeof (window as any).BarcodeDetector !== 'undefined'

let barcodeStream: MediaStream | null = null
let barcodeDetector: any = null
let scanInterval: ReturnType<typeof setInterval> | null = null

async function openBarcodeScanner() {
  showBarcodeScanner.value = true
  scannerReady.value = false
  scannerError.value = null
  scannerSuccess.value = false
  manualBarcode.value = ''

  if (!hasBarcodeDetector) {
    scannerError.value = 'noDetector'
    return
  }

  try {
    barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    await nextTick()
    if (barcodeVideoRef.value) {
      barcodeVideoRef.value.srcObject = barcodeStream
      await barcodeVideoRef.value.play()
      scannerReady.value = true
      barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
      })
      scanInterval = setInterval(scanFrame, 600)
    }
  } catch {
    scannerError.value = 'noCamera'
  }
}

async function scanFrame() {
  if (!barcodeVideoRef.value || !barcodeDetector || !scannerReady.value) return
  try {
    const results = await barcodeDetector.detect(barcodeVideoRef.value)
    if (results.length > 0) {
      const code = results[0].rawValue as string
      await lookupBarcode(code)
    }
  } catch { /* ignore */ }
}

async function lookupBarcode(code: string) {
  // 停止掃描
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null }
  isSearching.value = true
  scannerError.value = null
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
    const data = await res.json()
    if (data.status === 1 && data.product) {
      const p = data.product
      const name = p.product_name_zh || p.product_name_zh_Hant || p.product_name_zh_Hans || p.product_name || code
      addFoodName.value = name
      const kcal = p.nutriments?.['energy-kcal_100g'] ?? p.nutriments?.['energy-kcal'] ?? null
      if (kcal) {
        addFoodCalories.value = Math.round(kcal)
        addFoodPortion.value = addFoodPortion.value || '100g'
      }
      scannerSuccess.value = true
      searchResults.value = []
      setTimeout(() => closeBarcodeScanner(), 1000)
    } else {
      scannerError.value = 'notFound'
      // 重新開始掃描
      scanInterval = setInterval(scanFrame, 600)
    }
  } catch {
    scannerError.value = 'notFound'
    scanInterval = setInterval(scanFrame, 600)
  } finally {
    isSearching.value = false
  }
}

async function submitManualBarcode() {
  if (!manualBarcode.value.trim()) return
  await lookupBarcode(manualBarcode.value.trim())
}

function closeBarcodeScanner() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null }
  if (barcodeStream) { barcodeStream.getTracks().forEach(t => t.stop()); barcodeStream = null }
  barcodeDetector = null
  showBarcodeScanner.value = false
  scannerReady.value = false
}

async function removeEntry(entry: FlatFoodEntry) {
  await fitnessStore.removeFoodFromMeal(selectedDate.value, entry.mealType, entry.foodIndex)
}

function isToday(day: number): boolean {
  return (
    selectedYear.value === today.year() &&
    selectedMonth.value === today.month() &&
    day === today.date()
  )
}

onMounted(async () => {
  await fitnessStore.loadFromDB()
  scrollToSelectedDay()
})
</script>

<template>
  <div class="food-log-manager fullscreen-page">
    <!-- 漸變透明頂部導航 -->
    <header class="flm-header">
      <button class="back-btn" @click.prevent.stop="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="title">食記</h1>
      <span class="by-user">by {{ userStore.currentName }}</span>
    </header>

    <div class="scroll-content">
      <!-- 月份指示 -->
      <div class="month-bar">
        <button class="month-nav" @click="selectedMonth > 0 ? selectedMonth-- : (selectedYear--, selectedMonth = 11)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="month-label">{{ displayMonthYear }}</span>
        <button class="month-nav" @click="selectedMonth < 11 ? selectedMonth++ : (selectedYear++, selectedMonth = 0)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>

      <!-- 日期選擇列（方框風格） -->
      <div class="date-row" ref="dateRowRef">
        <button
          v-for="d in daysInMonth"
          :key="d"
          class="date-cell"
          :class="{ active: d === selectedDay, today: isToday(d) }"
          @click="selectDay(d)"
        >
          {{ d }}
        </button>
      </div>

      <!-- 食物列表（括號風格） -->
      <div class="food-entries">
        <TransitionGroup name="entry" tag="div" class="entries-inner">
          <div
            v-for="(entry, i) in flatEntries"
            :key="`${entry.mealType}-${entry.foodIndex}-${entry.food.name}`"
            class="food-item-container"
          >
            <div class="food-time">{{ entry.time }}</div>
            <div class="food-bracket-row">
              <div class="bracket left-bracket"></div>
              
              <div class="food-icon-box">
                <!-- SVG Icon -->
                <svg v-if="getFoodIconType(entry.food.name) === 'drink'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l1.5 12h9L18 8"/><path d="M4 8h16"/><path d="M10 3l-1 5"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'burger'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16"/><path d="M4 10h16v-1a4 4 0 0 0-8 0 4 4 0 0 0-8 0v1z"/><path d="M5 16h14a2 2 0 0 1 2 2H3a2 2 0 0 1 2-2z"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'rice'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M4 12a8 8 0 0 0 16 0"/><path d="M12 4v4"/><path d="M8 5v3"/><path d="M16 5v3"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'noodle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M4 12a8 8 0 0 0 16 0"/><path d="M8 8v4"/><path d="M12 7v5"/><path d="M16 8v4"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'bread'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2z"/><path d="M4 14v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'coffee'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2"/><path d="M10 2v2"/><path d="M14 2v2"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'salad'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 0 16 0"/><path d="M3 12h18"/><path d="M12 12c0-3 3-4 3-4s-2-2-4-2-4 2-4 2 3 1 3 4"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'apple'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 4v4"/></svg>
                <svg v-else-if="getFoodIconType(entry.food.name) === 'egg'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c-4.4 0-8-4-8-10S8 2 12 2s8 4 8 10-3.6 10-8 10z"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
              </div>
              
              <div class="food-name">{{ entry.food.name }}</div>
              
              <div class="bracket right-bracket"></div>
              
              <!-- 刪除按鈕隱藏在括號外，懸浮或點擊時可見 -->
              <button class="delete-btn" @click="removeEntry(entry)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <!-- 顯示份量或熱量在下方（可選） -->
            <div v-if="entry.food.portion || entry.food.calories" class="food-meta">
              <span v-if="entry.food.portion">{{ entry.food.portion }}</span>
              <span v-if="entry.food.calories">{{ entry.food.calories }} kcal</span>
            </div>
          </div>
        </TransitionGroup>

        <!-- 空狀態 -->
        <div v-if="flatEntries.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
          <p>這天還沒有食物紀錄</p>
          <button class="empty-add-btn" @click="openAddForm">記錄一餐</button>
        </div>
      </div>
    </div>

    <!-- 新增按鈕 FAB -->
    <button v-if="!showAddForm && flatEntries.length > 0" class="fab" @click="openAddForm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>

    <!-- 新增表單 overlay -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
          <div class="add-panel">
            <div class="add-panel-header">
              <h3>新增食物</h3>
              <button class="close-btn" @click="showAddForm = false">✕</button>
            </div>

            <!-- 時間 -->
            <div class="form-field">
              <label>用餐時間</label>
              <button class="time-display-btn" @click="showTimePicker = !showTimePicker">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <span>{{ displayTime(addTime) }}</span>
                <svg class="chevron" :class="{ open: showTimePicker }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <!-- 自訂時間選擇器 -->
              <Transition name="picker">
                <div v-if="showTimePicker" class="time-picker">
                  <!-- 小時 -->
                  <div class="time-unit">
                    <button class="time-step-btn" @click="adjustHour(1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                    </button>
                    <div class="time-val">{{ String(timeHour).padStart(2, '0') }}</div>
                    <button class="time-step-btn" @click="adjustHour(-1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                  <div class="time-sep">:</div>
                  <!-- 分鐘 -->
                  <div class="time-unit">
                    <button class="time-step-btn" @click="adjustMinute(5)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                    </button>
                    <div class="time-val">{{ String(timeMinute).padStart(2, '0') }}</div>
                    <button class="time-step-btn" @click="adjustMinute(-5)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                  <!-- 常用時間快選 -->
                  <div class="time-presets">
                    <button v-for="t in ['07:00','08:00','09:00','12:00','13:00','15:00','18:00','19:00','21:00']" :key="t"
                      class="time-preset-btn" :class="{ active: addTime === t }" @click="addTime = t; showTimePicker = false">
                      {{ t }}
                    </button>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 餐點類型 -->
            <div class="meal-type-row">
              <button
                v-for="type in ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]"
                :key="type"
                class="meal-type-btn"
                :class="{ active: addMealType === type }"
                @click="addMealType = type"
              >
                {{ type === 'breakfast' ? '早餐' : type === 'lunch' ? '午餐' : type === 'dinner' ? '晚餐' : '點心' }}
              </button>
            </div>

            <!-- 快速選擇 -->
            <div class="quick-row">
              <button
                v-for="qf in quickFoods"
                :key="qf.name"
                class="quick-btn"
                :class="{ active: addFoodName === qf.name }"
                @click="selectQuickFood(qf)"
              >
                {{ qf.name }}
              </button>
            </div>

            <!-- 食物名稱 -->
            <div class="form-field">
              <label>
                食物名稱
                <span v-if="isSearching" class="searching-badge">搜尋中…</span>
                <span v-else-if="searchError" class="error-badge">搜尋失敗</span>
              </label>
              <div class="food-name-row">
                <input v-model="addFoodName" type="text" placeholder="例：豆漿（輸入後自動查詢卡路里）" class="input" />
                <button class="scan-btn" @click="openBarcodeScanner" title="掃描條碼">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>
                </button>
              </div>
              <!-- 搜尋結果下拉 -->
              <div v-if="searchResults.length > 0" class="search-results">
                <button
                  v-for="r in searchResults"
                  :key="r.source + r.name"
                  class="search-result-item"
                  @click="pickSearchResult(r)"
                >
                  <div class="sr-name">{{ r.name }}</div>
                  <div v-if="r.nameEn && r.nameEn !== r.name" class="sr-name-en">{{ r.nameEn }}</div>
                  <div class="sr-meta">
                    <span class="sr-source" :class="r.source">{{ r.source === 'usda' ? 'USDA' : 'OFF' }}</span>
                    <span v-if="r.brand" class="sr-brand">{{ r.brand }}</span>
                    <span v-if="r.kcalPer100g !== null" class="sr-kcal">{{ Math.round(r.kcalPer100g) }} kcal/100g</span>
                    <span v-else class="sr-no-kcal">無卡路里資料</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- 份量 -->
            <div class="form-field">
              <label>份量（選填）</label>
              <input v-model="addFoodPortion" type="text" placeholder="例：一杯、200ml" class="input" />
            </div>

            <!-- 熱量 -->
            <div class="form-field">
              <label>熱量（選填）</label>
              <div class="cal-input-row">
                <input v-model.number="addFoodCalories" type="number" min="0" placeholder="0" class="input cal-input" />
                <span class="cal-unit">大卡</span>
              </div>
            </div>

            <button class="save-btn" :disabled="!addFoodName.trim()" @click="addFood">
              新增
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 條碼揃描器 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showBarcodeScanner" class="scanner-overlay">
          <div class="scanner-modal">
            <!-- 標題列 -->
            <div class="scanner-header">
              <span class="scanner-title">掃描條碼</span>
              <button class="close-btn" @click="closeBarcodeScanner">✕</button>
            </div>

            <!-- 沒有 BarcodeDetector （fallback） -->
            <div v-if="scannerError === 'noDetector'" class="scanner-fallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <p>此瀏覽器不支援條碼揃描<br/>請手動輸入條碼</p>
              <div class="manual-row">
                <input v-model="manualBarcode" type="text" inputmode="numeric" placeholder="請輸入條碼號碼" class="input" @keyup.enter="submitManualBarcode" />
                <button class="scan-submit-btn" :disabled="!manualBarcode.trim()" @click="submitManualBarcode">查詢</button>
              </div>
            </div>

            <!-- 沒有相機權限 -->
            <div v-else-if="scannerError === 'noCamera'" class="scanner-fallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              <p>無法存取相機<br/>請手動輸入條碼</p>
              <div class="manual-row">
                <input v-model="manualBarcode" type="text" inputmode="numeric" placeholder="請輸入條碼號碼" class="input" @keyup.enter="submitManualBarcode" />
                <button class="scan-submit-btn" :disabled="!manualBarcode.trim()" @click="submitManualBarcode">查詢</button>
              </div>
            </div>

            <!-- 正常摄影模式 -->
            <div v-else class="scanner-body">
              <div class="video-wrapper">
                <video ref="barcodeVideoRef" class="scanner-video" playsinline muted />
                <!-- 揃描線動畫 -->
                <div v-if="scannerReady" class="scan-line" />
                <!-- 尋找框角 -->
                <div class="scan-frame">
                  <span class="corner tl" /><span class="corner tr" />
                  <span class="corner bl" /><span class="corner br" />
                </div>
              </div>

              <!-- 狀態訊息 -->
              <div class="scanner-status">
                <span v-if="scannerSuccess" class="status-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  識別成功！
                </span>
                <span v-else-if="scannerError === 'notFound'" class="status-warn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  找不到此條碼的資料
                </span>
                <span v-else-if="!scannerReady" class="status-loading">準備相機中…</span>
                <span v-else class="status-hint">將條碼對準框內</span>
              </div>

              <!-- 手動輸入備選 -->
              <div class="manual-row manual-alt">
                <input v-model="manualBarcode" type="text" inputmode="numeric" placeholder="手動輸入條碼" class="input input-sm" @keyup.enter="submitManualBarcode" />
                <button class="scan-submit-btn" :disabled="!manualBarcode.trim()" @click="submitManualBarcode">查詢</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
// ===== 變數 =====
$ink: #3e2723; // 深墨色/咖啡色
$accent: #d32f2f; // 標記紅色
$border: #5d4037;
$bg: var(--color-background, #faf9f7);
$radius: 14px;

.food-log-manager {
  z-index: 100;
  background: $bg;
  display: flex;
  flex-direction: column;
}

// ===== 頂部漸層透明導航 =====
.flm-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  gap: 8px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  // 漸層透明，無黑線
  background: linear-gradient(to bottom, $bg 50%, rgba(250, 249, 247, 0) 100%);
  padding-bottom: 24px; // 讓漸變過渡更自然

  .back-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    svg {
      width: 28px;
      height: 28px;
      color: $ink;
    }
  }

  .title {
    flex: 1;
    font-size: 26px;
    font-weight: 800;
    margin: 0;
    color: $ink;
    letter-spacing: 2px;
  }

  .by-user {
    font-size: 16px;
    color: $ink;
    font-weight: 600;
    font-style: italic;
    opacity: 0.8;
  }
}

.scroll-content {
  flex: 1;
  overflow-y: auto;
  padding-top: calc(70px + var(--safe-top, 0px)); // 避開 absolute header 與瀏海安全區
  padding-bottom: 80px;
}

// ===== 月份 =====
.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 16px 4px;

  .month-label {
    font-size: 16px;
    font-weight: 700;
    color: $ink;
    min-width: 90px;
    text-align: center;
  }

  .month-nav {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    svg {
      width: 20px;
      height: 20px;
      color: $ink;
    }
  }
}

// ===== 日期列（方框風格） =====
.date-row {
  display: flex;
  gap: 12px;
  padding: 12px 16px 24px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.date-cell {
  flex: 0 0 auto;
  width: 44px;
  height: 48px;
  border-radius: 4px;
  border: 2.5px solid $ink;
  background: transparent;
  font-size: 20px;
  font-weight: 700;
  color: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  scroll-snap-align: center;
  transition: all 0.15s ease;

  &.active {
    border-color: $accent;
    color: $accent;
  }

  &:active {
    transform: scale(0.92);
  }
}

// ===== 食物列表（括號風格） =====
.food-entries {
  padding: 0 24px 24px 24px;
}

.entries-inner {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.food-item-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.food-time {
  font-size: 18px;
  font-weight: 700;
  color: $ink;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.food-bracket-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
  position: relative;
  // 右側留出删除按鈕空間
  padding-right: 36px;
}

.bracket {
  width: 16px;
  height: 60px;
  border: 4px solid $ink;
  flex-shrink: 0;
}

.left-bracket {
  border-right: none;
  border-radius: 16px 0 0 16px;
}

.right-bracket {
  border-left: none;
  border-radius: 0 16px 16px 0;
}

.food-icon-box {
  width: 52px;
  height: 52px;
  border: 2.5px solid $ink;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 32px;
    height: 32px;
    color: $ink;
  }
}

.food-name {
  font-size: 28px;
  font-weight: 800;
  color: $ink;
  letter-spacing: 2px;
  flex: 1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.food-meta {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: rgba($ink, 0.7);
}

.delete-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.2;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover, &:active {
    opacity: 1;
  }

  svg {
    width: 20px;
    height: 20px;
  }
}

// ===== 空狀態 =====
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 16px;
  gap: 16px;
  color: rgba($ink, 0.6);

  svg {
    width: 64px;
    height: 64px;
    opacity: 0.5;
  }

  p {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .empty-add-btn {
    margin-top: 12px;
    padding: 12px 28px;
    border: 2.5px solid $ink;
    border-radius: 12px;
    background: transparent;
    color: $ink;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;

    &:active {
      background: rgba($ink, 0.1);
    }
  }
}

// ===== FAB =====
.fab {
  position: absolute;
  bottom: calc(24px + var(--safe-bottom, 0px));
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  border: 3px solid $ink;
  background: $bg;
  color: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  box-shadow: 4px 4px 0 rgba($ink, 0.15);

  svg {
    width: 28px;
    height: 28px;
  }

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 rgba($ink, 0.15);
  }
}

// ===== 搜尋結果 =====
.searching-badge {
  font-size: 12px;
  font-weight: 600;
  color: rgba($ink, 0.5);
  margin-left: 8px;
}

.error-badge {
  font-size: 12px;
  font-weight: 600;
  color: $accent;
  margin-left: 8px;
}

.search-results {
  border: 2px solid $ink;
  border-top: none;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
  margin-top: -2px;
}

.search-result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid rgba($ink, 0.12);
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:last-child { border-bottom: none; }

  &:active { background: rgba($ink, 0.06); }
}

.sr-name {
  font-size: 15px;
  font-weight: 700;
  color: $ink;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sr-brand {
  font-size: 12px;
  color: rgba($ink, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.sr-kcal {
  font-size: 12px;
  font-weight: 700;
  color: $accent;
}

.sr-no-kcal {
  font-size: 12px;
  color: rgba($ink, 0.4);
}

.sr-name-en {
  font-size: 11px;
  color: rgba($ink, 0.45);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-source {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  flex-shrink: 0;

  &.off  { background: #e3f2fd; color: #1565c0; }
  &.usda { background: #e8f5e9; color: #2e7d32; }
}

// ===== 條碼掃描按鈕 =====
.food-name-row {
  display: flex;
  gap: 8px;
  align-items: stretch;

  .input { flex: 1; }
}

.scan-btn {
  width: 48px;
  flex-shrink: 0;
  border: 2px solid $ink;
  border-radius: 12px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $ink;

  svg { width: 22px; height: 22px; }

  &:active { background: rgba($ink, 0.08); }
}

// ===== 掃描器 Modal =====
.scanner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1100;
}

.scanner-modal {
  width: 100%;
  max-width: 480px;
  background: $bg;
  border-radius: 28px 28px 0 0;
  border-top: 3px solid $ink;
  padding-bottom: var(--safe-bottom, 0px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;

  .scanner-title {
    font-size: 18px;
    font-weight: 800;
    color: $ink;
  }

  .close-btn {
    border: none;
    background: transparent;
    font-size: 20px;
    font-weight: bold;
    color: $ink;
    cursor: pointer;
    width: 32px;
    height: 32px;
  }
}

.scanner-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 20px 28px;
  text-align: center;

  svg {
    width: 56px;
    height: 56px;
    opacity: 0.5;
    color: $ink;
  }

  p {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: rgba($ink, 0.7);
    line-height: 1.6;
  }
}

.scanner-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 20px 20px;
}

.video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  background: #000;
  border-radius: 16px;
  overflow: hidden;
  border: 2.5px solid $ink;
}

.scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

// 掃描線
.scan-line {
  position: absolute;
  left: 10%;
  right: 10%;
  height: 2px;
  background: $accent;
  box-shadow: 0 0 8px $accent;
  animation: scan-sweep 2s ease-in-out infinite;
}

@keyframes scan-sweep {
  0%   { top: 15%; }
  50%  { top: 80%; }
  100% { top: 15%; }
}

// 四個角框
.scan-frame {
  position: absolute;
  inset: 10%;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 4px solid #fff;

  &.tl { top: 0; left: 0;  border-right: none; border-bottom: none; border-radius: 4px 0 0 0; }
  &.tr { top: 0; right: 0; border-left: none;  border-bottom: none; border-radius: 0 4px 0 0; }
  &.bl { bottom: 0; left: 0;  border-right: none; border-top: none; border-radius: 0 0 0 4px; }
  &.br { bottom: 0; right: 0; border-left: none;  border-top: none; border-radius: 0 0 4px 0; }
}

.scanner-status {
  display: flex;
  justify-content: center;

  span {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 10px;

    svg { width: 18px; height: 18px; }
  }

  .status-success {
    background: #e8f5e9;
    color: #2e7d32;
  }
  .status-warn {
    background: #fff3e0;
    color: #e65100;
  }
  .status-loading, .status-hint {
    color: rgba($ink, 0.55);
    background: rgba($ink, 0.05);
  }
}

.manual-row {
  display: flex;
  gap: 8px;

  .input { flex: 1; }

  &.manual-alt .input { font-size: 14px; padding: 10px 12px; }
}

.scan-submit-btn {
  padding: 10px 16px;
  border: 2px solid $ink;
  border-radius: 12px;
  background: $ink;
  color: $bg;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:disabled { opacity: 0.45; cursor: not-allowed; }
}

// ===== 時間選擇器 =====
.time-display-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 2px solid $ink;
  border-radius: 12px;
  background: transparent;
  width: 100%;
  cursor: pointer;
  color: $ink;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
    text-align: left;
    font-size: 17px;
    font-weight: 700;
    color: $ink;
  }

  .chevron {
    transition: transform 0.2s ease;
    &.open { transform: rotate(180deg); }
  }

  &:active { background: rgba($ink, 0.05); }
}

.time-picker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px;
  border: 2px solid $ink;
  border-top: none;
  border-radius: 0 0 12px 12px;
  background: rgba($ink, 0.02);
  margin-top: -2px;
}

.time-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.time-step-btn {
  width: 44px;
  height: 44px;
  border: 2px solid $ink;
  border-radius: 10px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $ink;

  svg { width: 20px; height: 20px; }

  &:active {
    background: $ink;
    color: $bg;
  }
}

.time-val {
  font-size: 36px;
  font-weight: 800;
  color: $ink;
  min-width: 56px;
  text-align: center;
  letter-spacing: 1px;
}

.time-sep {
  font-size: 36px;
  font-weight: 800;
  color: $ink;
  padding-bottom: 4px;
}

.time-presets {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1.5px solid rgba($ink, 0.15);
}

.time-preset-btn {
  padding: 7px 12px;
  border: 1.5px solid rgba($ink, 0.35);
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  color: $ink;
  cursor: pointer;

  &.active {
    background: $ink;
    color: $bg;
    border-color: $ink;
  }

  &:active { opacity: 0.7; }
}

.picker-enter-active { transition: all 0.2s ease; }
.picker-leave-active { transition: all 0.15s ease; }
.picker-enter-from { opacity: 0; transform: translateY(-8px); }
.picker-leave-to   { opacity: 0; transform: translateY(-4px); }

// ===== Modal Overlay =====
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.add-panel {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  background: $bg;
  border-radius: 28px 28px 0 0;
  padding: 24px 24px calc(24px + var(--safe-bottom, 0px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 3px solid $ink;
}

.add-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h3 {
    font-size: 20px;
    font-weight: 800;
    margin: 0;
    color: $ink;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    color: $ink;
  }
}

// ===== 類型切換 =====
.meal-type-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.meal-type-btn {
  padding: 10px 16px;
  border-radius: 12px;
  border: 2px solid $ink;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  color: $ink;
  cursor: pointer;

  &.active {
    background: $ink;
    color: $bg;
  }
}

// ===== 快速選擇 =====
.quick-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-btn {
  padding: 8px 14px;
  border-radius: 10px;
  border: 2px solid rgba($ink, 0.3);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: $ink;
  cursor: pointer;

  &.active {
    border-color: $ink;
    background: rgba($ink, 0.1);
  }
}

// ===== 表單欄位 =====
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 14px;
    font-weight: 700;
    color: $ink;
  }
}

.input {
  padding: 12px 14px;
  border: 2px solid $ink;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: $ink;
  background: transparent;

  &:focus {
    outline: none;
    background: rgba($ink, 0.02);
  }

  &::placeholder {
    color: rgba($ink, 0.4);
  }
}

.cal-input-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .cal-input {
    width: 120px;
  }

  .cal-unit {
    font-size: 15px;
    font-weight: 700;
    color: $ink;
  }
}

.save-btn {
  padding: 16px;
  border: 2.5px solid $ink;
  border-radius: 14px;
  background: $ink;
  color: $bg;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  margin-top: 8px;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ===== 動畫 =====
.entry-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.entry-leave-active {
  transition: all 0.2s ease;
}
.entry-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.entry-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
  .add-panel { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
  .add-panel { transform: translateY(100%); }
}
</style>

