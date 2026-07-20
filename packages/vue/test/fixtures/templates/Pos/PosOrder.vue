<template>
  <div class="pos">POS order {{ orderId }}</div>
</template>

<script setup>
defineProps({ orderId: { type: String, required: true } });
</script>
