<template>
  <div ref="wapper" class="relative overflow-hidden">
    <el-radio-group v-model="model" :size="size">
      <template v-for="(item, _index) in data" :key="_index">
        <template v-if="!hide.some((h) => h.value === item.value)">
          <el-radio-button
            :label="item.label"
            :value="item.value"
            @click.stop="onButtonClick(item.value)"
          ></el-radio-button>
        </template>
      </template>
      <template v-if="showMore">
        <el-dropdown>
          <template #default>
            <el-button
              :type="isInHide ? 'primary' : null"
              :size="size"
              style="border-left-color: transparent !important"
              :icon="More"
            ></el-button>
          </template>
          <template #dropdown>
            <el-dropdown-menu>
              <template v-for="(h, _j) in hide" :key="_j">
                <el-dropdown-item @click.stop="doChoose(h.value)">
                  <el-button link :type="h.value === model ? 'primary' : null">{{
                    h.label
                  }}</el-button>
                </el-dropdown-item>
              </template>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-radio-group>
    <div ref="shadown" class="absolute top-[-100px] left-0 right-0 inline">
      <el-radio-group :size="size" class="flex-nowrap">
        <template v-for="(item, _index) in data" :key="_index">
          <el-radio-button :label="item.label" :value="item.value"></el-radio-button>
        </template>
        <el-button
          :size="size"
          style="border-left-color: transparent !important"
          :icon="More"
        ></el-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { More } from '@element-plus/icons-vue'

  type Item = {
    label: string
    value: any
  }

  const model = defineModel()
  const emit = defineEmits(['buttonClick'])
  const props = defineProps<{
    size?: 'large' | 'small'
    data: Item[]
  }>()

  const shadown = ref<HTMLElement>()
  const wapper = ref<HTMLElement>()
  const hide = ref<Item[]>([])

  const showMore = computed(() => {
    return hide.value.length > 0
  })

  const isInHide = computed(() => {
    return hide.value.some((h) => h.value === model.value)
  })

  const doChoose = (value: any) => {
    model.value = value
    emit('buttonClick', value)
  }

  const onButtonClick = (value: any) => {
    emit('buttonClick', value)
  }

  const handleHeight = () => {
    console.log('handleHeight !!!')
    const dom = wapper.value
    if (!dom) {
      return
    }
    const rect = dom.getBoundingClientRect()
    const wapperWidth = rect.width

    const sdom = shadown.value!.querySelector('.el-radio-group')!
    const srect = sdom.getBoundingClientRect()
    const sdomWidth = srect.width

    const btn = sdom.querySelector('button.el-button')!
    const btnRect = btn.getBoundingClientRect()
    const btnWidth = btnRect.width

    const radiosBtn = sdom.querySelectorAll('.el-radio-button')
    const radiosWidth: number[] = []
    radiosBtn.forEach((d) => {
      const r = d.getBoundingClientRect()
      radiosWidth.push(r.width)
    })

    hide.value.splice(0)

    if (wapperWidth >= sdomWidth - btnWidth) {
      return
    }

    let warr = radiosWidth.reverse()
    let darr = [...props.data].reverse()

    let width = sdomWidth
    for (const w of warr) {
      width -= w
      const d = darr.shift()
      hide.value.unshift(d!)
      if (width <= wapperWidth) {
        return
      }
    }
  }
  let observer: ResizeObserver | undefined

  onMounted(() => {
    observer = new ResizeObserver(handleHeight)
    observer.observe(shadown.value!)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = undefined
  })
</script>
