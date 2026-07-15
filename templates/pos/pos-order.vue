<template>
  <div class="pos-order">
    <h2>POS Order #{{ orderId }}</h2>
    <p>Total: {{ total }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ orderId: string; total: number }>();
</script>
