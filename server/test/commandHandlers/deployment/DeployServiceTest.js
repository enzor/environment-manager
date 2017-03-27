/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

const assert = require('assert');
const rewire = require('rewire');
const sinon = require('sinon');
const _ = require('lodash');

describe('DeployService', function () {
  let sut;
  let s3PackageLocator;
  let EnvironmentHelper;
  let OpsEnvironment;
  let environment;
  let opsEnvironment;
  let environmentType;
  let infrastructureConfigurationProvider;
  let namingConventionProvider;
  let DeploymentContract;
  let packagePathProvider;
  let sender;
  let deploymentLogger;
  let provideInfrastructure;
  let pushDeployment;
  let preparePackage;
  let getInfrastructureRequirements;

  const S3_PACKAGE = 's3://acme-bucket/em/binaries/package-3.1.0.tar';
  const ACCOUNT_NAME = 'acmeAccount';

  const configuration = {
    environmentTypeName: 'acmeEnvName',
    cluster: {
      Name: 'acmeClusterName'
    }
  };

  function createRequiredProps() {
    return {
      environmentName: 'env-name',
      serviceName: 'AcmeWidget',
      serviceVersion: '3.1.0',
      serviceSlice: 'none',
      mode: 'overwrite',
      serverRoleName: 'AcmeServer'
    };
  }

  function createCommand() {
    let command = createRequiredProps();
    command.commandId = 'abc123';
    command.username = 'roadrunner';
    return command;
  }

  beforeEach(() => {
    sut = rewire('commands/deployments/DeployService');

    environmentType = {
      AWSAccountName: ACCOUNT_NAME
    };
    environment = {
      getEnvironmentType: sinon.stub().returns(Promise.resolve(environmentType))
    };
    opsEnvironment = {
      Value: { DeploymentsLocked: false }
    };
    EnvironmentHelper = {
      getByName: sinon.stub().returns(Promise.resolve(environment))
    };
    OpsEnvironment = {
      getByName: sinon.stub().returns(Promise.resolve(opsEnvironment))
    };
    s3PackageLocator = {
      findDownloadUrl: sinon.stub().returns(Promise.resolve(S3_PACKAGE))
    };
    infrastructureConfigurationProvider = {
      get: sinon.stub().returns(Promise.resolve(configuration))
    };
    namingConventionProvider = {
      getRoleName: () => 'acmeRoleName'
    };
    DeploymentContract = function (deployment) {
      this.validate = () => deployment;
      _.assign(this, deployment);
    };
    packagePathProvider = {
      getS3Path: sinon.stub().returns(Promise.resolve(''))
    };
    provideInfrastructure = sinon.stub().returns(Promise.resolve({}));
    preparePackage = sinon.stub().returns(Promise.resolve());
    pushDeployment = sinon.stub().returns(Promise.resolve());
    getInfrastructureRequirements = sinon.stub().returns(Promise.resolve({}));
    sender = {
      sendCommand: sinon.stub().returns(Promise.resolve({}))
    };
    deploymentLogger = {
      inProgress: sinon.stub(),
      updateStatus: sinon.stub(),
      started: sinon.stub().returns(Promise.resolve({}))
    };

    sut.__set__({ // eslint-disable-line no-underscore-dangle
      s3PackageLocator,
      EnvironmentHelper,
      OpsEnvironment,
      infrastructureConfigurationProvider,
      namingConventionProvider,
      DeploymentContract,
      packagePathProvider,
      deploymentLogger,
      provideInfrastructure,
      preparePackage,
      pushDeployment,
      getInfrastructureRequirements
    });
  });

  describe('overwrite mode', function () {
    let command = createRequiredProps();
    command.mode = 'overwrite';
    command.serviceSlice = 'blue';

    it('should throw if slice is not \'none\'', (done) => {
      sut(command).catch((error) => {
        assert.equal(error.message, 'Slice must be set to \'none\' in overwrite mode.');
        done();
      });
    });
  });

  describe('blue/green mode', function () {
    let command = createRequiredProps();
    command.mode = 'bg';
    command.serviceSlice = 'none';

    it('should throw if slice is \'none\'', (done) => {
      sut(command).catch((error) => {
        assert.ok(error.message.indexOf('Unknown slice') === 0);
        done();
      });
    });
  });

  describe('when package path is not set', function () {
    let command;

    beforeEach(() => {
      command = createCommand();
    });

    it('should be obtained from S3 locator', (done) => {
      sut(command).then(() => {
        assert.equal(s3PackageLocator.findDownloadUrl.calledOnce, true);
        done();
      });
    });

    describe('if the package is not found in S3', function () {
      beforeEach(() => {
        s3PackageLocator.findDownloadUrl = sinon.stub().returns(Promise.resolve(null));
      });

      it('should throw', (done) => {
        sut(command).catch((error) => {
          assert.ok(error.message.indexOf('Deployment package was not found') === 0);
          done();
        });
      });
    });
  });

  describe('deployments', function () {
    let command;

    /**
     * Note: Because the deployment is asynchronous (ie, we don't wait for
     * the 'deploy()' method to return), any tests that depend on sub-calls
     * of 'deploy 'should not rely on the sut().then() promise to guarantee completion.
     */
    beforeEach(() => {
      command = createCommand();
    });

    it('should provide infrastructure', (done) => {
      sut.__set__({ // eslint-disable-line no-underscore-dangle
        provideInfrastructure: () => {
          done();
          return Promise.resolve();
        }
      });
      sut(command);
    }).timeout(10000);

    it('should prepare packages', (done) => {
      sut.__set__({ // eslint-disable-line no-underscore-dangle
        preparePackage: () => {
          done();
          return Promise.resolve();
        }
      });
      sut(command);
    }).timeout(10000);

    it('should push to consul', (done) => {
      sut.__set__({ // eslint-disable-line no-underscore-dangle
        pushDeployment: () => {
          done();
          return Promise.resolve();
        }
      });
      sut(command);
    }).timeout(10000);

    it('should start the deployment logger', (done) => {
      sut(command).then(() => {
        assert.equal(deploymentLogger.started.calledOnce, true);
        done();
      });
    });

    it('should pass deployment to logger.inProgress', (done) => {
      deploymentLogger.inProgress = function (id, accountName) {
        assert.equal(id, command.commandId);
        assert.equal(accountName, ACCOUNT_NAME);
        done();
      };
      sut(command);
    });

    describe('locked environments', function () {
      beforeEach(() => { opsEnvironment.Value.DeploymentsLocked = true; });

      it('should not allow deployments', (done) => {
        sut(command).catch((error) => {
          assert.equal(error.message.indexOf(
            `The environment ${command.environmentName} is currently locked for deployments`), 0);
          done();
        });
      });
    });
  });

  describe('dry run deployments', function () {
    let command;

    beforeEach(() => {
      command = createCommand();
      command.isDryRun = true;
    });

    it('should not call any sub commands', (done) => {
      sut(command).then(() => {
        assert.equal(sender.sendCommand.callCount, 0);
        done();
      });
    });

    it('should return a dry run result', (done) => {
      sut(command).then((result) => {
        assert.ok(result.isDryRun);
        assert.equal(result.packagePath, S3_PACKAGE);
        done();
      });
    });
  });
});

