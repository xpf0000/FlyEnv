<template>
  <router-view />
  <AI v-if="showAI" />
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
  import AI from '@web/components/AI/index.vue'

  const appStore = AppStore()
  const lang = computed(() => {
    return appStore.config.setup.lang
  })

  const showAI = computed(() => {
    return appStore?.config?.setup?.showAIRobot ?? true
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
</style>
