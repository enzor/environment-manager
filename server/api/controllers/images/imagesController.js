/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */

'use strict';

let ScanImages = require('queryHandlers/ScanImages');
let ScanCrossAccountImages = require('queryHandlers/ScanCrossAccountImages');
let _ = require('lodash');

function getImages(req, res, next) {
  const accountName = req.swagger.params.account.value;
  const stable = req.swagger.params.stable.value;

  let scanImages = getScanImagesQuery(accountName);

  scanImages().then((data) => {
    if (stable !== undefined) {
      res.json(_.filter(data, { IsStable: stable }));
    } else {
      res.json(data);
    }
  }).catch(next);
}

function getScanImagesQuery(accountName) {
  let query = { filter: {} };
  if (accountName) return () => ScanImages(Object.assign({}, query, { accountName }));
  return () => ScanCrossAccountImages(query);
}

module.exports = {
  getImages
};
