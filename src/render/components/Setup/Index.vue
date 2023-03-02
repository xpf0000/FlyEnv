<template>
  <div class="setup-panel main-right-panel">
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
    </div>
  </div>
</template>

<script>
  import Common from './Common.vue'
  import CustomDir from './CustomDir/index.vue'

  export default {
    components: {
      Common,
      CustomDir
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['setupBase', 'CustomVersionDir']
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {}
  }
</script>
<style lang="scss">
  .setup-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        user-select: none;
        cursor: pointer;
        min-width: 100px;
        padding: 0 12px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      overflow: auto;
    }
  }
</style>
