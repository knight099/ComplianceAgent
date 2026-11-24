#!/bin/sh
# Install for the current IT-managed user after provisioning the enrollment file.
set -eu
unitdir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
base="${XDG_DATA_HOME:-$HOME/.local/share}/complyos"
if [ "${1:-}" = uninstall ]; then
  systemctl --user disable --now complyos.timer
  rm -f "$unitdir/complyos.service" "$unitdir/complyos.timer" "$base/linux.py"
  systemctl --user daemon-reload
  exit 0
fi
umask 077
mkdir -p "$unitdir" "$base"
install -m 700 "$(dirname "$0")/linux.py" "$base/linux.py"
install -m 600 "${1:?provide enrollment JSON}" "$base/device.json"
cat > "$unitdir/complyos.service" <<UNIT
[Unit]
Description=Collect local privileged group evidence
[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/bin/python3 "$base/linux.py" "$base/device.json" "$base/latest.bundle"
UNIT
cat > "$unitdir/complyos.timer" <<UNIT
[Unit]
Description=Collect ComplyOS evidence hourly
[Timer]
OnCalendar=hourly
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now complyos.timer
systemctl --user start complyos.service
