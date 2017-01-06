/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

module.exports = {
  name: 'config/permissions',
  type: 'dynamodb/table',
  tableName: 'InfraConfigPermissions',
  keyName: 'Name',
  rangeName: null,
  queryable: true,
  editable: true,
  enableAuditing: true,
  exportable: true,
  importable: true,
  docs: {
    description: 'Permission Set',
    tags: ['Security and Permissions']
  }
};
