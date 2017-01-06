﻿/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

/**
 * DEPRECATED
 * TODO(filip): Move this logic to middle-level abstraction, ie.:
 * particular models / or their factories / managers, if necessary
 */
angular.module('EnvironmentManager.common').factory('awsService',
  function ($q, resources, cachedResources) {

    function AwsService() {
      var self = this;
      self.asgs = new AsgService();
      self.instances = new InstanceService();
      self.images = new ImageService();
    }

    function AsgService() {
      var self = this;
    }

    function InstanceService() {
      var self = this;

      self.getSummaryFromInstance = function (instance, account) {
        var instanceSummary = {

          AccountName: instance.AccountName || account,
          Ip: instance.PrivateIpAddress, // TODO: could be an array, cope with multiple
          InstanceId: instance.InstanceId,
          InstanceType: instance.InstanceType,
          AvailabilityZone: instance.Placement.AvailabilityZone,
          Status: _.capitalize(instance.State.Name),
          ImageId: instance.ImageId,
          LaunchTime: instance.LaunchTime,
        };
        instance.Tags.forEach(function (tag) {
          instanceSummary[tag.Key] = tag.Value;
        });

        return instanceSummary;
      }

      self.GetInstanceDetails = function (params) {
        return resources.aws.instances.all(params).then(function (instances) {
          return instances.map(self.getSummaryFromInstance, params.account);
        });
      };
    };

    function ImageService() {
      var self = this;

      self.GetImageDetails = function () {
        return cachedResources.aws.images.all({});
      };

      self.RestructureImagesByType = function (amiData, onlyStable) {
        var filteredAmiData = amiData.filter(function (ami) {
          return ami.IsCompatibleImage && (onlyStable ? ami.IsStable : true); });

        var amiTypes = groupBy(function (ami) { return ami.AmiType; }, filteredAmiData)
          .map(function (group) {
            var versions = group.items.sort(AmiVersionCompare);
            return {
              Name: group.key,
              Versions: versions,
              LatestVersion: versions[0],
            };
          });

        return amiTypes;
      };

      self.MergeExtraImageDataToInstances = function (instances, amiData) {
        instances = instances.map(function (instance) {
          instance.Ami = self.GetAmiByID(instance.ImageId, amiData);
          if (instance.Ami && instance.Ami.IsCompatibleImage) {
            var latestStableVersion = self.GetLatestAmiVersionByType(instance.Ami.AmiType, amiData, true);
            if (latestStableVersion) {
              instance.LatestAmi = angular.copy(latestStableVersion);
              instance.UsingLatestAmi = (instance.Ami.AmiVersion == latestStableVersion.AmiVersion);
              instance.DaysOutOfDate = new Date().getDaysBetweenDates(instance.Ami.CreationDate);
            }
          }

          return instance;
        });

        return instances;
      };

      self.GetAmiTypeFromName = function (name) {
        var amiType = name;
        if (name && IsCompatibleImage(name)) {
          var pos = name.lastIndexOf('-');
          if (pos) amiType = name.substr(0, pos);
        }

        return amiType;
      };

      self.GetAmiVersionFromName = function (name) {
        var amiVersion = '';
        if (name && IsCompatibleImage(name)) {
          var pos = name.lastIndexOf('-');
          if (pos) amiVersion = name.substr(pos + 1);
        }

        return amiVersion;
      };

      self.GetAmiByID = function (amiId, amiData) {
        for (var i = 0; i < amiData.length; i++) {
          if (amiData[i].ImageId == amiId) {
            return amiData[i];
          }
        }

        return null;
      };

      self.GetAmiByTypeAndVersion = function (amiType, amiVersion, amiData) {
        for (var i = 0; i < amiData.length; i++) {
          if (amiData[i].AmiType == amiType &&
            amiData[i].AmiVersion == amiVersion) {
            return amiData[i];
          }
        }
        return null;
      };

      self.GetAmiVersionsByType = function (amiType, amiData, onlyStable) {
        var versions = [];
        amiData.forEach(function (ami) {
          if (ami.AmiType && ami.AmiType == amiType) {
            if (!onlyStable || (onlyStable && ami.IsStable)) {
              versions.push(ami);
            }
          }
        });

        return versions;
      };

      self.GetLatestAmiVersionByType = function (amiType, amiData, onlyStable) {
        var latestVersion = null;
        amiData.forEach(function (ami) {
          if (ami.AmiType && ami.AmiType == amiType) {
            if (latestVersion) {
              if (!onlyStable || (onlyStable && ami.IsStable)) {
                if (ami.CreationDate > latestVersion.CreationDate) {
                  latestVersion = ami;
                }
              }
            } else {
              latestVersion = ami;
            }
          }
        });

        return latestVersion;
      };

      self.SortByVersion = function (amiData) {
        return amiData.sort(AmiVersionCompare);
      };

      function IsCompatibleImage(amiName) {
        // whatever-name-0.0.0
        return /^[a-zA-Z0-9.-]+-[0-9]+\.[0-9]+\.[0-9]+$/.test(amiName);
      }

      function AmiVersionCompare(amiA, amiB) {
        return SemanticVersionCompare(amiA.AmiVersion, amiB.AmiVersion) * -1;
      }

      function SemanticVersionCompare(a, b) {
        var segmentsA = String(a).replace(/(\.0+)+$/, '').split('.');
        var segmentsB = String(b).replace(/(\.0+)+$/, '').split('.');
        var length = Math.min(segmentsA.length, segmentsB.length);
        for (var i = 0; i < length; i++) {
          var diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10);
          if (diff !== 0) {
            return diff;
          }
        }

        return segmentsA.length - segmentsB.length;
      }
    }

    return new AwsService();
  });

// TODO(filip): use Lodash instead
function groupBy(fn, array) {

  array.sort(compare);

  if (array && 0 < array.length) {
    var prev = array[0];
    var group = { key: fn(prev), items: [prev] };
    var groups = [group];
    for (var i = 1; i < array.length; i++) {
      var item = array[i];
      var key = fn(item);
      if (key === group.key) {
        group.items.push(item);
      } else {
        group = { key: key, items: [item] };
        groups.push(group);
      }

      prev = item;
    }

    return groups;
  } else {
    return [];
  }

  function compare(l, r) {
    var x = fn(l);
    var y = fn(r);
    if (x < y) return -1;
    else if (x > y) return 1;
    else return 0;
  }
}
