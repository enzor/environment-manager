﻿/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

angular.module('EnvironmentManager.common', [
  'ngRoute',
  'ui.bootstrap',
]);

var context = require.context('.', true, /^((?!spec|test).)*(js|ts)$/);
context.keys().forEach(context);
