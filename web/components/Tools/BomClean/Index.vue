<template>
  <div class="host-edit">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
        <span class="ml-15">UTF8-Bom Clean</span>
      </div>
      <template v-if="data.end">
        <el-button type="primary" class="shrink0" @click="doEnd">{{ $t('util.ok') }}</el-button>
      </template>
      <template v-else>
        <el-button
          type="primary"
          class="shrink0"
          :disabled="files.length === 0 || data.running"
          :loading="data.running"
          @click="doClean"
          >{{ $t('util.clean') }}</el-button
        >
      </template>
    </div>

    <div v-loading="data.loading" class="main-wapper">
      <div class="main">
        <div class="path-choose mt-20 mb-20">
          <input
            type="text"
            class="input"
            readonly="readonly"
            placeholder="choose dir or file"
            :value="data.path"
          />
          <div class="icon-block" @click.stop="chooseDir">
            <yb-icon :svg="import('@/svg/folder.svg?raw')" class="choose" width="18" height="18" />
          </div>
        </div>
        <textarea
          v-model.trim="data.exclude"
          :disabled="data.running ? 'disabled' : null"
          :readonly="data.running ? 'readonly' : null"
          type="text"
          class="input-textarea"
          placeholder="exclude eg: node_modules, One exclude string per line"
        ></textarea>
        <div class="block">
          <div class="mt-20"> File Type </div>
          <div class="mt-20">
            <el-checkbox-group v-model="data.allowExt" :disabled="data.running">
              <template v-for="(item, i) in data.allExt" :key="i">
                <el-checkbox :label="item.ext">{{ item.ext }}({{ item.count }})</el-checkbox>
              </template>
            </el-checkbox-group>
          </div>
        </div>
        <template v-if="!data.running">
          <el-progress class="mt-20" :text-inside="true" :stroke-width="20" :percentage="0">
            <span>0 / {{ files.length }}</span>
          </el-progress>
        </template>
        <template v-else>
          <el-progress
            class="mt-20"
            :text-inside="true"
            :stroke-width="20"
            :percentage="currentProgress"
          >
            <span>{{ data.progress.finish }} / {{ data.progress.count }}</span>
          </el-progress>
        </template>
        <template v-if="data.end">
          <div class="mt-30">Result</div>
          <div style="margin-top: 15px">
            <span>total file: </span><span>{{ data.progress.count }}</span>
          </div>
          <div style="margin-top: 15px">
            <span>checked file: </span><span>{{ data.progress.finish }}</span>
          </div>
          <div style="margin-top: 15px; color: #67c23a">
            <template v-if="data.progress.successTask.length > 0">
              <el-popover placement="left" popper-class="bom-clean-popper">
                <template #reference>
                  <span>clean success: {{ data.progress.success }}</span>
                </template>
                <template #default>
                  <ul>
                    <template v-for="(item, i) in data.progress.successTask" :key="i">
                      <li>{{ item.path }}</li>
                    </template>
                  </ul>
                </template>
              </el-popover>
            </template>
            <template v-else>
              <span>clean success: {{ data.progress.success }}</span>
            </template>
          </div>
          <div style="margin-top: 15px; color: #f56c6c">
            <template v-if="data.progress.failTask.length > 0">
              <el-popover placement="left" popper-class="bom-clean-popper">
                <template #reference>
                  <span>clean fail: {{ data.progress.fail }}</span>
                </template>
                <template #default>
                  <ul>
                    <template v-for="(item, i) in data.progress.failTask" :key="i">
                      <li>{{ item.path }}: {{ item.msg }}</li>
                    </template>
                  </ul>
                </template>
              </el-popover>
            </template>
            <template v-else>
              <span>clean fail: {{ data.progress.fail }}</span>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, watch } from 'vue'
  import store, { Ext } from './store'
  import { waitTime } from '../../../fn'

  const emit = defineEmits(['doClose'])
  const data = computed(() => {
    return store.value
  })
  const allExt = computed(() => {
    const exts: { [key: string]: number } = {}
    const arr: Array<Ext> = []
    for (const ext in exts) {
      arr.push({
        ext,
        count: exts[ext]
      })
    }
    return arr
  })
  const files = computed(() => {
    const exclude = store.value.exclude.split('\n').filter((e) => e.trim().length > 0)
    return store.value.files.filter((f) => {
      return exclude.length === 0 || exclude.every((e) => !f.includes(e))
    })
  })
  const currentProgress = computed(() => {
    const progress = store.value.progress
    return Math.floor((progress.finish / progress.count) * 100.0)
  })
  const doClose = () => {
    emit('doClose')
  }
  const chooseDir = () => {}
  const doClean = () => {
    store.value.running = true
    waitTime().then(() => {
      store.value.end = true
    })
  }
  const doEnd = () => {
    store.value.path = ''
    store.value.files.splice(0)
    store.value.allExt.splice(0)
    store.value.allowExt.splice(0)
    store.value.exclude = `.idea
.git
.svn
.vscode
node_modules`
    store.value.progress = reactive({
      count: 0,
      finish: 0,
      fail: 0,
      failTask: [],
      success: 0,
      successTask: []
    })
    store.value.running = false
    store.value.end = false
  }
  watch(allExt, (v) => {
    store.value.allExt = v
    store.value.allowExt = reactive(
      v.map((e) => {
        return e.ext
      })
    )
  })
</script>
