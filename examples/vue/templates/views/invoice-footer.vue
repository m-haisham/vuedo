<template>
  <footer
    class="invoice-footer px-10 pt-6 pb-8 border-t border-slate-200 text-slate-500 text-sm flex items-center justify-between"
  >
    <div>{{ thankYou }}</div>
    <div class="text-right">
      <div>{{ contactEmail }}</div>
      <div>{{ website }}</div>
    </div>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  thankYou: string;
  contactEmail: string;
  website: string;
}>();
</script>
