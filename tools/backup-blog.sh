#!/usr/bin/env bash
set -euo pipefail

SRC="/Users/krokland/Desktop/iA/blog"
DST_BASE="/Users/krokland/Desktop/iA/backups/blog"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"

mkdir -p "$DST_BASE"

ARCHIVE="$DST_BASE/blog-backup-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "/Users/krokland/Desktop/iA" blog

# Mantener 30 backups más recientes
ls -1t "$DST_BASE"/blog-backup-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "Backup creado: $ARCHIVE"
