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

const SixHours = 6; // period of the script execution

// NOTE: the following names of the sheets are expected
// NOTE: if the spreadsheet lacks these sheets, the code will not run
const ResponsesSheetName = "Responses";
const AutomationSheetName = "Automation";

// NOTE: this sheet name is not validated; it is used to migrate from a form per badge
// NOTE: to a single form for all CNCF badges
const LegacyResponsesSheetName = "Legacy Responses";

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

    validator = new CertificateValidator(true, "leoy+badges@google.com");
    validator.validate(legacyResponseSheet, responseSheet);
    validator.storeResultsTo(automationSheet);
}

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
