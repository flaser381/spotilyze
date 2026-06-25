<script setup lang="ts">
defineProps<{ title: string; span?: string }>();
</script>

<template>
  <section class="card" :class="span ?? 's4'">
    <h3>{{ title }}</h3>
    <div class="body"><slot /></div>
  </section>
</template>
