import path from 'path';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import BaseEvents from 'base-events';

import WebpackBuildLogger from 'webpack-build-logger';
import WebpackCodeSplitter from 'webpack-code-splitter';
import UglifyJsPlugin from 'webpack/lib/optimize/UglifyJsPlugin';


const generateConfig = (config, applicationConfig) => {
  const regexp = (expr) => new RegExp(`${applicationConfig.src}.+${expr}`);

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
      loaders: [{
        test: regexp('\.js?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'babel',
        query: {
          presets: ["es2015", "stage-0"]
        }
      }, {
        test: regexp('\.jsx?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'babel',
        query: {
          presets: ["react", "es2015", "stage-0"]
        }
      }, {
        test: regexp('\.jade?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'jade'
      }, {
        test: regexp('\.html?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'html'
      }, {
        test: regexp('\.json?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'json'
      }, {
        test: regexp('\.yml?$'),
        exclude: /(node_modules|bower_components)/,
        loader: 'json!yaml'
      }]
    }
  };

  if (webpackConfig.optimize) {
    webpackConfig.plugins.push(new UglifyJsPlugin({
      compress: {
        warnings: false
      }
    }));
  }

  return webpackConfig;
};

const generateServerConfig = (config, applicationConfig) => {
  return {
    historyApiFallback: true,
    contentBase: applicationConfig.dest,
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
  }
};

export default class WebpackMutator extends BaseEvents {
  constructor(key, config, applicationConfig) {
    super();

    this.key = key;
    this.config = config;

    this.applicationSrc = applicationConfig.src;
    this.applicationDest = applicationConfig.dest;

    this.port = config.port || 9001;
    this.host = config.host || 'localhost';

    this.webpackConfig = generateConfig(config, applicationConfig);
    this.webpackServerConfig = generateServerConfig(config, applicationConfig);

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

    this.webpackConfig.plugins.push(logPlugin);
  }

  getConfig() {
    return this.webpackConfig;
  }

  getServerConfig() {
    return this.webpackServerConfig;
  }

  getBuilder() {
    let config = this.getConfig();
    return webpack(config);
  }

  build(cb = () => {
  }) {
    let builder = this.getBuilder();
    builder.run(cb);
  }

  serve(cb = () => {
  }) {
    let builder = this.getBuilder();
    let config = this.getServerConfig();
    let server = new WebpackDevServer(builder, config);

    server.listen(this.port, this.host, () => {

      cb({
        port: this.port,
        host: this.host
      });
    });
  }
}
