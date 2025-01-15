<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
          <el-popover :show-after="600" placement="top" width="auto">
            <template #default>
              <span>{{ I18nT('base.customVersionDirTips') }}</span>
            </template>
            <template #reference>
              <el-button
                class="custom-folder-add-btn"
                :icon="FolderAdd"
                link
                @click.stop="showCustomDir"
              ></el-button>
            </template>
          </el-popover>
          <template v-if="typeFlag === 'mysql' || typeFlag === 'mariadb'">
            <el-popover :show-after="600" placement="top" width="auto">
              <template #default>
                <span>phpMyAdmin</span>
              </template>
              <template #reference>
                <el-button link @click.stop="toPhpMyAdmin">
                  <svg
                    style="width: 29px; height: 29px"
                    viewBox="0 0 1024 1024"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M582.999746 295.856396l-127.493428 357.433894 101.994742-6.382813 25.498686-351.051081z m152.995731 331.899024L755.118587 212.87983s-51.782558 220.778742-178.494417 421.254785l159.371307-6.379195z m44.621795-6.382812c107.002572-11.499194 108.373936-12.762007 108.373936-12.762007l-127.497045-223.398446s31.013088 117.662304 19.123109 236.160453z m25.502304-197.863576c3.281866 31.306177 8.604495 44.896792 25.498685 70.207321 16.894191 25.317767 74.075364 65.456396 133.869004 82.976566-24.677314-34.168311-191.245569-325.516212-191.245569-325.516212s37.974841 115.965286 31.87788 172.332325z m-140.248198 229.777639c-59.83706 5.138092-216.740636 25.527633-216.740636 25.527633l38.246219 63.831745s88.62123-53.696678 191.245569-44.679689c63.516947 4.316721 98.712876 12.049187 114.749512 19.14482 16.033018 7.102869 40.82612 11.231435 57.369329-12.762007s65.742247-87.611703 152.995731-95.738572c-152.094756 16.923138-278.028664 39.530742-337.865724 44.67607zM621.249583 263.938714c13.398841 9.577837 18.363251 7.540693 25.498686 0 7.139053-7.537074 17.516551-8.286078 31.874261 0 1.458205-10.442629-8.633442-19.14482-19.12311-19.14482-14.882375 0-14.35771 12.762007-25.498685 12.762007-16.789258-13.561668-36.053484-14.144226-38.246219 6.382813-0.003618 0 12.092608-9.577837 25.495067 0z m-76.496056 497.852155c17.183661-8.79265 19.12311-12.762007 19.123109-12.762007v-12.762007s-12.834375 20.707958-31.874261 25.527633c-19.039887 4.826912-38.246219 0-38.24622 0v6.390049c0-0.007237 31.403873 1.599322 50.997372-6.393668z m19.123109 0c-13.181739 8.083449-22.466488 12.769244-31.874261 12.769244h-31.874262v6.382813h38.246219s26.450318-3.216735 38.246219-12.762007c11.803138-9.556127 27.575633-8.043647 51.00099-6.39005v-12.762007h-38.249838c0.003618-0.003618-12.316947 4.67494-25.495067 12.762007z m267.741625-31.910445c-16.36229 9.053173-34.685739 24.062191-57.372947 25.527633-22.687208 1.461823-38.246219 0-38.246219 0v12.769243h19.12311s19.604353 0.683873 51.000989-12.769243c30.38711-13.018912 51.344735-15.037965 63.744905-12.762008v-19.152056s-21.887548-2.673979-38.249838 6.386431z m-38.249837-6.386431s-82.564071-22.509908-101.994742-19.14482c-19.43429 3.365088-62.568933 4.750926-76.499675 6.382813-13.93436 1.631887-59.131477 2.684834-95.622784 31.914063l6.375576 6.382813s53.935491-32.482148 89.247208-31.914063 69.856339-6.911095 114.745894 0c39.367915 6.064396 63.748523 12.769244 63.748523 12.769243v-6.390049zM659.987901 302.137894c-14.205739-13.456735-30.506516-14.035675-32.362742 6.335774 0 0 10.236382-9.50547 21.576368 0s15.5373 7.475562 21.576367 0c6.039067-7.47918 14.820862-8.224565 26.971364 0 1.233866-10.363025-7.309117-19.000085-16.184989-19.000085-12.591943 0-12.146883 12.664311-21.576368 12.664311z"
                      fill="#CCCCCC"
                    ></path>
                    <path
                      d="M34.649555 663.070756h18.772127l-1.584848 7.511746c4.001922-3.307194 7.754177-5.673611 11.249526-7.099251s7.247604-2.138459 11.249527-2.138459c7.685428 0 13.861993 2.641413 18.529696 7.92424 4.671322 5.286445 7.005173 13.167265 7.005173 23.638841 0 13.188975-4.027251 24.329951-12.078134 33.422926-6.90024 7.765032-15.07053 11.651166-24.500014 11.651166-9.708099 0-17.046163-3.929555-22.014191-11.788665L33.339703 764.175378H13.529102l21.120453-101.104622z m11.940636 41.973145c0 5.695322 1.389456 10.120594 4.175604 13.264961 2.786148 3.147986 6.060777 4.721979 9.834742 4.721979 3.267392 0 6.418996-1.17959 9.454813-3.546007s5.554205-6.292353 7.555166-11.785046 3.003251-10.580127 3.003251-15.265922c0-5.470982-1.31347-9.66106-3.933173-12.581089-2.623322-2.91641-5.959463-4.374615-10.008424-4.374614-3.773965 0-7.215039 1.342417-10.319605 4.030869-3.104565 2.684834-5.510784 6.639717-7.215038 11.850176-1.697018 5.217696-2.547336 9.780466-2.547336 13.684693zM126.37535 736.263237h-19.806983l21.185584-101.032255h19.8106l-7.59135 35.970262c4.461456-3.488113 8.626205-6.002883 12.490629-7.544311a33.231152 33.231152 0 0 1 12.425499-2.312141c5.934134 0 10.630784 1.704254 14.079095 5.101908s5.177894 7.855491 5.177894 13.366275c0 2.941739-0.644071 7.490035-1.932212 13.644891l-8.973569 42.798134h-19.806982l9.179816-43.626742c0.966106-4.732834 1.44735-7.765032 1.44735-9.096594 0-2.435166-0.759859-4.389088-2.275958-5.858148-1.519717-1.46906-3.589428-2.20359-6.212749-2.20359-3.314431 0-6.487746 1.147025-9.523562 3.444692a29.909484 29.909484 0 0 0-9.042318 11.166304c-1.150643 2.435166-2.67036 8.155816-4.555533 17.158332l-6.075251 29.022983zM207.332862 663.070756h18.772127l-1.584848 7.511746c4.001922-3.307194 7.754177-5.673611 11.249527-7.099251s7.247604-2.138459 11.249526-2.138459c7.685428 0 13.861993 2.641413 18.529696 7.92424 4.671322 5.286445 7.005173 13.167265 7.005174 23.638841 0 13.188975-4.027251 24.329951-12.078135 33.422926-6.90024 7.765032-15.07053 11.651166-24.500014 11.651166-9.708099 0-17.046163-3.929555-22.014191-11.788665L206.026629 764.168141h-19.810601l21.116834-101.097385z m11.937018 41.973145c0 5.695322 1.389456 10.120594 4.175604 13.264961 2.786148 3.147986 6.060777 4.721979 9.834742 4.721979 3.267392 0 6.418996-1.17959 9.454813-3.546007s5.554205-6.292353 7.555166-11.785046 3.003251-10.580127 3.003251-15.265922c0-5.470982-1.31347-9.66106-3.933173-12.581089-2.623322-2.91641-5.959463-4.374615-10.008424-4.374614-3.773965 0-7.215039 1.342417-10.319605 4.030869-3.104565 2.684834-5.510784 6.639717-7.215038 11.850176-1.693399 5.217696-2.547336 9.780466-2.547336 13.684693z"
                      fill="#6C78AF"
                    ></path>
                    <path
                      d="M337.290403 736.263237h-19.738233l-3.658177-84.423915-16.080057 84.423915h-18.772127l21.120452-101.032255h29.677909l3.104565 70.779025 34.508438-70.779025h30.021654l-21.185583 101.032255h-18.981993l19.94448-83.805173-39.961328 83.805173zM402.858968 663.070756h19.738233l4.971647 36.458742c1.241102 9.37159 1.932212 15.942558 2.06971 19.709286 2.576283-7.490035 6.118671-15.392565 10.630785-23.711208l17.531024-32.460438h20.979336l-45.276721 80.356862c-3.726926 6.665046-6.657809 11.325512-8.799887 13.992254a23.186544 23.186544 0 0 1-7.728848 6.267025c-3.014106 1.519717-6.636099 2.275958-10.869597 2.275958-4.186459 0-8.901201-0.73453-14.147844-2.20359l1.725964-14.748495c2.391746 0.687491 4.71836 1.034855 6.972608 1.034855 6.075251 0 11.064989-4.598954 14.976452-13.786007l-12.772862-73.185244zM541.724947 713.934247h-40.098827l-12.146883 22.32899h-21.395449l57.213739-101.032255h23.125031l16.423802 101.032255h-19.738233l-3.38318-22.32899z m-2.554572-16.814586l-5.865386-40.659675-24.431265 40.659675h30.296651zM645.112763 736.263237h-18.772127l1.657216-7.924241c-3.589428 3.444693-7.12458 5.916042-10.598219 7.410432-3.47364 1.49077-7.395958 2.239774-11.766955 2.239773-7.59135 0-13.746205-2.587138-18.464565-7.757795-4.714742-5.167039-7.073922-12.805428-7.073922-22.915166 0-11.712678 3.314431-22.303661 9.939675-31.769328 6.625244-9.462049 15.392565-14.198502 26.298346-14.198502 9.845597 0 17.2307 3.907845 22.151689 11.716297l7.938714-37.833725h19.806982l-21.116834 101.032255z m-45.761583-29.775604c0 5.239406 1.320707 9.32817 3.969357 12.269908s5.901569 4.410799 9.765993 4.410798c3.585809 0 6.936424-1.226629 10.040989-3.687123s5.590389-6.216367 7.453852-11.267619 2.793385-9.899873 2.793385-14.542247c0-5.282827-1.429258-9.559746-4.280537-12.819901s-6.140382-4.895661-9.870926-4.895661c-5.800254 0-10.558417 3.220353-14.285342 9.650205s-5.58677 13.395223-5.586771 20.88164zM678.448848 663.070756h18.634629l-1.867081 8.890346c7.272933-7.073922 14.907703-10.616311 22.915166-10.61631 5.518021 0 9.776848 1.150643 12.765625 3.44831 2.992396 2.297668 4.899279 5.467364 5.727887 9.509089 2.529244-3.676269 6.16571-6.751887 10.909399-9.234092 4.740071-2.482205 9.66106-3.723307 14.766587-3.723307 5.843675 0 10.399208 1.566756 13.666601 4.689413 3.263774 3.122657 4.899279 7.258459 4.899279 12.403788 0 2.529244-0.644071 6.893004-1.928594 13.094897l-9.389682 44.726728h-19.806982l9.386064-44.726728c1.147025-5.604862 1.725965-8.774558 1.725964-9.509088 0-2.022671-0.611505-3.618375-1.827279-4.790728-1.223011-1.168735-3.05029-1.754912-5.489074-1.754911-4.924608 0-9.317314 2.594375-13.185357 7.786742-2.80424 3.719689-5.199604 10.315986-7.175237 19.778035l-6.972608 33.220297h-19.8106l9.252184-44.245484c1.056565-5.101908 1.584848-8.409102 1.584848-9.925202 0-1.928594-0.658544-3.51706-1.968396-4.754544s-3.11542-1.859845-5.416707-1.859844c-2.163788 0-4.396325 0.644071-6.697611 1.928593s-4.309484 3.057527-6.039067 5.308156c-1.725965 2.250629-3.209498 5.145329-4.446983 8.68048-0.553611 1.653597-1.450968 5.398615-2.69207 11.231435l-7.037739 33.632791h-19.810601l15.327435-73.188862zM804.75183 663.070756h19.806983l-15.320198 73.192481h-19.806982l15.320197-73.192481z m5.796636-27.839774h19.810601l-3.726926 17.918191h-19.806982l3.723307-17.918191zM844.297046 663.070756h18.772127l-1.932212 9.512707c4.693032-4.041724 9.074883-6.929187 13.149173-8.651534a32.637739 32.637739 0 0 1 12.870559-2.587137c6.028212 0 10.779138 1.725965 14.252777 5.170657 3.47364 3.444693 5.206841 8.018318 5.206841 13.713639 0 2.576283-0.759859 7.446615-2.275958 14.610997l-8.629823 41.419533h-19.806982l8.694954-41.557031c1.284523-6.201894 1.928594-9.899873 1.928593-11.093937 0-2.525625-0.745385-4.512113-2.239773-5.959463-1.498007-1.443731-3.578572-2.171025-6.248933-2.171024-2.898318 0-6.118671 1.215774-9.66106 3.650939a25.491449 25.491449 0 0 0-8.354827 9.650205c-1.472678 2.847661-3.126276 8.662389-4.968029 17.433329l-6.281498 30.050601h-19.806982l15.331053-73.192481z"
                      fill="#FB9800"
                    ></path>
                  </svg>
                </el-button>
              </template>
            </el-popover>
          </template>
          <slot name="tool-left"></slot>
        </div>
        <el-button class="button" :disabled="service?.fetching" link @click="resetData">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': service?.fetching }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table v-loading="service?.fetching" class="service-table" :data="versions">
      <el-table-column prop="version" width="140px">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.version')
          }}</span>
        </template>
        <template #default="scope">
          <span
            style="padding: 2px 12px 2px 24px; display: block"
            :class="{
              current:
                currentVersion?.version === scope.row.version &&
                currentVersion?.path === scope.row.path
            }"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.path')" :prop="null">
        <template #default="scope">
          <template v-if="!scope.row.version">
            <el-popover popper-class="version-error-tips" width="auto" placement="top">
              <template #reference>
                <span class="path error" @click.stop="openDir(scope.row.path)">{{
                  scope.row.path
                }}</span>
              </template>
              <template #default>
                <span>{{ scope.row?.error ?? I18nT('base.versionErrorTips') }}</span>
              </template>
            </el-popover>
          </template>
          <template v-else>
            <span
              class="path"
              :class="{
                current:
                  currentVersion?.version === scope.row.version &&
                  currentVersion?.path === scope.row.path
              }"
              @click.stop="openDir(scope.row.path)"
              >{{ scope.row.path }}</span
            >
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('php.quickStart')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <template
            v-if="
              currentVersion?.version === scope.row.version &&
              currentVersion?.path === scope.row.path
            "
          >
            <el-button
              link
              class="status group-off"
              :class="{ off: appStore.phpGroupStart[scope.row.bin] === false }"
            >
              <yb-icon
                style="width: 30px; height: 30px"
                :svg="import('@/svg/nogroupstart.svg?raw')"
                @click.stop="groupTrunOn(scope.row)"
              />
            </el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('service.env')" :prop="null" width="100px" align="center">
        <template #header>
          <el-tooltip :content="I18nT('service.envTips')" placement="top" :show-after="600">
            <span>{{ I18nT('service.env') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <template v-if="isInAppEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByApp')" :show-after="600" placement="top">
              <el-button link type="primary">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="isInEnv(scope.row)">
            <el-tooltip :content="I18nT('service.setByNoApp')" :show-after="600" placement="top">
              <el-button link type="warning">
                <yb-icon :svg="import('@/svg/select.svg?raw')" width="17" height="17" />
              </el-button>
            </el-tooltip>
          </template>
          <template v-else-if="ServiceActionStore.pathSeting[scope.row.bin]">
            <el-button style="width: auto; height: auto" text :loading="true"></el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column
        :show-overflow-tooltip="true"
        :label="I18nT('service.alias')"
        :prop="null"
        width="120px"
        align="left"
      >
        <template #header>
          <el-tooltip :content="I18nT('service.aliasTips')" placement="top" :show-after="600">
            <span>{{ I18nT('service.alias') }}</span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <div class="flex items-center h-full min-h-9"
            ><span class="truncate">{{
              appStore.config.setup.alias?.[scope.row.bin]?.map((a) => a.name)?.join(',')
            }}</span></div
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.service')" :prop="null" width="110px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running" :class="{ disabled: versionRunning }">
                <yb-icon
                  :svg="import('@/svg/stop2.svg?raw')"
                  @click.stop="serviceDo('stop', scope.row)"
                />
              </el-button>
              <el-button link class="status refresh" :class="{ disabled: versionRunning }">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="serviceDo('restart', scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button
                link
                class="status start"
                :class="{
                  disabled: versionRunning || !scope.row.version,
                  current:
                    currentVersion?.version === scope.row.version &&
                    currentVersion?.path === scope.row.path
                }"
              >
                <yb-icon
                  :svg="import('@/svg/play.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.operation')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <EXT :item="scope.row" :type="typeFlag" />
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { FolderAdd } from '@element-plus/icons-vue'
  import EXT from './EXT/index.vue'
  import type { AllAppModule } from '@/core/type'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { Setup } from './setup'

  const props = defineProps<{
    typeFlag: AllAppModule
    title: string
  }>()

  const {
    appStore,
    service,
    versions,
    versionRunning,
    isInEnv,
    isInAppEnv,
    groupTrunOn,
    openDir,
    serviceDo,
    showCustomDir,
    toPhpMyAdmin,
    currentVersion,
    resetData
  } = Setup(props.typeFlag)
</script>
