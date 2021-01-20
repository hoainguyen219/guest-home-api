const { camel } = require('to-case')

exports.camelize = obj => {
  return Object.entries(obj).reduce((o, [key, value]) => {
      o[camel(key)] = value
      return o
  }, {})
}
