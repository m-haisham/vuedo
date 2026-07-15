<template>
  <div class="pos-header">STORE RECEIPT — {{ store }}</div>
</template>

<script setup lang="ts">
defineProps<{ store: string }>();
</script>
