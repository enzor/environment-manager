/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';


require('./globals.ts');

require('./common/common.module.js');
require('./compare/compare.module.js');
require('./configuration/configuration.module.js');
require('./environments/environments.module.js');
require('./operations/operations.module.js');

var app = angular.module('EnvironmentManager', [
  'ui.grid',
  'ngRoute',
  'angularMoment',
  'EnvironmentManager.common',
  'EnvironmentManager.compare',
  'EnvironmentManager.configuration',
  'EnvironmentManager.environments',
  'EnvironmentManager.operations',
]);

// Setup global routes
app.config(function ($routeProvider) {
  $routeProvider
    .when('/', {
      templateUrl: '/app/environments/summary/env-summary.html',
      controller: 'EnvironmentsSummaryController as vm',
      menusection: '',
    })
    .when('/login', {
      templateUrl: '/login.html',
      allowAnonymous: true,
      menusection: '',
    })
    .otherwise({
      redirectTo: '/',
    });
});

app.config(function ($httpProvider) {
  // Set default put request content type to JSON
  $httpProvider.defaults.headers.put['Content-Type'] = 'application/json;charset=utf-8';

  // Set up error pop up on HTTP errors
  $httpProvider.interceptors.push(function ($q, $rootScope) {
    return {
      responseError: function(response) {
        if (response.status >= 400 && response.status !== 404) {
          $rootScope.$broadcast('error', response);
        }
        return $q.reject(response);
      }
    };
  });
});

app.run(function ($rootScope, $timeout) {
  $rootScope.canUser = function () {
    return true;
  };

  $timeout(function () {
    $rootScope.$broadcast('cookie-expired');
  }, (window.user.getExpiration() - new Date().getTime()));
});
