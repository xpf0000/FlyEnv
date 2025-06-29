<template>
  <div class="setup-common editor-config">
    <div class="main proxy-set">
      <el-form label-width="130px" label-position="left" @submit.prevent>
        <el-form-item :label="$t('base.theme')">
          <el-radio-group v-model="editorConfig.theme">
            <el-radio-button label="vs-dark" value="vs-dark" />
            <el-radio-button label="vs-light" value="vs-light" />
            <el-radio-button label="hc-black" value="hc-black" />
            <el-radio-button label="hc-light" value="hc-light" />
            <el-radio-button label="auto" value="auto">{{ $t('util.auto') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="$t('util.fontSize')">
          <el-input v-model.number="editorConfig.fontSize" type="number"></el-input>
        </el-form-item>
        <el-form-item :label="$t('util.lineHeight')">
          <el-input v-model.number="editorConfig.lineHeight" type="number"></el-input>
        </el-form-item>
      </el-form>
    </div>
    <div ref="wapper" class="editor-wapper"></div>
  </div>
</template>

<script lang="ts" setup>
  import { AppStore } from '@/store/app'
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMap } from '@/components/Setup/EditorConfig/store'
  import { EditorCreate, EditorDestroy } from '@/util/Editor'
  import { join } from '@/util/path-browserify'
  import { fs, nativeTheme } from '@/util/NodeFn'
  import { asyncComputed } from '@vueuse/core'

  const wapper = ref()
  const appStore = AppStore()
  const editorConfig = computed({
    get() {
      return appStore.editorConfig
    },
    set() {}
  })
  let monacoInstance: editor.IStandaloneCodeEditor | undefined

  const index = ref(1)

  const currentTheme = asyncComputed(async () => {
    if (index.value < 0) {
      return 'vs-light'
    }
    let theme = editorConfig.value.theme
    if (theme === 'auto') {
      let appTheme = appStore?.config?.setup?.theme
      if (!appTheme || appTheme === 'system') {
        appTheme = (await nativeTheme.shouldUseDarkColors()) ? 'dark' : 'light'
      }
      if (appTheme === 'light') {
        theme = 'vs-light'
      } else {
        theme = 'vs-dark'
      }
    }
    return theme
  })

  const initEditor = () => {
    monacoInstance = EditorCreate(wapper.value, {
      value: EditorConfigMap.text,
      language: 'ini',
      scrollBeyondLastLine: false,
      overviewRulerBorder: true,
      automaticLayout: true,
      theme: currentTheme.value,
      fontSize: editorConfig.value.fontSize,
      lineHeight: editorConfig.value.lineHeight
    })
  }

  onMounted(() => {
    if (!EditorConfigMap.text) {
      fs.readFile(join(window.Server.Static!, 'tmpl/httpd.conf')).then((text: string) => {
        EditorConfigMap.text = text
        initEditor()
      })
    } else {
      initEditor()
    }
  })

  onUnmounted(() => {
    EditorDestroy(monacoInstance)
    console.log('EditorConfig onUnmounted !!!')
    nativeTheme.removeListener('updated', onNativeThemeUpdate)
  })

  watch(
    editorConfig,
    () => {
      nextTick().then(() => {
        console.log('watching editor config: ', currentTheme.value)
        monacoInstance?.updateOptions({
          theme: currentTheme.value,
          fontSize: editorConfig.value.fontSize,
          lineHeight: editorConfig.value.lineHeight
        })
        appStore.saveConfig()
      })
    },
    {
      deep: true
    }
  )

  const onNativeThemeUpdate = () => {
    index.value += 1
    nextTick().then(() => {
      monacoInstance?.updateOptions({
        theme: currentTheme.value,
        fontSize: editorConfig.value.fontSize,
        lineHeight: editorConfig.value.lineHeight
      })
    })
  }

  nativeTheme.on('updated', onNativeThemeUpdate)
</script>
