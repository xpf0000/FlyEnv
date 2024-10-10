<template>
  <div class="main-right-panel p-5 overflow-hidden">
    <el-card class="h-full" body-class="h-full" style="--el-card-padding: 0px">
      <div class="flex h-full w-full relative overflow-hidden p-3">
        <div
          class="h-full w-60 flex-shrink-0 bg-white px-3 transition-all duration-300 relative dark:bg-transparent"
          :style="asideStyle"
        >
          <el-scrollbar>
            <div
              class="flex justify-center p-6 text-3xl pt-4 font-bold text-slate-500 dark:text-gray-400"
            >
              <span>{{ I18nT('base.leftTools').toUpperCase() }}</span>
            </div>
            <el-tree
              ref="tree"
              :data="asideData"
              node-key="id"
              default-expand-all
              :highlight-current="true"
              :expand-on-click-node="false"
              style="--el-tree-node-content-height: 30px"
              @node-click="onNodeClick"
            >
              <template #default="{ data }">
                <template v-if="data.isTop">
                  <span class="text-gray-400 select-none">{{
                    I18nT(`toolType.${data.label}`)
                  }}</span>
                </template>
                <template v-else>
                  <div class="flex items-center gap-3 py-2">
                    <yb-icon
                      :svg="data?.icon ?? import('@/svg/custom_tool.svg?raw')"
                      width="15"
                      height="15"
                    />
                    <span class="select-none">{{
                      typeof data.label === 'function' ? data.label() : data.label
                    }}</span>
                  </div>
                </template>
              </template>
            </el-tree>
          </el-scrollbar>
        </div>
        <div
          class="h-full flex-1 flex flex-col bg-slate-100 p-4 transition-all duration-300 overflow-hidden dark:bg-gray-800"
          :style="mainStyle"
        >
          <div class="pb-4 flex items-center flex-shrink-0">
            <template v-if="AppToolStore.expand">
              <el-button size="large" link @click.stop="AppToolStore.expand = !AppToolStore.expand">
                <Fold class="w-6 h-6" />
              </el-button>
            </template>
            <template v-else>
              <el-button size="large" link @click.stop="AppToolStore.expand = !AppToolStore.expand">
                <Expand class="w-6 h-6" />
              </el-button>
            </template>
            <el-button size="large" link @click.stop="AppToolStore.id = 'home'">
              <yb-icon :svg="import('@/svg/host.svg?raw')" class="w-6 h-6" />
            </el-button>
            <el-autocomplete
              v-model.trim="AppToolStore.search"
              :fetch-suggestions="querySearch"
              class="mx-4"
              clearable
              @select="selectTool"
            ></el-autocomplete>
            <el-button size="large" link @click.stop="doAdd(undefined)">
              <Plus class="w-6 h-6" />
            </el-button>
          </div>
          <template v-if="AppToolStore.id === 'home'">
            <el-scrollbar class="flex-1">
              <template v-if="likeData.length > 0">
                <div class="py-3">{{ I18nT('tool.FavoriteTools') }}</div>
                <div
                  class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                >
                  <template v-for="(item, index) in likeData" :key="index">
                    <div
                      class="group relative flex flex-col items-center justify-center py-6 bg-white gap-2 cursor-pointer hover:shadow-lg dark:bg-gray-700 dark:hover:shadow-slate-600"
                      @click.stop="AppToolStore.id = item.id"
                    >
                      <yb-icon
                        :svg="item?.icon ?? import('@/svg/custom_tool.svg?raw')"
                        width="30"
                        height="30"
                      />
                      <span>{{
                        typeof item.label === 'function' ? item.label() : item.label
                      }}</span>
                      <StarFilled
                        class="absolute left-2 top-2 w-6 h-6 text-emerald-500 hidden group-hover:inline-block"
                        @click.stop="AppToolStore.doUnLike(item)"
                      />
                      <template v-if="item.isCustom">
                        <div
                          class="absolute right-2 top-2 w-5 h-5 rounded-full border items-center justify-center border-slate-700 hidden group-hover:flex hover:border-amber-500"
                        >
                          <el-dropdown placement="top-start" @command="doCustomAction">
                            <div
                              class="outline-0 w-5 h-5 flex items-center justify-center hover:text-amber-500"
                            >
                              <MoreFilled class="w-3 h-3 outline-0" />
                            </div>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item :command="{ action: 'edit', item }"
                                  ><EditPen class="w-4 h-4 mr-2" /><span>{{
                                    I18nT('tool.actionEdit')
                                  }}</span></el-dropdown-item
                                >
                                <el-dropdown-item :command="{ action: 'del', item }"
                                  ><Delete class="w-4 h-4 mr-2" /><span>{{
                                    I18nT('tool.actionDel')
                                  }}</span></el-dropdown-item
                                >
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>
                        </div>
                      </template>
                    </div>
                  </template>
                </div>
              </template>
              <div class="py-3">{{ I18nT('tool.AllTools') }}</div>
              <div
                class="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              >
                <template v-for="(item, index) in homeData" :key="index">
                  <div
                    class="group flex flex-col items-center justify-center py-6 bg-white gap-2 cursor-pointer hover:shadow-lg relative dark:bg-gray-700 dark:hover:shadow-slate-600"
                    @click.stop="AppToolStore.id = item.id"
                  >
                    <yb-icon
                      :svg="item?.icon ?? import('@/svg/custom_tool.svg?raw')"
                      width="30"
                      height="30"
                    />
                    <span>{{ typeof item.label === 'function' ? item.label() : item.label }}</span>
                    <template v-if="likeID.includes(item.id)">
                      <StarFilled
                        class="absolute left-2 top-2 w-6 h-6 text-emerald-500 hidden group-hover:inline-block"
                        @click.stop="AppToolStore.doUnLike(item)"
                      />
                    </template>
                    <template v-else>
                      <Star
                        class="absolute left-3 top-3 w-5 h-5 hover:text-emerald-500 hidden group-hover:inline-block"
                        @click.stop="AppToolStore.doLike(item)"
                      />
                    </template>
                    <template v-if="item.isCustom">
                      <div
                        class="absolute right-2 top-2 w-5 h-5 rounded-full border items-center justify-center border-slate-700 hidden group-hover:flex hover:border-amber-500"
                      >
                        <el-dropdown placement="top-start" @command="doCustomAction">
                          <div
                            class="outline-0 w-5 h-5 flex items-center justify-center hover:text-amber-500"
                          >
                            <MoreFilled class="w-3 h-3 outline-0" />
                          </div>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item :command="{ action: 'edit', item }"
                                ><EditPen class="w-4 h-4 mr-2" /><span>{{
                                  I18nT('tool.actionEdit')
                                }}</span></el-dropdown-item
                              >
                              <el-dropdown-item :command="{ action: 'del', item }"
                                ><Delete class="w-4 h-4 mr-2" /><span>{{
                                  I18nT('tool.actionDel')
                                }}</span></el-dropdown-item
                              >
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </template>
                  </div>
                </template>
              </div>
            </el-scrollbar>
          </template>
          <template v-else>
            <template v-if="typeof toolComponent === 'string'">
              <iframe :src="toolComponent" class="flex-1 border-0 outline-0"></iframe>
            </template>
            <template v-else>

              <component :is="toolComponent" class="flex-1 overflow-hidden" />
            </template>
          </template>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { AppToolModules } from '@/core/AppTool'
  import { AppToolStore } from './store'
  import { computed, ref, watch } from 'vue'
  import { type AppToolModuleItem, AppToolType } from '@/core/type'
  import { I18nT } from '@shared/lang'
  import {
    Expand,
    Fold,
    Plus,
    Star,
    StarFilled,
    MoreFilled,
    EditPen,
    Delete
  } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import Base from '@/core/Base'

  type AsideTreeDataType = {
    isTop: boolean
    label: string
    children: AppToolModuleItem[]
  }

  const tree = ref()

  const asideStyle = computed(() => {
    if (AppToolStore.expand) {
      return {
        transform: 'translate(0, 0)'
      }
    }
    return {
      width: '0px',
      padding: '0px',
      transform: 'translate(-240px, 0)'
    }
  })

  const mainStyle = computed(() => {
    if (AppToolStore.expand) {
      return undefined
    }
    return {}
  })

  const likeID = computed(() => {
    return AppToolStore.like
  })

  const asideData = computed(() => {
    const tree: AsideTreeDataType[] = []
    const all = [...AppToolStore.custom, ...AppToolModules]
    const like = AppToolStore.like
    /**
     * user like
     */
    if (like.length > 0) {
      const likeItem: AsideTreeDataType = {
        isTop: true,
        label: 'Favorite',
        children: []
      }
      for (const id of like) {
        const find = all.find((a) => a.id === id)
        if (find) {
          likeItem.children.push(find)
        }
      }
      tree.push(likeItem)
    }
    /**
     * user custom
     */
    if (AppToolStore.custom.length > 0) {
      const item: AsideTreeDataType = {
        isTop: true,
        label: 'Custom',
        children: [...AppToolStore.custom]
      }
      tree.push(item)
    }
    for (const type of AppToolType) {
      const sub = AppToolModules.filter((a) => a.type === type)
      if (sub.length > 0) {
        tree.push({
          isTop: true,
          label: type,
          children: sub
        })
      }
    }
    return tree
  })

  const likeData = computed(() => {
    const all = [...AppToolStore.custom, ...AppToolModules]
    const like = AppToolStore.like
    const arr = []
    if (like.length > 0) {
      for (const id of like) {
        const find = all.find((a) => a.id === id)
        if (find) {
          arr.push(find)
        }
      }
    }
    const search = AppToolStore.search.trim().toLowerCase()
    if (!search) {
      return arr
    }
    return arr.filter((a) => {
      const label = typeof a.label === 'function' ? a.label().toLowerCase() : a.label.toLowerCase()
      return label.includes(search) || search.includes(label)
    })
  })

  const homeData = computed(() => {
    if (AppToolStore.id !== 'home') {
      return []
    }
    const all = [...AppToolStore.custom, ...AppToolModules]
    const search = AppToolStore.search.trim().toLowerCase()
    if (!search) {
      return all
    }
    return all.filter((a) => {
      const label = typeof a.label === 'function' ? a.label().toLowerCase() : a.label.toLowerCase()
      return label.includes(search) || search.includes(label)
    })
  })

  const toolComponent = computed(() => {
    if (AppToolStore.id === 'home') {
      return undefined
    }
    const all = [...AppToolStore.custom, ...AppToolModules]
    return all.find((a) => a.id === AppToolStore.id)?.component
  })

  const onNodeClick = (data: any) => {
    AppToolStore.id = data.id
  }

  const searchALL = computed(() => {
    return [...AppToolStore.custom, ...AppToolModules].map((i) => {
      const value = typeof i.label === 'function' ? i.label() : i.label
      return {
        value,
        check: value.toLowerCase(),
        id: i.id
      }
    })
  })

  const querySearch = (queryString: string, cb: any) => {
    const check = queryString.trim().toLowerCase()
    const results = check
      ? searchALL.value.filter((f: any) => f.check.includes(check) || check.includes(f.check))
      : searchALL.value
    cb(results)
  }

  const selectTool = (item: any) => {
    console.log('selectTool: ', item)
    if (item.id) {
      AppToolStore.id = item.id
    }
  }

  let AddVM: any
  import('./add.vue').then((res) => {
    AddVM = res.default
  })

  const doAdd = (item?: any) => {
    AsyncComponentShow(AddVM, {
      item
    }).then()
  }

  const doCustomAction = (command: { action: 'edit' | 'del'; item: AppToolModuleItem }) => {
    if (command.action === 'edit') {
      AsyncComponentShow(AddVM, {
        item: command.item
      }).then()
    } else {
      Base._Confirm(I18nT('base.delAlertContent'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      }).then(() => {
        AppToolStore.doDel(command.item)
      })
    }
  }

  watch(
    () => AppToolStore.id,
    (v) => {
      console.log('AppToolStore.id: ', v, tree.value)
      tree?.value?.setCurrentKey(v)
      if (v === 'home') {
        if (tree?.value?.store?.currentNode) {
          tree.value.store.currentNode.isCurrent = false
        }
      }
    }
  )
</script>
