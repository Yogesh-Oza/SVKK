import { type Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/placeholder";
const client = new MongoClient(uri);

export const mongoClientPromise: Promise<MongoClient> = client.connect();
export const db: Db = client.db(process.env.MONGODB_DB_NAME ?? "app");
