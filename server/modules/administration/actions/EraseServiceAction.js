/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let co = require("co");
let KeyValueStoreEraser = require('modules/administration/services/KeyValueStoreEraser');

function EraseServiceAction(environmentName) {
  let keyValueStoreEraser = new KeyValueStoreEraser(environmentName);

  this.do = function(serviceName) {
    return co(function*() {
      let erasedServicesKeys = yield keyValueStoreEraser.scanAndDelete({
        keyPrefix: `environments/${environmentName}/services/${serviceName}/`,
        condition: () => true
      });

      let erasedRolesKeys = yield keyValueStoreEraser.scanAndDelete({
        keyPrefix: `environments/${environmentName}/roles/`,
        condition: (key) =>
          key.match(`environments\/.*\/roles\/.*\/services\/${serviceName}\/`)
      });

      return erasedServicesKeys.concat(erasedRolesKeys);
    });
  };
}

module.exports = EraseServiceAction;
