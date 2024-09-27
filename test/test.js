const axios = require('axios')

axios({
  url: 'https://api.macphpstudy.com/api/version/fetch',
  method: 'post',
  data: {
    app: 'apache',
    os: 'win',
    arch: 'x86'
  }
}).then((res) => {
  console.log(res?.data)
})
