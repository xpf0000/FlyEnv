import { mapGetters } from 'vuex'

export const AppMixins = {
  computed: {
    ...mapGetters('app', {
      server: 'server',
      password: 'password'
    }),
    version() {
      if (!this.typeFlag) {
        return ''
      }
      return this.server?.[this.typeFlag]?.current ?? ''
    }
  }
}
