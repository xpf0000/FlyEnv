export const Redis = {
  brew: {
    redis: {
      version: '7.2.3',
      installed: true,
      name: 'redis',
      flag: 'brew'
    },
    'redis@3.2': {
      version: '3.2.13',
      installed: true,
      name: 'redis@3.2',
      flag: 'brew'
    },
    'redis@6.2': {
      version: '6.2.16',
      installed: false,
      name: 'redis@6.2',
      flag: 'brew'
    }
  },
  port: {
    redis: {
      name: 'redis',
      version: '7.4.0',
      installed: true,
      flag: 'port'
    }
  }
}
