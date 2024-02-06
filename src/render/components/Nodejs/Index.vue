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
      <mo-nodejs-versions v-if="current_tab === 0"></mo-nodejs-versions>
    </div>
  </div>
</template>

<script>
  import Versions from './Versions.vue'
  export default {
    name: 'MoNodejsPanel',
    components: {
      [Versions.name]: Versions
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
