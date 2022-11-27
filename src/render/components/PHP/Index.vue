<template>
  <div class="php-panel main-right-panel">
    <ul class="top-tab">
      <li
        v-tour="{
          position: 'right',
          group: 'custom',
          index: 3,
          count: 7,
          title: '使用指引',
          component: Step4,
          onPre: onStep3Pre,
          onNext: onStep3Next
        }"
        :class="current_tab === 0 ? 'active' : ''"
        @click="current_tab = 0"
        >{{ tabs[0] }}</li
      >
      <li :class="current_tab === 1 ? 'active' : ''" @click="current_tab = 1">{{ tabs[1] }}</li>
      <li
        v-tour="{
          position: 'right',
          group: 'custom',
          index: 2,
          count: 7,
          title: '使用指引',
          component: Step3,
          onPre: onStep2Pre,
          onNext: onStep2Next
        }"
        :class="current_tab === 2 ? 'active' : ''"
        @click="current_tab = 2"
        >{{ tabs[2] }}</li
      >
      <li
        v-tour="{
          group: 'custom',
          index: 1,
          count: 7,
          title: '使用指引',
          component: Step2,
          onNext: onStep1Next
        }"
        :class="current_tab === 3 ? 'active' : ''"
        @click="current_tab = 3"
        >{{ tabs[3] }}</li
      >
      <li :class="current_tab === 4 ? 'active' : ''" @click="current_tab = 4">{{ tabs[4] }}</li>
      <li :class="current_tab === 5 ? 'active' : ''" @click="current_tab = 5">{{ tabs[5] }}</li>
      <li :class="current_tab === 6 ? 'active' : ''" @click="current_tab = 6">{{ tabs[6] }}</li>
    </ul>
    <div class="main-block">
      <Service v-if="current_tab === 0" type-flag="php"></Service>
      <mo-php-config v-if="current_tab === 1"></mo-php-config>
      <Versions v-if="current_tab === 2" type-flag="php"></Versions>
      <Manager v-else-if="current_tab === 3" type-flag="php"></Manager>
      <mo-php-logs v-if="current_tab === 4" type="php-fpm"></mo-php-logs>
      <mo-php-logs v-if="current_tab === 5" type="php-fpm-slow"></mo-php-logs>
      <Extends v-if="current_tab === 6"></Extends>
    </div>
  </div>
</template>

<script>
  import Versions from '../VersionSwtich/index.vue'
  import Service from '../ServiceManager/index.vue'
  import Config from './Config.vue'
  import Logs from './Logs.vue'
  import Extends from './Extends.vue'
  import Manager from '../VersionManager/index.vue'
  import { mapGetters } from 'vuex'
  import { EventBus } from '@/global.js'
  import Step2 from '@/components/Tour/Step2.vue'
  import Step3 from '@/components/Tour/Step3.vue'
  import Step4 from '@/components/Tour/Step4.vue'
  import { markRaw, nextTick, toRaw } from 'vue'

  export default {
    name: 'MoPhpPanel',
    components: {
      [Config.name]: Config,
      Versions,
      Service,
      [Logs.name]: Logs,
      Extends,
      Manager
    },
    props: {},
    data() {
      return {
        Step2: markRaw(toRaw(Step2)),
        Step3: markRaw(toRaw(Step3)),
        Step4: markRaw(toRaw(Step4)),
        current_tab: 0,
        tabs: ['服务', '配置文件', '切换版本', '版本管理', 'FPM日志', '慢日志', '扩展']
      }
    },
    computed: {
      ...mapGetters('app', {
        server: 'server'
      }),
      version() {
        return this.server?.php?.current?.version
      }
    },
    watch: {},
    created: function () {
      if (!this.version) {
        this.current_tab = 3
      }
      EventBus.on('TourStep', this.onTourStep)
    },
    unmounted() {
      EventBus.off('TourStep', this.onTourStep)
    },
    methods: {
      onStep1Next() {
        return new Promise((resolve) => {
          this.current_tab = 2
          resolve(true)
        })
      },
      onStep2Pre() {
        return new Promise((resolve) => {
          this.current_tab = 3
          resolve(true)
        })
      },
      onStep2Next() {
        return new Promise((resolve) => {
          this.current_tab = 0
          resolve(true)
        })
      },
      onStep3Pre() {
        return new Promise((resolve) => {
          this.current_tab = 2
          resolve(true)
        })
      },
      onStep3Next() {
        return new Promise((resolve) => {
          EventBus.emit('TourStep', 4)
          resolve(true)
        })
      },
      onTourStep(step) {
        switch (step) {
          case 1:
            this.current_tab = 3
            break
        }
      }
    }
  }
</script>

<style lang="scss">
  .php-panel {
    height: 100%;
    overflow: auto;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        user-select: none;
        cursor: pointer;
        width: 100px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      overflow: hidden;
    }
  }
</style>
