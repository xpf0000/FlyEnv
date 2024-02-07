<template>
  <div class="setup-common editor-config">
    <div class="main proxy-set">
      <el-form label-width="130px" label-position="left" @submit.prevent>
        <el-form-item :label="$t(' util.theme')">
          <el-radio-group v-model="editorConfig.theme">
            <el-radio-button label="vs-dark" />
            <el-radio-button label="vs-light" />
            <el-radio-button label="hc-black" />
            <el-radio-button label="hc-light" />
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
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
  import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'
  import { EditorConfigMap } from '@/components/Setup/EditorConfig/store'

  const { readFile } = require('fs-extra')
  const { join } = require('path')

  const wapper = ref()
  const appStore = AppStore()
  const editorConfig = computed({
    get() {
      return appStore.editorConfig
    },
    set() {}
  })
  let monacoInstance: editor.IStandaloneCodeEditor | null = null

  const initEditor = () => {
    monacoInstance = editor.create(wapper.value, {
      value: EditorConfigMap.text,
      language: 'ini',
      scrollBeyondLastLine: false,
      overviewRulerBorder: true,
      automaticLayout: true,
      theme: editorConfig.value.theme,
      fontSize: editorConfig.value.fontSize,
      lineHeight: editorConfig.value.lineHeight
    })
  }

  onMounted(() => {
    if (!EditorConfigMap.text) {
      readFile(join(global.Server.Static, 'tmpl/httpd.conf'), 'utf-8').then((text: string) => {
        EditorConfigMap.text = text
        initEditor()
      })
    } else {
      initEditor()
    }
  })

  onUnmounted(() => {
    monacoInstance?.dispose()
    monacoInstance = null
  })

  watch(
    editorConfig,
    () => {
      monacoInstance?.updateOptions({
        theme: editorConfig.value.theme,
        fontSize: editorConfig.value.fontSize,
        lineHeight: editorConfig.value.lineHeight
      })
      appStore.saveConfig()
    },
    {
      deep: true
    }
  )
</script>
