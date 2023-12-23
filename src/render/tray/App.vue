<template>
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
      <li v-if="apache?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/apache.svg?raw')" width="30" height="30" />
          </div>
          <span class="title">Apache</span>
        </div>

        <el-switch
          :disabled="apache?.disabled"
          :value="apache?.run"
          @change="switchChange('apache')"
        >
        </el-switch>
      </li>
      <li v-if="nginx?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/nginx.svg?raw')" width="28" height="28" />
          </div>
          <span class="title">Nginx</span>
        </div>
        <el-switch :disabled="nginx?.disabled" :value="nginx?.run" @change="switchChange('nginx')">
        </el-switch>
      </li>
      <li v-if="php?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/php.svg?raw')" width="30" height="30" />
          </div>
          <span class="title">Php</span>
        </div>

        <el-switch
          :disabled="php?.disabled"
          :value="php?.run"
          @change="switchChange('php')"
        ></el-switch>
      </li>
      <li v-if="mysql?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/mysql.svg?raw')" width="30" height="30" />
          </div>
          <span class="title">Mysql</span>
        </div>

        <el-switch :disabled="mysql?.disabled" :value="mysql?.run" @change="switchChange('mysql')">
        </el-switch>
      </li>
      <li v-if="mariadb?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/mariaDB.svg?raw')" width="30" height="30" />
          </div>
          <span class="title">MariaDB</span>
        </div>

        <el-switch
          :disabled="mariadb?.disabled"
          :value="mariadb?.run"
          @change="switchChange('mariadb')"
        >
        </el-switch>
      </li>
      <li v-if="mongodb?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon
              style="padding: 5px"
              :svg="import('@/svg/MongoDB.svg?raw')"
              width="28"
              height="28"
            />
          </div>
          <span class="title">MongoDB</span>
        </div>

        <el-switch
          :disabled="mongodb?.disabled"
          :value="mongodb?.run"
          @change="switchChange('mongodb')"
        >
        </el-switch>
      </li>
      <li v-if="postgresql?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon
              style="padding: 6.5px"
              :svg="import('@/svg/postgresql.svg?raw')"
              width="28"
              height="28"
            />
          </div>
          <span class="title">PostgreSql</span>
        </div>

        <el-switch
          :disabled="postgresql?.disabled"
          :value="postgresql?.run"
          @change="switchChange('postgresql')"
        >
        </el-switch>
      </li>
      <li v-if="memcached?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon :svg="import('@/svg/memcached.svg?raw')" width="30" height="30" />
          </div>
          <span class="title">Memcached</span>
        </div>

        <el-switch
          :disabled="memcached?.disabled"
          :value="memcached?.run"
          @change="switchChange('memcached')"
        >
        </el-switch>
      </li>
      <li v-if="redis?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon
              style="padding: 7px"
              :svg="import('@/svg/redis.svg?raw')"
              width="28"
              height="28"
            />
          </div>
          <span class="title">Redis</span>
        </div>

        <el-switch :disabled="redis?.disabled" :value="redis?.run" @change="switchChange('redis')">
        </el-switch>
      </li>
      <li v-if="dns?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon
              style="padding: 5px"
              :svg="import('@/svg/dns2.svg?raw')"
              width="28"
              height="28"
            />
          </div>
          <span class="title">DNS Server</span>
        </div>

        <el-switch :disabled="dns?.running" :value="dns?.run" @change="switchChange('dns')">
        </el-switch>
      </li>
      <li v-if="ftp?.show" class="non-draggable">
        <div class="left">
          <div class="icon-block">
            <yb-icon
              style="padding: 5px"
              :svg="import('@/svg/ftp.svg?raw')"
              width="28"
              height="28"
            />
          </div>
          <span class="title">FTP</span>
        </div>

        <el-switch :disabled="ftp?.running" :value="ftp?.run" @change="switchChange('ftp')">
        </el-switch>
      </li>
    </ul>
    <ul class="bottom-tool">
      <li @click="showMainWin"> {{ $t('tray.showMainWin') }} </li>
      <li @click="doExit"> {{ $t('tray.exit') }} </li>
    </ul>
  </div>
  <span class="popper-arrow" :style="{ left: left }"></span>
</template>

<script lang="ts" setup>
  import { computed, ref, Ref } from 'vue'
  import { AppStore } from './store/app'
  import IPC from '../util/IPC'

  const store = AppStore()
  const password = computed(() => {
    return store.password
  })
  const php = computed(() => {
    return store.php
  })
  const nginx = computed(() => {
    return store.nginx
  })
  const apache = computed(() => {
    return store.apache
  })
  const mysql = computed(() => {
    return store.mysql
  })
  const mariadb = computed(() => {
    return store.mariadb
  })
  const memcached = computed(() => {
    return store.memcached
  })
  const redis = computed(() => {
    return store.redis
  })
  const mongodb = computed(() => {
    return store.mongodb
  })
  const dns = computed(() => {
    return store.dns
  })
  const ftp = computed(() => {
    return store.ftp
  })
  const postgresql = computed(() => {
    return store.postgresql
  })
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
    if (groupDisabled?.value || !password?.value) {
      return
    }
    IPC.send('APP:Tray-Command', 'groupDo').then((key: string) => {
      IPC.off(key)
    })
  }

  const switchChange = (flag: string) => {
    if (!password?.value) {
      return
    }
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
</script>

<style lang="scss">
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
        background: rgb(40, 43, 61);
        box-sizing: border-box;
        border: 1px solid rgb(40, 43, 61);
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
    background: rgb(40, 43, 61);
    border-radius: 10px !important;
    overflow: hidden;

    > .top-tool {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 26px 20px 12px 20px;
      list-style: none;
      border-bottom: 1px solid #242737;
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
        &:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }
      }
    }

    .menu {
      width: 100%;
      padding: 0;
      margin: 0 auto;
      user-select: none;
      cursor: default;
      > li {
        height: 45px;
        cursor: pointer;
        transition: background-color 0.25s;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 20px;
        .left {
          height: 100%;
          display: flex;
          align-items: center;
          .icon-block {
            width: 38px;
            height: 45px;
            display: flex;
            align-items: center;
          }
          .title {
            font-size: 14px;
          }
        }
      }
      svg {
        padding: 6px;
        color: #fff;
      }
    }
    .top-menu {
      flex: 1;
      overflow: auto;
    }

    > .bottom-tool {
      border-top: 1px solid #242737;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      font-size: 14px;
      justify-content: space-between;
      padding: 24px;

      > li {
        cursor: pointer;

        &:hover {
          color: #409eff;
        }
      }
    }
  }
</style>
