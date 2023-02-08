import Icons from './vue-svg-icons.vue'
function install(app: any, name: string) {
  app.component(name, Icons)
}
export default install
