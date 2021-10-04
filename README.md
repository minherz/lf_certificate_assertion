# Automate Linux Foundation Certificate Assertion

This is an App Script that is intended for a Google spreadsheet in order to assert Linux Foundation  [CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) and [CKAD](https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/) certificates.
The script uses the fact that Linux Foundation had started [issuing](https://training.linuxfoundation.org/badges/) digital badge ids for their Kubernetes certificates.
Using the digital badge id it is possible to validate the certificate vs. email of the owner and expiration date.
The script uses [OBI Assertion API](https://www.credly.com/docs/obi_specified_endpoints) to validate the certificates.

## How it works

The script installs a time based trigger that runs every 6 hours and executes a validation function.
The function reads information from two sheets: "Responses" and "Legacy Responses" and refreshes the list of validated emails together with the a code of the badge to the "Automation" sheet.
The "Responses" sheet is used by the Google Form that allows to post the digital badge id and the email of the certificate owner while the "Legacy Responses" sheet stores the static information from "legacy" submitters.

The script differentiates between different Kubernetes certificates using Credly (former YourAcclaim) badge URLs:

| Badge | URL |
|---|---|
| CKA  | `https://api.credly.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/64567b66-def2-4c84-be6c-2586962fccd3` |
| CKAD | `https://api.credly.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/067f5afd-160d-42df-961e-31d19e117173` |
| CKS  | `https://api.credly.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/efc98036-fdf4-4c5c-b6ca-34e58c8d61bd` |

The validation process issues assertion request to the [OBI endpoint](https://www.credly.com/docs/obi_specified_endpoints#get-badge-assertion) and validates the following:

- A response code is [200](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/200)
- The badge is not expired at the validation date/time
- The email of the badge owner matches the submitted email
- The badge URL is in the supported list of the badges

> :information_source: **NOTE:** Other types of the ownership validation beside the email aren't supported

## Manual validation

It is possible to validate your LF badge manually. You will need to run the following script while replacing the `<registration_email_here>` with the valid email address that was used for the exam registration.
Note that the script assumes the identity is hashed without salt. This can change in further versions of the API.

```bash
DATA=$(curl -sH "Content-Type: application/json" \
    https://api.credly.com/v1/obi/v2/badge_assertions/7e75e005-b03e-4347-af3c-dcab5e629df2)
EXP_DATE=$(echo -n $DATA | jq .expires)
NOW=$(TZ=UTC date +"%Y-%m-%d")"T"$(TZ=UTC date +"%T")".000Z"
if [[ $EXP_DATE < $NOW ]]; then
    echo "Certificate is expired"
    exit 1
fi
EMAIL="<registration_email_here>"
DIGEST=$(echo -n $EMAIL | sha256sum)
VALID_DIGEST=$(echo -n $DATA | jq .recipient.identity)
if [[ $VALID_DIGEST != "sha256\$$DIGEST" ]]; then
    echo "Invalid certificate"
    exit 1
fi

echo "Certificate is valid"
echo $(echo -n $DATA | jq .evidence)
```

The scription validates expiration and identity of the recipient. But it does not validate which LF badge the digitial badge belongs to.
