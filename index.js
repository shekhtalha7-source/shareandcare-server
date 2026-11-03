import express from 'express'
import { MongoClient, ObjectId } from 'mongodb'
import cors from 'cors'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 8000

app.use(cors())
app.use(express.json())

const client = new MongoClient(process.env.MONGODB_URL)
export async function connectToMongoDB() {
  try {
    await client.connect()
    console.log("You successfully connected to MongoDB!")
    return client
  } catch (err) {
    console.dir(err)
  }
}
const mongoClient = await connectToMongoDB()
const db = mongoClient.db("shareandcareDB")
const eventCollection = db.collection("events")
const joinCollection = db.collection("joinedEvents")

// create
app.post('/add-event', async (req, res) => {
  const data = req.body
  data.eventDate = new Date(data.eventDate)
  const result = await eventCollection.insertOne(data)
  res.send({ result })
})

// home: ৬টি আসন্ন ইভেন্ট (এটা /events/:id এর আগে থাকবে)
app.get('/events/recent', async (req, res) => {
  const result = await eventCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray()
  res.send(result)
})

// সব আসন্ন ইভেন্ট
app.get('/events', async (req, res) => {
  const result = await eventCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .toArray()
  res.send(result)
})

// একটি ইভেন্ট
app.get('/events/:id', async (req, res) => {
  const { id } = req.params
  const result = await eventCollection.findOne({ _id: new ObjectId(id) })
  res.send(result)
})

// আমার ইভেন্ট
app.get('/my-events', async (req, res) => {
  const result = await eventCollection.find({ creatorEmail: req.query.email }).toArray()
  res.send(result)
})

// update
app.patch('/events/:id', async (req, res) => {
  const { id } = req.params
  const updateData = req.body
  if (updateData.eventDate) updateData.eventDate = new Date(updateData.eventDate)
  const result = await eventCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData })
  res.json(result)
})

// delete
app.delete('/events/:id', async (req, res) => {
  const { id } = req.params
  const result = await eventCollection.deleteOne({ _id: new ObjectId(id) })
  res.json(result)
})

// join
app.post('/join', async (req, res) => {
  const result = await joinCollection.insertOne(req.body)
  res.send({ result })
})

// আমার জয়েন করা ইভেন্ট
app.get('/joined-events', async (req, res) => {
  const result = await joinCollection
    .find({ userEmail: req.query.email })
    .sort({ eventDate: 1 })
    .toArray()
  res.send(result)
})

app.get('/', (req, res) => {
  res.send({ message: 'ShareAndCare server is running fine' })
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})