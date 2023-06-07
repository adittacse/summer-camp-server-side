const express = require("express");
const app = express();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cors = require("cors");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());



app.get("/", (req, res) => {
    res.send("Summer Camp is running!");
});

app.listen(port, () => {
    console.log(`Summer Camp is running on port ${port}`);
});