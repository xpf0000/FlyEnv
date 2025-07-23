#!/bin/bash

open_terminal_with_command() {
    local command="$1"
    local terminal_found=false

    local desktop_env=""
    if [ -n "$XDG_CURRENT_DESKTOP" ]; then
        desktop_env="$XDG_CURRENT_DESKTOP"
    else
        desktop_env=$(echo "$XDG_DATA_DIRS" | grep -Eo 'gnome|kde|xfce|mate|cinnamon|lxde|lxqt')
    fi

    local use_temp_file=false
    if [ ${#command} -gt 100 ]; then
        use_temp_file=true
    fi

    local exec_cmd
    if $use_temp_file; then
        local temp_script=$(mktemp /tmp/term-cmd.XXXXXX)
        echo "#!/bin/bash" > "$temp_script"
        echo "$command" >> "$temp_script"
        echo 'echo -e "\nCommand execution completed. Press any key to close..."; read -n1 -s' >> "$temp_script"
        chmod +x "$temp_script"
        exec_cmd="set +H; bash \"$temp_script\"; echo \"$temp_script\""
    else
        exec_cmd="set +H; $command; echo -e '\nCommand execution completed. Press any key to close...'; read -n1 -s"
    fi

    echo "command: $exec_cmd"

    for terminal in "$TERMINAL" gnome-terminal kitty konsole xfce4-terminal mate-terminal lxterminal terminator tilix alacritty xterm urxvt; do
        case "$terminal" in
            gnome-terminal)
                if command -v gnome-terminal &>/dev/null; then
                    echo "terminal command: gnome-terminal -- bash -c \"$exec_cmd\""
                    gnome-terminal -- bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            kitty)
                if command -v kitty &>/dev/null; then
                    kitty bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            konsole)
                if command -v konsole &>/dev/null; then
                    konsole --noclose -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            xfce4-terminal)
                if command -v xfce4-terminal &>/dev/null; then
                    xfce4-terminal --execute bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            mate-terminal)
                if command -v mate-terminal &>/dev/null; then
                    mate-terminal --command="bash -c '$exec_cmd'"
                    terminal_found=true
                    break
                fi
                ;;
            lxterminal)
                if command -v lxterminal &>/dev/null; then
                    lxterminal -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            terminator)
                if command -v terminator &>/dev/null; then
                    terminator -e "bash -c '$exec_cmd'"
                    terminal_found=true
                    break
                fi
                ;;
            tilix)
                if command -v tilix &>/dev/null; then
                    tilix -e "bash -c '$exec_cmd'"
                    terminal_found=true
                    break
                fi
                ;;
            alacritty)
                if command -v alacritty &>/dev/null; then
                    alacritty -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            xterm)
                if command -v xterm &>/dev/null; then
                    xterm -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            urxvt)
                if command -v urxvt &>/dev/null; then
                    urxvt -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
            "$TERMINAL")
                if [ -n "$TERMINAL" ] && command -v "$TERMINAL" &>/dev/null; then
                    "$TERMINAL" -e bash -c "$exec_cmd"
                    terminal_found=true
                    break
                fi
                ;;
        esac
    done

    if ! $terminal_found; then
        if [ -n "$desktop_env" ]; then
            case "$desktop_env" in
                *GNOME*)
                    if command -v gnome-terminal &>/dev/null; then
                        gnome-terminal -- bash -c "$exec_cmd"
                        terminal_found=true
                    fi
                    ;;
                *KDE*)
                    if command -v konsole &>/dev/null; then
                        konsole --noclose -e bash -c "$exec_cmd"
                        terminal_found=true
                    fi
                    ;;
                *XFCE*)
                    if command -v xfce4-terminal &>/dev/null; then
                        xfce4-terminal --execute bash -c "$exec_cmd"
                        terminal_found=true
                    fi
                    ;;
            esac
        fi

        if ! $terminal_found && command -v x-terminal-emulator &>/dev/null; then
            x-terminal-emulator -e bash -c "$exec_cmd"
            terminal_found=true
        fi
    fi

    if ! $terminal_found; then
        echo "Error: Could not find a supported terminal emulator." >&2
        echo "Tried: gnome-terminal, kitty, konsole, xfce4-terminal, mate-terminal," >&2
        echo "lxterminal, terminator, tilix, alacritty, xterm, urxvt" >&2
        return 1
    fi

    return 0
}

open_terminal_with_command "$1"
