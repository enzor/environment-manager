/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');

const DESTINATION_ACCOUNT_ID = ''; // Assign the AWS Account ID of your Environment Manager master account
const DESTINATION_TABLE_NAME = 'InfraChangeAudit';
const WRITER_ROLE_NAME = 'roleInfraEnvironmentManagerAuditWriter';

/* See example of string matched by DYNAMO_STREAM_ARN_REGEX below:
/* arn:aws:dynamodb:us-west-2:account-id:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899
*/
const DYNAMO_STREAM_ARN_REGEX = /^(?:[^:]+:){5}[^\/]+\/([^\/]+)/;

// Copied from 'aws-sdk'
function unmarshall(data) {
  var list, map, i;
  for (var type in data) {
    var values = data[type];
    if (type === 'M') {
      map = {};
      for (var key in values) {
        map[key] = unmarshall(values[key]);
      }
      return map;
    } else if (type === 'L') {
      list = [];
      for (i = 0; i < values.length; i++) {
        list.push(unmarshall(values[i]));
      }
      return list;
    } else if (type === 'S') {
      return values + '';
    } else if (type === 'N') {
      return Number(values);
    } else if (type === 'BOOL') {
      return (values === 'true' || values === 'TRUE' || values === true);
    } else if (type === 'NULL') {
      return null;
    }
  }
}

function unmarshallImage(image) {
  delete image.Audit;
  var map = { M: image };

  return unmarshall(map);
}

function isRecordToExclude(record) {
  // Any remove operation is proceded by a change operation that replaces
  // item content to { __Deleted: true } and writes a proper audit.
  return (record.eventName === 'REMOVE');
}

function detectChangeType(record) {

  if (record.eventName == 'INSERT') return 'Created';

  var newImage = record.dynamodb.NewImage;

  // Any remove operation is proceded by a change operation that replaces
  // item content to { __Deleted: true } and writes a proper audit.
  if (newImage.__Deleted) return 'Deleted';
  else return 'Updated';

}

function getLastChangedDateFromAudit(audit) {
  if (!audit) return new Date();
  if (!audit.LastChanged) return new Date();

  var date = new Date(audit.LastChanged);
  if (date == 0) return new Date();
  if (date == 'Invalid Date') return new Date();

  return date;
}

function parseDynamoStreamARN(eventSourceARN) {
  let result = DYNAMO_STREAM_ARN_REGEX.exec(eventSourceARN);
  if (result === null) {
    throw new Error(`Failed to get the name of the source table. The eventSourceARN did not match the expected format for a DynamoDB table: ${eventSourceARN}`);
  }
  return {
    tableName: result[1],
    tableArn: result[0]
  }
}

function asAuditItem(record) {

  var changeType = detectChangeType(record);
  var dynamodb = record.dynamodb;
  var keyName = Object.keys(dynamodb.Keys)[0];
  var rangeName = Object.keys(dynamodb.Keys)[1];
  var audit = unmarshall(dynamodb.NewImage.Audit);
  var newImage = dynamodb.NewImage ? unmarshallImage(dynamodb.NewImage) : null;
  var oldImage = dynamodb.OldImage ? unmarshallImage(dynamodb.OldImage) : null;
  var user = audit ? audit.User : null;
  var lastChanged = getLastChangedDateFromAudit(audit);
  let isoTimestamp = lastChanged.toISOString();
  let tableInfo = parseDynamoStreamARN(record.eventSourceARN);

  var auditItem = {
    AuditID: record.eventID,
    Source: tableInfo.tableArn,
    Date: isoTimestamp.substring(0, 10),
    TransactionID: audit ? audit.TransactionID : null,
    Entity: {
      Type: tableInfo.tableName,
      Key: keyName ? newImage[keyName] : null,
      Range: rangeName ? newImage[rangeName] : null,
      Version: audit ? audit.Version : null
    },
    ChangeType: changeType,
    OldValue: (changeType != 'Created') ? oldImage : null,
    NewValue: (changeType != 'Deleted') ? newImage : null,
    ChangedBy: user,
    Timestamp: lastChanged.getTime(),
    ISOTimestamp: isoTimestamp
  };

  return auditItem;

}

function getAllAuditItems(event) {
  return event.Records.filter(r => !isRecordToExclude(r)).map(asAuditItem);
}

function asPutRequestItem(auditItem) {
  return {
    PutRequest: {
      Item: auditItem
    }
  };
}

function uuid() {
  function chunk(sizes, str) {
    function loop(chunkNumber, chunkStartIdx, acc) {
      if (chunkNumber >= sizes.length) {
        return acc;
      }
      if (chunkStartIdx >= str.length) {
        return acc;
      }
      let nextChunkStartIdx = chunkStartIdx + sizes[chunkNumber];
      acc.push(str.substring(chunkStartIdx, nextChunkStartIdx));
      return loop(chunkNumber + 1, nextChunkStartIdx, acc);
    }
    return loop(0, 0, []);
  }

  let s = crypto.randomBytes(16).toString('hex');
  return chunk([8, 4, 4, 4, 12], s).join('-');
}

function getDynamoClientWithCredentials(credentials) {
  let dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10', credentials: credentials });
  let documentClient = new AWS.DynamoDB.DocumentClient({ service: dynamodb });
  return documentClient;
}

/* This function returns a promise of the configuration required
 * to run this function. The current implementation just returns
 * a constant but a DynamoDB or S3 lookup would be easy. */
function getConfiguration(context) {
  return Promise.resolve({
    DestinationTableName: DESTINATION_TABLE_NAME,
    WriterRoleArn: `arn:aws:iam::${DESTINATION_ACCOUNT_ID}:role/${WRITER_ROLE_NAME}`
  });
}

exports.handler = function (event, context, callback) {
  let succeed = x => callback(null, x);
  let fail = x => callback(x);

return getConfiguration(context).then(config =>
 {
  function getAuditWriterCredentials() {
    let sts = new AWS.STS({ apiVersion: '2011-06-15' });
    let params = {
      RoleArn: config.WriterRoleArn,
      RoleSessionName: uuid(),
      DurationSeconds: 900
    };
    return new Promise(function (resolve, reject) {
      sts.assumeRole(params, function (error, data) {
        if (error) {
          reject(error);
        } else {
          let c = data.Credentials;
          resolve(new AWS.Credentials({
            accessKeyId: c.AccessKeyId,
            secretAccessKey: c.SecretAccessKey,
            sessionToken: c.SessionToken}));
        }
      });
    });
  }

  let destinationTableName = config.DestinationTableName;

   function writeItems(dynamodb, items) {
    let request = { RequestItems: {} };
    request.RequestItems[destinationTableName] = items;
    return new Promise(function (resolve, reject) {
      dynamodb.batchWrite(request, function (error, data) {
        if (error) {
          reject(error);
        } else {
          let unprocessed = data.UnprocessedItems[destinationTableName];
          if (unprocessed) {
            console.log('%d items remain to precess', unprocessed.length);
            resolve(writeItems(dynamodb, unprocessed));
          } else {
            resolve(`${auditItems.length} audit record written.`);
          }
        }
      });
    });
  }

  console.log(`Received ${event.Records.length} records from dynamo streams.`);

  var auditItems = getAllAuditItems(event);
  if (auditItems.length === 0) {
    succeed("No audit items found to write.");
    return;
  }

  let items = auditItems.map(asPutRequestItem);
  return getAuditWriterCredentials()
    .then(getDynamoClientWithCredentials)
    .then(dynamodb => writeItems(dynamodb, items))
    .then(succeed, fail);}, fail);
};