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
      <CustomDir v-if="current_tab === 1"></CustomDir>
      <EditorConfig v-if="current_tab === 2"></EditorConfig>
    </div>
  </div>
</template>

<script>
  import Common from './Common.vue'
  import CustomDir from './CustomDir/index.vue'
  import EditorConfig from './EditorConfig/index.vue'

  export default {
    components: {
      Common,
      CustomDir,
      EditorConfig
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['setupBase', 'CustomVersionDir', 'editorSetup']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
