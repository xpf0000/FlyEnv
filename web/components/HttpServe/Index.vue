<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <li class="active" @click="doAdd">{{ $t('base.add') }}</li>
    </ul>
    <List ref="list"></List>
  </div>
</template>

<script>
  import List from './List.vue'
  export default {
    components: { List },
    methods: {
      doAdd() {
        this.$refs.list.choosePath()
      }
    }
  }
</script>

<style lang="scss">
  .host-panel {
    height: 100%;
    overflow: hidden;
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
      overflow: hidden;
    }
  }
</style>
