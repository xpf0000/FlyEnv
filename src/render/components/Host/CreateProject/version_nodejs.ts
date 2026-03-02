const version = {
  'Next.js': {
    url: 'https://nextjs.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npx create-next-app@latest'
      }
    ]
  },
  Remix: {
    url: 'https://remix.run/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npx create-remix'
      }
    ]
  },
  Gatsby: {
    url: 'https://www.gatsbyjs.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npx create-gatsby'
      }
    ]
  },
  Expo: {
    url: 'https://expo.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm exec create-expo-app'
      }
    ]
  },
  Vue: {
    url: 'https://vuejs.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm create vue@latest'
      }
    ]
  },
  VitePress: {
    url: 'https://vuejs.org/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm add -D vitepress;npx vitepress init'
      }
    ]
  },
  NestJS: {
    url: 'https://nestjs.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm i -g @nestjs/cli; sleep 1.5; nest new',
        commandWin: 'npm i -g @nestjs/cli;Start-Sleep -Seconds 1.5;nest new'
      }
    ]
  },
  Nuxt: {
    url: 'https://nuxt.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npx nuxi@latest init'
      }
    ]
  },
  Svelte: {
    url: 'https://svelte.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm create sv@latest'
      }
    ]
  },
  Astro: {
    url: 'https://astro.build/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm create astro@latest'
      }
    ]
  },
  Hono: {
    url: 'https://hono.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm create hono@latest'
      }
    ]
  },
  Solid: {
    url: 'https://www.solidjs.com/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm create solid@latest'
      }
    ]
  },
  Fastify: {
    url: 'https://fastify.dev/',
    list: [
      {
        name: 'latest',
        version: '*',
        command: 'npm init fastify'
      }
    ]
  }
}
export default version
