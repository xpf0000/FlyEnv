#!/bin/zsh
export PATH="##BIN_PATH##:$PATH"
cd /tmp
sudo -S rm -rf pgvector
git clone --branch ##BRANCH## https://github.com/pgvector/pgvector.git
cd pgvector
sudo -S make
sudo -S make install
sudo -S rm -rf pgvector
