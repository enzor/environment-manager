/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let scanAcrossAccounts = require('modules/queryHandlersUtil/scanAcrossAccounts');
let ScanDynamoResources = require('queryHandlers/ScanDynamoResources');

module.exports = function ScanCrossAccountDynamoResources(query) {
  return scanAcrossAccounts((accountName) => {
    let accountSpecificQuery = Object.assign({}, query, { accountName });
    return ScanDynamoResources(accountSpecificQuery);
  });
};
