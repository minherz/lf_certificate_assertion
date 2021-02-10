# Automate Linux Foundation Certificate Assertion

This is an App Script that is intended for a Google spreadsheet in order to assert Linux Foundation  [CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) and [CKAD](https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/) certificates.
The script uses the fact that Linux Foundation had started [issuing](https://training.linuxfoundation.org/badges/) digital badge ids for their Kubernetes certificates.
Using the digital badge id it is possible to validate the certificate vs. email of the owner and expiration date.
The script uses [OBI Assertion API](https://www.youracclaim.com/docs/obi_specified_endpoints) to validate the certificates.

## How it works

The script installs a time based trigger that runs every 6 hours and executes a validation function.
The function reads information from two sheets: "Responses" and "Legacy Responses" and refreshes the list of validated emails together with the a code of the badge to the "Automation" sheet.
The "Responses" sheet is used by the Google Form that allows to post the digital badge id and the email of the certificate owner while the "Legacy Responses" sheet stores the static information from "legacy" submitters.

The script differentiates between different Kubernetes certificates using youracclaim badge URLs:

| Badge | URL |
|---|---|
| CKA | `https://api.youracclaim.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/64567b66-def2-4c84-be6c-2586962fccd3` |
| CKAD | `https://api.youracclaim.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/067f5afd-160d-42df-961e-31d19e117173` |
| CKS | _will be supported soon_ |

The validation process issues assertion request to the [OBI endpoint](https://www.youracclaim.com/docs/obi_specified_endpoints#get-badge-assertion) and validates the following:

- A response code is [200](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/200)
- The badge is not expired at the validation date/time
- The email of the badge owner matches the submitted email
- The badge URL is in the supported list of the badges

> :information_source: **NOTE:** Other types of the ownership validation beside the email aren't supported

