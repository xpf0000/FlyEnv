<template>
  <router-view />
  <div class="app-btns">
    <div class="a"></div>
    <div class="b"></div>
    <div class="c"></div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { AppStore } from './store/app'
  import { BrewStore } from './store/brew'
  import { I18nT } from '@shared/lang'

  const appStore = AppStore()
  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  watch(
    lang,
    (val) => {
      const body = document.body
      body.className = `lang-${val}`
    },
    {
      immediate: true
    }
  )

  const brewStore = BrewStore()
  brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
</script>

<style lang="scss">
  html,
  body,
  #app {
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
  }

  body {
    background: #fff;
  }

  #app {
    border-radius: 10px;
  }

  .app-btns {
    position: fixed;
    left: 5px;
    top: 0;
    height: 40px;
    display: flex;
    align-items: center;
    z-index: 999999;

    > div {
      width: 11.5px;
      height: 11.5px;
      border-radius: 10px;
      margin-left: 9px;

      &.a {
        background: #f56c6c;
      }
      &.b {
        background: #e6a23c;
      }
      &.c {
        background: #67c23a;
      }
    }
  }

  .el-drawer {
    background: #1d2033 !important;
    background-color: #1d2033 !important;

    .el-drawer__body {
      background: #1d2033 !important;
      padding: 0 !important;
    }
  }

  .el-table .cell {
    padding: 0 12px;
    line-height: 2.3;
  }

  .version-error-tips {
    max-width: 50vw !important;
    font-size: 14px !important;
  }

  .soft-index-panel {
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
      overflow: hidden;
    }
  }

  .ssl-make {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      input.input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .el-select {
        &.error {
          .el-input__wrapper {
            border: 1px solid #cc5441;
          }
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 20px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 200px;
          margin-top: 20px;
        }
        &.error {
          border: 2px solid #cc5441;
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 50px;
            margin-right: 30px;
            flex-shrink: 0;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }

  body.lang-en {
    .apache-service {
      .left-title {
        width: 110px;
      }
    }

    .nodejs-versions {
      .left-title {
        width: 110px;
      }
    }
  }

  .cli-to-html {
    word-wrap: break-word;
    white-space: pre-wrap;
    user-select: text;
  }

  .host-list-poper {
    background: #32364a !important;
    border: none !important;
    color: #fff !important;
    padding: 0 !important;
    width: auto !important;
  }

  .host-list-menu {
    display: flex;
    flex-direction: column;
    background: #3f4358;
    user-select: none;
    > li {
      display: flex;
      align-items: center;
      padding: 8px 15px;
      cursor: pointer;
      .el-dropdown {
        color: #fff;
      }
      &:hover {
        background: rgb(79, 82, 105);
      }
    }
  }

  .host-edit {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }
    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: auto;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      &::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .input {
        background: transparent;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 42px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border-bottom: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border-bottom: 2px solid #01cc74;
        }
        &.error {
          border-bottom: 2px solid #cc5441;
        }
      }
      .input-textarea {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.7);
        outline: none;
        height: 120px;
        color: #fff;
        margin-top: 40px;
        border-radius: 8px;
        padding: 10px;
        resize: none;
        line-height: 1.6;
        &::-webkit-input-placeholder {
          color: rgba(255, 255, 255, 0.7);
        }
        &:hover {
          border: 2px solid rgba(255, 255, 255, 0.7);
        }
        &:focus {
          border: 2px solid #01cc74;
        }
        &.nginx-rewrite {
          height: 140px;
          margin-top: 20px;
          padding: 0;
          overflow: hidden;
        }
      }
      .el-select {
        &.error {
          .el-input__wrapper {
            box-shadow: 0 0 0 1px #cc5441 inset;
          }
        }
      }
      .main {
        background: #32364a;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        .path-choose {
          display: flex;
          align-items: flex-end;
          .input {
            flex: 1;
          }
          .icon-block {
            margin-left: 30px;
            display: flex;
            .choose {
              color: #01cc74;
            }
          }
        }
        .park {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 15px;

          .title {
            display: flex;
            align-items: center;
            margin-right: 20px;
          }
        }
        .ssl-switch {
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .port-set {
          display: flex;
          align-items: flex-end;
          .port-type {
            width: 70px;
            margin-right: 30px;
            flex-shrink: 0;
            display: flex;
            align-items: baseline;
          }
          .input {
            flex: 1;
            &::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
            &::-webkit-inner-spin-button {
              -webkit-appearance: none !important;
              margin: 0;
            }
          }
          &.port-ssl {
            .input {
              margin-right: 48px;
            }
          }
        }
      }
      .plant-title {
        padding: 22px 24px;
        font-size: 15px;
        font-weight: 600;
      }
    }
  }

  .module-config {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    padding: 5px 0 0 0;
    .block {
      width: 100%;
      flex: 1;
      overflow: hidden;
    }
    .tool {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 30px 0 0;
    }
  }
</style>
