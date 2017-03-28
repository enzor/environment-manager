/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let co = require('co');
let Enums = require('Enums');
let DeploymentContract = require('modules/deployment/DeploymentContract');
let provideInfrastructure = require('commands/deployments/ProvideInfrastructure.js');
let preparePackage = require('commands/deployments/PreparePackage');
let pushDeployment = require('commands/deployments/PushDeployment');
let getInfrastructureRequirements = require('commands/deployments/GetInfrastructureRequirements');
let infrastructureConfigurationProvider = require('modules/provisioning/infrastructureConfigurationProvider');
let logger = require('modules/logger');
let namingConventionProvider = require('modules/provisioning/namingConventionProvider');
let packagePathProvider = new (require('modules/PackagePathProvider'))();
let deploymentLogger = require('modules/DeploymentLogger');
let _ = require('lodash');
let SupportedSliceNames = _.values(Enums.SliceName);
let SupportedDeploymentModes = _.values(Enums.DeploymentMode);
let s3PackageLocator = require('modules/s3PackageLocator');
let EnvironmentHelper = require('models/Environment');
let OpsEnvironment = require('models/OpsEnvironment');
let ResourceLockedError = require('modules/errors/ResourceLockedError');

module.exports = function DeployServiceCommandHandler(command) {
  return co(function* () {
    let deployment = yield validateCommandAndCreateDeployment(command);
    let destination = yield packagePathProvider.getS3Path(deployment);
    let sourcePackage = getSourcePackageByCommand(command);

    if (command.isDryRun) {
      return {
        isDryRun: true,
        packagePath: command.packagePath
      };
    }

    let accountName = deployment.accountName;

    // Run asynchronously, we don't wait for deploy to finish intentionally
    deploy(deployment, destination, sourcePackage);

    yield deploymentLogger.started(deployment, accountName);
    return deployment;
  });
};

function validateCommandAndCreateDeployment(command) {
  return co(function* () {
    const { mode, environmentName, serviceSlice, serviceName, serviceVersion } = command;

    if (mode === 'overwrite' && serviceSlice !== undefined && serviceSlice !== 'none') {
      throw new Error('Slice must be set to \'none\' in overwrite mode.');
    }
    if (SupportedDeploymentModes.indexOf(mode.toLowerCase()) < 0) {
      throw new Error(`Unknown mode \'${mode}\'. Supported modes are: ${SupportedDeploymentModes.join(', ')}`);
    }
    if (mode === 'bg' && SupportedSliceNames.indexOf(serviceSlice) < 0) {
      throw new Error(`Unknown slice \'${serviceSlice}\'. Supported slices are: ${SupportedSliceNames.join(', ')}`);
    }

    if (!command.packagePath) {
      let s3Package;
      try {
        s3Package = yield s3PackageLocator.findDownloadUrl({
          environment: environmentName,
          service: serviceName,
          version: serviceVersion
        });
      } catch (error) {
        throw new Error(`An attempt to locate the following package in S3 was forbidden: ${serviceName} version ${serviceVersion}`);
      }

      if (!s3Package) {
        throw new Error('Deployment package was not found. Please specify a location or upload the package to S3');
      } else {
        command.packagePath = s3Package;
      }
    }

    const environment = yield EnvironmentHelper.getByName(command.environmentName);
    const opsEnvironment = yield OpsEnvironment.getByName(command.environmentName);
    const environmentType = yield environment.getEnvironmentType();
    command.accountName = environmentType.AWSAccountName;

    if (opsEnvironment.Value.DeploymentsLocked) {
      throw new ResourceLockedError(`The environment ${environmentName} is currently locked for deployments. Contact the environment owner.`);
    }

    let configuration = yield infrastructureConfigurationProvider.get(
      command.environmentName, command.serviceName, command.serverRoleName
    );

    let roleName = namingConventionProvider.getRoleName(configuration, command.serviceSlice);

    let deploymentContract = new DeploymentContract({
      id: command.commandId,
      environmentTypeName: configuration.environmentTypeName,
      environmentName: command.environmentName,
      serviceName: command.serviceName,
      serviceVersion: command.serviceVersion,
      serviceSlice: command.serviceSlice || '',
      serverRole: roleName,
      serverRoleName: command.serverRoleName,
      clusterName: configuration.cluster.Name,
      accountName: command.accountName,
      username: command.username
    });
    yield deploymentContract.validate(configuration);
    return deploymentContract;
  });
}

function deploy(deployment, destination, source) {
  return co(function* () {
    const accountName = deployment.accountName;
    const requiredInfra = yield getInfrastructureRequirements({ accountName, deployment });
    yield provideInfrastructure({
      accountName,
      deployment,
      asgsToCreate: requiredInfra.asgsToCreate,
      launchConfigsToCreate: requiredInfra.launchConfigsToCreate
    });
    yield preparePackage({ accountName, destination, source, deployment });
    yield pushDeployment({ accountName, deployment, s3Path: destination, expectedNodeDeployments: requiredInfra.expectedInstances });

    deploymentLogger.inProgress(
      deployment.id,
      deployment.accountName,
      'Waiting for nodes to perform service deployment...'
    );
  }).catch((error) => {
    let deploymentStatus = {
      deploymentId: deployment.id,
      environmentName: deployment.environmentName,
      accountName: deployment.accountName
    };

    let newStatus = {
      name: Enums.DEPLOYMENT_STATUS.Failed,
      reason: sanitiseError(error)
    };

    return deploymentLogger.updateStatus(deploymentStatus, newStatus);
  }).catch(error => logger.error(error));
}

function sanitiseError(error) {
  if (_.isObjectLike(error) && !(error instanceof Error)) {
    return JSON.stringify(error);
  }
  return _.toString(error);
}

function getSourcePackageByCommand(command) {
  return {
    url: command.packagePath
  };
}
