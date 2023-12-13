<template>
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
</template>

<script lang="ts">
  import { defineComponent, nextTick } from 'vue'
  import { AppStore } from '../../../store/app'
  import { AppI18n } from '@shared/lang'
  export default defineComponent({
    components: {},
    props: {},
    data() {
      return {
        langs: {
          en: 'English',
          zh: '中文'
        },
        running: false
      }
    },
    computed: {
      appLang: {
        get() {
          return AppStore().config.setup.lang
        },
        set(v: string) {
          this.running = true
          AppStore().config.setup.lang = v
          AppI18n(v)
          nextTick().then(() => {
            this.running = false
          })
        }
      }
    },
    created: function () {},
    methods: {}
  })
</script>
