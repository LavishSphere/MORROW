#!/bin/sh
# Pterodactyl starts this with cwd /home/container. Paths are absolute.
exec node --experimental-strip-types /app/packages/api/src/index.ts
