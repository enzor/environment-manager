/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

angular.module('EnvironmentManager.environments').controller('EnvironmentsSummaryController',
  function ($scope, $routeParams, $location, $uibModal, $http, $q, modal, resources, cachedResources, configValidation, cron, Environment) {
    var vm = this;

    var SHOW_ALL_OPTION = 'Any';

    vm.data = [];

    vm.owningClustersList = [];
    vm.environmentTypesList = [];
    vm.selectedEnvironmentType = SHOW_ALL_OPTION;
    vm.selectedOwningCluster = SHOW_ALL_OPTION;

    vm.environmentConfigValid = {};

    vm.dataLoading = false;

    vm.gridOptions = {
      data: 'Data',
      columnDefs: [{
        name: 'statusIcon',
        displayName: '',
        field: 'EnvironmentName',
        cellClass: 'config-status',
        cellTemplate: '<div class="ui-grid-cell-contents" title="{{grid.appScope.EnvironmentConfigValid[row.entity.EnvironmentName].Error}}"><a href="#/environment/settings?environment={{row.entity.EnvironmentName}}&tab=validation"><div class="config-status-{{grid.appScope.EnvironmentConfigValid[row.entity.EnvironmentName].Valid}}"></div></a></div>',
      }, {
        name: 'environment',
        field: 'EnvironmentName',
        cellTemplate: '<a href="#/environment/settings?environment={{row.entity.EnvironmentName}}">{{row.entity.EnvironmentName}} <small ng-if="row.entity.Configuration.EnvironmentType">({{row.entity.Configuration.EnvironmentType}})</small></a>',
      }, {
        name: 'owningCluster',
        field: 'row.entity.Configuration.OwningCluster',
      }],
    };

    function init() {

      vm.userHasCreatePermission = user.hasPermission({ access: 'POST', resource: '/config/environments/**' });
      vm.userHasDeletePermission = user.hasPermission({ access: 'DELETE', resource: '/config/environments/**' });

      $q.all([
        cachedResources.config.clusters.all().then(function (clusters) {
          vm.owningClustersList = [SHOW_ALL_OPTION].concat(_.map(clusters, 'ClusterName')).sort();
        }),

        cachedResources.config.environmentTypes.all().then(function (environmentTypes) {
          vm.environmentTypesList = [SHOW_ALL_OPTION].concat(_.map(environmentTypes, 'EnvironmentType').sort());
        }),
      ]).then(function () {
        vm.selectedEnvironmentType = $routeParams.environmentType || SHOW_ALL_OPTION;
        vm.selectedOwningCluster = $routeParams.cluster || SHOW_ALL_OPTION;

        vm.refresh();
      });
    }

    vm.refresh = function () {
      vm.dataLoading = true;
      $location.search({
        environmentType: vm.selectedEnvironmentType,
        cluster: vm.selectedOwningCluster,
      });

      var query = {};
      if (vm.selectedEnvironmentType != SHOW_ALL_OPTION) {
        query.environmentType = vm.selectedEnvironmentType;
      }

      if (vm.selectedOwningCluster != SHOW_ALL_OPTION) {
        query.cluster = vm.selectedOwningCluster;
      }

      $q.all([
        Environment.all({ query: query, useCache: false }),
        Environment.getAllOps(),
      ]).then(function (results) {
        var configEnvironments = results[0];
        var opsEnvironments = results[1];

        vm.data = configEnvironments.merge(opsEnvironments,
          function (source, target) {
            return source.EnvironmentName === target.EnvironmentName;
          },

          function (source, target) {
            target = target || {};

            var result = {
              EnvironmentName: source.EnvironmentName,
              Configuration: source.Value,
              Operation: target.Value || {},
            };

            var scheduleAction = target.Value.ScheduleStatus;
            result.Operation.getScheduleAction = function () { return scheduleAction; };

            return result;
          });

        vm.dataLoading = false;
        setTimeout(validateEnvironments, 5000); // Don't call unless user is waiting on page to prevent excessive dynamo load
      });
    };

    vm.deleteEnvironment = function (environment) {
      modal.confirmation({
        title: 'Delete Environment',
        message:
        'Are you sure you want to delete the environment <strong>' + environment.EnvironmentName + '</strong>?<br /><br />' +
        'This will permanently delete the environment as well as any associated load balancer settings and upstreams.' +
        'It will not delete any associated AWS resources',
        action: 'Delete',
        severity: 'Danger'
      }).then(function () {
        return $http.delete('/api/v1/config/environments/' + environment.EnvironmentName);
      }).then(function () {
        return modal.information({
          title: 'Environment Deleted',
          message: 'Environment ' + environment.EnvironmentName + ' was deleted successfully.',
        });
      }).then(function () {
        cachedResources.config.environments.flush();
        vm.refresh();
      });
    };

    vm.viewEnvironment = function (environment) {
      $location.path('/environments/' + environment.EnvironmentName);
    };

    vm.newEnvironment = function () {
      var instance = $uibModal.open({
        templateUrl: '/app/environments/dialogs/env-create-environment-modal.html',
        controller: 'CreateEnvironmentController',
      });
      instance.result.then(function () {
        cachedResources.config.environments.flush();
        vm.refresh();
      });
    };

    vm.viewDeployments = function (env) {
      $location.search('environment', env.EnvironmentName);
      $location.path('/operations/deployments/');
    };

    vm.viewHistory = function (environment) {
      $scope.ViewAuditHistory('Environment', environment.EnvironmentName);
    };

    function validateEnvironments() {
      $q.all([
        // Make sure cache populated to avoid async multiple hits
        Environment.all(),
        cachedResources.config.services.all(),
        cachedResources.config.lbUpstream.all(),
        cachedResources.config.deploymentMaps.all(),
        cachedResources.config.lbSettings.all(),
      ]).then(function () {
        vm.data.forEach(function (env) { validateEnvironment(env); });
      });
    }

    function validateEnvironment(environment) {
      if (!vm.environmentConfigValid[environment.EnvironmentName]) {
        configValidation.ValidateEnvironment(environment.EnvironmentName).then(function (node) {
          vm.environmentConfigValid[environment.EnvironmentName] = node;
        });
      }
    }

    init();
  });
