/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let sender = require('modules/sender');
let co = require('co');
let config = require('config');
let _ = require('lodash');
let ResourceNotFoundError = require('modules/errors/ResourceNotFoundError.class');

function hostFilter(active) {
  if (active === true) {
    return (host) => host.State === 'up';
  } else if (active === false) {
    return (host) => host.State === 'down';
  } else {
    return (host) => true;
  }
}

function* handleQuery(query, resourceName, upstreamFilter) {
  const masterAccountName = config.getUserValue('masterAccountName');
  
  // Get all LoadBalancer upstreams from DynamoDB without apply any filter.
  // NOTE: If it ever becomes a DynamoDB map item then filtering this query
  //       would be great!

  // Requires all LoadBalancer upstreams in the specified AWS account.
  let subquery = {
    name: 'ScanDynamoResources',
    resource: 'config/lbupstream',
    accountName: query.accountName,
  };

  let upstreams = yield sender.sendQuery({ query: subquery, parent: query });

  // Filtering upstreams
  upstreams = upstreams.filter(upstreamFilter);

  // If any upstream was found the chain continues otherwise a
  // [ResourceNotFound] error is returned.
  if (!upstreams.length) {
    throw new ResourceNotFoundError(`No ${resourceName} has been found.`)
  }

  // Flatting upstreams hosts in to a plain list
  let upstreamValues = (upstream) => {
    return upstream.Value.Hosts.filter(hostFilter(query.active)).map((host) => {
      return {
        Key: upstream.key,
        EnvironmentName: upstream.Value.EnvironmentName,
        ServiceName: upstream.Value.ServiceName,
        UpstreamName: upstream.Value.UpstreamName,
        DnsName: host.DnsName,
        Port: host.Port,
        OwningCluster: '',
        Name: 'Unknown',
        State: host.State === 'up' ? 'Active' : 'Inactive',
      };
    });
  };
  
  upstreams = _(upstreams).map(upstreamValues).compact().flatten().value();

  // Getting all services the upstreams refer to

  // Extracts all service names the found upstreams refer to
  let serviceNames = upstreams.map((upstream) => {
    return upstream.ServiceName;
  }).distinct();


  // Gets all services from DynamoDB table
  let promises = serviceNames.map((serviceName) => {
    var subquery = {
      name: 'ScanDynamoResources',
      resource: 'config/services',
      accountName: masterAccountName,
      filter: { ServiceName: serviceName },
    };
    return sender.sendQuery({ query: subquery, parent: query });
  });

  let services = yield Promise.all(promises);
  let hasLength = x => x && x.length;
  services = _(services).filter(hasLength).flatten();

  // Assigning blue/green port reference to the found slices
  function getServicesPortMapping(services) {
    var result = {};
    services.forEach((service) => {
      var portsMapping = {};
      portsMapping.owningCluster = service.OwningCluster;
      if (service.Value.BluePort) portsMapping[service.Value.BluePort] = 'Blue';
      if (service.Value.GreenPort) portsMapping[service.Value.GreenPort] = 'Green';
      result[service.ServiceName] = portsMapping;
    });

    return result;
  }

  var servicesPortsMapping = getServicesPortMapping(services);

  upstreams.forEach((upstream) => {
    var servicePortsMapping = servicesPortsMapping[upstream.ServiceName];
    if (!servicePortsMapping) return;
    upstream.OwningCluster = servicePortsMapping.owningCluster;
    var portMapping = servicePortsMapping[upstream.Port];
    if (!portMapping) return;
    upstream.Name = portMapping;
  });

  return upstreams;
};

var QUERYING = {
  upstream: {
    byUpstreamName: (query) => {
      return `Upstream named "${query.upstreamName}"`;
    },

    byServiceName: (query) => {
      return `Upstream for service "${query.serviceName}" in "${query.environmentName}" environment`;
    },
  },
};

var FILTER = {
  upstream: {
    byUpstreamName: (query) => {
      return (upstream) => {
        return upstream.Value.EnvironmentName === query.environmentName && upstream.Value.UpstreamName === query.upstreamName;
      };
    },

    byServiceName: (query) => {
      return (upstream) => {
        return upstream.Value.EnvironmentName === query.environmentName && upstream.Value.ServiceName === query.serviceName;
      };
    },
  },
  
};

module.exports = {
  handleQuery: co.wrap(handleQuery),
  QUERYING,
  FILTER,
};
