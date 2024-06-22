<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index"
        >{{ item }}</li
      >
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0"></Service>
    </div>
  </div>
</template>

<script lang="ts">
  import { defineComponent, ref } from 'vue'
  import Service from './Service.vue'
  import { AppStore } from '@/store/app'

  const current_tab = ref(0)

  export default defineComponent({
    components: {
      Service
    },
    props: {},
    data() {
      return {
        current_tab,
        tabs: [this.$t('base.service')]
      }
    },
    computed: {
      version() {
        return AppStore().config.server?.redis?.current?.version
      }
    },
    watch: {},
    created: function () {}
  })
</script>
