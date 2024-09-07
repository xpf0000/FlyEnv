<template>
    <div class="soft-index-panel main-right-panel">
        <ul class="top-tab">
            <template v-for="(item, index) in tabs" :key="index">
                <li :class="current_tab === index ? 'active' : ''" @click="current_tab = index">{{
                    item
                }}</li>
            </template>
        </ul>
        <div class="main-block">
            <Service v-if="current_tab === 0" type-flag="tomcat" title="Tomcat"></Service>
            <Manager v-else-if="current_tab === 1" type-flag="tomcat" title="Tomcat"
                url="https://dlcdn.apache.org/tomcat/">
            </Manager>
            <Config v-else-if="current_tab === 2" :file-name="'server.xml'"></Config>
            <Config v-else-if="current_tab === 3" :file-name="'web.xml'"></Config>
            <Logs v-else-if="current_tab === 4" type="access_log"></Logs>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import Service from '../ServiceManager/index.vue'
import Config from './Config.vue'
import Logs from './Logs.vue'
import Manager from '../VersionManager/index.vue'
import { AppStore } from '@/store/app'

const current_tab = ref(0)

export default defineComponent({
    components: {
        Config,
        Service,
        Logs,
        Manager
    },
    props: {},
    data() {
        return {
            current_tab,
            tabs: [
                this.$t('base.service'),
                this.$t('base.versionManager'),
                'server.xml',
                'web.xml',
                this.$t('base.log')
            ]
        }
    },
    computed: {
        version() {
            return AppStore().config.server?.tomcat?.current?.version
        }
    },
    watch: {},
    created: function () {
        if (!this.version) {
            this.current_tab = 1
        }
    }
})
</script>