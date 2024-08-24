#!/bin/zsh
export PATH="##BIN_PATH##:$PATH"
cd /tmp
echo "##PASSWORD##" | sudo -S rm -rf pgvector
git clone --branch ##BRANCH## https://github.com/pgvector/pgvector.git
cd pgvector
echo "##PASSWORD##" | sudo -S make
echo "##PASSWORD##" | sudo -S make install
echo "##PASSWORD##" | sudo -S rm -rf pgvector
