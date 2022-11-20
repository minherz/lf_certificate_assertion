/*
Copyright 2021 undefined

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


// NOTE: positions and order of the columns match the form parameters.
// NOTE: if the order of the form parameters changes, it should be reflected in these constants
const SubmitterEmailPos = 1;
const DigitalBadgeIdPos = 2;
const CertificateMailPos = 3;

// regular expression matching organization and badge UIDs from badge URL
const BadgeUrlRegEx = new RegExp('^https:\/\/api.credly.com\/api\/v1\/obi\/v2\/issuers\/([0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})\/badge_classes\/([0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})$');
const LinuxFoundationUID = 'f4b8d042-0072-4a1a-8d00-260b513026e8';
const BadgeClassUidToMomaBadgename = new Map([
    ['64567b66-def2-4c84-be6c-2586962fccd3', 'cncf_cka'],
    ['067f5afd-160d-42df-961e-31d19e117173', 'cncf_ckad'],
    ['efc98036-fdf4-4c5c-b6ca-34e58c8d61bd', 'cncf_cks'],
]);


class Notification {
    constructor(submitter, badgeId, facts) {
        this.submitter = submitter;
        this.badge = badgeId
        this.facts = facts;
    }
}

// CertificateValidator scans a sheet for CNCF certificate records, validates them and store validated records into another sheet
class CertificateValidator {
    constructor(deleteInvalidCertificates, emailForNotifications) {
        this.options = {
            'emailNotifications': !(emailForNotifications),
            'notificationsEmail': emailForNotifications,
            'deleteInvalidCerts': deleteInvalidCertificates
        };
    }

    // validate runs validation of certificate info from sourceSheets, stores one record per each valid certificate per googler
    validate(...sourceSheets) {
        if (!sourceSheets) {
            return;
        }
        // reset data from previous call
        this.notifications = [];
        this.certRecords = [];

        for (const sheet of sourceSheets)
            if (sheet) {
                const results = this.validateRecords(sheet);
                this.certRecords.push(...results);
            }
        if (this.options.emailNotifications && this.notifications.length > 0) {
            let body = [];
            this.notifications.forEach(function (notification) {
                body.push(`${notification.submitter} | ${notification.badge} | ${notification.facts.join(", ")}`)
            })
            MailApp.sendEmail({
                to: this.options.notificationsEmail,
                subject: "SBU for CNCF badges notifications",
                body: body.join("\n\r"),
                noReply: true // go/yaqs-eng/q/9216203221041676288
            });
        }
    }

    storeResultsTo(destSheet) {
        if (destSheet) {
            // clean up automation sheet from rows of expired certificates starting after receiverRows.length (excluding header row)  
            var n = destSheet.getLastRow() - 1;
            if (n > this.certRecords.length) {
                var range = destSheet.getRange(this.certRecords.length + 2, 1, n - this.certRecords.length, 2);
                range.clear();
            }
            // setup refreshed values for Teams badge automation
            if (this.certRecords.length > 0) {
                range = destSheet.getRange(2, 1, this.certRecords.length, 2);
                range.setValues(this.certRecords);
            }
        }
    }

    validateRecords(sheet) {
        let values = sheet.getDataRange().getValues();
        let validRecords = [];
        // scan all submitted records bottom up in order to be able
        // safely delete the expired or invalid records
        for (let rowi = values.length - 1; rowi > 0; rowi--) {
            const row = values[rowi];
            const ldapMail = row[SubmitterEmailPos];
            const digitalBadgeId = row[DigitalBadgeIdPos];
            let certMail = row[CertificateMailPos];
            if (certMail === "") {
                certMail = ldapMail;
            }

            let fetchResponse = UrlFetchApp.fetch(`https://api.credly.com/v1/obi/v2/badge_assertions/${digitalBadgeId}`, { muteHttpExceptions: true });
            if (fetchResponse.getResponseCode() !== 200) {
                this.notifications.push(new Notification(ldapMail, digitalBadgeId, [fetchResponse.getResponseCode(), fetchResponse.getContentText()]));
                if (this.options.deleteInvalidCerts) {
                    sheet.deleteRow(rowi + 1);
                }
                continue;
            }
            const { isValid, badgeName, error } = this.validateRecord(JSON.parse(fetchResponse.getContentText()), certMail);
            if (isValid && ldapMail) {
                validRecords.push([ldapMail, badgeName]);
            } else {
                this.notifications.push(new Notification(ldapMail, digitalBadgeId, [error]));
                if (this.options.deleteInvalidCerts) {
                    sheet.deleteRow(rowi + 1);
                }
            }
        }
        return validRecords;
    }

    validateRecord(certInfo, mailAddr) {
        // check expiration
        let expireTime = Date.parse(certInfo.expires);
        let now = new Date();
        if (now.getTime() > expireTime) {
            return { isValid: false, badgeName: "", error: "certificate is expired" };
        }
        // check recipient
        if (certInfo.recipient.type !== "email") {
            return { isValid: false, badgeName: "", error: `recipient identity ${certInfo.recipient.type} is not supported` };
        }
        if (certInfo.recipient.hashed) {
            let salt = certInfo.recipient.salt || "";
            let digest = "sha256$" + CertificateValidator.createDigest(Utilities.DigestAlgorithm.SHA_256, mailAddr.toLowerCase() + salt); // TODO: make smart choice of digest algorithm
            if (certInfo.recipient.identity !== digest) {
                return { isValid: false, badgeName: "", error: `${mailAddr} is not the certificate recipient` };
            }
        } else if (certInfo.recipient.identity != mailAddr) {
            return { isValid: false, badgeName: "", error: `${mailAddr} is not the certificate recipient` };
        }
        // identify badge
        if (certInfo.badge) {
            let matchedIds = BadgeUrlRegEx.exec(certInfo.badge);
            if (matchedIds.length !== 3) {
                return { isValid: false, badgeName: "", error: "invalid protocol response: badge Uri does not match expected format" };
            }
            if (matchedIds[1] !== LinuxFoundationUID) {
                return { isValid: false, badgeName: "", error: "unsupported certificate: badge was issued by unsupported organization" };
            }
            if (!BadgeClassUidToMomaBadgename.has(matchedIds[2])) {
                return { isValid: false, badgeName: "", error: "unsupported certificate: unsupported certification" };
            }
            return { isValid: true, badgeName: BadgeClassUidToMomaBadgename.get(matchedIds[2]) };
        } else {
            return { isValid: false, badgeName: "", error: "invalid protocol response: certificate information missing badge Uri" };
        }
    }

    static createDigest(method, message) {
        let digest = Utilities.computeDigest(method, message);
        return digest.map(function (b) {
            return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
        })
            .join("");
    }
}
