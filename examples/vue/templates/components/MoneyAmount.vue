<template>
  <span :class="[bold ? 'font-semibold' : '', cls].filter(Boolean).join(' ')" class="tabular-nums">
    {{ formatted }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  amount: number;
  bold?: boolean;
  cls?: string;
}>();

const formatted = computed(() => "$" + props.amount.toFixed(2));
</script>
