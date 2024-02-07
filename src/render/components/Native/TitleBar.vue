<template>
  <div class="title-bar">
    <div class="title-bar-dragger"></div>
  </div>
</template>

<script>
  export default {
    name: 'MoTitleBar',
    props: {},
    data() {
      return {}
    },
    computed: {},
    methods: {}
  }
</script>

<style lang="scss">
  .title-bar {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 24px;
    z-index: 5000;
    flex-shrink: 0;
    position: fixed;
    left: 0;
    top: 0;
    background: transparent;

    .title-bar-dragger {
      flex: 1;
      user-select: none;
      -webkit-app-region: drag;
      -webkit-user-select: none;
    }
  }
</style>
