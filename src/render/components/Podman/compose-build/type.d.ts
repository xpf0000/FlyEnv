type PortBindItemType = {
  src: string
  dest: string
}

type ApacheFormType = {
  wwwRoot: string
  ports: PortBindItemType[]
  logDir: string
}
