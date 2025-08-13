<template>
  <div class="w-full h-full overflow-hidden flex gap-3 pt-3">
    <div
      class="overflow-hidden flex flex-col w-[200px] flex-shrink-0 px-[8px] py-[12px] bg-white rounded-md"
    >
      <el-scrollbar class="flex-1 overflow-hidden">
        <div class="w-full flex flex-col gap-7">
          <div class="flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px]">分组</span>
              <el-button
                link
                :icon="Plus"
                @click.stop="CodeLibrary.addGroup(langType, undefined)"
              ></el-button>
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
                  <div class="flex items-center gap-2 flex-1 overflow-hidden">
                    <Folder class="w-[16px] h-[16px]" />
                    <span class="text-[13px] truncate">{{ item.name }}</span>
                  </div>
                  <el-dropdown trigger="click">
                    <template #default>
                      <div class="h-full flex items-center justify-center flex-shrink-0">
                        <div
                          class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100"
                        >
                          <yb-icon :svg="import('@/svg/more1.svg?raw')" width="16" height="16" />
                        </div>
                      </div>
                    </template>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          :icon="Edit"
                          @click.stop="CodeLibrary.addGroup(langType, item)"
                          >{{ I18nT('base.edit') }}</el-dropdown-item
                        >
                        <el-dropdown-item :icon="Delete" @click.stop="doDelGroup(item)">{{
                          I18nT('base.del')
                        }}</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </template>
          </div>
          <div class="flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px]">代码</span>
              <el-button link :icon="Plus" @click.stop="addCode(undefined)"></el-button>
            </div>
            <template v-if="codesNoGroup.length === 0">
              <el-empty :image-size="28"></el-empty>
            </template>
            <template v-else>
              <template v-if="chooseMode">
                <template v-for="(item, _index) in codesNoGroup" :key="_index">
                  <div
                    class="h-[32px] hover:bg-gray-200 group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                    @click.stop="itemsClick(item)"
                  >
                    <div class="flex items-center gap-2 flex-1 overflow-hidden">
                      <el-checkbox v-model="choosedItemID" :value="item.id"></el-checkbox>
                      <span class="text-[13px] truncate">{{ item.name }}</span>
                    </div>
                  </div>
                </template>
              </template>
              <template v-else>
                <template v-for="(item, _index) in codesNoGroup" :key="_index">
                  <div
                    :class="{
                      'bg-gray-300': item.id === currentGroupID,
                      'hover:bg-gray-200': item.id !== currentGroupID
                    }"
                    class="h-[32px] group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                    @click.stop="itemsClick(item)"
                  >
                    <div class="flex items-center gap-3 flex-1 overflow-hidden">
                      <span class="text-[13px] truncate">{{ item.name }}</span>
                    </div>
                    <el-dropdown trigger="click">
                      <template #default>
                        <div class="h-full flex items-center justify-center flex-shrink-0">
                          <div
                            class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100"
                          >
                            <yb-icon :svg="import('@/svg/more1.svg?raw')" width="16" height="16" />
                          </div>
                        </div>
                      </template>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item :icon="SetUp" @click.stop="doBatchOperation(item)">{{
                            I18nT('tools.BatchOperations')
                          }}</el-dropdown-item>
                          <el-dropdown-item :icon="Edit" @click.stop="addCode(item)">{{
                            I18nT('base.edit')
                          }}</el-dropdown-item>
                          <el-dropdown-item :icon="Delete" @click.stop="doDelGroup(item)">{{
                            I18nT('base.del')
                          }}</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </template>
            </template>
          </div>
        </div>
      </el-scrollbar>
      <template v-if="chooseMode">
        <div class="pt-2 flex flex-col gap-2 border-t-[1px] border-solid border-slate-100">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <el-checkbox
                v-model="chooseAll"
                :value="true"
                :label="I18nT('tools.SelectAll')"
                @change="onChooseAllChanged"
              ></el-checkbox>
            </div>
            <el-button link @click.stop="exitChooseMode">{{ I18nT('base.cancel') }}</el-button>
          </div>
          <div class="flex items-center justify-between">
            <el-button size="small" :disabled="!choosedItemID.length">
              <yb-icon :svg="import('@/svg/move-to.svg?raw')" width="14" height="14" />
            </el-button>
            <el-button size="small" :disabled="!choosedItemID.length" style="margin-left: 0px">
              <Delete width="14" height="14" />
            </el-button>
          </div>
        </div>
      </template>
    </div>
    <div class="flex-1 overflow-hidden"></div>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { Plus, Folder, Edit, Delete, SetUp } from '@element-plus/icons-vue'
  import CodeLibrary from './setup'
  import { ElMessageBox } from 'element-plus'
  import { uuid } from '@/util/Index'
  import Base from '@/core/Base'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const props = defineProps<{
    langType: string
  }>()

  const groups = computed(() => {
    return CodeLibrary.group.filter((f) => f.type === props.langType)
  })

  const codesNoGroup = computed(() => {
    return CodeLibrary.items.filter((f) => f.fromType === props.langType && !f.groupID)
  })

  const currentGroupID = computed({
    get() {
      return CodeLibrary.groupID
    },
    set(v: string) {
      CodeLibrary.groupID = v
    }
  })

  const doDelGroup = (item: any) => {
    Base._Confirm(I18nT('tools.GroupDelTips'), I18nT('tools.GroupDelTitle'), {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        CodeLibrary.group = CodeLibrary.group.filter((f) => f.id !== item.id)
        CodeLibrary.items = CodeLibrary.items.filter((f) => f.groupID !== item.id)
        if (CodeLibrary.groupID === item.id) {
          if (groups.value.length > 0) {
            const group = groups.value[0]
            CodeLibrary.groupID = group.id
            CodeLibrary.itemID = ''
          }
        }
      })
      .catch(() => {})
  }

  let CodeAddVM: any
  import('./codeAdd.vue').then((res) => {
    CodeAddVM = res.default
  })

  const addCode = (item?: any) => {
    AsyncComponentShow(CodeAddVM, {
      langType: props.langType,
      item
    }).then()
  }

  const chooseAll = ref<boolean[]>([])
  const choosedItemID = ref<string[]>([])
  const chooseMode = ref(false)
  const doBatchOperation = (item: any) => {
    choosedItemID.value.push(item.id)
    chooseMode.value = true
  }

  const itemsClick = (item: any) => {
    if (chooseMode.value) {
      if (choosedItemID.value.includes(item.id)) {
        choosedItemID.value = choosedItemID.value.filter((f) => f !== item.id)
      } else {
        choosedItemID.value.push(item.id)
      }
      return
    }
  }

  const onChooseAllChanged = () => {
    const isAll = chooseAll.value.length > 0
    if (isAll) {
      choosedItemID.value = codesNoGroup.value.map((f) => f.id)
    } else {
      choosedItemID.value.splice(0)
    }
  }

  const exitChooseMode = () => {
    choosedItemID.value.splice(0)
    chooseMode.value = false
  }
</script>
