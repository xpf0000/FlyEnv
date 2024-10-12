<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { CopyDocument } from '@element-plus/icons-vue'
  import { useEventListener } from '@vueuse/core'
  import { I18nT } from '@shared/lang'
  import { MessageSuccess } from '@/util/Element'

  const { clipboard } = require('@electron/remote')

  const event = ref<KeyboardEvent>()

  useEventListener(document, 'keydown', (e) => {
    event.value = e
  })

  const fields = computed(() => {
    if (!event.value) {
      return []
    }

    return [
      {
        label: 'Key :',
        value: event.value.key,
        placeholder: 'Key name...'
      },
      {
        label: 'Keycode :',
        value: String(event.value.keyCode),
        placeholder: 'Keycode...'
      },
      {
        label: 'Code :',
        value: event.value.code,
        placeholder: 'Code...'
      },
      {
        label: 'Location :',
        value: String(event.value.location),
        placeholder: 'Code...'
      },

      {
        label: 'Modifiers :',
        value: [
          event.value.metaKey && 'Meta',
          event.value.shiftKey && 'Shift',
          event.value.ctrlKey && 'Ctrl',
          event.value.altKey && 'Alt'
        ]
          .filter(Boolean)
          .join(' + '),
        placeholder: 'None'
      }
    ]
  })

  const copy = (v: string) => {
    clipboard.writeText(v)
    MessageSuccess(I18nT('base.success'))
  }
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('keycode-info.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-card class="mb-5">
          <div class="py-12 text-center">
            <div v-if="event" class="mb-2 text-3xl">
              {{ event.key }}
            </div>
            <span class="lh-1 op-70">
              Press the key on your keyboard you want to get info about this key
            </span>
          </div>
        </el-card>

        <template v-for="({ label, value, placeholder }, i) of fields" :key="i">
          <el-input :model-value="value" readonly :placeholder="placeholder" class="mb-1">
            <template #prepend>
              <span class="w-14">{{ label }}</span>
            </template>
            <template #suffix>
              <el-button link :icon="CopyDocument" @click.stop="copy(value)"></el-button>
            </template>
          </el-input>
        </template>
      </el-scrollbar>
    </div>
  </div>
</template>
