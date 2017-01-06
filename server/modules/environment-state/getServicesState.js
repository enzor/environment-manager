/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let _ = require('lodash');
let Enums = require('Enums');
let DIFF_STATE = Enums.DIFF_STATE;
let co = require('co');
let logger = require('modules/logger');
let serviceTargets = require('modules/service-targets');

const HEALTH_GOOD = Enums.HEALTH_STATUS.Healthy;
const HEALTH_BAD = Enums.HEALTH_STATUS.Error;
const SERVICE_INSTALL = Enums.ServiceAction.INSTALL;

/**
 * Generate service health info (with checks list and pass / fail)
 */
function getServiceChecksInfo(serviceObjects) {
  // Get all health checks for all instances of this service
  var serviceChecks = _.flatMap(serviceObjects, 'HealthChecks');
  var checksGrouped = _.groupBy(serviceChecks, 'Name');
  return _.map(checksGrouped, function (checks, checkName) {
    // If some instances checks failed for a given check, mark as failed
    // also, don't count in instance into working
    return {
      Name: checks[0].Name,
      Status: _.some(checks, { Status: 'critical' }) ? HEALTH_BAD : HEALTH_GOOD
    };
  });
}

function getServiceOverallHealth(healthChecks) {
  return _.some(healthChecks, { Status: HEALTH_BAD }) ? HEALTH_BAD : HEALTH_GOOD
}

function checkServiceProperties(svcA, svcB, prop) {
  if (svcA[prop] !== svcB[prop]) {
    //TODO: What behaviour/feature do we expect if a service does not match the expected target?
    logger.warn(`${svcB.Name} ${svcB.Version} ${prop} mismatch:`);
    logger.warn(` Found: ${svcA[prop]} and ${svcB[prop]}`);
  }
}

function getServiceAndSlice(obj) {
  return obj.Name + (obj.Slice !== 'none' ? '-' + obj.Slice : '');
}

function* getServicesState(environmentName, runtimeServerRoleName, instances) {
  let targetServiceStates = yield serviceTargets.getAllServiceTargets(environmentName, runtimeServerRoleName);
  let allServiceObjects = _.flatMap(instances, instance => instance.Services);
  allServiceObjects = _.compact(allServiceObjects);

  // Find all objects representing particular service for all nodes
  let instanceServicesGrouped = _.groupBy(allServiceObjects, (obj) => getServiceAndSlice(obj));

  let servicesList = _.map(instanceServicesGrouped, (serviceObjects, key) => {
    
    let service = _.find(targetServiceStates, (targetService) => {
      return getServiceAndSlice(targetService) === getServiceAndSlice(serviceObjects[0]);
    });

    // That is a service that is not in a target state, but on at least one of instances
    if (service === undefined) {
      // Create fake "target state" object to generate metadata
      service = {
        Name: serviceObjects[0].Name,
        Version: serviceObjects[0].Version,
        Slice: serviceObjects[0].Slice,
        DiffWithTargetState: DIFF_STATE.Unexpected,
      };
    } else {
      service.DiffWithTargetState = null;

      // Check instance serviceObjects for inconsistencies with target state
      // TODO(Filip): add error / warnings to API output when inconsistencies detected
      _.each(serviceObjects, (obj) => {
        checkServiceProperties(obj, service, 'Version');
        checkServiceProperties(obj, service, 'DeploymentId');
      });

      if (service.Action === 'Ignore') {
        service.DiffWithTargetState = DIFF_STATE.Ignored;
      } else {
        service.DiffWithTargetState = null;
      }
    }

    let serviceInstances = _.filter(instances, (instance) => _.some(instance.Services, { Name: service.Name, Slice: service.Slice }));
    let presentOnInstancesCount = 0;
    let serviceObjectsOnInstances = [];

    // Healthy nodes are these where service is present AND service's status is healthy
    let healthyNodes = _.filter(serviceInstances, (instance) => {
      let serviceOnInstance = _.find(instance.Services, { Name: service.Name, Slice: service.Slice });

      if (serviceOnInstance !== undefined) {
        serviceObjectsOnInstances.push(serviceOnInstance);
        // If at least one instance has state "Missing", overall service state will also be "Missing"
        if (serviceOnInstance.DiffWithTargetState === DIFF_STATE.Missing) {
          service.DiffWithTargetState = DIFF_STATE.Missing;
        } else {
          presentOnInstancesCount += 1;
        }
        return serviceOnInstance.OverallHealth === 'Healthy';
      }
      return false;
    });

    let serviceHealthChecks = getServiceChecksInfo(serviceObjects);
    let serviceAction = service.Action || SERVICE_INSTALL;

    let missingOrUnexpectedInstances = _.filter(serviceObjectsOnInstances,
      (s) => s.DiffWithTargetState === DIFF_STATE.Missing || s.DiffWithTargetState === DIFF_STATE.Unexpected).length > 0;

    return {
      Name: service.Name,
      Version: service.Version,
      Slice: service.Slice,
      DiffWithTargetState: service.DiffWithTargetState,
      DeploymentId: service.DeploymentId,
      InstancesNames: _.map(serviceInstances, 'Name'),
      InstancesCount: {
        Healthy: healthyNodes.length,
        Present: presentOnInstancesCount,
        Total: serviceInstances.length
      },
      MissingOrUnexpectedInstances: missingOrUnexpectedInstances,
      OverallHealth: getServiceOverallHealth(serviceHealthChecks, serviceInstances),
      HealthChecks: serviceHealthChecks,
      Action: serviceAction
    };
  });

  return servicesList;
}

module.exports = co.wrap(getServicesState);