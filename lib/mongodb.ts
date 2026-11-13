
import { configureMongoDns } from "./mongodb-dns";
import { MongoClient } from "mongodb";

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please add MONGODB_URI to your .env.local file");
  }
  return uri;
}

const options = {};

let clientPromise: Promise<MongoClient> | undefined;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function connectToMongoDB(): Promise<MongoClient> {
  configureMongoDns();

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(getMongoUri(), options)
        .connect()
        .catch((error: unknown) => {
          global._mongoClientPromise = undefined;
          throw error;
        });
    }

    return global._mongoClientPromise;
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(getMongoUri(), options).connect();
  }

  return clientPromise;
}
