<template>
  <div class="w-full h-full overflow-hidden flex gap-3 pt-3">
    <div
      class="overflow-hidden flex flex-col w-[220px] flex-shrink-0 px-[8px] py-[12px] bg-white dark:bg-slate-900 rounded-md"
    >
      <el-scrollbar class="flex-1 overflow-hidden">
        <div class="w-full flex flex-col gap-7">
          <div class="flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px]">{{ I18nT('tools.Group') }}</span>
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
                    'bg-gray-300 dark:bg-gray-700': item.id === currentGroupID,
                    'hover:bg-gray-200 dark:hover:bg-gray-800': item.id !== currentGroupID
                  }"
                  class="h-[32px] group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                  @click.stop="groupClick(item)"
                >
                  <div class="flex items-center gap-2 flex-1 overflow-hidden">
                    <Folder class="w-[16px] h-[16px]" />
                    <span class="text-[13px] truncate">{{ item.name }}</span>
                  </div>
                  <el-dropdown trigger="click">
                    <template #default>
                      <div class="h-full flex items-center justify-center flex-shrink-0">
                        <div
                          class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-600"
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
                        <el-dropdown-item
                          :icon="Top"
                          @click.stop="CodeLibrary.groupMoveToTop(item)"
                          >{{ I18nT('tools.MoveToTop') }}</el-dropdown-item
                        >
                        <el-dropdown-item
                          :icon="Delete"
                          @click.stop="CodeLibrary.delGroup(langType, item)"
                          >{{ I18nT('base.del') }}</el-dropdown-item
                        >
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </template>
          </div>
          <div class="flex flex-col">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px]">{{ I18nT('tools.Code') }}</span>
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
                    <div class="flex items-center gap-1 flex-1 overflow-hidden">
                      <el-checkbox
                        v-model="choosedItemID"
                        :value="item.id"
                        class="pointer-events-none"
                      ></el-checkbox>
                      <span class="text-[13px] truncate">{{ item.name }}</span>
                    </div>
                  </div>
                </template>
              </template>
              <template v-else>
                <template v-for="(item, _index) in codesNoGroup" :key="_index">
                  <div
                    :class="{
                      'bg-gray-300 dark:bg-gray-700': item.id === currentItem?.id,
                      'hover:bg-gray-200 dark:hover:bg-gray-800': item.id !== currentItem?.id
                    }"
                    class="h-[32px] group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
                    @click.stop="itemsClick(item)"
                  >
                    <div class="flex items-center gap-3 flex-1 overflow-hidden">
                      <span class="text-[13px] truncate">{{ item.name }}</span>
                    </div>
                    <el-dropdown trigger="click">
                      <template #default>
                        <div
                          class="h-full flex items-center justify-center flex-shrink-0"
                          @click.stop="emptyClick"
                        >
                          <div
                            class="hidden group-hover:flex items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-600"
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
                          <el-dropdown-item
                            :icon="Top"
                            @click.stop="CodeLibrary.itemMoveToTop(item)"
                            >{{ I18nT('tools.MoveToTop') }}</el-dropdown-item
                          >
                          <el-dropdown-item @click.stop="doChangeGroups(item)">
                            <div class="flex items-center gap-[7px]">
                              <yb-icon
                                :svg="import('@/svg/move-to.svg?raw')"
                                width="13"
                                height="13"
                              />
                              <span>{{ I18nT('tools.MoveToGroup') }}</span>
                            </div>
                          </el-dropdown-item>
                          <el-dropdown-item :icon="Delete" @click.stop="doDelItems(item)">{{
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
            <el-button
              size="small"
              :disabled="!choosedItemID.length"
              @click.stop="doChangeGroups(undefined)"
            >
              <yb-icon :svg="import('@/svg/move-to.svg?raw')" width="14" height="14" />
            </el-button>
            <el-button
              size="small"
              :disabled="!choosedItemID.length"
              style="margin-left: 0px"
              @click.stop="doDelItems(undefined)"
            >
              <Delete width="14" height="14" />
            </el-button>
          </div>
        </div>
      </template>
    </div>
    <div class="flex-1 overflow-hidden bg-white dark:bg-slate-900 p-4 rounded-md">
      <el-scrollbar>
        <template v-if="currentItem">
          <div class="vp-doc select-text pointer-events-auto" v-html="currentItemHTML"></div>
        </template>
        <template v-else-if="currentGroup">
          <GroupContent :lang-type="langType" />
        </template>
        <template v-else>
          <el-empty></el-empty>
        </template>
      </el-scrollbar>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { Delete, Edit, Folder, Plus, SetUp, Top } from '@element-plus/icons-vue'
  import CodeLibrary, { CodeLibraryItemType } from './setup'
  import Base from '@/core/Base'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { asyncComputed } from '@vueuse/core'
  import { md } from '@/util/NodeFn'
  import GroupContent from './groupContent.vue'

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

  const currentGroup = computed(() => {
    if (!CodeLibrary.groupID) {
      return undefined
    }
    return CodeLibrary.group.find((f) => f.id === CodeLibrary.groupID)
  })

  const currentItem = computed(() => {
    if (!CodeLibrary.itemID) {
      return undefined
    }
    return CodeLibrary.items.find((f) => f.id === CodeLibrary.itemID)
  })

  const currentItemHTML = asyncComputed(async () => {
    if (!currentItem.value) {
      return ''
    }
    const item: CodeLibraryItemType = currentItem.value
    let content = `# ${item.name}`
    if (item.comment) {
      content += `\n\n${item.comment}`
    }
    content += `\n\n## ${I18nT('tools.Code')}\n\n\`\`\`${item.fromType}\n${item.value}\n\`\`\``
    content += `\n\n## ${I18nT('tools.CodeResult')}\n\n\`\`\`${item.fromType}\n${item.toValue}\n\`\`\``

    return await md.render(content)
  })

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

  const groupClick = (item: any) => {
    CodeLibrary.groupID = item.id
    CodeLibrary.itemID = ''
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
    CodeLibrary.groupID = item.groupID
    CodeLibrary.itemID = item.id
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

  const doDelItems = (item?: any) => {
    Base._Confirm(I18nT('base.delAlertContent'), undefined, {
      customClass: 'confirm-del',
      type: 'warning'
    })
      .then(() => {
        if (item?.id) {
          CodeLibrary.items = CodeLibrary.items.filter((f) => f.id !== item.id)
        } else {
          CodeLibrary.items = CodeLibrary.items.filter((f) => !choosedItemID.value.includes(f.id))
          chooseMode.value = false
          choosedItemID.value.splice(0)
          chooseAll.value.splice(0)
        }
      })
      .catch(() => {})
  }

  let GroupChangedVM: any
  import('./groupChange.vue').then((res) => {
    GroupChangedVM = res.default
  })

  const doChangeGroups = (item?: any) => {
    AsyncComponentShow(GroupChangedVM, {
      langType: props.langType
    }).then((groupID: string) => {
      console.log('doChangeGroups groupID: ', groupID)
      if (!item?.id) {
        for (const id of choosedItemID.value) {
          const find = CodeLibrary.items.find((f) => f.id === id)
          if (find) {
            find.groupID = groupID
          }
        }
        chooseMode.value = false
        choosedItemID.value.splice(0)
        chooseAll.value.splice(0)
      } else {
        const find = CodeLibrary.items.find((f) => f.id === item.id)
        if (find) {
          find.groupID = groupID
        }
      }
    })
  }

  const emptyClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
</script>
