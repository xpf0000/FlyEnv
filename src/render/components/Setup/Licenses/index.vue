<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <div v-if="!store.isActive" class="flex flex-col gap-2 items-start">
        <div class="text-xl">{{ I18nT('licenses.title') }}</div>
        <p>{{ I18nT('licenses.description') }}</p>
        <p>{{ I18nT('licenses.restrictions.title') }} </p>
        <p>1. {{ I18nT('licenses.restrictions.items.0') }}</p>
        <p>2. {{ I18nT('licenses.restrictions.items.1') }}</p>
        <p>3. {{ I18nT('licenses.restrictions.items.2') }}</p>
        <p>{{ I18nT('licenses.licenseInfo') }}</p>
        <div class="text-xl">{{ I18nT('licenses.howToObtain.title') }}</div>
        <p>{{ I18nT('licenses.howToObtain.description') }}</p>
        <p>1. {{ I18nT('licenses.howToObtain.methods.0.title') }} </p>
        <p>
          {{ I18nT('licenses.howToObtain.methods.0.description') }}
          <el-button type="primary" link @click.stop="toUrl('https://flyenv.com/sponsor.html')"
            >https://flyenv.com/sponsor.html</el-button
          >
        </p>
        <p>2. {{ I18nT('licenses.howToObtain.methods.1.title') }} </p>
        <p>
          {{ I18nT('licenses.howToObtain.methods.1.description') }}
          <el-button type="primary" link @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
            >https://github.com/xpf0000/FlyEnv</el-button
          ></p
        >
        <p> 3. {{ I18nT('licenses.howToObtain.methods.2.title') }} </p>
        <p>{{ I18nT('licenses.howToObtain.methods.2.description') }}</p>
        <p>{{ I18nT('licenses.submitInfo') }}</p>
        <el-form-item class="w-full mt-5 mb-1" label-position="top" label="UUID">
          <el-input v-model="store.uuid" readonly></el-input>
        </el-form-item>
        <el-form-item
          class="w-full mb-0"
          label-position="top"
          :label="I18nT('licenses.messageLabel')"
        >
          <el-input
            v-model="store.message"
            class="mt-4"
            type="textarea"
            resize="none"
            rows="6"
            :placeholder="I18nT('licenses.messagePlaceholder')"
          ></el-input>
        </el-form-item>
        <div class="mt-4">
          <el-button
            :loading="store.fetching"
            :disabled="store.fetching || !store.message.trim()"
            type="primary"
            @click.stop="doRequest"
            >{{ I18nT('licenses.requestButton') }}</el-button
          >
          <el-button :loading="store.fetching" :disabled="store.fetching" @click.stop="doRefresh">{{
            I18nT('licenses.refreshButton')
          }}</el-button>
        </div>
      </div>
      <div v-else class="h-full min-h-[80vh] flex items-center justify-center">
        <el-result icon="success" :title="I18nT('setup.licenseActivated')"> </el-result>
      </div>
    </el-scrollbar>
  </div>
</template>
<script lang="ts" setup>
  import { SetupStore } from '@/components/Setup/store'
  import { I18nT } from '@lang/index'
  import { shell } from '@/util/NodeFn'

  const store = SetupStore()

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
