/**
 * 禮物圖示：商城禮物 id 對應的 lucide 圖示
 * 禮物櫃、商城共用；沒有 id（角色自己編的禮物）就回傳 Gift
 */
import {
  Cake,
  Coffee,
  Diamond,
  Flower2,
  Gem,
  Gift,
  Heart,
  Sparkles,
  Star,
} from "lucide-vue-next";

export function getGiftIcon(itemId?: string) {
  const iconMap: Record<string, typeof Gift> = {
    // Common
    gift_flower: Flower2,
    gift_chocolate: Cake,
    gift_cake: Cake,
    gift_cola: Coffee,
    gift_mug_simple: Coffee,
    gift_plush_bear: Heart,
    // Uncommon
    gift_lotion: Sparkles,
    gift_toner: Sparkles,
    gift_mug_cat: Coffee,
    gift_plush_bunny: Heart,
    gift_charm_star: Star,
    gift_earring_pearl: Sparkles,
    gift_crystal_clear: Gem,
    // Rare
    gift_necklace_silver: Sparkles,
    gift_ring_silver: Sparkles,
    gift_crystal_rose: Gem,
    gift_crystal_amethyst: Gem,
    gift_crystal_citrine: Gem,
    gift_earring_crystal: Sparkles,
    gift_plush_giant: Heart,
    gift_charm_moon: Star,
    gift_skincare_set: Gift,
    // Epic
    gift_necklace_gold: Sparkles,
    gift_ring_gold: Sparkles,
    gift_crystal_obsidian: Gem,
    gift_crystal_moonstone: Gem,
    gift_crystal_labradorite: Gem,
    gift_crystal_aquamarine: Gem,
    gift_earring_diamond: Diamond,
    gift_charm_custom: Star,
    gift_limited_box: Gift,
    // Legendary
    gift_diamond: Diamond,
    gift_necklace_custom: Sparkles,
    gift_crystal_ruby: Gem,
    gift_crystal_sapphire: Gem,
    gift_crystal_emerald: Gem,
    gift_ring_diamond: Diamond,
    gift_charm_diamond: Diamond,
    gift_crystal_alexandrite: Gem,
    gift_empathy_doll: Heart,
  };
  if (!itemId) return Gift;
  return iconMap[itemId] || Gift;
}
