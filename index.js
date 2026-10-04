import { MongoClient } from "mongodb";
import express from "express";
import dotenv from "dotenv";
import cors from "cors"

dotenv.config()
const app = express();
app.use(cors())
app.use(express.json())
const port = 5005;

app.get("/", (req, res) => {
  res.send("Hello World!");
});


const client = new MongoClient(
  process.env.MONGODB_URI,
);

async function run() {
    try {
        await client.connect();

        const db = client.db("hireloop_db");
        const jobsCollection = db.collection("jobs");

        app.get('/api/jobs', async (req, res) => {
            const query = {};
            if (req.query.companyId) {
                query.companyId = req.query.companyId;
            }
            if (req.query.status) {
                query.status = req.query.status;
            }
            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/api/jobs', async (req, res) => {
            const job = req.body;
            const result = await jobsCollection.insertOne(job);
            res.send(result)
        })


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. you successfully connected to MongoDB!");
    }
    catch (error) {
        console.log(error);
        
    }
}

run().catch(console.dir)


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
