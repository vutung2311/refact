#!/bin/sh
if [ -z "$REFACT_DATABASE_HOST" ]; then
    echo "Required REFACT_DATABASE_HOST is undefined"
    exit 1;
fi
python -m self_hosting_machinery.watchdog.docker_watchdog
