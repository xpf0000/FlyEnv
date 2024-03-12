<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-for="(item, index) in tabs"
        :key="index"
        :class="current_tab === index ? 'active' : ''"
        @click="current_tab = index"
        >{{ $t(`base.${item}`) }}</li
      >
    </ul>
    <div class="main-block">
      <Common v-if="current_tab === 0"></Common>
      <EditorConfig v-if="current_tab === 1"></EditorConfig>
    </div>
  </div>
</template>

<script>
  import Common from './Common.vue'
  import EditorConfig from './EditorConfig/index.vue'

  export default {
    components: {
      Common,
      EditorConfig
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['setupBase', 'editorSetup']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
