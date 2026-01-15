<template>
  <div class="h-full overflow-hidden">
    <el-scrollbar>
      <div class="p-3 flex flex-col gap-4">
        <el-card>
          <template #header>
            <span>本机许可证状态</span>
          </template>
          <template #default>
            <el-descriptions :column="1" :direction="'vertical'">
              <el-descriptions-item label="激活状态">
                <template v-if="store.isActive">
                  <el-result icon="success" :title="I18nT('licenses.licenseActivated')">
                  </el-result>
                </template>
                <template v-else>
                  <el-result icon="warning" :title="I18nT('licenses.licenseNoActivated')">
                  </el-result>
                </template>
              </el-descriptions-item>
              <el-descriptions-item label-align="left" :align="'center'" label="UUID">
                {{ store.uuid }}
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-card>
        <el-card>
          <template #header>
            <div class="w-full flex items-center justify-between">
              <span>我的许可证</span>
              <div class="flex gap-1">
                <div
                  v-if="!store.githubAuthing"
                  class="flex h-full aspect-square items-center justify-center"
                >
                  <yb-icon
                    class="hover:text-blue-400 cursor-pointer"
                    :svg="import('@/svg/github.svg?raw')"
                    width="20"
                    height="20"
                    @click.stop="store.githubAuthStart()"
                  />
                </div>
                <el-button v-else size="small" @click.stop="store.githubAuthCancel()">{{
                  I18nT('base.cancel')
                }}</el-button>
              </div>
            </div>
          </template>
          <template #default>
            <el-empty v-loading="store.githubAuthing" description="请先登录">
              <template #image>
                <yb-icon
                  class="text-blue-400 cursor-pointer hover:text-blue-400"
                  :svg="import('@/svg/github.svg?raw')"
                  @click.stop="store.githubAuthStart()"
                />
              </template>
              <template v-if="store.githubAuthing" #description>
                <span>GitHub授权登录中...</span>
              </template>
            </el-empty>
          </template>
        </el-card>
        <el-card>
          <template #header>
            <span>许可证说明</span>
          </template>
          <template #default>
            <div class="flex flex-col gap-2 items-start">
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
                <el-button
                  type="primary"
                  link
                  @click.stop="toUrl('https://flyenv.com/sponsor.html')"
                  >https://flyenv.com/sponsor.html</el-button
                >
              </p>
              <p>2. {{ I18nT('licenses.howToObtain.methods.1.title') }} </p>
              <p>
                {{ I18nT('licenses.howToObtain.methods.1.description') }}
                <el-button
                  type="primary"
                  link
                  @click.stop="toUrl('https://github.com/xpf0000/FlyEnv')"
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
                <el-button
                  :loading="store.fetching"
                  :disabled="store.fetching"
                  @click.stop="doRefresh"
                  >{{ I18nT('licenses.refreshButton') }}</el-button
                >
              </div>
            </div>
          </template>
        </el-card>
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
