/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let co = require('co');
let assertContract = require('modules/assertContract');
let AwsError = require('modules/errors/AwsError.class');
let TopicNotFoundError = require('modules/errors/TopicNotFoundError.class');
let config = require('config');
let awsAccounts = require('modules/awsAccounts');
let amazonClientFactory = require('modules/amazon-client/childAccountClient');

const AWS_REGION = config.get('EM_AWS_REGION');

module.exports = function SNSTopicClient(accountName) {
  this.get = function (parameters) {
    assertContract(parameters, 'parameters', {
      properties: {
        topicName: { type: String, empty: false },
      },
    });

    return co(function* () {
      let awsAccount = yield awsAccounts.getByName(accountName);
      let topicArn = yield getTopicArnByConvention(parameters.topicName, awsAccount);
      let client = yield amazonClientFactory.createSNSClient(accountName);
      let topic = yield client.getTopicAttributes({ TopicArn: topicArn }).promise().then(

        response => Promise.resolve(response.Attributes),
        error => Promise.reject(error.code === 'NotFound' ? 
          new TopicNotFoundError(`Topic '${parameters.topicName}' not found.`) 
          : new AwsError(error.message))
      );
      return topic;
    });
  };

  function getTopicArnByConvention(topicName, awsAccount) {
    let topicArn = `arn:aws:sns:${AWS_REGION}:${awsAccount.AccountNumber}:${topicName}`;
    return Promise.resolve(topicArn);
  }
};
