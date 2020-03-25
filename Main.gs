/*
Copyright 2020 undefined

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

const ResponseSheetName = "Responses";
const AutomationSheetName = "Automation";
const PeriodInHours = 6;

function onOpen(e) {
    if (!isValidSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())) {
        return;
    }

    var ui = SpreadsheetApp.getUi();
    ui.createAddonMenu()
      .addItem('Restart automation', 'restartAutomation')
      .addToUi();

    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === runAutomation.name) {
            return;
        }
    }
    restartAutomation();
}
  
function restartAutomation() {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
        ScriptApp.deleteTrigger(triggers[i]);
    }
    Logger.log("INFO: run automation each " + PeriodInHours + " hours");
    ScriptApp.newTrigger(runAutomation.name)
        .timeBased()
        .everyHours(PeriodInHours)
        .create();
}

// ATTENTION: order of form parameters is important; if order changes the constants in the function should be changed
function runAutomation() {
    const TimestampFieldPos = 0;
    const SubmitterEmailPos = 1;
    const DigitalBadgeIdPos = 2;
    const CertificateMailPos = 3;
    const CertificateIdPos = 4;

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var responseSheet = spreadsheet.getSheetByName(ResponseSheetName);
    var automationSheet = spreadsheet.getSheetByName(AutomationSheetName);
    var docName = spreadsheet.getName();
    var certificateName = ""
    var badgeName = ""

    if (docName.toUpperCase().startsWith("CKAD")) {
        certificateName = "CKAD";
        badgeName = "cncf_ckad";
    } else if (docName.toUpperCase().startsWith("CKA")) {
        certificateName = "CKA";
        badgeName = "cncf_cka";
    }


    // for each record in the Responses sheet
    var values = responseSheet.getDataRange().getValues();
    var receiverRows = [];
    for (var rowi = values.length - 1; rowi > 0; rowi--) {
        // pull parameters
        var ldapMail = values[rowi][SubmitterEmailPos];
        var digitalBadgeId = values[rowi][DigitalBadgeIdPos];
        var certMail = values[rowi][CertificateMailPos];
        if (certMail === "") {
            certMail = ldapMail;
        }
        var certificate = values[rowi][CertificateIdPos];
        if (certificate === "") {
            certificate = certificateName + "-";
        }
        // validate badge
        var isValid = true;
        var accessResponse = UrlFetchApp.fetch("https://api.youracclaim.com/v1/obi/v2/badge_assertions/" + digitalBadgeId);
        if (accessResponse.getResponseCode() === 200) {
            var accessObj = JSON.parse(accessResponse.getContentText());
            // confirm correct certificate
            if (!accessObj.evidence[0].description.startsWith(certificate)) {
                Logger.log("WARN: invalid certificate: " + ldapMail + " certificate is not CKA")
                isValid = false;
            }
            // validate expiration
            var expireTime = Date.parse(accessObj.expires);
            var now = new Date();
            if (now.getTime() > expireTime) {
                Logger.log("WARN: invalid certificate: " + ldapMail + " certificate is expired")
                isValid = false;
            }
            // validate ownership
            if (accessObj.recipient.type != "email") {
                Logger.log("WARN: Cannot verify recipient identity: unknown identity type");
                continue;
            }
            if (accessObj.recipient.hashed) {
                var salt = accessObj.recipient.salt || "";
                var digest = "sha256$" + createDigest(Utilities.DigestAlgorithm.SHA_256, certMail + salt); // TODO: make smart choice of digest algorithm
                if (accessObj.recipient.identity != digest) {
                    Logger.log("WARN: invalid certificate: " + ldapMail + " is not the certificate recipient")
                    isValid = false;
                }
            } else if (accessObj.recipient.identity != certMail) {
                Logger.log("WARN: invalid certificate: " + ldapMail + " is not the certificate recipient")
                isValid = false;
            }
        } else {
            Logger.log("WARN: invalid certificate: " + digitalBadgeId + " is not a valid badge id")
            isValid = false
        }

        if (isValid) {
            // add valid recipient
            receiverRows.push([ldapMail, badgeName]);
        } else {
            // delete from Responses if invalid
            responseSheet.deleteRow(rowi + 1);
        }
    } // end of for on values
    // replace existing recipients with updated ones
    var n = automationSheet.getLastRow() - 1;
    if (n > receiverRows.length) {
        // clear values in "extra" rows starting from "next" after receiverRows.length and excluding header row  
        var range = automationSheet.getRange(receiverRows.length + 2, 1, n - receiverRows.length, 2);
        range.clear();    
    }
    range = automationSheet.getRange(2, 1, receiverRows.length, 2);
    range.setValues(receiverRows);
}

function createDigest(method, message) {
    var digest = Utilities.computeDigest(method, message);
    return digest.map(function(b) {
      return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
    })
    .join("");
}

function isValidSpreadsheet(spreadsheet) {
    var responseSheet = spreadsheet.getSheetByName(ResponseSheetName);
    var automationSheet = spreadsheet.getSheetByName(AutomationSheetName);
    var docName = spreadsheet.getName();
    if (!responseSheet) {
        Logger.log("ERROR: spreadsheet '" + docName + "' has to have '" + ResponseSheetName + "' sheet");
        return false;
    }
    if (!automationSheet) {
        Logger.log("ERROR: spreadsheet '" + docName + "' has to have '" + AutomationSheetName + "' sheet");
        return false;
    }
    if (!docName.toUpperCase().startsWith("CKAD") && !docName.toUpperCase().startsWith("CKA")) {
        Logger.log("ERROR: '" + docName + "' should start with CKA or CKAD to be used for the validation");
        return false;
    }
    return true;
}
