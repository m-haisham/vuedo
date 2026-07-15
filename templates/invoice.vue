<template>
  <div class="p-10 font-sans bg-white text-gray-900">
    <img src="../assets/logo.png" class="w-32 mb-8" />
    <h1 class="text-4xl font-bold">Invoice #{{ id }}</h1>
    <p>Billed to: {{ customerName }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ id: string; customerName: string }>();
</script>
