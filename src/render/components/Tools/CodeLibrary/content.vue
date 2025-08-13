<template>
  <div class="w-full overflow-hidden flex gap-3 py-3">
    <div class="overflow-hidden w-[200px] flex-shrink-0">
      <el-scrollbar>
        <div class="w-full flex flex-col gap-5">
          <el-button size="small" round :icon="Plus">
            {{ I18nT('base.add') }}
          </el-button>
          <div class="flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px]">分组</span>
              <el-button link :icon="Plus" @click.stop="addGroup"></el-button>
            </div>
            <template v-if="groups.length === 0">
              <el-empty :image-size="28"></el-empty>
            </template>
            <template v-else>
              <template v-for="(item, _index) in groups" :key="_index">
                <div
                  :class="{
                    'bg-gray-300': item.id === currentGroupID,
                    'hover:bg-gray-200': item.id !== currentGroupID
                  }"
                  class="h-[32px] group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                  @click.stop="currentGroupID = item.id"
                >
                  <div class="flex items-center gap-3">
                    <Folder class="w-[16px] h-[16px]" />
                    <span class="text-[13px]">{{ item.name }}</span>
                  </div>
                  <el-dropdown trigger="click">
                    <template #default>
                      <div class="h-full flex items-center justify-center">
                        <div
                          class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100"
                        >
                          <yb-icon :svg="import('@/svg/more1.svg?raw')" width="16" height="16" />
                        </div>
                      </div>
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item :icon="Edit">{{ I18nT('base.edit') }}</el-dropdown-item>
                        <el-dropdown-item :icon="Delete">{{ I18nT('base.del') }}</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </template>
          </div>
        </div>
      </el-scrollbar>
    </div>
    <div class="flex-1 overflow-hidden"></div>
  </div>
</template>
<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import { Plus, Folder, Edit, Delete } from '@element-plus/icons-vue'
  import CodeLibrary from './setup'
  import { ElMessageBox } from 'element-plus'
  import { uuid } from '@/util/Index'

  const props = defineProps<{
    langType: string
  }>()

  const groups = computed(() => {
    return CodeLibrary.group.filter((f) => f.type === props.langType)
  })

  const currentGroupID = computed({
    get() {
      return CodeLibrary.groupID
    },
    set(v: string) {
      CodeLibrary.groupID = v
    }
  })

  const addGroup = () => {
    ElMessageBox.prompt(I18nT('tools.GroupNameInput'), I18nT('tools.GroupName'), {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel')
    })
      .then(({ value }) => {
        if (!value.trim()) {
          return
        }
        const item = {
          id: uuid(),
          name: value,
          type: props.langType
        }
        CodeLibrary.group.unshift(item)
      })
      .catch()
  }
</script>
