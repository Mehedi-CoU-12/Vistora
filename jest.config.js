const preset = require('@react-native/jest-preset');

module.exports = {
  ...preset,
  transform: {
    ...preset.transform,
    
    
    '^.+\\.mjs$': 'babel-jest',
  },
  
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
};
