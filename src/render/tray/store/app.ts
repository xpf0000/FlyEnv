import { defineStore } from 'pinia'

interface State {
  password: string
  nginx: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
  apache: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
  mysql: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
  php: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
  memcached: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
  redis: {
    show: boolean
    run: boolean
    running: boolean
    disabled: boolean
  }
}

const state: State = {
  apache: { show: true, disabled: true, run: false, running: false },
  memcached: { show: true, disabled: true, run: false, running: false },
  mysql: { show: true, disabled: true, run: false, running: false },
  nginx: { show: true, disabled: true, run: false, running: false },
  password: '',
  php: { show: true, disabled: true, run: false, running: false },
  redis: { show: true, disabled: true, run: false, running: false }
}

export const AppStore = defineStore('app', {
  state: (): State => state,
  getters: {
    groupIsRunning(): boolean {
      return (
        this.apache?.run ||
        this.memcached?.run ||
        this.mysql?.run ||
        this.nginx?.run ||
        this.php?.run ||
        this.redis?.run
      )
    },
    groupDisabled(): boolean {
      const allDisabled =
        this.apache?.disabled &&
        this.memcached?.disabled &&
        this.mysql?.disabled &&
        this.nginx?.disabled &&
        this.php?.disabled &&
        this.redis?.disabled
      const running =
        this.apache?.running ||
        this.memcached?.running ||
        this.mysql?.running ||
        this.nginx?.running ||
        this.php?.running ||
        this.redis?.running
      return allDisabled || running
    }
  },
  actions: {}
})
