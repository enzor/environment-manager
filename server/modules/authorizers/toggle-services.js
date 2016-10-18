'use strict';

function getSlicesByService(serviceName, environmentName, accountName, user) {
  return new Promise((resolve, reject) => {
    let sender = require('modules/sender');

    let query = {
      name: 'GetSlicesByService',
      accountName,
      serviceName,
      environmentName,
    };

    sender.sendQuery({ query, user }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function getModifyPermissions(serviceName, environmentName, accountName, user) {
  return getSlicesByService(serviceName, environmentName, accountName, user).then((slices) => {
    if (slices && slices.length) {
      let slice = slices[0];
      return slice.OwningCluster.toLowerCase();
    }

    throw `Could not find environment: ${environmentName}`;
  });
}

// eslint-disable-next-line arrow-body-style
exports.getRules = (request) => {
  return getModifyPermissions(request.params.service, request.params.environment, request.params.account, request.user).then((sliceCluster) => (
    [{
      resource: request.url.replace(/\/+$/, ''),
      access: request.method,
      clusters: [sliceCluster],
    }]
  ));
};

exports.docs = {
  requiresClusterPermissions: true,
  requiresEnvironmentTypePermissions: false,
};
