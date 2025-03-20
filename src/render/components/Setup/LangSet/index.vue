<template>
  <div class="plant-title">{{ I18nT('base.lang') }}</div>
  <div class="main brew-src">
    <el-select
      v-model="appLang"
      :loading="running"
      :disabled="running"
      :placeholder="$t('base.changeLang')"
    >
      <template v-for="(label, value) in AppAllLang" :key="value">
        <el-option :label="label" :value="value"></el-option>
      </template>
    </el-select>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref } from 'vue'
  import { AppStore } from '@/store/app'
  import { AppAllLang, AppI18n, I18nT } from '@lang/index'

  const appStore = AppStore()
  const running = ref(false)
  const appLang = computed({
    get() {
      return appStore.config.setup.lang
    },
    set(v: string) {
      running.value = true
      AppStore().config.setup.lang = v
      AppI18n(v)
      AppStore().saveConfig()
      nextTick().then(() => {
        running.value = false
      })
    }
  })
</script>
