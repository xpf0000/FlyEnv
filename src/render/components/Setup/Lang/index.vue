<template>
  <el-form-item :label="$t('base.lang')" label-position="left" label-width="110">
    <el-radio-group v-model="appLang">
      <template v-for="(label, value) in langs" :key="value">
        <el-radio :value="value">{{ label }}</el-radio>
      </template>
    </el-radio-group>
  </el-form-item>

  <!-- <div class="plant-title">{{ $t('base.lang') }}</div>
  <div class="main brew-src">
    <el-select
      v-model="appLang"
      :loading="running"
      :disabled="running"
      :placeholder="$t('base.changeLang')"
    >
      <template v-for="(label, value) in langs" :key="value">
        <el-option :label="label" :value="value"></el-option>
      </template>
    </el-select>
  </div> -->
</template>

<script lang="ts" setup>
  import { computed, ref, watch, nextTick } from 'vue'
  import { AppStore } from '@/store/app'
  import { AppI18n } from '@shared/lang'

  const store: any = AppStore()

  watch(
    () => store.config.setup.lang,
    () => {
      store.saveConfig()
    },
    { deep: true }
  )

  const langs = ref({
    en: 'English',
    zh: '中文'
  })
  const running = ref(false)

  const appLang = computed({
    get() {
      return store.config.setup.lang
    },
    set: (v) => {
      running.value = true
      store.config.setup.lang = v
      AppI18n(v)
      nextTick().then(() => {
        running.value = false
      })
    }
  })
</script>
