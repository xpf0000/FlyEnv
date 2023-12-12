export const Redis = {
  homebrew: {
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
      version: '6.2.14',
      installed: false,
      name: 'redis@6.2',
      flag: 'brew'
    }
  },
  macports: {
    redis: {
      name: 'redis',
      version: '7.2.1',
      installed: true,
      flag: 'port'
    }
  }
}
