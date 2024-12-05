<template>
  <div class="h-full">
    <div v-if="!store.isActive" class="flex flex-col gap-2 items-start">
      <template v-if="lang === 'zh'">
        <div class="text-xl">许可证获取方式</div>
        <p>以下几种方式任选其一即可</p>
        <p
          >1. 捐赠项目.
          <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
            >https://flyenv.com/sponsor.html</el-button
          >
        </p>
        <p
          >2. 参与项目开发. 提交Pull Request.
          <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
            >https://github.com/xpf0000/FlyEnv</el-button
          ></p
        >
        <p>3. 帮助推广项目. 发表文章,视频,博客,vlog,或者在各种评论中介绍FlyEnv</p>
        <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
          <el-input v-model="store.uuid" readonly></el-input>
        </el-form-item>
        <el-form-item class="w-full mb-0" label-position="top" label="消息">
          <el-input
            v-model="store.message"
            class="mt-4"
            type="textarea"
            resize="none"
            rows="6"
            placeholder="捐赠请提交捐赠人和捐赠金额.参与项目开发请提交PR链接.帮助推广项目,请提交链接"
          ></el-input>
        </el-form-item>
        <div class="mt-4">
          <el-button
            :loading="store.fetching"
            :disabled="store.fetching || !store.message.trim()"
            type="primary"
            @click.stop="doRequest"
            >请求许可证</el-button
          >
          <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh"
            >刷新状态</el-button
          >
        </div>
      </template>
      <template v-else>
        <div class="text-xl">License acquisition method</div>
        <p>Choose one of the following methods</p>
        <p
          >1. Sponsored Project.
          <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
            >https://flyenv.com/sponsor.html</el-button
          >
        </p>
        <p
          >2. Participate in project development Submit a Pull Request
          <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
            >https://github.com/xpf0000/FlyEnv</el-button
          ></p
        >
        <p
          >3. Assist in promoting the project. Publish articles, videos, blogs, vlogs, or introduce
          FlyEnv in various comments</p
        >
        <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
          <el-input v-model="store.uuid" readonly></el-input>
        </el-form-item>
        <el-form-item class="w-full mb-0" label-position="top" label="Message">
          <el-input
            v-model="store.message"
            type="textarea"
            resize="none"
            rows="6"
            placeholder="Please submit the sponsor and sponsorship amount for sponsorship Please submit a PR link to participate in project development Please submit the link to help promote the project"
          ></el-input>
        </el-form-item>
        <div class="mt-4">
          <el-button
            :loading="store.fetching"
            :disabled="store.fetching || !store.message.trim()"
            type="primary"
            @click.stop="doRequest"
            >Request License</el-button
          >
          <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh"
            >Refresh State</el-button
          >
        </div>
      </template>
    </div>
    <div v-else class="h-full flex items-center justify-center">
      <el-result icon="success" :title="I18nT('setup.licenseActivated')"> </el-result>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { AppStore } from '@/store/app'
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@shared/lang'

  const { shell } = require('@electron/remote')

  const store = SetupStore()
  const app = AppStore()
  const lang = computed(() => {
    return app.config.setup.lang
  })

  const toUrl = (url: string) => {
    shell.openExternal(url)
  }
  const doRequest = () => {
    store.postRequest()
  }
  const doRefresh = () => {
    store.refreshState()
  }
</script>
