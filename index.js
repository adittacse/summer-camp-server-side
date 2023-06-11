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
    const cartCollection = client.db("tranquilZenDB").collection("carts");
    const paymentCollection = client.db("tranquilZenDB").collection("payment");

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

    // warning: use verifyJWT before using verifyStudent
    const verifyStudent = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        if (user?.role !== "Student") {
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

    // step-6: get all instructors by role
    app.get("/users/role/:role", async (req, res) => {
        try {
            const role = req.params.role;
            const query = { role: role };
            const users = await userCollection.find(query).toArray();
        
            const instructors = await Promise.all(
                users.map(async (user) => {
                    const totalClasses = await classCollection.countDocuments({ instructorEmail: user.email });
                    const classes = await classCollection.find({ instructorEmail: user.email }).toArray();
                    const approvedClasses = classes.filter(classItem => classItem.status === "Approved");
                    const classNames = classes.map(eachClass => eachClass.className);
                    return {
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        image: user.image,
                        totalClasses: approvedClasses.length,
                        classNames,
                    };
                })
            );
            res.send(instructors);
        } catch (error) {
            res.status(500).send({ error: 'Internal Server Error' });
        }
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

    // step-9: display top 6 classes based on students
    app.get('/classes/top', async (req, res) => {
        try {
          // Query the database to get the top 6 classes based on student count
          const topClasses = await classCollection
            .find()
            .sort({ studentCount: -1 })
            .limit(6)
            .toArray();
      
          res.send(topClasses);
        } catch (error) {
          res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // step-8: getting specific class
    // working code
    app.get('/class/enrolled', verifyJWT, async (req, res) => {
        const classesId = req.query.classesId;
      
        let classIds = [];
        if (typeof classesId === 'string') {
          classIds = classesId.split(',');
        } else if (Array.isArray(classesId)) {
          classIds = classesId;
        }
      
        const filter = { _id: { $in: classIds.map((id) => new ObjectId(id)) } };
        const result = await classCollection.find(filter).toArray();
        res.send(result);
    });                              
      

    // step-2: getting all classes from mongodb to display in client side (admin only)
    // step-7: getting each instructor classes (each instructor only)
    app.get("/class", async (req, res) => {
        const instructorEmail = req.query.instructorEmail;
        const status = req.query.status;
        let filter = {};
        
        if (instructorEmail) {
          filter = { instructorEmail, ...(status && { status }) };
        } else {
          filter = status ? { status } : {};
        }
        
        const result = await classCollection.find(filter).toArray();
        res.send(result);
    });
    
    // step-6: getting specific class to display
    app.get("/class/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await classCollection.findOne(filter);
        res.send(result);
    });

    // step-1: uploading new class
    app.post("/class", verifyJWT, async (req, res) => {
        const newClass = req.body;
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

    // step-4: deny a class
    app.patch("/class/deny/:id", verifyJWT, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "Denied"
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    // step-5: update feedback of a class
    app.patch("/class/feedback/:id", verifyJWT, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedFeedback = req.body;
        const updatedClass = {
          $set: {
            feedback: updatedFeedback.feedback
          }
        };
        const result = await classCollection.updateOne(filter, updatedClass, options);
        res.send(result);
    });

    // step-7: update a class
    app.patch("/class/update-class/:id", verifyJWT, verifyInstructor, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedData = req.body;
        const updatedClass = {
          $set: {
            className: updatedData.className,
            seats: updatedData.seats,
            price: updatedData.price,
            image: updatedData.image
          }
        };
        const result = await classCollection.updateOne(filter, updatedClass, options);
        res.send(result);
    });


    // carts related api

    // step-2: getting cart items from mongodb
    app.get("/carts", verifyJWT,  async (req, res) => {
        const email = req.query.email;
        if (!email) {
          return res.send([]);
        }
  
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res.status(403).send({ message: "Forbidden Access!" });
        }
  
        const query = { email: email };
        const result = await cartCollection.find(query).toArray();
        res.send(result);
    });

    // step-1: inserting a class to mongodb (student)
    app.post("/carts", async (req, res) => {
        const item = req.body;
        const result = await cartCollection.insertOne(item);
        res.send(result);
    });

    // step-3: delete a class from cart
    app.delete("/carts/:id", async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
    });



    // step-1: display 6 instructors based on students number
    app.get('/api/instructors', async (req, res) => {
        try {
        const instructors = await userCollection.find({ role: 'Instructor' }).toArray();
    
            res.send(instructors);
        } catch (error) {
            console.error('Error fetching instructors:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });



    // see all classes of an instructor
    app.get('/see-classes/:id', async (req, res) => {
        try {
          const instructorId = req.params.id;
      
          // Find the instructor's email from the userCollection based on their ID
          const instructor = await userCollection.findOne({ _id: new ObjectId(instructorId) });
          if (!instructor) {
            return res.status(404).json({ error: 'Instructor not found' });
          }

          const instructorEmail = instructor.email;
      
          // Fetch classes from the classCollection that match the instructorEmail
          const classes = await classCollection.find({ instructorEmail }).toArray();
          
          const response = { classes, instructor };

          res.send(response);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: 'Server error' });
        }
    });



    // payments related api

    // step-3: getting payment history of student from mongodb (descending order)
    app.get("/payments", verifyJWT,  async (req, res) => {
        const email = req.query.email;
        if (!email) {
          return res.send([]);
        }
  
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res.status(403).send({ message: "Forbidden Access!" });
        }
  
        const query = { email: email };
        const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
        res.send(result);
    });

    // Step 4: calculating each class id count in payment to set enrolled students
    app.get("/payments/count", async (req, res) => {
        try {
            const classId = req.query.classId;
            if (!classId) {
                return res.status(400).send({ message: "Class ID is required!" });
            }
        
            const query = { classesId: classId };
            const count = await paymentCollection.countDocuments(query);
            res.send({ count });
        } catch (error) {
            console.error("Error fetching payment count:", error);
            res.status(500).send({ message: "Internal Server Error" });
        }
    });
  


    // step-1: create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"]
        });
  
        res.send({
          clientSecret: paymentIntent.client_secret
        });
    });

    // step-2: inserting payment information with class
    app.post("/payments", verifyJWT, async (req, res) => {
        const payment = req.body;
        const insertResult = await paymentCollection.insertOne(payment);
      
        const query = { _id: { $in: payment.cartItemsId.map(id => new ObjectId(id)) } };
        const deleteResult = await cartCollection.deleteMany(query);
      
        res.send({ insertResult, deleteResult });
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