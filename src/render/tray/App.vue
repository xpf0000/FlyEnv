<template>
  <VueSvg />
  <div class="tray-aside-inner">
    <ul class="top-tool">
      <li
        :class="{
          'non-draggable': true,
          'swith-power': true,
          on: groupIsRunning,
          disabled: groupDisabled
        }"
        @click="groupDo"
      >
        <yb-icon :svg="import('@/svg/switch.svg?raw')" width="24" height="24" />
      </li>
    </ul>
    <ul class="menu top-menu">
      <el-scrollbar>
        <template v-for="(item, _index) in allService" :key="_index">
          <li v-if="store[item.typeFlag] && store[item.typeFlag].show" class="non-draggable">
            <div class="left">
              <div class="icon-block" :class="{ run: store[item.typeFlag].run }">
                <yb-icon :svg="item.icon" width="30" height="30" />
              </div>
              <span class="title">{{
                typeof item.label === 'string' ? item.label : (item.label?.() ?? '')
              }}</span>
            </div>

            <el-switch
              v-model="store[item.typeFlag].run"
              :disabled="store[item.typeFlag]?.disabled"
              @change="switchChange(item.typeFlag)"
            >
            </el-switch>
          </li>
        </template>
      </el-scrollbar>
    </ul>
    <ul class="bottom-tool">
      <li @click="showMainWin"> {{ I18nT('tray.showMainWin') }} </li>
      <li @click="doExit"> {{ I18nT('tray.exit') }} </li>
    </ul>
  </div>
  <span class="popper-arrow" :style="{ left: left }"></span>
</template>

<script lang="ts" setup>
  import { computed, ref, Ref } from 'vue'
  import { AppStore } from './store/app'
  import IPC from '../util/IPC'
  import { AppModules } from '@/core/App'
  import { I18nT } from '@lang/index'
  import VueSvg from '@/components/VueSvgIcon/svg.vue'

  const allService = AppModules.filter((m) => m.isTray).map((m) => {
    return {
      typeFlag: m.typeFlag,
      label: m.label,
      icon: m.icon
    }
  })

  const store = AppStore()
  const groupIsRunning = computed(() => {
    return store.groupIsRunning
  })
  const groupDisabled = computed(() => {
    return store.groupDisabled
  })
  const left: Ref<string | null> = ref(null)
  IPC.on('APP:Poper-Left').then((key: string, res: any) => {
    console.log('APP:Poper-Left: ', key, res)
    left.value = `${res}px`
  })

  const groupDo = () => {
    if (groupDisabled?.value) {
      return
    }
    IPC.send('APP:Tray-Command', 'groupDo').then((key: string) => {
      IPC.off(key)
    })
  }

  const switchChange = (flag: string) => {
    IPC.send('APP:Tray-Command', 'switchChange', flag).then((key: string) => {
      IPC.off(key)
    })
  }

  const showMainWin = () => {
    IPC.send('application:show', 'index').then((key: string) => {
      IPC.off(key)
    })
  }

  const doExit = () => {
    IPC.send('application:exit').then((key: string) => {
      IPC.off(key)
    })
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault()
    }
  })
</script>

<style lang="scss">
  * {
    user-select: none !important;
  }

  html,
  body,
  #app {
    min-height: 100vh;
    min-width: 100vw;
    overflow: hidden;
    background: transparent !important;
  }
  #app {
    padding-top: 6px;

    .popper-arrow {
      position: absolute;
      left: calc(50% - 6px);
      top: 0;
      width: 12px;
      height: 12px;
      z-index: -1;

      &:before {
        position: absolute;
        width: 12px;
        height: 12px;
        z-index: -1;
        content: ' ';
        transform: rotate(45deg);
        box-sizing: border-box;
        right: 0;
        border-bottom-color: transparent !important;
        border-right-color: transparent !important;
        border-top-left-radius: 2px;
      }
    }
  }
  .tray-aside-inner {
    display: flex;
    height: 100vh;
    flex-flow: column;
    border-radius: 10px !important;
    overflow: hidden;

    > .top-tool {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 20px;
      height: 60px;
      list-style: none;
      flex-shrink: 0;
      > li {
        width: 30px;
        height: 30px;
        cursor: pointer;
        border-radius: 14px;
        transition: background-color 0.25s;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }

    .menu {
      width: 100%;
      padding: 0;
      margin: 0 auto;
      user-select: none;
      cursor: default;
      li {
        height: 45px;
        cursor: pointer;
        transition: background-color 0.25s;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 18px;
        .left {
          height: 100%;
          display: flex;
          align-items: center;
          gap: 10px;

          .icon-block {
            width: 30px;
            height: 45px;
            display: flex;
            align-items: center;
            justify-content: center;

            &.run {
              svg {
                color: #01cc74;
              }
            }
          }
          .title {
            font-size: 14px;
          }
        }
      }
      svg {
        padding: 6px;
      }
    }
    .top-menu {
      flex: 1;
      overflow: hidden;
    }

    > .bottom-tool {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      font-size: 14px;
      justify-content: space-between;
      padding: 0 24px 2px;
      height: 60px;

      > li {
        cursor: pointer;

        &:hover {
          color: #409eff;
        }
      }
    }
  }

  html.dark {
    #app {
      .popper-arrow {
        &:before {
          background: #32364a;
          border: 1px solid #32364a;
        }
      }
    }
    .tray-aside-inner {
      background: #32364a;
      > .top-tool {
        border-bottom: 1px solid #282b3d;
        > li {
          &:hover {
            background-color: rgba(255, 255, 255, 0.15);
          }
        }
      }

      .menu {
        li {
          &:hover {
            background: #474b60;
          }
        }
        svg {
          color: #fff;
        }
      }
      > .bottom-tool {
        border-top: 1px solid #282b3d;
      }
    }
  }
  html.light {
    --base-bg-color: #f4f5f6;
    --base-bg-color-2: rgba(51, 68, 85, 0.2);
    --base-bg-color-1: rgba(51, 68, 85, 0.15);

    body {
      background: var(--base-bg-color);
    }

    #app {
      .popper-arrow {
        &:before {
          background: var(--base-bg-color);
          border: 1px solid var(--base-bg-color);
        }
      }
    }
    .tray-aside-inner {
      background: var(--base-bg-color);

      > .top-tool {
        border-bottom: 1px solid var(--base-bg-color-1);
        > li {
          &:hover {
            background: var(--base-bg-color-2);
            backdrop-filter: blur(5px);
          }
        }
      }

      .menu {
        color: #345;

        li {
          &:hover {
            background: var(--base-bg-color-1);
          }
        }

        svg {
          color: #345;
        }
      }
      > .bottom-tool {
        border-top: 1px solid var(--base-bg-color-1);
      }
    }
  }
</style>
