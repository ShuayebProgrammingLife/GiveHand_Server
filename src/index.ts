import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { MongoClient, ObjectId, Filter } from "mongodb";
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
const events = db.collection<EventDoc>("events");
const joined = db.collection<JoinedDoc>("joined");

// ---------- Helpers ----------
const parseId = (value: unknown): ObjectId | null =>
  typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type ParsedEvent =
  | { error: string }
  | { data: Omit<EventDoc, "creatorEmail" | "createdAt"> };

const parseEventBody = (body: Record<string, unknown> | undefined): ParsedEvent => {
  const title = str(body?.title);
  const description = str(body?.description);
  const eventType = str(body?.eventType);
  const thumbnail = str(body?.thumbnail);
  const location = str(body?.location);

  if (!title || !description || !eventType || !thumbnail || !location) {
    return { error: "All fields are required" };
  }

  const eventDate = new Date(String(body?.eventDate));
  if (!body?.eventDate || Number.isNaN(eventDate.getTime())) {
    return { error: "A valid event date is required" };
  }
  if (eventDate <= new Date()) {
    return { error: "Event date must be in the future" };
  }

  return { data: { title, description, eventType, thumbnail, location, eventDate } };
};

// ---------- JWT (BetterAuth) ----------
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (typeof payload.email !== "string") {
      res.status(401).json({ message: "Unauthorized: No email found in token" });
      return;
    }
    res.locals.user = payload as AuthUser;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

const getUser = (res: Response) => res.locals.user as AuthUser;

// ---------- Public routes ----------
app.get("/", (_req: Request, res: Response) => {
  res.send("CommunityKit server is running");
});

// Upcoming events only (past events are hidden)
app.get("/events", async (req: Request, res: Response) => {
  const { limit, type, search } = req.query as Record<string, string | undefined>;
  const query: Filter<EventDoc> = { eventDate: { $gte: new Date() } };
  if (type) query.eventType = type;
  if (search) query.title = { $regex: escapeRegex(search), $options: "i" };

  const result = await events
    .find(query)
    .sort({ eventDate: 1 })
    .limit(Number(limit) || 0)
    .toArray();
  res.json(result);
});

app.get("/events/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ message: "Invalid event id" });
    return;
  }
  const event = await events.findOne({ _id: id });
  if (!event) {
    res.status(404).json({ message: "Event not found" });
    return;
  }
  res.json(event);
});

// ---------- Private routes ----------
app.post("/events", verifyJWT, async (req: Request, res: Response) => {
  const parsed = parseEventBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const result = await events.insertOne({
    ...parsed.data,
    creatorEmail: getUser(res).email,
    createdAt: new Date(),
  });
  res.status(201).json(result);
});

app.get("/my-events", verifyJWT, async (_req: Request, res: Response) => {
  const result = await events
    .find({ creatorEmail: getUser(res).email })
    .sort({ eventDate: 1 })
    .toArray();
  res.json(result);
});

app.put("/events/:id", verifyJWT, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ message: "Invalid event id" });
    return;
  }
  const parsed = parseEventBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const result = await events.updateOne(
    { _id: id, creatorEmail: getUser(res).email },
    { $set: parsed.data }
  );
  if (!result.matchedCount) {
    res.status(403).json({ message: "You can only update your own events" });
    return;
  }
  res.json(result);
});

app.delete("/events/:id", verifyJWT, async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ message: "Invalid event id" });
    return;
  }
  const result = await events.deleteOne({
    _id: id,
    creatorEmail: getUser(res).email,
  });
  if (!result.deletedCount) {
    res.status(403).json({ message: "You can only delete your own events" });
    return;
  }
  res.json(result);
});

app.post("/join", verifyJWT, async (req: Request, res: Response) => {
  const id = parseId(req.body?.eventId);
  if (!id) {
    res.status(400).json({ message: "Invalid event id" });
    return;
  }
  const event = await events.findOne({ _id: id });
  if (!event) {
    res.status(404).json({ message: "Event not found" });
    return;
  }
  if (event.eventDate <= new Date()) {
    res.status(400).json({ message: "This event has already passed" });
    return;
  }

  const user = getUser(res);
  try {
    const result = await joined.insertOne({
      eventId: id.toString(),
      userEmail: user.email,
      userName: user.name ?? "",
      event,
      eventDate: event.eventDate,
      joinedAt: new Date(),
    });
    res.status(201).json(result);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ message: "You have already joined this event" });
      return;
    }
    throw error;
  }
});

app.get("/joined", verifyJWT, async (_req: Request, res: Response) => {
  const result = await joined
    .find({ userEmail: getUser(res).email })
    .sort({ eventDate: 1 })
    .toArray();
  res.json(result);
});

// ---------- Start ----------
await client.connect();
await joined.createIndex({ eventId: 1, userEmail: 1 }, { unique: true });
console.log("MongoDB connected");

const PORT = Number(process.env.PORT) || 3005;
app.listen(PORT, () => console.log(`Server is running on: http://localhost:${PORT}`));