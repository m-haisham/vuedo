<template>
  <div class="card">Card {{ name }}</div>
</template>

<script setup>
defineProps({ name: { type: String, required: true } });
</script>
