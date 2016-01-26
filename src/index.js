

import WebpackMutator from './webpack-mutator';

module.exports = (key, config, applicationConfig) => {
  return new WebpackMutator(key, config, applicationConfig);
};
