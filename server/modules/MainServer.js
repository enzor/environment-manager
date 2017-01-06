/* Copyright (c) Trainline Limited, 2016-2017. All rights reserved. See LICENSE.txt in the project root for license information. */
'use strict';

let express = require('express');
let bodyParser = require('body-parser');
let cookieParser = require('cookie-parser');
let logger = require('modules/logger');
let winston = require('winston');
let fs = require('fs');
let config = require('config/');
let compression = require('compression');
let expressWinston = require('express-winston');

let serverFactoryConfiguration = new(require('modules/serverFactoryConfiguration'))();
let tokenAuthentication = require('modules/authentications/tokenAuthentication');
let cookieAuthentication = require('modules/authentications/cookieAuthentication');
let authentication = require('modules/authentication');
let deploymentMonitorScheduler = require('modules/monitoring/DeploymentMonitorScheduler');
let apiV1 = require('api/v1');

const APP_VERSION = require('config').get('APP_VERSION');

module.exports = function MainServer() {

  let httpServerFactory = require('modules/http-server-factory');
  let _server;

  this.start = function () {
    return createExpressApp()
      .then(createServer)
      .then(initializeServer);
  };

  this.stop = function () {
    _server.close();
  };

  function createExpressApp() {
    return new Promise((resolve) => {

      let routeInstaller = require('modules/routeInstaller');
      let routes = {
        home: require('routes/home'),
        form: require('routes/form'),
        initialData: require('routes/initialData'),
        deploymentNodeLogs: require('routes/deploymentNodeLogs'),
      };

      // start express
      let app = express();

      app.use(compression());
      app.use(cookieParser());
      app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
      app.use(bodyParser.json({ extended: false, limit: '50mb' }));
      app.use(cookieAuthentication.middleware);
      app.use(tokenAuthentication.middleware);

      /* notice how the router goes after the logger.
       * https://www.npmjs.com/package/express-winston#request-logging */
      if (config.get('IS_PRODUCTION') === true) {
        app.use(expressWinston.logger({ winstonInstance: logger }));
      }

      const PUBLIC_DIR = config.get('PUBLIC_DIR');
      logger.info(`Serving static files from "${PUBLIC_DIR}"`);

      let staticPaths = ['*.js', '*.css', '*.html', '*.ico', '*.gif', '*.woff2', '*.ttf', '*.woff', '*.svg', '*.eot', '*.jpg', '*.png', '*.map'];
      app.get(staticPaths, authentication.allowUnknown, express.static(PUBLIC_DIR));
      app.get('/', authentication.denyUnauthorized, express.static(PUBLIC_DIR));

      app.get('*.js', authentication.allowUnknown, express.static('modules'));

      // routing for API JSON Schemas
      app.use('/schema', authentication.allowUnknown, express.static(`${PUBLIC_DIR}/schema`));

      // routing for html pages
      app.get('/login', authentication.allowUnknown, routes.form.login.get);
      app.post('/login', authentication.allowUnknown, routes.form.login.post);
      app.get('/logout', authentication.allowUnknown, routes.form.logout.get);

      app.get('/deployments/nodes/logs', authentication.denyUnauthorized, routes.deploymentNodeLogs);

      // routing for APIs
      app.get('/api/initial-data', authentication.denyUnauthorized, routes.initialData);
      app.use('/api', routeInstaller());

      if (config.get('IS_PRODUCTION') === true) {
        app.use(expressWinston.errorLogger({ winstonInstance: logger }));
      }

      apiV1.setup(app);

      resolve(app);
    });
  };

  function createServer(app) {
    let parameters = {
      port: serverFactoryConfiguration.getPort(),
    };

    return httpServerFactory.create(app, parameters).then(server => {
      logger.info(`Main server created using ${httpServerFactory.constructor.name} service.`);
      logger.info(`Main server listening at port ${parameters.port}.`);
      return Promise.resolve(server);
    });
  }

  function initializeServer(server) {
    _server = server;
    deploymentMonitorScheduler.start();
    logger.info(`EnvironmentManager v.${APP_VERSION} started!`);
  }
};
