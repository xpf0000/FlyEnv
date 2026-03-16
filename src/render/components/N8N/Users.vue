<template>
  <div class="n8n-users px-4 pt-4">

    <!-- Data Directory row (always visible) -->
    <div class="flex items-center gap-3 mb-4 p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <span class="text-sm font-medium whitespace-nowrap">{{ I18nT('n8n.usersDataDir') }}</span>
      <el-input v-model="dataDir" size="small" readonly class="flex-1" />
      <el-button size="small" :loading="scanning" @click="scanDataDir">{{ I18nT('n8n.usersDataDirScan') }}</el-button>
      <el-button size="small" @click="chooseDataDir">{{ I18nT('n8n.usersDataDirChange') }}</el-button>
    </div>

    <!-- Scan results dialog -->
    <el-dialog
      v-model="showScanDialog"
      :title="I18nT('n8n.usersDataDirScanTitle')"
      width="520px"
      :destroy-on-close="true"
    >
      <p class="text-sm text-gray-500 mb-3">{{ I18nT('n8n.usersDataDirScanTip') }}</p>
      <el-radio-group v-model="scanSelected" class="flex flex-col gap-2">
        <el-radio v-for="p in scanResults" :key="p" :value="p" class="font-mono text-sm">{{ p }}</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="showScanDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :disabled="!scanSelected" @click="applyScanResult">{{ I18nT('base.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Toolbar -->
    <div class="flex items-center gap-2 mb-4">
      <el-button :loading="loading" @click="loadUsers">{{ I18nT('base.refresh') }}</el-button>
      <el-button type="primary" @click="openAddDialog">
        {{ I18nT('n8n.usersAddUser') }}
      </el-button>
      <el-button @click="openChangePasswordDialog">{{ I18nT('n8n.usersChangePassword') }}</el-button>
    </div>

    <!-- Users table — reads from SQLite directly, works offline -->
    <el-table :data="users" v-loading="loading" border>
      <el-table-column :label="I18nT('n8n.usersName')" min-width="150">
        <template #default="{ row }">{{ row.firstName }} {{ row.lastName }}</template>
      </el-table-column>
      <el-table-column prop="email" :label="I18nT('n8n.usersEmail')" min-width="200" />
      <el-table-column :label="I18nT('n8n.usersRole')" width="120">
        <template #default="{ row }">{{ formatRole(row.roleSlug) }}</template>
      </el-table-column>
      <el-table-column :label="I18nT('n8n.usersStatus')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.disabled ? 'info' : row.isPending ? 'warning' : 'success'" size="small">
            {{ row.disabled ? I18nT('n8n.usersDisabled') : row.isPending ? I18nT('n8n.usersPending') : I18nT('n8n.usersActive') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('n8n.usersActions')" width="80" fixed="right">
        <template #default="{ row }">
          <el-dropdown trigger="click" @command="(cmd: string) => handleAction(cmd, row)">
            <el-button type="primary" link size="small">&#8943;</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="name">{{ I18nT('n8n.usersChangeName') }}</el-dropdown-item>
                <el-dropdown-item command="password">{{ I18nT('n8n.usersResetPassword') }}</el-dropdown-item>
                <el-dropdown-item v-if="row.roleSlug !== 'global:owner'" command="role">{{ I18nT('n8n.usersChangeRole') }}</el-dropdown-item>
                <el-dropdown-item v-if="row.roleSlug !== 'global:owner'" :command="row.disabled ? 'enable' : 'disable'">
                  {{ row.disabled ? I18nT('n8n.usersEnable') : I18nT('n8n.usersDisable') }}
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.roleSlug !== 'global:owner'"
                  command="delete"
                  style="color: var(--el-color-danger)"
                >{{ I18nT('base.del') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
</el-table>

<!-- Delete confirm dialog -->
<el-dialog
  v-model="showDeleteDialog"
  :title="I18nT('n8n.usersActions')"
  width="440px"
  :destroy-on-close="true"
>
  <p class="mb-3 text-sm">{{ I18nT('n8n.usersDeleteConfirm', { email: deletingRow?.email }) }}</p>
  <template #footer>
    <el-button @click="showDeleteDialog = false">{{ I18nT('base.cancel') }}</el-button>
    <el-button type="danger" :loading="!!deletingId" @click="confirmDelete">
      {{ I18nT('base.del') }}
    </el-button>
  </template>
</el-dialog>
    <!-- Edit Name Dialog -->
    <el-dialog
      v-model="showEditNameDialog"
      :title="I18nT('n8n.usersChangeNameTitle')"
      width="440px"
      :destroy-on-close="true"
    >
      <el-form :model="editNameForm" label-width="110px">
        <el-form-item :label="I18nT('n8n.usersFirstName')">
          <el-input v-model="editNameForm.firstName" />
        </el-form-item>
        <el-form-item :label="I18nT('n8n.usersLastName')">
          <el-input v-model="editNameForm.lastName" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditNameDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="editNameLoading" @click="confirmEditName">{{ I18nT('base.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Change Role Dialog -->
    <el-dialog
      v-model="showChangeRoleDialog"
      :title="I18nT('n8n.usersChangeRoleTitle')"
      width="400px"
      :destroy-on-close="true"
    >
      <el-form :model="changeRoleForm" label-width="80px">
        <el-form-item :label="I18nT('n8n.usersRole')">
          <el-select v-model="changeRoleForm.role" style="width: 100%">
            <el-option value="global:member" :label="I18nT('n8n.usersRoleMember')" />
            <el-option value="global:admin" :label="I18nT('n8n.usersRoleAdmin')" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChangeRoleDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="changeRoleLoading" @click="confirmChangeRole">{{ I18nT('base.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Reset Password Dialog -->
    <el-dialog
      v-model="showResetPasswordDialog"
      :title="I18nT('n8n.usersResetPasswordTitle')"
      width="440px"
      :destroy-on-close="true"
    >
      <el-form :model="resetPasswordForm" label-width="130px">
        <el-form-item :label="I18nT('n8n.usersNewPassword')">
          <el-input v-model="resetPasswordForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResetPasswordDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="resetPasswordLoading" @click="confirmResetPassword">{{ I18nT('base.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Add User Dialog -->
    <el-dialog
      v-model="showAddDialog"
      :title="I18nT('n8n.usersAddUser')"
      width="480px"
      :destroy-on-close="true"
    >
      <el-form :model="newUser" label-width="120px">
        <el-form-item :label="I18nT('n8n.usersEmail')">
          <el-input v-model="newUser.email" type="email" />
        </el-form-item>
        <el-form-item :label="I18nT('n8n.usersFirstName')">
          <el-input v-model="newUser.firstName" />
        </el-form-item>
        <el-form-item :label="I18nT('n8n.usersLastName')">
          <el-input v-model="newUser.lastName" />
        </el-form-item>
        <el-form-item :label="I18nT('n8n.usersRole')">
          <el-select v-model="newUser.role" style="width: 100%">
            <el-option value="global:member" :label="I18nT('n8n.usersRoleMember')" />
            <el-option value="global:admin" :label="I18nT('n8n.usersRoleAdmin')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="I18nT('n8n.usersNewPassword')">
          <el-input v-model="newUser.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="doCreateUser">
          {{ I18nT('base.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Invite URL Dialog -->
    <el-dialog
      v-model="showInviteUrlDialog"
      :title="I18nT('n8n.usersInviteUrlTitle')"
      width="560px"
    >
      <p class="text-sm text-gray-500 mb-3">{{ I18nT('n8n.usersInviteUrlTip') }}</p>
      <el-input v-model="inviteUrl" type="textarea" :rows="3" readonly />
      <template #footer>
        <el-button type="primary" @click="copyInviteUrl">{{ I18nT('base.copy') }}</el-button>
        <el-button @click="showInviteUrlDialog = false">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- Change Owner Password Dialog -->
    <el-dialog
      v-model="showChangePasswordDialog"
      :title="I18nT('n8n.usersChangePasswordTitle')"
      width="480px"
      :destroy-on-close="true"
    >
      <el-form :model="passwordChange" label-width="130px">
        <el-form-item :label="I18nT('n8n.usersNewPassword')">
          <el-input v-model="passwordChange.newPass" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChangePasswordDialog = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" :loading="changingPassword" @click="doChangePassword">
          {{ I18nT('base.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { BrewStore } from '@/store/brew'
  import IPC from '@/util/IPC'
  import { dialog } from '@/util/NodeFn'
  import { ElMessage } from 'element-plus'

  const brewStore = BrewStore()

  const isRunning = computed(() => {
    return !!brewStore.module('n8n').installed.find((v) => v.run)
  })

  // ── Data directory ───────────────────────────────────────────────────────
  const dataDir = ref('')
  const scanning = ref(false)
  const showScanDialog = ref(false)
  const scanResults = ref<string[]>([])
  const scanSelected = ref('')

  const loadDataDir = () => {
    IPC.send('app-fork:n8n', 'getDataDir').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) dataDir.value = res.data?.path ?? ''
    })
  }

  const scanDataDir = () => {
    scanning.value = true
    IPC.send('app-fork:n8n', 'scanDataDir').then((key: string, res: any) => {
      IPC.off(key)
      scanning.value = false
      if (res?.code !== 0) {
        ElMessage.error(res?.msg ?? 'Scan failed')
        return
      }
      const found: string[] = res.data ?? []
      if (found.length === 0) {
        ElMessage.warning(I18nT('n8n.usersDataDirScanNone'))
      } else if (found.length === 1) {
        // Only one result — apply directly
        applyDataDir(found[0])
      } else {
        scanResults.value = found
        scanSelected.value = found[0]
        showScanDialog.value = true
      }
    })
  }

  const applyScanResult = () => {
    showScanDialog.value = false
    applyDataDir(scanSelected.value)
  }

  const applyDataDir = (newPath: string) => {
    IPC.send('app-fork:n8n', 'setDataDir', newPath).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        dataDir.value = newPath
        ElMessage.success(I18nT('n8n.usersDataDirChanged'))
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? 'Failed')
      }
    })
  }

  const chooseDataDir = () => {
    dialog
      .showOpenDialog({ properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || !filePaths?.length) return
        applyDataDir(filePaths[0])
      })
  }

  // ── User list ────────────────────────────────────────────────────────────
  const users = ref<any[]>([])
  const loading = ref(false)

  const loadUsers = () => {
    loading.value = true
    IPC.send('app-fork:n8n', 'userList').then((key: string, res: any) => {
      IPC.off(key)
      loading.value = false
      if (res?.code === 0) {
        users.value = res.data ?? []
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersLoadFailed'))
      }
    })
  }

  const formatRole = (roleSlug: string) => {
    if (roleSlug === 'global:owner') return I18nT('n8n.usersRoleOwner')
    if (roleSlug === 'global:admin') return I18nT('n8n.usersRoleAdmin')
    return I18nT('n8n.usersRoleMember')
  }

  // ── Action dispatcher ────────────────────────────────────────────────────
  const handleAction = (cmd: string, row: any) => {
    if (cmd === 'delete') deleteUser(row)
    else if (cmd === 'disable') toggleDisabled(row, true)
    else if (cmd === 'enable') toggleDisabled(row, false)
    else if (cmd === 'role') openChangeRoleDialog(row)
    else if (cmd === 'name') openEditNameDialog(row)
    else if (cmd === 'password') openResetPasswordDialog(row)
  }

  // ── Toggle disabled ──────────────────────────────────────────────────────
  const toggleDisabled = (row: any, disabled: boolean) => {
    IPC.send('app-fork:n8n', 'userSetDisabled', row.id, disabled).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        ElMessage.success(disabled ? I18nT('n8n.usersDisableSuccess') : I18nT('n8n.usersEnableSuccess'))
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersToggleStatusFailed'))
      }
    })
  }

  // ── Edit name ────────────────────────────────────────────────────────────
  const showEditNameDialog = ref(false)
  const editNameRow = ref<any>(null)
  const editNameForm = ref({ firstName: '', lastName: '' })
  const editNameLoading = ref(false)

  const openEditNameDialog = (row: any) => {
    editNameRow.value = row
    editNameForm.value = { firstName: row.firstName ?? '', lastName: row.lastName ?? '' }
    showEditNameDialog.value = true
  }

  const confirmEditName = () => {
    if (!editNameRow.value) return
    editNameLoading.value = true
    IPC.send('app-fork:n8n', 'userSetName', editNameRow.value.id, editNameForm.value.firstName, editNameForm.value.lastName).then((key: string, res: any) => {
      IPC.off(key)
      editNameLoading.value = false
      if (res?.code === 0) {
        showEditNameDialog.value = false
        ElMessage.success(I18nT('n8n.usersChangeNameSuccess'))
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersChangeNameFailed'))
      }
    })
  }

  // ── Change role ──────────────────────────────────────────────────────────
  const showChangeRoleDialog = ref(false)
  const changeRoleRow = ref<any>(null)
  const changeRoleForm = ref({ role: 'global:member' })
  const changeRoleLoading = ref(false)

  const openChangeRoleDialog = (row: any) => {
    changeRoleRow.value = row
    changeRoleForm.value = { role: row.roleSlug ?? 'global:member' }
    showChangeRoleDialog.value = true
  }

  const confirmChangeRole = () => {
    if (!changeRoleRow.value) return
    changeRoleLoading.value = true
    IPC.send('app-fork:n8n', 'userSetRole', changeRoleRow.value.id, changeRoleForm.value.role).then((key: string, res: any) => {
      IPC.off(key)
      changeRoleLoading.value = false
      if (res?.code === 0) {
        showChangeRoleDialog.value = false
        ElMessage.success(I18nT('n8n.usersChangeRoleSuccess'))
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersChangeRoleFailed'))
      }
    })
  }

  // ── Reset password ───────────────────────────────────────────────────────
  const showResetPasswordDialog = ref(false)
  const resetPasswordRow = ref<any>(null)
  const resetPasswordForm = ref({ password: '' })
  const resetPasswordLoading = ref(false)

  const openResetPasswordDialog = (row: any) => {
    resetPasswordRow.value = row
    resetPasswordForm.value = { password: '' }
    showResetPasswordDialog.value = true
  }

  const confirmResetPassword = () => {
    if (!resetPasswordRow.value) return
    if (!resetPasswordForm.value.password) {
      ElMessage.warning(I18nT('n8n.usersNewPassword') + ' required')
      return
    }
    resetPasswordLoading.value = true
    IPC.send('app-fork:n8n', 'userResetPassword', resetPasswordRow.value.id, resetPasswordForm.value.password).then((key: string, res: any) => {
      IPC.off(key)
      resetPasswordLoading.value = false
      if (res?.code === 0) {
        showResetPasswordDialog.value = false
        ElMessage.success(I18nT('n8n.usersResetPasswordSuccess'))
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersResetPasswordFailed'))
      }
    })
  }

  // ── Delete user ──────────────────────────────────────────────────────────
  const deletingId = ref<string | null>(null)
  const deletingRow = ref<any>(null)
  const showDeleteDialog = ref(false)

  const deleteUser = (row: any) => {
    deletingRow.value = row
    showDeleteDialog.value = true
  }

  const confirmDelete = () => {
    if (!deletingRow.value) return
    deletingId.value = deletingRow.value.id
    IPC.send('app-fork:n8n', 'userDelete', deletingRow.value.id).then((key: string, res: any) => {
      IPC.off(key)
      deletingId.value = null
      showDeleteDialog.value = false
      if (res?.code === 0) {
        ElMessage.success(I18nT('n8n.usersDeleteSuccess'))
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersDeleteFailed'))
      }
    })
  }

  // ── Add user ─────────────────────────────────────────────────────────────
  const showAddDialog = ref(false)
  const creating = ref(false)
  const newUser = ref({ email: '', firstName: '', lastName: '', role: 'global:member', password: '' })
  const showInviteUrlDialog = ref(false)
  const inviteUrl = ref('')

  const openAddDialog = () => {
    newUser.value = { email: '', firstName: '', lastName: '', role: 'global:member', password: '' }
    showAddDialog.value = true
  }

  const doCreateUser = () => {
    if (!newUser.value.email) {
      ElMessage.warning(I18nT('n8n.usersEmail') + ' required')
      return
    }
    if (!newUser.value.password) {
      ElMessage.warning(I18nT('n8n.usersNewPassword') + ' required')
      return
    }
    creating.value = true
    IPC.send(
      'app-fork:n8n',
      'userCreate',
      newUser.value.email,
      newUser.value.firstName,
      newUser.value.lastName,
      newUser.value.role,
      newUser.value.password
    ).then((key: string, res: any) => {
      IPC.off(key)
      creating.value = false
      if (res?.code === 0) {
        showAddDialog.value = false
        ElMessage.success(I18nT('n8n.usersCreateSuccess'))
        const url = res.data?.inviteAcceptUrl ?? res.data?.user?.inviteAcceptUrl ?? ''
        if (url) {
          inviteUrl.value = url
          showInviteUrlDialog.value = true
        }
        loadUsers()
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersCreateFailed'))
      }
    })
  }

  const copyInviteUrl = () => {
    navigator.clipboard.writeText(inviteUrl.value).then(() => {
      ElMessage.success(I18nT('base.copySuccess'))
    })
  }

  // ── Change owner password ────────────────────────────────────────────────
  const showChangePasswordDialog = ref(false)
  const changingPassword = ref(false)
  const passwordChange = ref({ newPass: '' })

  const openChangePasswordDialog = () => {
    passwordChange.value = { newPass: '' }
    showChangePasswordDialog.value = true
  }

  const doChangePassword = () => {
    if (!passwordChange.value.newPass) {
      ElMessage.warning(I18nT('n8n.usersNewPassword') + ' required')
      return
    }
    changingPassword.value = true
    IPC.send(
      'app-fork:n8n',
      'userChangeOwnerPassword',
      passwordChange.value.newPass
    ).then((key: string, res: any) => {
      IPC.off(key)
      changingPassword.value = false
      if (res?.code === 0) {
        showChangePasswordDialog.value = false
        ElMessage.success(I18nT('n8n.usersChangePasswordSuccess'))
      } else {
        ElMessage.error(res?.msg ?? I18nT('n8n.usersChangePasswordFailed'))
      }
    })
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  onMounted(() => {
    loadDataDir()
    loadUsers()
  })
</script>
