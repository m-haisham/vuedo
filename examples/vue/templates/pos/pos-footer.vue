<template>
  <footer
    class="pos-footer text-center text-xs text-slate-500 border-t-2 border-dashed border-slate-800 pt-2 mt-2 pb-2"
  >
    <div class="font-semibold">{{ thankYou }}</div>
    <div class="mt-1">{{ returnPolicy }}</div>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  thankYou: string;
  returnPolicy: string;
}>();
</script>
