export default {
  name: 'site',
  mark: 'mark',
  setup: 'setup',
  phpVersion: 'php version',
  newProject: 'New Project',
  dir: 'Dir',
  frameWork: 'Framework',
  newProjectTips:
    'Creating a new project with composer, initialize with selected framework, supports: wordpress, laravel, yii2, symfony, thinkphp, codeIgniter, cakephp, slim',
  toCreateHost: 'Create Host',
  dnsInfo:
    'Turn on a DNS server. Resolve the domain name set in the /etc/hosts file to the local ip. Mainly used for other computers or phones on the LAN to access the local site. \n' +
    'This feature requires node, so if you don\'t have it installed, please install it first.\n' +
    'How to use.\n' +
    '1. Start the DNS server.\n' +
    '2. On other computers or phones, set the DNS of the network, enter the DNS IP displayed in the current interface. It is best to keep only this one DNS setting, and then restore the original setting after it is no longer in use.\n' +
    '3. Use this command for testing: dig {ip} domain\n' +
    '4. On other computers or phones, use the domain name of the local site to access.\n',
  staticSite: 'Static Site',
  park: 'Generate Sub-Sites',
  hostsCopy: 'Copy hosts text',
  hostsOpen: 'Open custom hosts file',

  placeholderName: 'host name eg: www.xxx.com',
  placeholderAlias: 'host alias eg: www.xxx.com',
  placeholderRemarks: 'host remarks',
  placeholderRootPath: 'host root path',
  hostPort: 'Port',
  hostSSL: 'SSL',

  parkConfim: 'Make sure to generate sites based on subdirectories?'
}
