<template>
  <div class="tool-timestamp tools host-edit">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('util.toolTimestamp') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <div class="path-choose my-5" style="flex-direction: column; align-items: center">
          <span>Current Unix Timestamp</span>
          <span
            class="ml-7 current my-5"
            style="font-size: 50px"
            @dblclick.stop="doCopy(current)"
            >{{ current }}</span
          >
        </div>
        <div
          style="align-items: center"
          class="path-choose my-5 flex items-center justify-between gap-5 md:gap-6 xl:gap-16"
        >
          <div class="left max-w-[345px]">
            <el-input v-model="timestamp0" placeholder="Unix Timestamp"></el-input>
            <el-select v-model="flag0" class="w-32 max-w-32">
              <el-option :value="0" :label="I18nT('base.second')"></el-option>
              <el-option :value="1" :label="I18nT('base.millisecond')"></el-option>
            </el-select>
          </div>
          <yb-icon
            :svg="import('@/svg/back.svg?raw')"
            width="24"
            height="24"
            style="transform: rotate(180deg); flex-shrink: 0"
          />
          <div class="right max-w-[345px]">
            <el-input :value="datetime0" readonly placeholder="Date time string"></el-input>
          </div>
        </div>
        <div
          style="align-items: center"
          class="path-choose my-5 flex items-center justify-between gap-5 md:gap-6 xl:gap-16"
        >
          <div class="left max-w-[345px]">
            <el-date-picker
              v-model="timestamp1"
              style="--el-date-editor-width: 100%"
              class="w-full"
              type="datetime"
              value-format="x"
              placeholder="Date time"
            />
          </div>
          <yb-icon
            :svg="import('@/svg/back.svg?raw')"
            width="24"
            height="24"
            style="transform: rotate(180deg); flex-shrink: 0"
          />
          <div class="right max-w-[345px]">
            <el-input v-model="timestamp1str" readonly placeholder="Unix Timestamp"></el-input>
            <el-select v-model="flag1" class="w-32 max-w-32">
              <el-option :value="0" :label="I18nT('base.second')"></el-option>
              <el-option :value="1" :label="I18nT('base.millisecond')"></el-option>
            </el-select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { MessageSuccess } from '@/util/Element'
  import { I18nT } from '@lang/index'
  import { clipboard } from '@/util/NodeFn'

  // Reactive data
  const current = ref(0)
  const flag0 = ref(0) // 0: seconds, 1: milliseconds
  const flag1 = ref(0) // 0: seconds, 1: milliseconds
  const timestamp0 = ref<string | null>(null)
  const timestamp1 = ref<string | null>(null)
  const timer = ref<number | null>(null)

  // Computed properties
  const datetime0 = computed(() => {
    if (!timestamp0.value) return ''

    let t = parseInt(timestamp0.value)
    if (isNaN(t)) return ''

    if (flag0.value === 0) {
      t = t * 1000
    }

    const unixTimestamp = new Date(t)
    return unixTimestamp.toLocaleString()
  })

  const timestamp1str = computed(() => {
    if (timestamp1.value === null) return ''

    let t = parseInt(timestamp1.value)
    if (isNaN(t)) return ''

    if (flag1.value === 0) {
      t = Math.floor(t / 1000)
    }

    return t.toString()
  })

  // Methods
  const getCurrent = () => {
    current.value = Math.round(Date.now() / 1000)
  }

  const doCopy = (str: string | number) => {
    clipboard.writeText(`${str}`)
    MessageSuccess(I18nT('base.copySuccess'))
  }

  // Lifecycle hooks
  onMounted(() => {
    getCurrent()
    timer.value = window.setInterval(getCurrent, 1000)
  })

  onUnmounted(() => {
    if (timer.value) {
      clearInterval(timer.value)
    }
    console.log('timestamp destroyed !!!!!')
  })
</script>
