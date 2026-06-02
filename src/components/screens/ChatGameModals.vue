<script setup lang="ts">
import DishWashingGame from "@/components/modals/DishWashingGame.vue";
import FishingGame from "@/components/modals/FishingGame.vue";
import GamblingGame from "@/components/modals/GamblingGame.vue";
import MeritHub from "@/components/modals/MeritHub.vue";

defineProps<{
  showDishWashingGame: boolean;
  showFishingGame: boolean;
  showGamblingGame: boolean;
  showMeritHub: boolean;
  chatId: string;
}>();

const emit = defineEmits<{
  closeDishWashing: [];
  closeFishing: [];
  closeGambling: [];
  closeMerit: [];
}>();
</script>

<template>
  <DishWashingGame
    :visible="showDishWashingGame"
    :chat-id="chatId"
    @close="emit('closeDishWashing')"
  />

  <FishingGame
    :visible="showFishingGame"
    :chat-id="chatId"
    @close="emit('closeFishing')"
  />

  <GamblingGame
    :visible="showGamblingGame"
    :chat-id="chatId"
    @close="emit('closeGambling')"
  />

  <MeritHub
    :visible="showMeritHub"
    @close="emit('closeMerit')"
  />
</template>
