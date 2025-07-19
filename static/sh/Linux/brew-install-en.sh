#!/bin/bash
# Homebrew installer script (Linux version)

# String coloring functions
if [[ -t 1 ]]; then
  tty_escape() { printf "\033[%sm" "$1"; }
else
  tty_escape() { :; }
fi
tty_universal() { tty_escape "0;$1"; } # Normal display
tty_green="$(tty_universal 32)"        # Green
tty_reset="$(tty_escape 0)"            # Reset color

# Check if Homebrew is already installed (Linux version)
if command -v brew &>/dev/null; then
    echo -e "${tty_green}\nDetected that brew is already installed. The installer script will exit automatically.${tty_reset}"
    echo "FlyEnv-End of Homebrew installation"
    exit 0
fi

# User confirmation
echo -e "\n              ${tty_green}Starting the Homebrew installer${tty_reset}"
echo -n "${tty_green}-> Do you want to proceed with the installation now? (Y/N) "
read user_input
echo "${tty_reset}"

case "$user_input" in
    [yY])
        echo "--> Beginning script execution"
        ;;
    *)
        echo "You entered '$user_input'. Installation aborted. To continue, please type Y or y."
        echo "FlyEnv-End of Homebrew installation"
        exit 0
        ;;
esac

# Linux-specific Homebrew installation command
echo -e "${tty_green}Installing Homebrew (Linux version)...${tty_reset}"
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Configure environment variables (Linux-specific paths)
if [[ -f "$HOME/.linuxbrew/bin/brew" ]]; then
    echo -e "${tty_green}Detected Linuxbrew, configuring environment variables...${tty_reset}"
    echo 'eval "$($HOME/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
    eval "$($HOME/.linuxbrew/bin/brew shellenv)"
fi

echo "FlyEnv-End of Homebrew installation"
