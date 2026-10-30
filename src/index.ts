import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI as string);
const db = client.db("communitykit");

app.get("/", (_req, res) => res.send("CommunityKit server cholche"));

await client.connect();
console.log("MongoDB connected");
app.listen(process.env.PORT, () => console.log(`Server: ${process.env.PORT}`));