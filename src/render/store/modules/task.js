const state = {
  nginx: {
    running: false,
    log: []
  },
  apache: {
    running: false,
    log: []
  },
  php: {
    running: false,
    log: [],
    extendRunning: false,
    currentExtend: '',
    extendAction: '',
    extendRefreshing: false
  },
  memcached: {
    running: false,
    log: []
  },
  mysql: {
    running: false,
    log: []
  },
  redis: {
    running: false,
    log: []
  }
}
const getters = {
  nginx: (state) => state.nginx,
  apache: (state) => state.apache,
  php: (state) => state.php,
  memcached: (state) => state.memcached,
  mysql: (state) => state.mysql,
  redis: (state) => state.redis
}
const mutations = {}
const actions = {}
export default { state, getters, mutations, actions }
