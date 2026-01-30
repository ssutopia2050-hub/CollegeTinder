require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")

const app = express()

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Atlas connected"))
    .catch(err => console.error(err))
