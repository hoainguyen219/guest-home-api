const express = require('express')
const app = express()
const knex = require('./database')
const cors = require('cors')
const bodyParser = require('body-parser')
const multer = require('multer')
const admin = require('./storage')
const config = require('./config')

const { camelize } = require('./util')
const { count, queryBuilder } = require('./database')

const uploads = multer({
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
}).any()

app.use(cors())
app.use(function (req, res, next) {
  uploads(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        statusCode: 400,
        error: err.message,
      })
    } else {
      next()
    }
  })
})

app.use(
  bodyParser.json({ limit: '50mb' }),
  bodyParser.urlencoded({ limit: '50mb' }),
  bodyParser.text()
)
// get list
// {
//   area: {
//     min: xxx,
//     max: xxx
//   },
//   price: {
//     min: xxx,
//     max: xxx
//   },
//   date: {
//     fromDate
//   }
// }
app.get('/posts', async (req, res) => {
  const {
    minArea,
    maxArea,
    minPrice,
    maxPrice,
    city,
    district,
    fromDate,
    toDate,
    lat,
    lng,
    distance,
  } = req.query

  const posts = await knex
    .select(
      'post.*',
      'post_schedule.from_date as fromDate',
      'post_schedule.to_date as toDate'
    )
    .count('rating as totalReview')
    .sum('rating as totalScore')
    .from('post')
    .leftJoin('post_schedule', 'post.post_id', 'post_schedule.post_id')
    .where('status', 1)
    .modify((queryBuilder) => {
      if (minArea) queryBuilder.where('area', '>=', minArea)
      if (minPrice) queryBuilder.where('price', '>=', minPrice)
      if (maxPrice) queryBuilder.where('price', '<=', maxPrice)
      if (maxArea) queryBuilder.where('area', '<=', maxArea)
      if (city) queryBuilder.where('city', city)
      if (district) queryBuilder.where('district', district)
      if (maxArea) queryBuilder.where('area', '<=', maxArea)
      if (fromDate)
        queryBuilder.whereRaw(
          `post.post_id not in (
          select post_id from post_schedule 
            where (from_date between ? and ? )
            or (to_date between ? and ?)
            or ((? between from_date and to_date) and (? between from_date and to_date)))`,
          [fromDate, toDate, fromDate, toDate, fromDate, toDate]
        )
      if (lat && lng && distance) {
        queryBuilder
          .select(
            knex.raw(
              `6371 * ACOS(COS(RADIANS(?))
                * COS(RADIANS(lat)) * COS(RADIANS(lng) - RADIANS(?))+ SIN(RADIANS(?))
                * SIN(RADIANS(lat))) as distance`,
              [lat, lng, lat]
            )
          )
          .having('distance', '<=', distance)
          .orderBy('distance', 'asc')
      }
    })
    .groupBy('post.post_id')

  res.send(posts.map((x) => camelize(x)))
})

// get by id
app.get('/posts/:id', async (req, res) => {
  const id = req.params.id
  let post = await knex
    .select('post.*')
    .from('post')
    .where('post.post_id', parseInt(id))
    .first()
  const urlImages = await knex
    .select('url_image')
    .from('image')
    .where('image.post_id', parseInt(id))
  const today = new Date().toISOString().split('T')[0]
  const schedule = await knex
    .select(
      'from_date as fromDate',
      'to_date as toDate',
      'user.full_name as fullName',
      'user.phone_number as phoneNumber'
    )
    .from('post_schedule')
    .leftJoin('user', 'post_schedule.user_id', 'user.user_id')
    .where('post_id', parseInt(id))
    .andWhere('to_date', '>=', today)
    .orderBy('from_date')
  const [{ totalReview }] = await knex('post_schedule')
    .count('schedule_id as totalReview')
    .whereNotNull('rating')
    .andWhere('post_id', parseInt(id))
  const [{ totalScore }] = await knex('post_schedule')
    .sum({ totalScore: 'rating' })
    .where('post_id', parseInt(id))
  var avgScore
  var avgScore1
  if (totalReview !== 0) {
    avgScore = (totalScore / totalReview).toFixed(2)
  }
  else avgScore = undefined

  // hien thi diem danh gia nguoi cho thue
  const [{ totalReview1 }] = await knex('post_schedule')
    .count('schedule_id as totalReview1')
    .whereNotNull('rating_1')
    .andWhere('post_id', parseInt(id))
  const [{ totalScore1 }] = await knex('post_schedule')
    .sum({ totalScore1: 'rating_1' })
    .where('post_id', parseInt(id))
  if (totalReview1 !== 0) {
    avgScore1 = (totalScore1 / totalReview1).toFixed(2)
  } else avgScore1 = undefined
  post.urlImages = urlImages.map((x) => x.url_image)
  post.schedule = schedule
  post.totalReview = totalReview
  post.avgScore = avgScore
  post.avgScore1 = avgScore1
  res.send(camelize(post))
})

// get all cities
app.get('/cities', async (req, res) => {
  const cities = await knex.select('*').from('city')
  res.send(cities)
})

// get all districts
app.get('/cities/:cityId', async (req, res) => {
  const cityId = req.params.cityId
  const districts = await knex
    .select('*')
    .from('district')
    // .where('code', cityId)
    .where('city_id', cityId)

  res.send(districts)
})

//get list post by id: xem danh sach tin dang
app.get('/list/:userId', async (req, res) => {
  const userId = req.params.userId
  let posts = await knex
    .select('post.*')
    .count('rating as totalReview')
    .sum('rating as totalScore')
    .count('rating_1 as totalReview1')
    .sum('rating_1 as totalScore1')
    .from('post')
    .leftJoin('post_schedule', 'post.post_id', 'post_schedule.post_id')
    .where('post.post_by', parseInt(userId))
    .groupBy('post_id')
    .orderBy('post_id', 'desc')
  res.send(posts)
})

app.get('/manageSchedule/:userId', async (req, res) => {
  const userId = req.params.userId
  const schedules = await knex
    .select('from_date as fromDate', 'to_date as toDate', 
    'user.full_name as fullName', 'user.phone_number as phoneNumber',
    'post.title as title', 'post.address as address')
    .from('post_schedule')
    .leftJoin('post', 'post.post_id', 'post_schedule.post_id')
    .leftJoin('user', 'user.user_id', 'post_schedule.user_id')
    .where('post.post_by', parseInt(userId))
    .andWhere(knex.raw('to_date > current_date'))
    .orderBy([{column: 'post.post_id', order:'asc'}, {column: 'fromDate', order: 'asc'}])
  
    res.send(schedules)
})

//get schedule by userid: xem lich su thue
app.get('/schedule/:userId', async (req, res) => {
  const userId = req.params.userId
  let schedules = await knex
    .select(
      'post_schedule.schedule_id as Id',
      'post_schedule.from_date as fromDate',
      'post.post_id as postId',
      'post_schedule.to_date as toDate',
      'post.title as title',
      'post.address as address',
      'user.full_name as fullNameHost',
      'user.phone_number as Phone'
    )
    .from('post_schedule')
    .leftJoin('post', 'post.post_id', 'post_schedule.post_id')
    .leftJoin('user', 'user.user_id', 'post.post_by')
    .where('post_schedule.user_id', parseInt(userId))
    .orderBy('post_schedule.post_id')

  const reviews = await knex('post_schedule')
    .select('post_id')
    .count('rating as totalReview')
    .sum('rating as totalScore')
    .count('rating_1 as totalReview1')
    .sum('rating_1 as totalScore1')
    .whereIn('post_id', function () {
      this.select('post_id')
        .from('post_schedule')
        .where('user_id', parseInt(userId))
    })
    .groupBy('post_id')
    .orderBy('post_id')

  const reviewsMapping = []
  for (let review of reviews) {
    if (reviewsMapping[review.pos_id]) {
      reviewsMapping[review.pos_id].push(review)
    } else {
      reviewsMapping[review.post_id] = [review]
    }
  }
  for (let schedule of schedules) {
    schedule['reviews'] = reviewsMapping[schedule.postId]
  }

  const rates = await knex('post_schedule')
    .select('rating as Rating', 'post_id', 'rating_1 as Rating1')
    .where('user_id', userId)
    .whereNotNull('rating')
    .whereIn('post_id', function () {
      this.select('post_id')
        .from('post_schedule')
        .where('user_id', parseInt(userId))
    })
    .orderBy('post_id')


  const rateMapping = []
  for (let rate of rates) {
    rate.isRated = 1
    if (!rate.rating) {
      if (rateMapping[rate.pos_id]) {
        rateMapping[rate.pos_id].push(rate)
      } else {
        rateMapping[rate.post_id] = [rate]
      }
    }
  }
  for (let schedule of schedules) {
    schedule.isRated = rateMapping[schedule.postId]
  }

  res.send(schedules)

})

// post
app.post('/posts', async (req, res) => {
  console.log('kkk')
  const files = req.files
  const filesUploaded = []
  const filesUrls = []
  const bucket = admin.storage().bucket()

  if (files) {
    const numFiles = files.length
    for (let i = 0; i < numFiles; i++) {
      const currentFile = files[i]
      const time = new Date().getTime()
      const fileName = `images/${time}-${currentFile.originalname}`
      filesUploaded.push(bucket.file(fileName).save(currentFile.buffer))
      filesUrls.push(
        `https://storage.cloud.google.com/datn-a7520.appspot.com/${fileName}`
      )
    }
  }
  const newPost = req.body
  const [post] = await knex('post').insert([
    {
      title: newPost.title,
      area: newPost.area,
      address: newPost.address,
      bathroom: newPost.bathroom,
      city: newPost.city,
      district: newPost.district,
      lat: newPost.lat,
      lng: newPost.lng,
      description: newPost.description,
      price: newPost.price,
      bedroom: newPost.bedroom,
      air_condition: newPost.utilities.air_condition ? 1 : 0,
      wc: newPost.utilities.wc ? 1 : 0,
      garage: newPost.utilities.garage ? 1 : 0,
      electric_water_heater: newPost.utilities.electric_water_heater ? 1 : 0,
      status: 0,
      post_by: newPost.userId
    },
  ])
  await knex('image').insert(
    filesUrls.map((item) => {
      return { url_image: item, post_id: post }
    })
  )
  res.send({ postId: post })
})

//chinh sua
app.post('/posts/update/:postId', async (req, res) => {
  console.log('kkk')
  const postId = req.params.postId
  const files = req.files
  const filesUploaded = []
  const filesUrls = []
  const bucket = admin.storage().bucket()

  if (files) {
    const numFiles = files.length
    for (let i = 0; i < numFiles; i++) {
      const currentFile = files[i]
      const time = new Date().getTime()
      const fileName = `images/${time}-${currentFile.originalname}`
      filesUploaded.push(bucket.file(fileName).save(currentFile.buffer))
      filesUrls.push(
        `https://storage.cloud.google.com/datn-a7520.appspot.com/${fileName}`
      )
    }
  }
  const newPost = req.body
  console.log(req.body.title)
  const post = await knex('post').where('post_id', parseInt(postId)).update(
    {
      title: newPost.title || '',
      area: newPost.area,
      address: newPost.address || '',
      bathroom: newPost.bathroom ,
      city: newPost.city || '',
      district: newPost.district || '',
      lat: newPost.lat ,
      lng: newPost.lng ,
      description: newPost.description || '',
      price: newPost.price ,
      bedroom: newPost.bedroom ,
      air_condition: newPost.utilities.air_condition ? 1 : 0 ,
      wc: newPost.utilities.wc ? 1 : 0,
      garage: newPost.utilities.garage ? 1 : 0,
      electric_water_heater: newPost.utilities.electric_water_heater ? 1 : 0 ,
    },
  )
  await knex('image').where('post_id', parseInt(postId)).del()
  await knex('image').insert(
    filesUrls.map((item) => {
      return { url_image: item, post_id: post }
    })
  )
  res.send({ postId: post })
})

//get danh sach schedule theo post_id
app.get('/getSchedule/:postId', async(req, res) => {
  const postId = req.params.postId
  const listSchedule = await knex('post_schedule')
  .select('from_date as fromDate', 'to_date as toDate')
  .whereRaw('post_id = ? and to_date >= current_date', [postId])

  res.send(listSchedule)
})


// register
app.post('/register', async (req, res) => {
  const user = req.body
  const checkUser = await knex('user').select('user_id').where('account', user.account)
  console.log(checkUser.length)
  if (checkUser.length > 0) {return res.sendStatus(400)}
  const [userId] = await knex('user').insert([
    {
      ...user,
      role: 1,
    },
  ])
  res.send({ userId })
})
// login
app.post('/login', async (req, res) => {
  const { username, password } = req.body
  const userInfo = await knex
    .select('*')
    .from('user')
    .where('account', username)
    .andWhere('password', password)
    .first()
  if (!userInfo) return res.sendStatus(400)
  res.send(userInfo)
})
// booking
app.post('/posts/:id/booking', async (req, res) => {
  const postId = req.params.id
  const { fromDate, toDate, userId } = req.body
  const booked = await knex('post_schedule')
    .select('post_id')
    .whereRaw(
      `post_id = ?
      and ((from_date between ? and ? )
      or (to_date between ? and ?)
      or ((? between from_date and to_date) and (? between from_date and to_date)))
      `,
      [postId, fromDate, toDate, fromDate, toDate, fromDate, toDate])
    
  console.log(365, booked.length)
  console.log(366, booked)
  if (booked.length > 0) {
    res.sendStatus(400)
    // res.send('Đặt lịch không thành công: Trùng lịch')
  }
  else {
    await knex('post_schedule').insert([
      {
        post_id: postId,
        from_date: fromDate,
        to_date: toDate,
        user_id: userId,
      },
    ])
  }
  res.send({ postId })
})

//rating
app.post('/posts/:scheduleId/rating', async (req, res) => {
  const scheduleId = req.params.scheduleId
  const { score, score1 } = req.body
  await knex('post_schedule').where('schedule_id', scheduleId).update({
    rating: score,
    rating_1: score1,
  })
  res.send({ scheduleId })
})

//quan ly bai viet
app.get('/admin', async (req, res) => {
  const postmanges = await knex('post').select('post.*').where('status', 0)

  res.send(postmanges)
})
//thống kê
app.get('/admin/tk', async (req, res) => {
  const cities = await knex('post')
    .select('city as city')
    .count('city as count')
    .groupBy('city')
    .orderBy('count', 'desc')
    // .limit(10)
  let totalPost = await knex('post').count('* as totalPost').first()

  totalPost.cities = cities
  res.send(camelize(totalPost))
})

//Chinh sua bai viet

//Xoa
app.delete('/post/:postId', async (req, res) => {
  const postId = req.params.postId
  const hasSchedule = await knex('post_schedule')
    .where({ post_id: postId })
    .andWhereRaw('to_date > current_date()')
  if (hasSchedule.length) return res.sendStatus(400)
  await knex('post_schedule')
    .where({
      post_id: postId,
    })
    .del()
  await knex('image')
    .where({
      post_id: postId,
    })
    .del()
  const deletedCount = await knex('post')
    .where({
      post_id: postId,
    })
    .del()
  if (!deletedCount) return res.sendStatus(404)
  return res.send({ postId })
})

//Duyet
app.post('/admin/accept/:postId', async (req, res) => {
  const postId = req.params.postId
  const post = await knex('post').where('post_id', postId).update('status', 1)
  if (!post) return res.sendStatus(404)
  return res.send({ postId })
})

//phân trang
app.get('/news/:page', async (req, res, next) => {
  let perPage = 15; // số lượng sản phẩm xuất hiện trên 1 page
  let page = req.params.page || 1;
  const products = await knex('post').select('*')
    .offset((perPage * page) - perPage) // Trong page đầu tiên sẽ bỏ qua giá trị là 0
    .limit(perPage)
  res.send(products)
});

const port = process.env.PORT || 5000
const host = process.env.HOST || 'localhost'

app.listen(port, function () {
  console.log(`Example app listening on port http://${host}:${port}`)
})
