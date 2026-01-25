#!/bin/bash

initenv() {
    for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
    do
        if [ -f "${HOME}/${EACH_PROFILE}" ]; then
            source "${HOME}/${EACH_PROFILE}" > /dev/null 2>&1 || true
        fi
    done
}

initenv > /dev/null 2>&1

if command -v printenv &> /dev/null; then
    printenv
    exit 0
elif command -v env &> /dev/null; then
    env
    exit 0
elif [ -f "/usr/bin/printenv" ]; then
    /usr/bin/printenv
    exit 0
elif [ -f "/usr/bin/env" ]; then
    /usr/bin/env
    exit 0
else
    export
    exit 0
fi
