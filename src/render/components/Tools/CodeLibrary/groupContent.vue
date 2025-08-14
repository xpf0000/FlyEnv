<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-2">
        <Folder class="w-[20px] h-[20px]" />
        <span class="text-[22px] font-bold truncate">{{ currentGroup?.name }}</span>
      </div>
      <div class="flex items-center gap-2">
        <el-input
          v-model="search"
          size="small"
          :placeholder="I18nT('base.placeholderSearch')"
          clearable
          :prefix-icon="Search"
        ></el-input>
        <el-button link :icon="Plus" @click.stop="addCode(undefined)"></el-button>
        <el-dropdown trigger="click">
          <template #default>
            <div class="h-full flex items-center justify-center flex-shrink-0">
              <div
                class="items-center justify-center py-[2px] px-[2px] rounded-sm hover:bg-slate-100 dark:hover:bg-slate-600"
              >
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="16" height="16" />
              </div>
            </div>
          </template>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :icon="SetUp" @click.stop="doBatchOperation()">{{
                I18nT('tools.BatchOperations')
              }}</el-dropdown-item>
              <el-dropdown-item
                :icon="Edit"
                @click.stop="CodeLibrary.addGroup(langType, currentGroup)"
                >{{ I18nT('base.edit') }}</el-dropdown-item
              >
              <el-dropdown-item
                :icon="Delete"
                @click.stop="CodeLibrary.delGroup(langType, currentGroup!)"
                >{{ I18nT('base.del') }}</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <template v-if="!groupItems.length">
      <el-empty></el-empty>
    </template>
    <template v-else>
      <template v-if="chooseMode">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <el-checkbox
              v-model="chooseAll"
              :value="true"
              :label="I18nT('tools.SelectAll')"
              @change="onChooseAllChanged"
            ></el-checkbox>
            <el-button link :disabled="!choosedItemID.length" @click.stop="doChangeGroups">
              <yb-icon :svg="import('@/svg/move-to.svg?raw')" width="14" height="14" />
            </el-button>
            <el-button
              link
              :disabled="!choosedItemID.length"
              style="margin-left: 0px"
              @click.stop="doDelItems(undefined)"
            >
              <Delete width="14" height="14" />
            </el-button>
          </div>
          <el-button link @click.stop="exitChooseMode">{{ I18nT('base.cancel') }}</el-button>
        </div>
        <template v-for="(item, _index) in groupItems" :key="_index">
          <div
            class="hover:bg-gray-200 dark:hover:bg-gray-800 group cursor-pointer w-full flex gap-3 items-center justify-between relative px-2 py-1 rounded-md"
            @click.stop="itemsClick(item)"
          >
            <el-checkbox
              v-model="choosedItemID"
              :value="item.id"
              class="pointer-events-none flex-shrink-0"
            ></el-checkbox>
            <div class="flex flex-col gap-1 flex-1 overflow-hidden">
              <span class="text-[16px] truncate font-bold">{{ item.name }}</span>
              <span class="truncate text-[14px] text-[#999]">{{
                item.comment || item.value || I18nT('base.none')
              }}</span>
            </div>
          </div>
        </template>
      </template>
      <template v-else>
        <template v-for="(item, _index) in groupItems" :key="_index">
          <div
            class="hover:bg-gray-200 dark:hover:bg-gray-800 group cursor-pointer w-full flex flex-col gap-1 relative px-3 py-2 rounded-md"
            @click.stop="itemsClick(item)"
          >
            <div class="flex items-center justify-between gap-3 flex-1 overflow-hidden">
              <div class="flex-1 flex items-center gap-2">
                <yb-icon :svg="import('@/svg/terminal.svg?raw')" width="20" height="20" />
                <span class="text-[16px] truncate font-bold">{{ item.name }}</span>
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
                    <el-dropdown-item :icon="Top" @click.stop="CodeLibrary.itemMoveToTop(item)">{{
                      I18nT('tools.MoveToTop')
                    }}</el-dropdown-item>
                    <el-dropdown-item :icon="Delete" @click.stop="doDelItems(item)">{{
                      I18nT('base.del')
                    }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="flex-1 flex items-center gap-2">
              <div class="w-[20px] h-[20px]"></div>
              <span class="truncate text-[14px] text-[#999]">{{
                item.comment || item.value || I18nT('base.none')
              }}</span>
            </div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { Delete, Edit, Folder, Plus, SetUp, Search, Top } from '@element-plus/icons-vue'
  import CodeLibrary from './setup'
  import Base from '@/core/Base'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const props = defineProps<{
    langType: string
  }>()

  const search = ref('')

  const currentGroupID = computed({
    get() {
      return CodeLibrary.groupID
    },
    set(v: string) {
      CodeLibrary.groupID = v
    }
  })

  watch(currentGroupID, () => {
    chooseMode.value = false
    choosedItemID.value.splice(0)
    chooseAll.value.splice(0)
  })

  const currentGroup = computed(() => {
    if (!CodeLibrary.groupID) {
      return undefined
    }
    return CodeLibrary.group.find((f) => f.id === CodeLibrary.groupID)
  })

  const groupItems = computed(() => {
    const s = search.value.trim()
    if (!s) {
      return CodeLibrary.items.filter((f) => f.groupID === currentGroupID.value)
    }
    return CodeLibrary.items.filter(
      (f) =>
        f.groupID === currentGroupID.value &&
        (f.name.includes(s) ||
          f.comment.includes(s) ||
          f.value.includes(s) ||
          f.toValue.includes(s))
    )
  })

  let CodeAddVM: any
  import('./codeAdd.vue').then((res) => {
    CodeAddVM = res.default
  })

  const addCode = (item?: any) => {
    AsyncComponentShow(CodeAddVM, {
      langType: props.langType,
      item,
      groupID: currentGroupID.value
    }).then()
  }

  const emptyClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const chooseAll = ref<boolean[]>([])
  const choosedItemID = ref<string[]>([])
  const chooseMode = ref(false)
  const doBatchOperation = (item?: any) => {
    if (item) {
      choosedItemID.value.push(item.id)
    }
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
    CodeLibrary.groupID = item.groupID
    CodeLibrary.itemID = item.id
  }

  const onChooseAllChanged = () => {
    const isAll = chooseAll.value.length > 0
    if (isAll) {
      choosedItemID.value = groupItems.value.map((f) => f.id)
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
        }
      })
      .catch(() => {})
  }

  let GroupChangedVM: any
  import('./groupChange.vue').then((res) => {
    GroupChangedVM = res.default
  })

  const doChangeGroups = () => {
    AsyncComponentShow(GroupChangedVM, {
      langType: props.langType
    }).then((groupID: string) => {
      console.log('doChangeGroups groupID: ', groupID)
      for (const id of choosedItemID.value) {
        const find = CodeLibrary.items.find((f) => f.id === id)
        if (find) {
          find.groupID = groupID
        }
      }
    })
  }
</script>
