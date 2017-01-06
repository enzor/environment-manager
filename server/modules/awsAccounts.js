/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

const TEN_MINUTES = 10 * 60;
const CACHE_KEY = 'AWSAccounts';

let _ = require('lodash');
let config = require('config');
let ResourceNotFoundError = require('modules/errors/ResourceNotFoundError.class');
let fetchAccounts  = require('queryHandlers/GetAWSaccounts');
let cacheManager = require('modules/cacheManager');
let accountsCache = cacheManager.create(CACHE_KEY, fetchAccounts, { stdTTL: TEN_MINUTES, logHits:false });

function getByName(accountName) {
  let matches = val => accountName.toLowerCase() === val.toString().toLowerCase();

  return getAllAccounts().then(accounts => {
    let matchingAccounts = [].concat(
      accounts.filter(account => matches(account.AccountNumber)),
      accounts.filter(account => matches(account.AccountName))
    );

    if (matchingAccounts.length > 0) {
      return matchingAccounts[0];
    } else {
      throw new ResourceNotFoundError(`AWS account ${accountName} not found`);
    }
  })
}

function getMasterAccount() {
  return getAllAccounts().then(accounts => accounts.find(a => a.IsMaster));
}

function getAMIsharingAccounts() {
  return getAllAccounts().then(accounts => accounts.filter(a => a.IncludeAMIs).map(a => a.AccountNumber))
}

function getAllAccounts() {
  return accountsCache.get(CACHE_KEY);
}

function flush() {
  accountsCache.flushAll();
  return getMasterAccount().then(account => config.setUserValue('masterAccountName', account.AccountName));
}

module.exports = {
  flush,
  all: getAllAccounts,
  getByName,
  getMasterAccount,
  getAMIsharingAccounts
};
