<template><section class="receipt"><ReceiptTotal :total="total" /></section></template>
<script setup lang="ts">
import ReceiptTotal from "../components/ReceiptTotal.vue";
defineProps<{ total: number }>();
</script>
