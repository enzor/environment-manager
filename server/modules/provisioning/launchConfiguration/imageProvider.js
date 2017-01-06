/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let assert = require('assert');
let sender = require('modules/sender');
let Image = require('modules/provisioning/Image.class');
let ImageNotFoundError = require('modules/errors/ImageNotFoundError.class');

module.exports = {

  get: function (imageNameOrType, includeUnstable) {
    assert(imageNameOrType, 'Expected "imageNameOrType" argument not to be null');
    if (doesSpecifyVersion(imageNameOrType)) {
      return getImageByName(imageNameOrType);
    } else {
      includeUnstable = includeUnstable === undefined ? false : includeUnstable;
      return getLatestImageByType(imageNameOrType, includeUnstable);
    }
  },
};

function doesSpecifyVersion(imageNameOrType) {
  return imageNameOrType.match(/\-(\d+\.){2}\d+$/);
}

function getImageByName(imageName) {
  var query = {
    name: 'ScanCrossAccountImages',
    filter: {
      name: imageName,
    },
  };

  return sender
    .sendQuery({ query: query })
    .then(amiImages => amiImages.length ?
      Promise.resolve(new Image(amiImages[0])) :
      Promise.reject(new ImageNotFoundError(`No AMI image named "${imageName}" found.`))
    );
}

function getLatestImageByType(imageType, includeUnstable) {
  var query = {
    name: 'ScanCrossAccountImages',
  };

  return sender
    .sendQuery({ query: query })
    .then(amiImages => {

      let isLatest = includeUnstable ? image => image.IsLatest : image => image.IsLatestStable;
      var latestImage = amiImages.find(image => image.AmiType === imageType && isLatest(image));

      if (latestImage) {
        return new Image(latestImage);
      }

      throw new ImageNotFoundError(`No AMI image of type "${imageType}" found.`);
    });
}
