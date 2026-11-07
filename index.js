import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

app.use(cors());
app.use(express.json());

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("shareandcareDB");
const eventCollection = db.collection("events");
const joinCollection = db.collection("joinedEvents");

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.FRONTEND_URI}/api/auth/jwks`),
);


// Middleware to verify the JWT token from the request header
// Attaches the user info to req.user if the token is valid

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized!" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.FRONTEND_URI,
      audience: process.env.FRONTEND_URI,
    });
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized!" });
  }
};

// create
app.post("/add-event", verifyToken, async (req, res) => {
  const data = req.body;
  const date = new Date(data.eventDate);

  if (isNaN(date) || date <= new Date()) {
    return res.status(400).send({ message: "Event date must be in the future" });
  }

  const result = await eventCollection.insertOne({
    ...data,
    eventDate: date,
    creatorEmail: req.user.email,
    createdAt: new Date(),
  });
  res.send(result);
});

// home: 6 upcoming events (must stay above /events/:id)
app.get("/events/recent", async (req, res) => {
  const result = await eventCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();
  res.send(result);
});

// all upcoming events (?type=Cleanup&search=winter)
app.get("/events", async (req, res) => {
  const { type, search } = req.query;
  const query = { eventDate: { $gte: new Date() } };
  if (type) query.eventType = type;
  if (search) {
    query.title = {
      $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  const result = await eventCollection
    .find(query)
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});

// single event (public)
app.get("/events/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }
  const result = await eventCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

// my events
app.get("/my-events", verifyToken, async (req, res) => {
  const result = await eventCollection
    .find({ creatorEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});

// update (owner only)
app.patch("/events/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  const { _id, creatorEmail, ...data } = req.body;
  if (data.eventDate) {
    const date = new Date(data.eventDate);
    if (isNaN(date) || date <= new Date()) {
      return res.status(400).send({ message: "Event date must be in the future" });
    }
    data.eventDate = date;
  }

  const result = await eventCollection.updateOne(
    { _id: new ObjectId(id), creatorEmail: req.user.email },
    { $set: data },
  );
  if (result.matchedCount === 0) {
    return res.status(403).send({ message: "You can only update your own events" });
  }
  res.json(result);
});

// delete (owner only)
app.delete("/events/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  const result = await eventCollection.deleteOne({
    _id: new ObjectId(id),
    creatorEmail: req.user.email,
  });
  if (result.deletedCount === 0) {
    return res.status(403).send({ message: "You can only delete your own events" });
  }
  res.json(result);
});

// join
app.post("/join", verifyToken, async (req, res) => {
  const { eventId } = req.body;
  if (!ObjectId.isValid(eventId)) {
    return res.status(400).send({ message: "Invalid event id" });
  }

  const event = await eventCollection.findOne({ _id: new ObjectId(eventId) });
  if (!event) {
    return res.status(404).send({ message: "Event not found" });
  }

  const already = await joinCollection.findOne({
    eventId,
    userEmail: req.user.email,
  });
  if (already) {
    return res.status(409).send({ message: "You have already joined this event" });
  }

  const { _id, ...eventData } = event;
  const result = await joinCollection.insertOne({
    ...eventData,
    eventId,
    userEmail: req.user.email,
    userName: req.user.name,
    joinedAt: new Date(),
  });
  res.send(result);
});

// joined events
app.get("/joined-events", verifyToken, async (req, res) => {
  const result = await joinCollection
    .find({ userEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});

export default app;