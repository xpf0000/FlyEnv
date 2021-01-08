<template>
  <div class="nodejs-panel main-right-panel">
    <ul class="top-tab">
        <li @click="current_tab = index" :class="current_tab === index ? 'active' : ''" v-for="(item, index) in tabs" v-text="item">服务</li>
    </ul>
    <div class="main-block">
      <mo-nodejs-versions v-if="current_tab === 0"></mo-nodejs-versions>
    </div>
  </div>
</template>

<script>
  import Versions from './Versions'
  export default {
    name: 'mo-nodejs-panel',
    data () {
      return {
        current_tab: 0,
        tabs: ['切换版本']
      }
    },
    components: {
      [Versions.name]: Versions
    },
    props: {
    },
    computed: {
    },
    watch: {
    },
    methods: {
    },
    created: function () {
    }
  }
</script>

<style lang="scss">
  .nodejs-panel{
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    >.top-tab{
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      >li{
        user-select: none;
        cursor: pointer;
        width: 100px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active{
          background: #3e4257;
        }
      }
    }
    .main-block{
      flex: 1;
      width: 100%;
      overflow: hidden;
    }
  }
</style>
