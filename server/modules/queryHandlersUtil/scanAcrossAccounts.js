/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let co = require('co');
let awsAccounts = require('modules/awsAccounts');

function* handler(scanAccount) {
  let results = [];
  let accounts = yield awsAccounts.all();

  for (let account of accounts) {
    let items = yield scanAccount(account.AccountName);

    items.forEach((item) => {
      item.AccountName = account.AccountName;
    });

    results = results.concat(items);
  }

  return results;
}

module.exports = co.wrap(handler);
