import path from 'path';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import BaseEvents from 'base-events';

import WebpackBuildLogger from 'webpack-build-logger';
import WebpackCodeSplitter from 'webpack-code-splitter';

import UglifyJsPlugin from 'webpack/lib/optimize/UglifyJsPlugin';
import ProvidePlugin from 'webpack/lib/ProvidePlugin';

import clone from 'lodash/cloneDeep';
import setter from 'lodash/set';


const normalizePathExpr =  expr => expr
  .replace(/([^\\])\//g, '$1\\/')
  .replace(/\//g, path.sep);

const getLoadersMap = (applicationConfig) => {
  const regexp = (expr) => {
    let normalized = normalizePathExpr(`${applicationConfig.src}.+${expr}`);
    return new RegExp(normalized);
  };

  const loaderPresetsMap = new Map();

  loaderPresetsMap.set('babel', {
    test: regexp('\.js?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'babel',
    query: {
      presets: ["es2015", "stage-0"]
    }
  });

  loaderPresetsMap.set('jsx', {
    test: regexp('\.jsx?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'babel',
    query: {
      presets: ["react", "es2015", "stage-0"]
    }
  });

  loaderPresetsMap.set('jade', {
    test: regexp('\.jade?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'jade'
  });

  loaderPresetsMap.set('html', {
    test: regexp('\.html?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'html'
  });

  loaderPresetsMap.set('json', {
    test: regexp('\.json?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'json'
  });

  loaderPresetsMap.set('yaml', {
    test: regexp('\.yml?$'),
    exclude: /(node_modules|bower_components)/,
    loader: 'json!yaml'
  });

  return loaderPresetsMap;
};

const getLoadersPresets = (presets, applicationConfig) => {
  let loaderPresetsMap = getLoadersMap(applicationConfig);
  let loaders = [];

  for (let preset of presets) {
    if (!loaderPresetsMap.has(preset)) {
      let availableKeys = [];
      for (let key of loaderPresetsMap.keys()) {
        availableKeys.push(key);
      }

      throw new Error(`Loader "${preset}" does not exists. Available presets: ${availableKeys.join(', ')}`);
    }

    let loader = loaderPresetsMap.get(preset);
    loaders.push(loader);
  }

  return loaders;
};

const generateConfig = (config, applicationConfig) => {

  let jsRelativeDest = config.js.getOriginalDest();
  let bundle = `${path.dirname(jsRelativeDest)}/${path.basename(jsRelativeDest, '.js')}`;

  let webpackConfig = {
    bail: config.bail || false,
    devtool: config.devtool,
    debug: config.debug,
    //target: applicationConfig.dest,
    output: {
      path: path.resolve(applicationConfig.dest),
      filename: "[name].js",
      chunkFilename: "[name].js",
      pathinfo: true
    },
    resolve: {
      modulesDirectories: config.resolve,
      alias: config.alias
    },
    entry: {
      [bundle]: config.js.getCollected()
    },
    plugins: [],
    module: {
      loaders: []
    }
  };

  if (config.loadersPresets) {
    webpackConfig.module.loaders = getLoadersPresets(config.loadersPresets, applicationConfig);
  }

  if (config.loaders) {
    let loaders = [];
    for (let loader of config.loaders) {
      let normalizedTest = normalizePathExpr(loader.test.source);
      let test = new RegExp(normalizedTest);

      let normalizedLoader = Object.assign({}, loader, {
        test
      });

      loaders.push(normalizedLoader);
    }

    webpackConfig.module.loaders = webpackConfig.module.loaders.concat(loaders);
  }

  if (config.optimize) {
    webpackConfig.plugins.push(new UglifyJsPlugin({
      compress: {
        warnings: false
      }
    }));
  }

  if (config.shim) {
    let providePlugin = new ProvidePlugin(config.shim);
    webpackConfig.plugins.push(providePlugin);
  }

  return webpackConfig;
};


let _config = Symbol('webpack-config');

export default class WebpackMutator extends BaseEvents {
  constructor(key, config, applicationConfig) {
    super();

    this.key = key;

    this.applicationSrc = applicationConfig.src;
    this.applicationDest = applicationConfig.dest;

    this.port = config.port || 9001;
    this.host = config.host || 'localhost';

    this[_config] = generateConfig(config, applicationConfig);

    // ---

    let logPlugin = new WebpackBuildLogger({});

    logPlugin.on('build.start', () => {
      this.emit('build.start');
    });

    logPlugin.on('build.done', (options) => {
      this.emit('build.done', options);
    });

    logPlugin.on('build.error', (err) => {
      this.emit('build.error', err);
    });

    this[_config].plugins.push(logPlugin);
  }

  // ----
  set(path, value) {
    setter(this[_config], path, value);
  }

  addLoader(loader) {
    this[_config].module.loaders.push(loader);
  }

  // ---

  getConfig() {
    return clone(this[_config]);
  }

  getBuilder() {
    let config = this.getConfig();
    return webpack(config);
  }

  build(cb = () => {}) {
    let builder = this.getBuilder();
    builder.run(cb);
  }

  getServer() {
    let builder = this.getBuilder();

    return new WebpackDevServer(builder, {
      historyApiFallback: true,
      contentBase: this.applicationDest,
      quiet: true,
      noInfo: true,
      lazy: false,
      watchOptions: {
        aggregateTimeout: 300,
        poll: 1000
      },
      headers: {
        'X-Custom-Header': 'yes'
      },
      stats: {
        colors: true
      }
    });
  }

  serve(cb = () => {}, instance) {
    let server = instance || this.getServer();

    server.listen(this.port, this.host, () => {

      cb({
        port: this.port,
        host: this.host
      });
    });
  }
}
