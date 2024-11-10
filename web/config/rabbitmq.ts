export const Rabbitmq = {
  brew: {
    rabbitmq: {
      version: '4.0.2',
      installed: true,
      name: 'rabbitmq',
      flag: 'brew'
    }
  },
  port: {
    'rabbitmq-server': {
      version: '3.11.15',
      installed: false,
      name: 'rabbitmq-server',
      flag: 'port'
    }
  }
}
