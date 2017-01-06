/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let co = require("co");
let KeyValueStoreEraser = require('modules/administration/services/KeyValueStoreEraser');

function EraseRoleSliceAction(environmentName) {

  let keyValueStoreEraser = new KeyValueStoreEraser(environmentName);

  this.do = function (roleName, roleSlice) {

    return co(function* () {

      let erasedRolesKeys = yield keyValueStoreEraser.scanAndDelete({
        keyPrefix: `environments/${environmentName}/roles/${roleName}`,
        condition: (key) => {
          var keySegments = key.split("/");
          var keyRoleName = keySegments[3];
          return (keyRoleName === `${roleName}-${roleSlice}`);
        }
      });

      let serviceInstallationKeysToErase = [];

      let erasedServicesDefinitionKeys = yield keyValueStoreEraser.scanAndDelete({
        keyPrefix: `environments/${environmentName}/services/`,
        condition: (key, value) => {
          if (!value) return false;
          if (!value.Service) return false;
          if (!value.Service.Tags) return false;

          var tags = fromTagsListToObject(value.Service.Tags);
          if (tags["server_role"] !== `${roleName}-${roleSlice}`) return false;

          var keySegments = key.split("/");
          keySegments.pop(); 

          serviceInstallationKeysToErase.push(keySegments.join("/") + "/installation");
          return true;
        } 
      });

      let erasedServicesInstallationKeys = yield keyValueStoreEraser.scanAndDelete({
        keyPrefix: `environments/${environmentName}/services/`,
        condition: (key) => {
          return serviceInstallationKeysToErase.indexOf(key) >= 0;
        } 
      });

      let result = erasedServicesDefinitionKeys
        .concat(erasedServicesInstallationKeys)
        .concat(erasedRolesKeys);

      return result;
    });
  };

  var fromTagsListToObject = function (tags) {

    var result = {};

    tags.forEach(tag => {
      var segments = tag.split(":");
      var key = segments[0];
      var value = segments[1];
      result[key] = value;
    });

    return result;
  };
}

module.exports = EraseRoleSliceAction;
