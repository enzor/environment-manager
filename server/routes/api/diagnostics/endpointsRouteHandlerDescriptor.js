/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let route = require('modules/helpers/route');
let noAuthorization = require('modules/authorizers/none');

module.exports = route
  .get('/diagnostics/endpoints')
  .inOrderTo('Describe all available API endpoints.')
  .allowAnonymous()
  .do((request, response) => {
    let routeHandlerProvider = require('modules/routeHandlerProvider');
    response.send(routeHandlerProvider.get());
  });
