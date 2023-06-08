const express = require("express");
const app = express();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cors = require("cors");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return res.status(401).send({ error: true, message: "Unauthorized Access" });
    }
    // bearer token
    const token = authorization.split(" ")[1];
  
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).send({ error: true, message: "Unauthorized Access" });
      }
      req.decoded = decoded;
      next();
    })
  }


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gkaujxr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("tranquilZenDB").collection("users");
    const classCollection = client.db("tranquilZenDB").collection("class");

    app.post("/jwt", (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "10h" });
        res.send({ token });
    });
    
    // warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        if (user?.role !== "Admin") {
            return res.status(403).send({ error: true, message: "forbidden message" });
        }
        next();
    }

    // warning: use verifyJWT before using verifyInstructor
    const verifyInstructor = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        if (user?.role !== "Instructor") {
            return res.status(403).send({ error: true, message: "forbidden message" });
        }
        next();
    }

    // users related api

    // step-2: get all users
    app.get("/users", async (req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result);
    });

    // step-3: get specific user by email
    app.get("/users/:email", async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const result = await userCollection.findOne(query);
        res.send(result);
    });

    // step-1: insert user name, email, role to mongoDB
    // before insert check existing or not
    app.post("/users", async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
            return res.send({ message: "User already exist!" });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
    });

    // step-4: updating user role to admin
    app.patch("/users/user-to-admin/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "Admin"
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    // step-5: updating an user role from admin to instructor
    app.patch("/users/admin-to-instructor/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "Instructor"
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
    });


    // class related api

    // step-2: getting all classes from mongodb to display in client side
    app.get("/class", verifyJWT, verifyAdmin, async (req, res) => {
        const result = await classCollection.find().toArray();
        res.send(result);
    });

    // step-1: uploading new class
    app.post("/class", verifyJWT, verifyInstructor, async (req, res) => {
        const newClass = req.body;
        console.log(newClass);
        const result = await classCollection.insertOne(newClass);
        res.send(result);
    });

    // step-3: approving a class
    app.patch("/class/approve/:id", verifyJWT, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "Approved"
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        res.send(result);
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("Summer Camp is running!");
});

app.listen(port, () => {
    console.log(`Summer Camp is running on port ${port}`);
});