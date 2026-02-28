import Base from './index'

Base.start({
  accountId: 'a857981d126a7423a175c8116bcf7200',
  apiToken: 'D-9fxlfvju5d4QNW1GPCOkkVYRIewBM5Il8QBpr5',
  cloudflaredBin: 'E:\\Github\\FlyEnv\\data\\app\\cloudflared\\2026.2.0\\cloudflared.exe',
  id: 'LJ1wbXCIOPvUtFYOjM5wBHWiWjsbWzcg',
  localService: 'nginxtest.test',
  pid: '',
  subdomain: 'tunnel-test',
  zoneId: '225be1e69af2d88dfe1d90c9b87ef879',
  zoneName: 'one-env.com'
} as any)
  .then((res) => {
    console.log(res)
  })
  .catch((err) => {
    console.error(err)
    console.error(err?.response?.data?.errors)
  })
