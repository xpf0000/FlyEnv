<template>
  <div class="h-full overflow-hidden flex flex-col">
    <el-autocomplete
      v-model="ProjectSetup.search.NodeJS"
      :fetch-suggestions="querySearch"
      :trigger-on-focus="false"
      clearable
      class="mb-6 flex-shrink-0"
      placeholder="Search"
    >
      <template #suffix>
        <Search class="w-4 h-4" />
      </template>
    </el-autocomplete>
    <div class="flex-1 overflow-hidden">
      <el-scrollbar>
        <el-collapse v-model="ProjectSetup.collapse.NodeJS">
          <template v-for="(item, index) in list" :key="index">
            <el-collapse-item :title="item.key" :name="item.key">
              <div class="p-2 grid grid-cols-2 gap-4">
                <template v-for="(p, i) in item.list" :key="i">
                  <div
                    class="p-3 flex flex-col bg-slate-100 rounded-md hover:shadow-lg relative dark:bg-gray-700 dark:hover:shadow-slate-600 group"
                    @click.stop="toCreate(p)"
                  >
                    <div
                      class="h-[80px] flex justify-center items-center text-xl overflow-hidden cursor-pointer"
                    >
                      <span class="truncate">{{ p.name }}</span></div
                    >
                    <el-button
                      link
                      class="absolute right-2 bottom-2 hidden group-hover:inline-flex"
                      @click="openURL(p.url)"
                    >
                      <yb-icon
                        style="width: 20px; height: 20px"
                        :svg="import('@/svg/http.svg?raw')"
                      ></yb-icon>
                    </el-button>
                  </div>
                </template>
              </div>
            </el-collapse-item>
          </template>
        </el-collapse>
      </el-scrollbar>
    </div>
  </div>
</template>
<script lang="ts" setup>
  import { computed, reactive } from 'vue'
  import { ProjectSetup } from '@/components/Host/CreateProject/project'
  import Projects from './version_nodejs'
  import { Search } from '@element-plus/icons-vue'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const { shell } = require('@electron/remote')

  const list = computed(() => {
    let allName = Object.keys(Projects)
    if (ProjectSetup.search.NodeJS) {
      const queryString = ProjectSetup.search.NodeJS.toLowerCase()
      allName = allName.filter(
        (n) => n.toLowerCase().includes(queryString) || queryString.includes(n.toLowerCase())
      )
    }
    const keys = Array.from(new Set(allName.map((s) => s.slice(0, 1).toUpperCase())))
    keys.sort()
    console.log('keys: ', keys)
    return keys.map((k) => {
      const names = allName.filter((a) => a.toUpperCase().startsWith(k))
      names.sort()
      return {
        key: k,
        list: names.map((n: keyof typeof Projects) => {
          const arr: any = Projects[n]
          return { name: n, ...arr }
        })
      }
    })
  })

  if (!ProjectSetup.collapse['NodeJS']) {
    const keys = list.value.map((l) => l.key)
    ProjectSetup.collapse['NodeJS'] = reactive([...keys])
  }

  const querySearch = (queryString: string, cb: any) => {
    const allName = Object.keys(Projects)
    const results = queryString
      ? allName
          .filter(
            (n) =>
              n.toLowerCase().includes(queryString.toLowerCase()) ||
              queryString.toLowerCase().includes(n.toLowerCase())
          )
          .map((n) => ({
            value: n
          }))
      : allName.map((n) => ({
          value: n
        }))
    console.log('results: ', results)
    // call callback function to return suggestions
    cb(results)
  }

  const openURL = (url: string) => {
    shell.openExternal(url)
  }

  let CreateVM: any
  import('./nodejsCreate.vue').then((res) => {
    CreateVM = res.default
  })

  const toCreate = (item: any) => {
    console.log('toCreate: ', item)
    AsyncComponentShow(CreateVM, {
      type: item.name
    }).then()
  }
</script>
