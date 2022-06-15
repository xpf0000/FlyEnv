const state = {
  cardHeadTitle: '当前版本库',
  brewRunning: false,
  showInstallLog: false,
  brewSrc: '',
  log: [],
  nginx: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  apache: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  php: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  memcached: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  mysql: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  },
  redis: {
    getListing: false,
    installedInited: false,
    installed: [],
    list: {}
  }
}
const getters = {
  brewSrc: (state) => state.brewSrc,
  cardHeadTitle: (state) => state.cardHeadTitle,
  showInstallLog: (state) => state.showInstallLog,
  log: (state) => state.log,
  brewRunning: (state) => state.brewRunning,
  nginx: (state) => state.nginx,
  apache: (state) => state.apache,
  php: (state) => state.php,
  memcached: (state) => state.memcached,
  mysql: (state) => state.mysql,
  redis: (state) => state.redis
}
const mutations = {
  SET_BREW_SRC(state, val) {
    state.brewSrc = val
  },
  RESET_BREW_INSTALLED_INITED(state, typeFlag) {
    state[typeFlag].installedInited = false
  },
  SET_BREW_RUNNING(state, val) {
    state.brewRunning = val
  },
  SET_SHOW_INSTALL_LOG(state, val) {
    state.showInstallLog = val
  },
  SET_CARD_HEAD_TITLE(state, val) {
    state.cardHeadTitle = val
  }
}
const actions = {}
export default { state, getters, mutations, actions }
