import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = 5005;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const logger = (req, res, next) => {
  console.log("logger middleware logged", req.params);
  next();
};

const client = new MongoClient(process.env.MONGODB_URI);

async function run() {
  try {
    await client.connect();

    const db = client.db("hireloop_db");
    const jobsCollection = db.collection("jobs");
    const companyCollection = db.collection("companies");
    const usersCollection = db.collection("user");
    const applicationsCollection = db.collection("applications");
    const planCollection = db.collection("plans");
    const subscriptionCollection = db.collection("subscriptions");
    const sessionCollection = db.collection("session");

    // verification related

    const verifyToken = async (req, res, next) => {
      console.log("headers", req.headers);
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);

      if (!session) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const userId = session.userId;

      const userQuery = {
        _id: userId,
      };

      const user = await usersCollection.findOne(userQuery);

      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      req.user = user;
      next();
    };

    // must be used after verifyToken middleware
    const verifySeeker = async (req, res, next) => {
      if (req.user?.role !== "seeker") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // must be used after verifyToken middleware
    const verifyRecruiter = async (req, res, next) => {
      if (req.user?.role !== "recruiter") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // must be used after verifyToken middleware
    const verifyAdmin = async (req, res, next) => {
      if (req.user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Jobs related APIs

    app.get("/api/jobs", async (req, res) => {
      console.log("Server Side q: ", req.query);
      const query = {};

      //job filter releted query
      if (req.query.search) {
        query.$or = [
          { title: { $regex: req.query.search, $options: "i" } },
          { company: { $regex: req.query.search, $options: "i" } },
        ];
      }
      if (req.query.type) {
        query.type = req.query.type;
      }
      if (req.query.category) {
        query.category = req.query.category;
      }
      if (req.query.isRemote === "true") {
        query.isRemote = true;
      }

      // company related query
      if (req.query.companyId) {
        query.companyId = req.query.companyId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }

      //paginaiton reletated work
      if (req.query.page) {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const perPage = Math.max(1, parseInt(req.query.perPage, 10) || 12);
        const skipItems = (page - 1) * perPage;

        const total = await jobsCollection.countDocuments(query);
        const cursor = jobsCollection
          .find(query)
          .skip(skipItems)
          .limit(perPage);
        const jobs = await cursor.toArray();
        return res.send({ total, jobs });
      }

      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      const newJob = {
        ...job,
        createdAt: new Date(),
      };
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    app.get(`/api/jobs/:id`, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // plans

    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.plan_id) {
        query.id = req.query.plan_id;
      }
      const plan = await planCollection.findOne(query);
      res.send(plan);
    });

    // subscription
    app.post("/api/subscriptions", async (req, res) => {
      const data = req.body;
      const subsInfo = {
        ...data,
        createdAt: new Date(),
      };

      const result = await subscriptionCollection.insertOne(subsInfo);

      // update the user plan information
      const filter = { email: data.email };
      const updateDocument = {
        $set: {
          plan: data.planId,
        },
      };
      const updateResult = await usersCollection.updateOne(
        filter,
        updateDocument,
      );

      res.send(updateResult);
    });

    //application related apis

    app.get(
      `/api/applications`,
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const query = {};
        if (req.query.applicantId) {
          query.applicantId = req.query.applicantId;

          // check whether asking for user information or someone else
          console.log(req.user, req.query.applicantId);

          if (req.user._id.toString() !== req.query.applicantId) {
            return res.status(403).send({ message: "forbidden access" });
          }
        }
        if (req.query.jobId) {
          query.jobId = req.query.jobId;
        }
        const cursor = applicationsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.post("/api/applications", async (req, res) => {
      const application = req.body;
      const newApplication = {
        ...application,
        createdAt: new Date(),
      };
      const result = await applicationsCollection.insertOne(newApplication);
      res.send(result);
    });

    // company related apis

    // app.get("/api/companies", async (req, res) => {
    //   const cursor = companyCollection.find();
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    //inefficient way to join/aggregate collection
    app.get(
      `/api/companies`,
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const cursor = companyCollection.find();
        const companies = await cursor.toArray();

        for (const company of companies) {
          const filter = { companyId: company._id.toString() };
          const jobCount = await jobsCollection.countDocuments(filter);
          company.jobCount = jobCount;
        }

        res.send(companies);
      },
    );

    //inefficient way to join/aggregate collection
    app.get(`/api/companies2`, async (req, res) => {
      const pipeline = [{ $skip: 5 }, { $limit: 2 }];

      const cursor = companyCollection.aggregate(pipeline);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/api/stats", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$type",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $project: {
            jobType: "$_id",
            _id: 0,
            count: 1,
          },
        },
        // { $sort: { count: 1 } },
      ];
      const cursor = jobsCollection.aggregate(pipeline);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/api/my/companies", async (req, res) => {
      const query = {};
      if (req.query.recruiterId) {
        query.recruiterId = req.query.recruiterId;
      }
      const result = await companyCollection.findOne(query);
      res.send(result || {});
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      const newCompany = {
        ...company,
        createdAt: new Date(),
      };
      const result = await companyCollection.insertOne(newCompany);
      res.send(result);
    });

    app.patch(
      `/api/companies/:id`,
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedCompany = req.body;
        const filter = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            status: updatedCompany.status,
          },
        };
        const result = await companyCollection.updateOne(filter, updatedDoc);
        res.send(result);
      },
    );

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. you successfully connected to MongoDB!",
    );
  } catch (error) {
    console.log(error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
