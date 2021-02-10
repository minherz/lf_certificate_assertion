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


// NOTE: the following names of the sheets are expected
// NOTE: if the spreadsheet lacks these sheets, the code will not run
const ResponsesSheetName = "Responses";
const AutomationSheetName = "Automation";

// NOTE: this sheet name is not validated; it is used to migrate from a form per badge
// NOTE: to a single form for all CNCF badges
const LegacyResponsesSheetName = "Legacy Responses";

// NOTE: positions and order of the columns match the form parameters.
// NOTE: if the order of the form parameters changes, it should be reflected in these constants
const SubmitterEmailPos = 1;
const DigitalBadgeIdPos = 2;
const CertificateMailPos = 3;

const SixHours = 6; // period of the script execution

const CertBadgeUriToTeamsBadgeName = new Map([
    ['https://api.youracclaim.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/64567b66-def2-4c84-be6c-2586962fccd3', 'cncf_cka'],
    ['https://api.youracclaim.com/api/v1/obi/v2/issuers/f4b8d042-0072-4a1a-8d00-260b513026e8/badge_classes/067f5afd-160d-42df-961e-31d19e117173', 'cncf_ckad'],
    ['unknown', 'cncf_cks'],
]);

function onOpen(e) {
    if (!isValidSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())) {
        return;
    }

    let ui = SpreadsheetApp.getUi();
    ui.createAddonMenu()
        .addItem('Restart automation', 'restartAutomation')
        .addToUi();

    let triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === runAutomation.name) {
            return;
        }
    }
    restartAutomation();
}

function restartAutomation() {
    let triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
        ScriptApp.deleteTrigger(triggers[i]);
    }
    Logger.log("INFO: run automation each " + SixHours + " hours");
    ScriptApp.newTrigger(runAutomation.name)
        .timeBased()
        .everyHours(SixHours)
        .create();
}

function runAutomation() {
    let legacyResponseSheet = getSheetByName(LegacyResponsesSheetName);
    let responseSheet = getSheetByName(ResponsesSheetName);
    let automationSheet = getSheetByName(AutomationSheetName);
    let receiverRows = [];

    let results = validateRecords(responseSheet);
    receiverRows.push(...results);
    if (legacyResponseSheet) {
        results = validateRecords(legacyResponseSheet);
        receiverRows.push(...results);
    }

    // clean up automation sheet from "extra" rows starting after receiverRows.length (excluding header row)  
    var n = automationSheet.getLastRow() - 1;
    if (n > receiverRows.length) {
        var range = automationSheet.getRange(receiverRows.length + 2, 1, n - receiverRows.length, 2);
        range.clear();
    }
    // setup refreshed values for Teams badge automation
    if (receiverRows.length > 0) {
        range = automationSheet.getRange(2, 1, receiverRows.length, 2);
        range.setValues(receiverRows);
    }
}

function validateRecords(sheet) {
    let values = sheet.getDataRange().getValues();
    let validatedRecords = [];
    // scan all submitted records bottom up in order to be able
    // safely delete the expired or invalid records
    for (let rowi = values.length - 1; rowi > 0; rowi--) {
        let ldapMail = values[rowi][SubmitterEmailPos];
        let digitalBadgeId = values[rowi][DigitalBadgeIdPos];
        let certMail = values[rowi][CertificateMailPos];
        if (certMail === "") {
            certMail = ldapMail;
        }
        const { isValid, badgeName } = validateRecord(digitalBadgeId, certMail);
        if (isValid && ldapMail) {
            validatedRecords.push([ldapMail, badgeName]);
        } else {
            sheet.deleteRow(rowi + 1);
        }
    }
    return validatedRecords;
}

function validateRecord(digitalBadgeId, mailAddr) {
    let accessResponse = UrlFetchApp.fetch("https://api.youracclaim.com/v1/obi/v2/badge_assertions/" + digitalBadgeId, { muteHttpExceptions: true });
    if (accessResponse.getResponseCode() !== 200) {
        Logger.log("WARN: invalid certificate: " + digitalBadgeId + " is not a valid badge id")
        return { isValid: false, badgeName: "" };
    }

    let certInfo = JSON.parse(accessResponse.getContentText());
    let expireTime = Date.parse(certInfo.expires);
    let now = new Date();
    if (now.getTime() > expireTime) {
        Logger.log("WARN: certificate '" + digitalBadgeId + "' is expired")
        return { isValid: false, badgeName: "" };
    }
    if (certInfo.recipient.type != "email") {
        Logger.log("WARN: Cannot verify recipient identity: unknown identity type");
        return { isValid: false, badgeName: "" };
    }
    if (certInfo.recipient.hashed) {
        let salt = certInfo.recipient.salt || "";
        let digest = "sha256$" + createDigest(Utilities.DigestAlgorithm.SHA_256, mailAddr + salt); // TODO: make smart choice of digest algorithm
        if (certInfo.recipient.identity != digest) {
            Logger.log("WARN: invalid certificate: " + mailAddr + " is not the certificate recipient")
            return { isValid: false, badgeName: "" };
        }
    } else if (certInfo.recipient.identity != mailAddr) {
        Logger.log("WARN: invalid certificate: " + mailAddr + " is not the certificate recipient")
        return { isValid: false, badgeName: "" };
    }
    if (!certInfo.badge || !CertBadgeUriToTeamsBadgeName.has(certInfo.badge)) {
        Logger.log("WARN: invalid protocol response: certificate information missing badge Uri")
        return { isValid: false, badgeName: "" };
    }
    return { isValid: true, badgeName: CertBadgeUriToTeamsBadgeName.get(certInfo.badge) };
}

function createDigest(method, message) {
    let digest = Utilities.computeDigest(method, message);
    return digest.map(function (b) {
        return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
    })
        .join("");
}

function isValidSpreadsheet(spreadsheet) {
    let responseSheet = getSheetByName(ResponsesSheetName);
    let automationSheet = getSheetByName(AutomationSheetName);

    if (!responseSheet || !automationSheet) {
        return false;
    }
}

function getSheetByName(name) {
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) {
        Logger.log("ERROR: spreadsheet has to have '" + name + "' sheet");
    }
    return sheet;
}
