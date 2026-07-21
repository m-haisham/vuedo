<template>
  <header class="pos-header text-center border-b-2 border-dashed border-slate-800 pt-2 pb-2 mb-2">
    <div class="text-lg font-bold tracking-wide">{{ store }}</div>
    <div class="text-xs">{{ address }}</div>
    <div class="text-sm font-semibold mt-1">ORDER RECEIPT</div>
    <div class="text-xs mt-1">#{{ orderNumber }} &middot; {{ date }}</div>
    <div class="text-xs">Cashier: {{ cashier }}</div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  store: string;
  address: string;
  orderNumber: string;
  date: string;
  cashier: string;
}>();
</script>
