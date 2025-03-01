export default {
  startInstall: 'Iniciar a instalação de {service}',
  startDown: 'Iniciar o download de {service}, Link de download: {url}',
  downSuccess: 'Download concluído, instalar {service}',
  downFail: 'Falha no download, a instalação de {service} falhou',
  installSuccess: 'Instalação de {service} concluída com sucesso, local de instalação: {appDir}',
  installFail: 'Falha na instalação de {service}, motivo: {error}',
  installFromZip: 'O pacote de instalação já existe, instalar {service}',
  installFromZipFail:
    'Falha na instalação, baixe o pacote de instalação novamente para instalar',

  startServiceBegin: 'Iniciando o serviço {service}...',
  serviceUseBundle: 'Versão interna utilizada, iniciando a descompactação e instalação de {service}',
  bundleUnzipSuccess: 'Descompactação concluída com sucesso, local de instalação: {appDir}',
  bundleUnzipFail: 'Falha na descompactação, motivo: {error}',
  confInit: 'O arquivo de configuração não existe, gerando arquivo de configuração',
  confInitSuccess: 'Arquivo de configuração gerado com sucesso, caminho do arquivo: {file}',
  confInitFail: 'Falha ao gerar o arquivo de configuração, motivo: {error}',
  apachePortHandleBegin: 'Iniciando a obtenção de todas as portas de escuta do Apache no site',
  apachePortHandleEnd:
    'Obtenção das portas de escuta do Apache concluída, arquivo de configuração escrito com sucesso',
  execStartCommand: 'Iniciando a execução do comando de inicialização',
  execStartCommandSuccess:
    'Comando de inicialização executado com sucesso, verificando se a inicialização foi bem-sucedida',
  execStartCommandFail:
    'Falha na execução do comando de inicialização, motivo: {error}, o serviço {service} falhou ao iniciar',
  startServiceSuccess: 'Serviço {service} iniciado com sucesso, pid: {pid}',
  startServiceFail: 'Falha ao iniciar o serviço {service}, motivo: {error}',

  stopServiceBegin: 'Iniciando a parada do serviço {service}',
  stopServiceEnd: 'Serviço {service} parado com sucesso',

  initDBPass: 'Iniciando a inicialização da senha do banco de dados',
  initDBPassSuccess: 'Senha do banco de dados inicializada com sucesso, conta e senha: {user} {pass}',
  initDBPassFail: 'Falha ao inicializar a senha do banco de dados, motivo: {error}',
  initDBDataDir: 'Pasta de dados não encontrada, iniciando a inicialização da pasta de dados',
  initDBDataDirSuccess: 'Inicialização da pasta de dados concluída com sucesso, caminho: {dir}',
  initDBDataDirFail: 'Falha ao inicializar a pasta de dados, motivo: {error}',

  initPlugin: 'Iniciando a inicialização do plugin e executando o comando: {command}',
  initPluginSuccess: 'Plugin inicializado com sucesso',
  initPluginFail: 'Falha ao inicializar o plugin, motivo: {error}',

  erlangEnvInit: 'Tentando inicializar o ambiente de execução Erlang',
  erlangEnvInitEnd: 'Inicialização do ambiente de execução Erlang concluída',

  newProjectBegin: 'Iniciando um novo projeto e executando o comando: {command}',
  newProjectSuccess: 'Novo projeto criado com sucesso, caminho do projeto: {dir}',
  newProjectFail: 'Falha ao criar novo projeto'
}
