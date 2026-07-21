<template><span class="total" :class="{ bold: total > 100 }">{{ formatted }}</span></template>
<script setup lang="ts">
const props = defineProps<{ total: number }>();
const formatted = props.total.toFixed(2);
</script>
