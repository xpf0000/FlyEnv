import YAML from 'yamljs'

type BindType = {
  in: number
  out: number
}

export const generateComposeFile = (formData: any): string => {
  const compose: any = {
    services: {
      [formData.name]: {
        image: formData.image,
        container_name: formData.name,
        ports: formData.ports.map((p: BindType) => `${p.out}:${p.in}`),
        volumes: formData.volumes.map((p: BindType) => {
          return {
            type: 'bind',
            source: p.out,
            target: p.in,
            read_only: false
          }
        }),
        environment: formData.env.reduce(
          (acc: any, env: any) => {
            acc[env.name] = env.value
            return acc
          },
          {} as Record<string, string>
        ),
        network_mode: formData.networkMode,
        tty: formData.tty,
        stdin_open: formData.interactive,
        restart: formData.restart === 'no' ? 'no' : formData.restart
      }
    }
  }

  // 添加命令和参数
  if (formData.command) {
    if (Array.isArray(formData.command)) {
      compose.services[formData.name].command = formData.command
    } else {
      compose.services[formData.name].command = formData.command.split(' ')
    }
  }

  if (formData.args && formData.args.length > 0) {
    compose.services[formData.name].command = [
      ...(compose.services[formData.name].command || []),
      ...formData.args
    ]
  }

  return YAML.stringify(compose, Infinity, 2)
}
