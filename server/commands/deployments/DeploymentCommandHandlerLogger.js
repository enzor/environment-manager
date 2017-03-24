/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let logger = require('modules/logger');
let deploymentLogger = require('modules/DeploymentLogger');

module.exports = function DeploymentCommandHandlerLogger(deployment) {
  let { id, accountName } = deployment;

  this.debug = logger.debug.bind(logger);

  this.info = function (message) {
    logger.info(message);
    deploymentLogger.inProgress(id, accountName, message);
  };

  this.warn = function (message) {
    logger.warn(message);
    deploymentLogger.inProgress(id, accountName, message);
  };

  this.error = logger.error.bind(logger);
};
