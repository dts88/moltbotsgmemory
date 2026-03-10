#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

# Chill 色系
COLORS=("#8A7FC8" "#50C8B4" "#6496DC" "#A080C0")

echo "🌊 Chill Hue 动态启动"

i=0
while true; do
  color="${COLORS[$((i % 4))]}"
  $OPENHUE set room "Living room" --rgb "$color" --brightness 80 --transition-time 3s > /dev/null 2>&1
  sleep 4
  ((i++))
done
