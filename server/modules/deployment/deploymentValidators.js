/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

var validators = [
  require('modules/deployment/validators/blueGreenDeploymentValidator'),
  require('modules/deployment/validators/rootDeviceSizeValidator'),
  require('modules/deployment/validators/uniqueServiceVersionDeploymentValidator'),
];

module.exports = validators;
