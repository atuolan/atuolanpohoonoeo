<script setup lang="ts">
/** 支持作者：打賞收款碼 */
import { CupSoda } from "lucide-vue-next";
</script>

<template>
  <div class="st-page">
    <section class="st-group">
      <div class="st-card support-card">
        <span class="st-tile st-tile--lg st-tile--pink" aria-hidden="true"><CupSoda /></span>
        <p class="support-card__text">
          感謝大家的喜愛和支持！如果你很喜歡這個小手機，想要支持作者、請我喝奶茶，可以掃描這裡打賞。
        </p>
        <img class="support-card__qr" src="/收款碼.png" alt="打賞作者收款碼" loading="lazy" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.support-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 20px;
  text-align: center;

  > * + *::before {
    display: none;
  }
}

.support-card__text {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
}

.support-card__qr {
  width: min(220px, 100%);
  height: auto;
  border-radius: 16px;
}
</style>
