<template>
  <div class="title-bar">
    <div class="title-bar-dragger"></div>
    <ul v-if="isWin" class="window-actions">
      <li @click="handleMinimize">
        <yb-icon :svg="import('../../svg/minimize.svg?raw')" width="12" height="12" />
      </li>
      <li @click="handleMaximize">
        <yb-icon :svg="import('../../svg/maximize.svg?raw')" width="12" height="12" />
      </li>
      <li class="win-close-btn" @click="handleClose">
        <yb-icon :svg="import('../../svg/close.svg?raw')" width="12" height="12" />
      </li>
    </ul>
  </div>
</template>

<script>
  import IPC from '../../util/IPC.js'

  export default {
    name: 'MoTitleBar',
    props: {},
    data() {
      return {
        isWin: process.platform === 'win32'
      }
    },
    computed: {},
    methods: {
      handleMinimize: function () {
        IPC.send('Application:APP-Minimize')
      },
      handleMaximize: function () {
        IPC.send('Application:APP-Maximize')
      },
      handleClose: function () {
        IPC.send('Application:APP-Close')
      }
    }
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
    .window-actions {
      opacity: 1.0;
      transition: $--fade-transition;
      list-style: none;
      padding: 0;
      margin: 0;
      z-index: 5100;
      > li {
        display: inline-block;
        padding: 3px 8px;
        margin: 0;
        color: #fff;
        &:hover {
          color: #1d2033;
          background-color: $--titlebar-actions-active-background;
        }
        &.win-close-btn:hover {
          color: $--titlebar-close-active-color;
          background-color: $--titlebar-close-active-background;
        }
      }
    }
    &:hover {
      .window-actions {
        opacity: 1;
      }
    }
  }
</style>
