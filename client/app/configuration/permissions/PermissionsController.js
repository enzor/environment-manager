/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

angular.module('EnvironmentManager.configuration').controller('PermissionsController',
  function ($routeParams, $location, resources, cachedResources, modal, $http) {
    var vm = this;

    function init() {
      vm.canPost = user.hasPermission({ access: 'POST', resource: '/config/permissions/*' });
      vm.refresh();
    }

    vm.refresh = function () {
      $http.get('/api/v1/config/permissions').then(function (response) {
        var members = response.data;
        vm.members = members.sort(function (a, b) {
          var nameA = a.Name.toLowerCase();
          var nameB = b.Name.toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
        });

        vm.canDelete = false;
        for (var i in members) {
          var member = members[i];
          var canDelete = user.hasPermission({ access: 'DELETE', resource: '/config/permissions/' + member.Name });
          if (canDelete) {
            vm.canDelete = true;
            break;
          }
        };
      });
    };

    vm.canUser = function (action) {
      if (action == 'post') return vm.canPost;
      if (action == 'delete') return vm.canDelete;
    };

    vm.new = function () {
      $location.path('/config/permissions/new');
    };

    vm.delete = function (member) {
      var memberName = member.Name;

      modal.confirmation({
        title: 'Deleting a user or group',
        message: 'Are you sure you want to delete <strong>' + memberName + '</strong>?',
        action: 'Delete',
        severity: 'Danger',
        details: ["NOTE: This will delete all permissions assignment for '" + memberName + "'. It will not delete '" + memberName + "' from the directory."],
      }).then(function () {
        $http.delete('/api/v1/config/permissions/' + memberName).then(function () {
          vm.refresh();
        });
      });
    };

    init();

  });

