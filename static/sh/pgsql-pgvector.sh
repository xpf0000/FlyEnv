#!/bin/zsh
## Macports 路径替换为自己的
export PGROOT="/opt/local/lib/postgresql14"
export PATH="/opt/local/lib/postgresql14/bin:$PATH"
## Homebrew 路径替换为自己的
#export PGROOT="/usr/local/Cellar/postgresql@16/16.3"
#export PATH="/usr/local/Cellar/postgresql@16/16.3/bin:$PATH"
echo "$PGROOT"
echo "$PATH"
cd /tmp
sudo rm -rf pgvector
git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git
cd pgvector
sudo make
sudo make install
sudo rm -rf pgvector
