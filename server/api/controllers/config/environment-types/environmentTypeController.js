/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

const RESOURCE = 'config/environmenttypes';
const KEY_NAME = 'EnvironmentType';

let dynamoHelper = new (require('api/api-utils/DynamoHelper'))(RESOURCE);

/**
 * GET /config/environment-types
 */
function getEnvironmentTypesConfig(req, res, next) {
  return dynamoHelper.getAll().then(data => res.json(data)).catch(next);
}

/**
 * GET /config/environment-types/{name}
 */
function getEnvironmentTypeConfigByName(req, res, next) {
  const key = req.swagger.params.name.value;
  return dynamoHelper.getByKey(key).then(data => res.json(data)).catch(next);
}

/**
 * POST /config/environment-types
 */
function postEnvironmentTypesConfig(req, res, next) {
  const body = req.swagger.params.body.value;
  const user = req.user;

  return dynamoHelper.create(body[KEY_NAME], { Value: body.Value }, user).then(_ => res.status(201).end()).catch(next);
}

/**
 * PUT /config/environment-types/{name}
 */
function putEnvironmentTypeConfigByName(req, res, next) {
  const key = req.swagger.params.name.value;
  const expectedVersion = req.swagger.params['expected-version'].value;
  const body = req.swagger.params.body.value;
  const user = req.user;

  return dynamoHelper.update(key, { Value: body }, expectedVersion, user)
    .then(_ => res.status(200).end())
    .catch(next);
}

/**
 * DELETE /config/environment-types/{name}
 */
function deleteEnvironmentTypeConfigByName(req, res, next) {
  const key = req.swagger.params.name.value;
  const user = req.user;
  return dynamoHelper.delete(key, user).then(_ => res.status(200).end()).catch(next);
}

module.exports = {
  getEnvironmentTypesConfig,
  getEnvironmentTypeConfigByName,
  postEnvironmentTypesConfig,
  putEnvironmentTypeConfigByName,
  deleteEnvironmentTypeConfigByName
};
