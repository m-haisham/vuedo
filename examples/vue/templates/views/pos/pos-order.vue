<template>
  <section class="pos-body font-mono text-sm">
    <div class="divide-y divide-dashed divide-slate-300">
      <div v-for="(item, i) in items" :key="i" class="py-1">
        <div class="flex justify-between">
          <span>{{ item.name }}</span>
          <MoneyAmount :amount="item.price * item.qty" />
        </div>
        <div class="text-xs text-slate-500">
          {{ item.qty }} &times;
          <MoneyAmount :amount="item.price" />
        </div>
      </div>
    </div>
    <div class="border-t-2 border-dashed border-slate-800 mt-2 pt-2 space-y-1">
      <div class="flex justify-between">
        <span>Subtotal</span>
        <MoneyAmount :amount="subtotal" />
      </div>
      <div class="flex justify-between">
        <span>Tax</span>
        <MoneyAmount :amount="tax" />
      </div>
      <div class="flex justify-between font-bold text-base">
        <span>TOTAL</span>
        <MoneyAmount :amount="total" bold />
      </div>
      <div class="flex justify-between text-xs text-slate-500">
        <span>Paid via</span>
        <span>{{ paymentMethod }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MoneyAmount from "../../components/MoneyAmount.vue";

const props = defineProps<{
  items: { name: string; qty: number; price: number }[];
  tax: number;
  total: number;
  paymentMethod: string;
}>();

const subtotal = computed(() =>
  props.items.reduce((sum, item) => sum + item.price * item.qty, 0),
);
</script>
