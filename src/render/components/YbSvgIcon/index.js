import Icons from './vue-svg-icons.vue'
function install(app, name) {
  app.component(name, Icons)
}
export default install
