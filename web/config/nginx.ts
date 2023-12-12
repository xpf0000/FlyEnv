export const Nginx = {
  homebrew: {
    nginx: {
      version: '1.25.3',
      installed: true,
      name: 'nginx',
      flag: 'brew'
    }
  },
  macports: {
    nginx: {
      name: 'nginx',
      version: '1.24.0',
      installed: true,
      flag: 'port'
    }
  }
}
