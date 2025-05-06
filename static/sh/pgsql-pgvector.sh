#!/bin/zsh
export PATH="{BinPath}:$PATH"
cd /tmp
sudo -S rm -rf pgvector
git clone --branch {Branch} https://github.com/pgvector/pgvector.git
cd pgvector
sudo -S make
sudo -S make install
sudo -S rm -rf pgvector
