# Automate Linux Foundation Certificate Assertion

This is a simple Google App Script that can be added to a Google spreadsheet in order to assert Linux Foundation  [CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) and [CKAD](https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/) certificates. The script has to be copied/added to the spreadsheet since it is not possible to associate a spreadsheet with custom App Script project.

The script installs a trigger that runs executes validation function each `PeriodInHours` hours. The spreadsheet has to have two sheets with the fixed names:

- "Responses" -- contains information about certificates that has to be asserted
- "Automation" -- stores emails of the certificate holders who passed the validation

At the moment, the script validates _*ONLY*_ one certificate (either CKA or CKAD). The information that is required for validation includes:

- email of the certificate holder
- LF digital badge id issued by [youracclaim.com](https://youracclaim.com)
- email used for the certificate registration (can be empty if it is same to the holder's email)
- LF certificate number (can be empty)

The script uses [OBI Assertion API](https://www.youracclaim.com/docs/obi_specified_endpoints) to verify digital badge id. It validates

- the digital badge is valid
- the digital badge is not expired
- the digital badge is granted to the correct email
- the LF certificate associated with the badge match the provided LF certificate. If the certificate isn't provided, the validation confirms the certificate is CKA or CKAD respectively
