import { createServer } from 'vite'
import viteConfig from '../web/vite.config'

async function launchViteDevServer(openInBrowser = false) {
  const config = openInBrowser ? viteConfig.serveConfig : viteConfig.serverConfig
  const server = await createServer({
    ...config,
    configFile: false
  })
  await server.listen()
}

launchViteDevServer(true).then(() => {
  console.log('Vite Dev Server Start !!!')
})
