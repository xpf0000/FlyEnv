<template>
  <div class="setup-common">
    <theme-set />
    <lange-set />
    <nav-show />
    <proxy-set />
    <mirror-change />
    <rest-password />
    <permission />
    <other />
  </div>
</template>

<script lang="ts">
  import BrewSrc from './BrewSrc/index.vue'
  import RestPassword from './RestPassword/index.vue'
  import ProxySet from './ProxySet/index.vue'
  import LangeSet from './Lang/index.vue'
  import AutoUpdate from './AutoUpdate/index.vue'
  import { AppStore } from '@/store/app'
  import { defineComponent } from 'vue'
  import ForceStart from './ForceStart/index.vue'
  import ShowAI from './AI/index.vue'
  import MacPortsSrc from './MacPortsSrc/index.vue'
  import ThemeSet from './Theme/index.vue'
  import NavShow from './NavShow/index.vue'
  import MirrorChange from './MirrorChange/index.vue'
  import Permission from './Permission/index.vue'
  import Other from './Other/index.vue'
  import Base from '@/core/Base'
  import { I18nT } from '@shared/lang'

  export default defineComponent({
    components: {
      BrewSrc,
      RestPassword,
      ProxySet,
      LangeSet,
      AutoUpdate,
      ForceStart,
      ShowAI,
      MacPortsSrc,
      ThemeSet,
      NavShow,
      MirrorChange,
      Permission,
      Other
    },
    props: {},
    data() {
      return {}
    },
    computed: {
      showItem() {
        return AppStore().config.setup.common.showItem
      },
      postgresqlShow: {
        get() {
          return this?.showItem?.PostgreSql ?? true
        },
        set(v: boolean) {
          this.showItem.PostgreSql = v
        }
      }
    },
    watch: {
      showItem: {
        handler() {
          AppStore().saveConfig()
        },
        deep: true
      }
    },
    created: function () {},
    unmounted() {},
    methods: {
      showAbout() {
        Base.Dialog(import('@/components/About/index.vue'))
          .className('about-dialog')
          .title(I18nT('base.about'))
          .width('665px')
          .noFooter()
          .show()
      }
    }
  })
</script>
