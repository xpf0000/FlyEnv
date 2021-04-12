const state = {
  taskRunning: false,
  taskLog: [],
  taskVersion: '',
  taskResult: ''
}

const getters = {
  running: (state) => state.taskRunning,
  log: (state) => state.taskLog
}

const mutations = {
  SET_TASK_VERSION (state, v) {
    state.taskVersion = v
  },
  GET_TASK_RESULT (state, v) {
    state.taskResult = v
  },
  UPDATE_TASK_STATUS (state, running) {
    state.taskRunning = running
  },
  Clean_TASK_LOG (state) {
    state.taskLog.splice(0, state.taskLog.length)
  },
  UPDATE_TASK_LOG (state, log) {
    state.taskLog.push(log)
  }
}

const actions = {
  start ({ commit }, { v }) {
    commit('UPDATE_TASK_STATUS', true)
    commit('Clean_TASK_LOG')
    commit('SET_TASK_VERSION', v)
    commit('GET_TASK_RESULT', '')
  },
  end ({ commit }) {
    commit('UPDATE_TASK_STATUS', false)
    commit('SET_TASK_VERSION', '')
  },
  updateLog ({ commit }, log) {
    commit('UPDATE_TASK_LOG', log)
  },
  cleanLog ({ commit }) {
    commit('Clean_TASK_LOG')
  },
  result ({ commit }, r) {
    commit('GET_TASK_RESULT', r)
  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
