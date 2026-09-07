#!/usr/bin/env bash

prepare_ssh_staging() {
  local directory=${1:?SSH staging directory is required}
  install -m 700 -d "$directory"
  install -m 600 /dev/null "$directory/key"
  install -m 600 /dev/null "$directory/known_hosts"
}
