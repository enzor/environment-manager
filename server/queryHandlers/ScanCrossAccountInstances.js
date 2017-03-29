/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let scanAcrossAccounts = require('modules/queryHandlersUtil/scanAcrossAccounts');
let ScanInstances = require('queryHandlers/ScanInstances');

module.exports = function ScanCrossAccountInstances(query) {
  return scanAcrossAccounts((accountName) => {
    let accountSpecificQuery = Object.assign({}, query, { accountName });
    return ScanInstances(accountSpecificQuery);
  });
};
