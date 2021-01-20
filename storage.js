const admin = require('firebase-admin')

const config = require('./config')
const serviceAccount = require('./service-account.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: config.firestore.bucketName
})

module.exports = admin
