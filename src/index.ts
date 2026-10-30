import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

interface EventDoc {
  title: string;
  description: string;
  eventType: string;
  thumbnail: string;
  location: string;
  eventDate: Date;
  creatorEmail: string;
  createdAt: Date;
}

interface JoinedDoc {
  eventId: string;
  userEmail: string;
  userName: string;
  event: EventDoc & { _id: ObjectId };
  eventDate: Date;
  joinedAt: Date;
}

type AuthUser = JWTPayload & { email: string; name?: string };

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI as string);
const db = client.db("communitykit");
const events = db.collection("events");
const joined = db.collection("joined");

// JWT verify (BetterAuth)
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (typeof payload.email !== "string") {
      return res.status(401).json({ message: "Unauthorized: No Email found in token" });
    }
    res.locals.user = payload as AuthUser;
    next();
  }
  catch {
    res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

const getUser = (res: Response) => res.locals.user as AuthUser;

// Public: upcomming events(past event hide korbo)
app.get("/events", async (req: Request, res: Response) => {
  const { limit, type, search } = req.query as Record<string, string | undefined>;
  const query: Record<string, unknown> = { eventDate: { $gte: new Date() } };
  if (type) {
    query.eventType = type;
  }
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }
  const result = await events
    .find(query)
    .sort({ eventDate: 1 })
    .limit(Number(limit) || 0)
    .toArray();
  res.json(result);
});

app.get("/events/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid event id"
    });
  }
  const event = await events.findOne({ _id: new ObjectId(id) });
  if (!event) return res.status(404).json({ message: "Event pawa jayni" });
  res.json(event);
});

// Private
app.post("/events", verifyJWT, async (req: Request, res: Response) => {
  const { title, description, eventType, thumbnail, location, eventDate } = req.body;
  if (!title || !description || !eventType || !thumbnail || !location || !eventDate)
    return res.status(400).json({ message: "Shob field dite hobe" });
  if (new Date(eventDate) <= new Date())
    return res.status(400).json({ message: "Date obossoi future e hote hobe" });
  const result = await events.insertOne({
    title, description, eventType, thumbnail, location,
    eventDate: new Date(eventDate),
    creatorEmail: getUser(res).email,
    createdAt: new Date(),
  });
  res.status(201).json(result);
});

app.get("/my-events", verifyJWT, async (_req: Request, res: Response) => {
  res.json(
    await events.find({ creatorEmail: getUser(res).email }).sort({ eventDate: 1 }).toArray()
  );
});

app.put("/events/:id", verifyJWT, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ObjectId.isValid(id))
    return res.status(400).json({ message: "Invalid event id" });
  const { title, description, eventType, thumbnail, location, eventDate } = req.body;
  if (new Date(eventDate) <= new Date())
    return res.status(400).json({ message: "Date obossoi future e hote hobe" });
  const result = await events.updateOne(
    { _id: new ObjectId(id), creatorEmail: getUser(res).email },
    { $set: { title, description, eventType, thumbnail, location, eventDate: new Date(eventDate) } }
  );
  if (!result.matchedCount){
    return res.status(403).json({ message: "Eta tomar event na" });
  }
  res.json(result);
});


app.get("/", (_req, res) => res.send("CommunityKit server cholche"));

await client.connect();
console.log("MongoDB connected");
app.listen(process.env.PORT, () => console.log(`Server is running on: http://localhost:${process.env.PORT}`));