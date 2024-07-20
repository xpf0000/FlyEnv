#!/usr/bin/bash
arch=$(uname -m)
echo "$arch"
if [[ $arch != "x86_64" ]]; then
  exit 0;
fi
if [ -f "~/.bashrc" ]; then
  source ~/.bashrc
fi
if [ -f "~/.zshrc" ]; then
  source ~/.zshrc
fi
password=$1
if [ -f "/etc/fedora-release" ]; then
  echo "$password" | sudo -S dnf install https://rpms.remirepo.net/fedora/remi-release-$(cut -d ' ' -f 3 /etc/fedora-release).rpm
  echo "$password" | sudo -S dnf config-manager --set-enabled remi
  echo "$password" | sudo -S dnf update
  exit 0
fi
if [ -f "/etc/redhat-release" ]; then
  echo "$password" | sudo -S dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-$(cut -d ' ' -f 4 /etc/redhat-release | cut -d '.' -f 1).noarch.rpm -y
  echo "$password" | sudo -S dnf install https://rpms.remirepo.net/enterprise/remi-release-$(cut -d ' ' -f 4 /etc/redhat-release | cut -d '.' -f 1).rpm -y
  echo "$password" | sudo -S dnf update
fi
