#!/bin/bash
initenv() {
    for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"
    do
        if [ -f "${HOME}/${EACH_PROFILE}" ]; then
            . "${HOME}/${EACH_PROFILE}" > /dev/null 2>&1 || true
        fi
    done
}

initenv > /dev/null 2>&1

echo "$PATH"
