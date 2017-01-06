/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

const KEY_NAME = 'EnvironmentName';

let _ = require('lodash');
let co = require('co');

let DynamoHelper = require('api/api-utils/DynamoHelper');

let environmentTable = new DynamoHelper('config/environments');
let opsEnvironmentTable = new DynamoHelper('ops/environments');
let lbSettingsTable = new DynamoHelper('config/lbsettings');
let lbUpstreamsTable = new DynamoHelper('config/lbupstream');

let Environment = require('models/Environment');

/**
 * GET /config/environments
 */
function getEnvironmentsConfig(req, res, next) {
  const environmentType = req.swagger.params.environmentType.value;
  const cluster = req.swagger.params.cluster.value;

  let filter = {
    'Value.OwningCluster': cluster,
    'Value.EnvironmentType': environmentType
  };
  filter = _.omitBy(filter, _.isUndefined);

  return environmentTable.getAll(filter).then(data => res.json(data)).catch(next);
}

/**
 * GET /config/environments/{name}
 */
function getEnvironmentConfigByName(req, res, next) {
  const key = req.swagger.params.name.value;
  return environmentTable.getByKey(key).then(data => res.json(data)).catch(next);
}

/**
 * POST /config/environments
 */
function postEnvironmentsConfig(req, res, next) {
  const body = req.swagger.params.body.value;
  const user = req.user;

  return environmentTable.create(body[KEY_NAME], { Value: body.Value }, user).then(_ => res.status(201).end()).catch(next);
}

/**
 * PUT /config/environments/{name}
 */
function putEnvironmentConfigByName(req, res, next) {
  const key = req.swagger.params.name.value;
  const expectedVersion = req.swagger.params['expected-version'].value;
  const body = req.swagger.params.body.value;
  const user = req.user;

  return environmentTable.update(key, { Value: body }, expectedVersion, user)
    .then(_ => res.status(200).end())
    .catch(next);
}

/**
 * DELETE /config/environments/{name}
 */
function deleteEnvironmentConfigByName(req, res, next) {
  const environmentName = req.swagger.params.name.value;
  const user = req.user;
  
  return co(function* () {
    let accountName = yield Environment.getAccountNameForEnvironment(environmentName);

    yield [
      deleteLBSettingsForEnvironment(environmentName, accountName, user),
      deleteLBUpstreamsForEnvironment(environmentName, accountName, user)
    ];

    yield deleteEnvironment(environmentName, accountName, user);
    res.status(200).end();
  }).catch(next);
}

function deleteLBSettingsForEnvironment(environmentName, accountName, user) {
  return co(function*(){
    let lbSettingsList = yield lbSettingsTable.queryRangeByKey(environmentName);
    return lbSettingsList.map(lbSettings => {
      return lbSettingsTable.deleteWithSortKey(environmentName, lbSettings.VHostName, user, { accountName });
    });
  });
}

function deleteLBUpstreamsForEnvironment(environmentName, accountName, user) {
  return co(function*(){
    let allLBUpstreams = yield lbUpstreamsTable.getAll(null, { accountName });
    let lbUpstreams = allLBUpstreams.filter(lbUpstream => {
      return lbUpstream.Value.EnvironmentName.toLowerCase() === environmentName.toLowerCase();
    });

    return lbUpstreams.map(lbUpstream => {
      return lbUpstreamsTable.delete(lbUpstream.key, user, { accountName });
    });
  });
}

function deleteEnvironment(environmentName, accountName, user) {
  return co(function*(){
    yield opsEnvironmentTable.delete(environmentName, user);
    yield environmentTable.delete(environmentName, user);
  });
}

module.exports = {
  getEnvironmentsConfig,
  getEnvironmentConfigByName,
  postEnvironmentsConfig,
  putEnvironmentConfigByName,
  deleteEnvironmentConfigByName
};
