<template>
  <el-config-provider :locale="locale">
    <el-container id="container" class="overflow-hidden h-screen">
      <Aside />
      <router-view />
    </el-container>
  </el-config-provider>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import zhCn from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import vi from 'element-plus/es/locale/lang/vi'
  import sv from 'element-plus/es/locale/lang/sv'
  import tr from 'element-plus/es/locale/lang/tr'
  import id from 'element-plus/es/locale/lang/id'
  import fr from 'element-plus/es/locale/lang/fr'
  import it from 'element-plus/es/locale/lang/it'
  import ja from 'element-plus/es/locale/lang/ja'
  import pt from 'element-plus/es/locale/lang/pt'
  import ptBr from 'element-plus/es/locale/lang/pt-br'
  import Aside from '@/components/Aside/Index.vue'
  import { AppStore } from '@/store/app'

  const appStore = AppStore()
  const language = ref(appStore?.config?.setup?.lang)

  const locale = computed(() => {
    switch (language.value) {
      case 'zh-cn':
        return zhCn
      case 'vi':
        return vi
      case 'sv':
        return sv
      case 'tr':
        return tr
      case 'id':
        return id
      case 'fr':
        return fr
      case 'it':
        return it
      case 'ja':
        return ja
      case 'pt':
        return pt
      case 'pt-br':
        return ptBr
      default:
        return en
    }
  })
</script>
