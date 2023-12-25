export const Postgresql = {
  homebrew: {
    'postgresql@16': {
      version: '16.1',
      installed: false,
      name: 'postgresql@16',
      flag: 'brew'
    },
    'postgresql@15': {
      version: '15.5',
      installed: true,
      name: 'postgresql@15',
      flag: 'brew'
    },
    'postgresql@14': {
      version: '14.10',
      installed: false,
      name: 'postgresql@14',
      flag: 'brew'
    },
    'postgresql@13': {
      version: '13.13',
      installed: false,
      name: 'postgresql@13',
      flag: 'brew'
    },
    'postgresql@12': {
      version: '12.17',
      installed: true,
      name: 'postgresql@12',
      flag: 'brew'
    },
    'postgresql@11': {
      version: '11.22',
      installed: false,
      name: 'postgresql@11',
      flag: 'brew'
    },
    'postgresql@10': {
      version: '10.22',
      installed: false,
      name: 'postgresql@10',
      flag: 'brew'
    }
  },
  macports: {
    postgresql16: {
      name: 'postgresql16',
      version: '16.0',
      installed: true,
      flag: 'port'
    },
    postgresql15: {
      name: 'postgresql15',
      version: '15.4',
      installed: false,
      flag: 'port'
    },
    postgresql14: {
      name: 'postgresql14',
      version: '14.9',
      installed: false,
      flag: 'port'
    },
    postgresql13: {
      name: 'postgresql13',
      version: '13.12',
      installed: false,
      flag: 'port'
    },
    postgresql12: {
      name: 'postgresql12',
      version: '12.16',
      installed: true,
      flag: 'port'
    },
    postgresql11: {
      name: 'postgresql11',
      version: '11.14',
      installed: false,
      flag: 'port'
    },
    postgresql10: {
      name: 'postgresql10',
      version: '10.19',
      installed: false,
      flag: 'port'
    },
    postgresql96: {
      name: 'postgresql96',
      version: '9.6.24',
      installed: false,
      flag: 'port'
    },
    postgresql95: {
      name: 'postgresql95',
      version: '9.5.25',
      installed: false,
      flag: 'port'
    },
    postgresql94: {
      name: 'postgresql94',
      version: '9.4.26',
      installed: false,
      flag: 'port'
    },
    postgresql93: {
      name: 'postgresql93',
      version: '9.3.25',
      installed: false,
      flag: 'port'
    },
    postgresql92: {
      name: 'postgresql92',
      version: '9.2.24',
      installed: false,
      flag: 'port'
    },
    postgresql91: {
      name: 'postgresql91',
      version: '9.1.24',
      installed: false,
      flag: 'port'
    },
    postgresql90: {
      name: 'postgresql90',
      version: '9.0.23',
      installed: false,
      flag: 'port'
    },
    postgresql84: {
      name: 'postgresql84',
      version: '8.4.22',
      installed: false,
      flag: 'port'
    },
    postgresql83: {
      name: 'postgresql83',
      version: '8.3.23',
      installed: false,
      flag: 'port'
    }
  }
}
