/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let sender = require('modules/sender');
let awsAccounts = require('modules/awsAccounts');
let accountValidator = require('../validators/awsAccountValidator');

function UpdateAWSAccount(command) {
  try {
    return awsAccounts.getMasterAccountName()
      .then((masterAccountName) => {
        let account = command.account;

        return accountValidator.validate(account).then((_) => {
          let dynamoCommand = {
            name: 'UpdateDynamoResource',
            resource: 'config/accounts',
            item: account,
            accountName: masterAccountName
          };

          return sender.sendCommand({ command: dynamoCommand, parent: command }).then(awsAccounts.flush);
        });
      });
  } catch (error) {
    return Promise.reject(error);
  }
}

module.exports = UpdateAWSAccount;
