<template>
  <div
    class="vuedo-header text-sm text-gray-500 border-b border-gray-200 pb-2 mb-4 flex justify-between"
  >
    <span class="font-semibold">vuedo inc.</span>
    <span>Invoice {{ id }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ id: string; customerName: string }>();
</script>
