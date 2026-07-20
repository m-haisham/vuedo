<template>
  <div class="hello">Hello {{ name }}</div>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
});
</script>
