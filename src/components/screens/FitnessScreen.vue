<script setup lang="ts">
import BodyMetricsComp from "@/components/fitness/BodyMetrics.vue";
import ExerciseLog from "@/components/fitness/ExerciseLog.vue";
import MealLog from "@/components/fitness/MealLog.vue";
import WorkoutTimer from "@/components/fitness/WorkoutTimer.vue";
import FitnessPartnerModal from "@/components/modals/FitnessPartnerModal.vue";
import WorkoutSetupModal, {
    type WorkoutPlan,
} from "@/components/modals/WorkoutSetupModal.vue";
import { useCharactersStore } from "@/stores/characters";
import { useFitnessStore } from "@/stores/fitness";
import {
    ArrowLeft,
    Calendar,
    ChevronRight,
    Dumbbell,
    Flame,
    Scale,
    Target,
    TrendingUp,
    UserPlus,
    Utensils,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{
  (e: "back"): void;
}>();

// 彈窗狀態
const showPartnerModal = ref(false);
const showSetupModal = ref(false);

// 當前訓練計畫
const currentPlan = ref<WorkoutPlan | null>(null);

const fitnessStore = useFitnessStore();
const charactersStore = useCharactersStore();

// 當前視圖
type ViewType = "home" | "timer" | "log" | "meals" | "metrics";
const currentView = ref<ViewType>("home");

// 選中的訓練夥伴
const selectedPartnerId = ref<string | undefined>(
  fitnessStore.settings.defaultPartnerId,
);

// 取得夥伴角色
const selectedPartner = computed(() => {
  if (!selectedPartnerId.value) return null;
  return charactersStore.characters.find(
    (c) => c.id === selectedPartnerId.value,
  );
});

// 本週進度
const weeklyProgress = computed(() => {
  const goal = fitnessStore.settings.weeklyGoal || 3;
  return Math.min(100, Math.round((fitnessStore.weeklyWorkouts / goal) * 100));
});

onMounted(() => {
  fitnessStore.loadFromDB();
});

// 打開訓練設定
function openWorkoutSetup() {
  showSetupModal.value = true;
}

// 開始訓練
function startWorkout(plan: WorkoutPlan) {
  currentPlan.value = plan;
  currentView.value = "timer";
}

// 訓練完成
function handleWorkoutComplete(data: { duration: number; exercises: any[] }) {
  // 記錄訓練
  fitnessStore.addWorkoutLog({
    date: new Date().toISOString().split("T")[0],
    partnerId: selectedPartnerId.value,
    exercises: data.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      type: ex.type,
      sets: Array(ex.sets).fill({ reps: 0, completed: true }),
    })),
    totalDuration: Math.round(data.duration / 60),
  });
}

// 從計時器返回
function handleTimerBack() {
  currentView.value = "home";
  currentPlan.value = null;
}
</script>

<template>
  <div class="fitness-screen">
    <!-- 頂部導航 -->
    <header class="screen-header">
      <button
        class="icon-btn"
        @click="currentView === 'home' ? emit('back') : (currentView = 'home')"
      >
        <ArrowLeft :size="24" stroke-width="3" />
      </button>
      <div class="screen-title">
        <Dumbbell :size="20" stroke-width="3" />
        <span>健身夥伴</span>
      </div>
      <div style="width: 44px" />
    </header>

    <!-- 主頁 -->
    <div v-if="currentView === 'home'" class="home-view">
      <!-- 訓練夥伴卡片 -->
      <section class="partner-card">
        <div class="partner-header">
          <span class="label">今日訓練夥伴</span>
          <button class="change-btn" @click="showPartnerModal = true">
            更換
          </button>
        </div>

        <div v-if="selectedPartner" class="partner-info">
          <div class="partner-avatar">
            <img
              v-if="selectedPartner.avatar"
              :src="selectedPartner.avatar"
              :alt="selectedPartner.nickname"
            />
            <Dumbbell v-else :size="32" stroke-width="2.5" />
          </div>
          <div class="partner-details">
            <span class="name">{{ selectedPartner.nickname }}</span>
            <span class="quote">「一起加油吧！」</span>
          </div>
        </div>

        <div v-else class="no-partner">
          <UserPlus :size="32" stroke-width="2.5" />
          <span>尚未選擇訓練夥伴</span>
          <button class="select-btn" @click="showPartnerModal = true">
            選擇夥伴
          </button>
        </div>
      </section>

      <!-- 開始訓練按鈕 -->
      <button class="start-workout-btn" @click="openWorkoutSetup">
        <Dumbbell :size="24" stroke-width="3" />
        <span>開始訓練</span>
      </button>

      <!-- 統計卡片 -->
      <section class="stats-section">
        <h2>本週統計</h2>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">
              <Target :size="24" stroke-width="2.5" />
            </div>
            <div class="stat-content">
              <span class="stat-value">{{ fitnessStore.weeklyWorkouts }}</span>
              <span class="stat-label">次訓練</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${weeklyProgress}%` }"
              />
            </div>
            <span class="progress-text"
              >目標 {{ fitnessStore.settings.weeklyGoal }} 次</span
            >
          </div>

          <div class="stat-card">
            <div class="stat-icon flame">
              <Flame :size="24" stroke-width="2.5" />
            </div>
            <div class="stat-content">
              <span class="stat-value">{{ fitnessStore.streak }}</span>
              <span class="stat-label">連續天數</span>
            </div>
          </div>

          <div
            v-if="fitnessStore.stats.weightChange !== undefined"
            class="stat-card"
          >
            <div class="stat-icon trend">
              <TrendingUp :size="24" stroke-width="2.5" />
            </div>
            <div class="stat-content">
              <span class="stat-value">
                {{ fitnessStore.stats.weightChange > 0 ? "+" : ""
                }}{{ fitnessStore.stats.weightChange }}
              </span>
              <span class="stat-label">kg 變化</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 快捷功能 -->
      <section class="quick-actions">
        <h2>功能</h2>

        <div class="action-list">
          <button class="action-item" @click="currentView = 'log'">
            <div class="action-icon">
              <Calendar :size="24" stroke-width="2.5" />
            </div>
            <span class="action-label">訓練日誌</span>
            <ChevronRight :size="20" stroke-width="2.5" class="action-arrow" />
          </button>

          <button class="action-item" @click="currentView = 'meals'">
            <div class="action-icon meals">
              <Utensils :size="24" stroke-width="2.5" />
            </div>
            <span class="action-label">飲食記錄</span>
            <ChevronRight :size="20" stroke-width="2.5" class="action-arrow" />
          </button>

          <button class="action-item" @click="currentView = 'metrics'">
            <div class="action-icon metrics">
              <Scale :size="24" stroke-width="2.5" />
            </div>
            <span class="action-label">身體數據</span>
            <ChevronRight :size="18" class="action-arrow" />
          </button>
        </div>
      </section>
    </div>

    <!-- 計時器視圖 -->
    <div v-else-if="currentView === 'timer'" class="timer-view">
      <WorkoutTimer
        :partner-id="selectedPartnerId"
        :plan="currentPlan || undefined"
        @complete="handleWorkoutComplete"
        @back="handleTimerBack"
      />
    </div>

    <!-- 訓練日誌視圖 -->
    <div v-else-if="currentView === 'log'" class="log-view">
      <ExerciseLog @back="currentView = 'home'" />
    </div>

    <!-- 飲食記錄視圖 -->
    <div v-else-if="currentView === 'meals'" class="meals-view">
      <MealLog @back="currentView = 'home'" />
    </div>

    <!-- 身體數據視圖 -->
    <div v-else-if="currentView === 'metrics'" class="metrics-view">
      <BodyMetricsComp @back="currentView = 'home'" />
    </div>

    <!-- 訓練夥伴選擇彈窗 -->
    <FitnessPartnerModal
      :visible="showPartnerModal"
      @close="showPartnerModal = false"
      @select="(id) => (selectedPartnerId = id)"
    />

    <!-- 訓練設定彈窗 -->
    <WorkoutSetupModal
      :visible="showSetupModal"
      @close="showSetupModal = false"
      @start="startWorkout"
    />
  </div>
</template>
<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$text-main: #1a1a1a;
$text-sec: #6b7280;
$accent-color: #fb923c;
$card-bg: #ffffff;
$green-accent: #7dd3a8;
$orange-accent: #f97316;
$blue-accent: #3b82f6;

.fitness-screen {
  width: 100%;
  height: 100%;
  background: $bg-color;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: $text-main;
  font-family: "Nunito", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  position: relative;
}

.screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  margin-top: 10px;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  background: $card-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $text-main;
  box-shadow: 2px 2px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }
}

.screen-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 900;
  color: $text-main;
  background: $card-bg;
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
}

.home-view {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 32px;
  padding-bottom: calc(32px + var(--safe-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  z-index: 2;
}

// 訓練夥伴卡片
.partner-card {
  background: $card-bg;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 18px;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 $frame-border;
  }

  .partner-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;

    .label {
      font-size: 14px;
      font-weight: 800;
      color: $text-sec;
    }

    .change-btn {
      font-size: 14px;
      color: $text-main;
      font-weight: 800;
      background: #fef3c7;
      padding: 4px 10px;
      border-radius: 12px;
      border: 2px solid $frame-border;
    }
  }

  .partner-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .partner-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
    background: #f0fdf4;
    border: 3px solid $frame-border;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $green-accent;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .partner-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;

    .name {
      font-weight: 900;
      font-size: 18px;
      color: $text-main;
    }

    .quote {
      font-size: 14px;
      font-weight: 700;
      color: $text-sec;
    }
  }

  .no-partner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 0 8px;
    color: $text-sec;
    font-weight: 700;

    .select-btn {
      margin-top: 8px;
      padding: 10px 20px;
      background: $green-accent;
      color: $text-main;
      border: 2px solid $frame-border;
      box-shadow: 2px 2px 0 $frame-border;
      border-radius: 20px;
      font-size: 15px;
      font-weight: 900;
      transition:
        transform 0.1s,
        box-shadow 0.1s;

      &:active {
        transform: translate(2px, 2px);
        box-shadow: 0 0 0 $frame-border;
      }
    }
  }
}

// 開始訓練按鈕
.start-workout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px;
  background: $accent-color;
  color: #fff;
  border-radius: 20px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  font-size: 18px;
  font-weight: 900;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 $frame-border;
  }
}

// 統計區塊
.stats-section {
  h2 {
    font-size: 16px;
    font-weight: 900;
    color: $text-main;
    margin-bottom: 12px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-card {
  background: $card-bg;
  border-radius: 20px;
  border: 3px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }

  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #f0fdf4;
    border: 2px solid $frame-border;
    color: $text-main;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0 $frame-border;

    &.flame {
      background: #ffedd5;
    }

    &.trend {
      background: #dbeafe;
    }
  }

  .stat-content {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 4px;
  }

  .stat-value {
    font-size: 26px;
    font-weight: 900;
    color: $text-main;
  }

  .stat-label {
    font-size: 13px;
    font-weight: 800;
    color: $text-sec;
  }

  .progress-bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.05);
    border: 2px solid $frame-border;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 4px;

    .progress-fill {
      height: 100%;
      background: $green-accent;
      border-right: 2px solid $frame-border;
      transition: width 0.3s ease;
    }
  }

  .progress-text {
    font-size: 12px;
    font-weight: 800;
    color: $text-sec;
  }
}

// 快捷功能
.quick-actions {
  h2 {
    font-size: 16px;
    font-weight: 900;
    color: $text-main;
    margin-bottom: 12px;
  }
}

.action-list {
  background: $card-bg;
  border-radius: 20px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.action-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  text-align: left;
  background: transparent;
  transition: background 0.1s;

  &:not(:last-child) {
    border-bottom: 2px solid $frame-border;
  }

  &:active {
    background: #f1f5f9;
  }

  .action-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #f0fdf4;
    border: 2px solid $frame-border;
    color: $text-main;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0 $frame-border;

    &.meals {
      background: #ffedd5;
    }

    &.metrics {
      background: #dbeafe;
    }
  }

  .action-label {
    flex: 1;
    font-size: 16px;
    font-weight: 800;
    color: $text-main;
  }

  .action-arrow {
    color: $text-main;
  }
}

// 計時器視圖
.timer-view,
.log-view,
.meals-view,
.metrics-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  z-index: 2;

  :deep(.workout-timer) {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
}

.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: $text-sec;
  background: $card-bg;
  border: 3px dashed $text-sec;
  border-radius: 32px;
  padding: 40px;
  margin: 20px;

  p {
    font-size: 16px;
    font-weight: 800;
    color: $text-sec;
  }
}
</style>
