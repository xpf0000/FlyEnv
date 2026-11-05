<template>
  <div>
    <button id="counter-read" @click="Fixture.read()">Read</button>
    <button id="counter-write" @click="Fixture.write()">Increment</button>
    <output id="counter-result">{{ JSON.stringify(Fixture.result) }}</output>
  </div>
</template>
<script setup lang="ts">
  import { Fixture } from './controller'
</script>
