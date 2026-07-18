<template>
  <div class="plant-title flex items-center gap-1">
    <span>{{ I18nT('base.lang') }}</span>
    <div class="w-7 flex items-center justify-center">
      <template v-if="LangSetup.loading">
        <el-button :loading="true" link></el-button>
      </template>
      <template v-else>
        <el-tooltip :placement="'top'" :show-after="600" :content="I18nT('setup.langTips')">
          <el-button link @click.stop="LangSetup.doLoad()">
            <Refresh class="w-4 h-4" />
          </el-button>
        </el-tooltip>
      </template>
    </div>
    <el-tooltip :placement="'top'" :show-after="600" :content="I18nT('setup.openLangDir')">
      <el-button link @click.stop="LangSetup.openLangDir(appLang)">
        <FolderOpened class="w-4 h-4" />
      </el-button>
    </el-tooltip>
  </div>
  <div class="main brew-src">
    <el-select
      :model-value="appLang"
      @change="onLanguageChange"
      :loading="running"
      :disabled="running"
      :placeholder="$t('base.changeLang')"
    >
      <template v-for="(item, _index) in langList" :key="_index">
        <el-option :label="item.label" :value="item.value"></el-option>
      </template>
      <template v-for="(item, _index) in otherLang" :key="_index">
        <el-option :label="item.label" :value="item.lang"></el-option>
      </template>
    </el-select>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import { Refresh, FolderOpened } from '@element-plus/icons-vue'
  import { AppStore } from '@/store/app'
  import { AppAllLang, I18nT } from '@lang/index'
  import { LangSetup } from '@/components/Setup/LangSet/setup'
  import { CustomerLangs } from '@lang/customer'
  import { RendererLanguage } from '@/core/LanguageService'
  import { MessageError } from '@/util/Element'

  const appStore = AppStore()
  const running = ref(false)
  const appLang = computed(() => appStore.config.setup.lang)

  onMounted(() => {
    LangSetup.doLoad().catch((error) => MessageError(String(error)))
  })

  const onLanguageChange = async (locale: string) => {
    if (running.value || locale === appLang.value) return
    running.value = true
    try {
      const committedLocale = await RendererLanguage.switchLocale(locale)
      appStore.config.setup.lang = committedLocale
    } catch (error) {
      MessageError(String(error))
    } finally {
      running.value = false
    }
  }

  const langList = computed(() => {
    const all = Object.keys(AppAllLang).sort()
    return all.map((item) => {
      return {
        value: item,
        label: `${item} - ${AppAllLang[item]}`
      }
    })
  })

  const otherLang = computed(() => {
    return CustomerLangs.filter((c) => !Object.keys(AppAllLang).includes(c.lang))
  })
</script>
