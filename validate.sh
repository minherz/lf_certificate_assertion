#!/usr/bin/env bash

set -eu

_error_report() {
  echo >&2 "Exited [$?] at line $(caller):"
  cat -n $0 | tail -n+$(($1 - 3)) | head -n7 | sed "4s/^\s*/>>> /"
}
trap '_error_report $LINENO' ERR

# Read input parameters
read -rp "Please input digital badge id: " badge_id
if [[ -z "${badge_id}" ]]; then
    echo "Cannot validate certification without digital badge id"
    exit 1

read -rp "Please input an email address used for certification exam registration: " subscriber_email
if [[ -z "${subscriber_email}" ]]; then
    echo "Cannot validate certification without email address"
    exit 1

invalid=0
data=$(curl -sH "Content-Type: application/json" https://api.credly.com/v1/obi/v2/badge_assertions/$badge_id)
exp_date=$(echo -n $data | jq -r .expires)
now=$(TZ=UTC date +"%Y-%m-%d")"T"$(TZ=UTC date +"%T")".000Z"

#Validate certificate exists
if [[ -z "${data}" ]]; then
    echo "Certificate with the badge '${badge_id}' does not exist"
    invalid=1
fi

# Validate that certificate is not expired
if [[ $exp_date < $now ]]; then
    echo "Certificate is expired"
    invalid=1
fi

# Validate that certificate is issued to the provided email
digest=($(echo -n ${subscriber_email,,} | sha256sum))
valid_digest=$(echo -n $data | jq -r .recipient.identity)
if [[ $valid_digest != "sha256\$$digest" ]]; then
    echo "Certificate was not issued to ${subscriber_email}"
    invalid=1
fi

if [ $invalid -eq 0 ]; then
   echo "Certificate is valid"
   echo $(echo -n $data | jq .evidence)
fi
