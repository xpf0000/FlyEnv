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
      <Versions v-if="current_tab === 0"></Versions>
    </div>
  </div>
</template>

<script>
  import Versions from './List.vue'
  export default {
    name: 'MoNodejsPanel',
    components: {
      Versions
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: [this.$t('base.versionSwitch')]
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
