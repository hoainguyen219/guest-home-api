const setupPaginator = require('knex-paginator')
const config = require('./config')

const connection = {
  user: 'root',
  password: '',
  database: 'hostel',
  charset: 'utf8',
  typeCast: function (field, next) {
    if (field.type === 'JSON') {
      return JSON.parse(field.string())
    }
    return next()
  },
}

connection.host = 'localhost'
connection.port = '3306'
const knex = require('knex')({
  client: 'mysql',
  connection,
})
setupPaginator(knex)

module.exports = knex
