/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let assert = require('assert');
let co = require('co');
let topicNotificationMappingProvider = require('modules/provisioning/autoScaling/topicNotificationMappingProvider');
let namingConventionProvider = require('modules/provisioning/namingConventionProvider');
let lifecycleHooksProvider = require('modules/provisioning/autoScaling/lifecycleHooksProvider');
let subnetsProvider = require('modules/provisioning/autoScaling/subnetsProvider');
let tagsProvider = require('modules/provisioning/autoScaling/tagsProvider');

module.exports = {
  get: function (configuration, accountName) {
    assert(configuration, "Expected 'configuration' argument not to be null.");

    return co(function* () {
      let sliceNames = configuration.serverRole.FleetPerSlice ? ['blue', 'green'] : [null];
      let topicNotificationMapping = yield topicNotificationMappingProvider.get(accountName);
      let lifecycleHooks = yield lifecycleHooksProvider.get(accountName);
      let subnets = yield subnetsProvider.get(configuration);
      let templates = [];

      for (let index = 0; index < sliceNames.length; index++) {

        let sliceName = sliceNames[index];

        let autoScalingGroupName = namingConventionProvider.getAutoScalingGroupName(
          configuration, sliceName
        );

        let launchConfigurationName = namingConventionProvider.getLaunchConfigurationName(
          configuration, sliceName
        );

        let tags = yield tagsProvider.get(configuration, sliceName);

        templates.push({
          autoScalingGroupName,
          launchConfigurationName,
          size: {
            min: configuration.serverRole.AutoScalingSettings.MinCapacity,
            desired: configuration.serverRole.AutoScalingSettings.DesiredCapacity,
            max: configuration.serverRole.AutoScalingSettings.MaxCapacity,
          },
          subnets,
          tags,
          topicNotificationMapping,
          lifecycleHooks,
        });
      }

      return templates;
    });
  },
};
